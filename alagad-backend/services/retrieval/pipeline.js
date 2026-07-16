const {
	normalizeQuery,
	classifyIntent,
	classifyRetrievalCategory,
	inferTypeFilters,
	inferIntentTypeFilters,
	inferCategoryFilters,
} = require('./queryNormalizer');
const crypto = require('crypto');
const { sharedEmbeddingProvider, EMBEDDING_MODEL } = require('./embeddingProvider');
const { InMemoryVectorStore } = require('./vectorStore');
const { rerankResults } = require('./reranker');
const { exactMatchFallback } = require('./exactFallback');
const { buildIndexPayloadFromDatabase } = require('./documentIndexer');
const { sharedVectorIndexManager, INDEX_TTL_MS } = require('./vectorIndexManager');

const DEFAULT_TOP_K = 10;
const PREFILTER_TOP_K_MULTIPLIER = 4;
const MIN_REQUIRED_THRESHOLD = 0.85;
const envThreshold = Number(process.env.RETRIEVAL_SIMILARITY_THRESHOLD);
const DEFAULT_THRESHOLD = Number.isFinite(envThreshold)
	? Math.max(MIN_REQUIRED_THRESHOLD, envThreshold)
	: MIN_REQUIRED_THRESHOLD;
const VECTOR_DB_NAME = process.env.VECTOR_DB || 'chromadb';
const SQL_CONNECTION = process.env.SQL_CONNECTION || '';

class RetrievalPipeline {
	constructor({
		indexLoader = buildIndexPayloadFromDatabase,
		vectorStore = new InMemoryVectorStore(),
		similarityThreshold = DEFAULT_THRESHOLD,
		useSharedIndex = true,
	} = {}) {
		this.indexLoader = indexLoader;
		this.vectorStore = vectorStore;
		this.similarityThreshold = similarityThreshold;
		this.embeddingProvider = sharedEmbeddingProvider;
		this.useSharedIndex = Boolean(useSharedIndex && indexLoader === buildIndexPayloadFromDatabase);
		this.indexManager = this.useSharedIndex ? sharedVectorIndexManager : null;

		this.indexState = {
			loadedAt: 0,
			canonicalDocuments: [],
			chunkDocuments: [],
			vectorCount: 0,
		};
	}

	async embed(text) {
		return this.embeddingProvider.embedText(text);
	}

	async ensureIndex() {
		if (this.indexManager) {
			const state = await this.indexManager.ensureFreshIndex({ ttlMs: INDEX_TTL_MS });
			this.indexState = {
				loadedAt: state.loadedAt,
				canonicalDocuments: state.canonicalDocuments,
				chunkDocuments: [],
				vectorCount: state.vectorCount,
			};
			return this.indexState;
		}

		const stale = (Date.now() - this.indexState.loadedAt) > INDEX_TTL_MS;
		if (!stale && this.indexState.vectorCount > 0) {
			return this.indexState;
		}

		const payload = await this.indexLoader();
		const chunkDocuments = Array.isArray(payload?.chunkDocuments) ? payload.chunkDocuments : [];
		const canonicalDocuments = Array.isArray(payload?.canonicalDocuments) ? payload.canonicalDocuments : [];

		const vectorDocuments = [];
		for (const chunk of chunkDocuments) {
			const embedding = await this.embed(chunk.content);
			vectorDocuments.push({
				id: chunk.id,
				embedding,
				content: chunk.content,
				metadata: {
					...chunk.metadata,
					source_id: chunk.metadata?.canonical_id || chunk.canonical_id || chunk.metadata?.id,
				},
			});
		}

		this.vectorStore.clear();
		this.vectorStore.upsertMany(vectorDocuments);

		this.indexState = {
			loadedAt: Date.now(),
			canonicalDocuments,
			chunkDocuments,
			vectorCount: vectorDocuments.length,
		};

		return this.indexState;
	}

	selectTopUnique(items, maxCount = 1) {
		const selected = [];
		const seen = new Set();

		for (const item of items || []) {
			const sourceId = item?.metadata?.canonical_id || item?.metadata?.source_id || item?.metadata?.id;
			if (!sourceId || seen.has(sourceId)) continue;
			seen.add(sourceId);
			selected.push(item);
			if (selected.length >= maxCount) break;
		}

		return selected;
	}

	canonicalToResult(canonicalDoc, score = 1) {
		return {
			id: `${canonicalDoc.id}::fallback`,
			similarity: score,
			rerankScore: score,
			content: canonicalDoc.content,
			metadata: {
				...canonicalDoc,
				canonical_id: canonicalDoc.id,
				source_id: canonicalDoc.id,
			},
			rerankSignals: {
				exactCanonical: true,
				exactAlias: false,
				phraseCanonical: true,
				phraseAlias: false,
				sameTypeBoost: 0,
				stalenessPenalty: 0,
			},
		};
	}

	toTimestamp(value) {
		const timestamp = new Date(value || '').getTime();
		return Number.isFinite(timestamp) ? timestamp : 0;
	}

	rankCandidatesBySimilarity(items = []) {
		return [...items].sort((left, right) => {
			const similarityDiff = Number(right?.similarity || 0) - Number(left?.similarity || 0);
			if (similarityDiff !== 0) return similarityDiff;

			const rightFreshness = this.toTimestamp(right?.metadata?.last_updated || right?.metadata?.last_indexed);
			const leftFreshness = this.toTimestamp(left?.metadata?.last_updated || left?.metadata?.last_indexed);
			const freshnessDiff = rightFreshness - leftFreshness;
			if (freshnessDiff !== 0) return freshnessDiff;

			const rerankDiff = Number(right?.rerankScore || 0) - Number(left?.rerankScore || 0);
			if (rerankDiff !== 0) return rerankDiff;

			return String(left?.metadata?.source_id || left?.metadata?.canonical_id || left?.id || '')
				.localeCompare(String(right?.metadata?.source_id || right?.metadata?.canonical_id || right?.id || ''));
		});
	}

	async retrieve(userQuery, options = {}) {
		const includeDeactivated = Boolean(options?.includeDeactivated);
		const includeAdminUser = Boolean(options?.includeAdminUser);
		const metadataFilters = options?.metadataFilters && typeof options.metadataFilters === 'object'
			? options.metadataFilters
			: {};
		const query = String(userQuery || '').trim();
		const indexState = await this.ensureIndex();

		const normalized = normalizeQuery(query);
		const queryEmbeddingId = `query:${crypto.createHash('sha1').update(normalized.normalized || query).digest('hex').slice(0, 16)}`;
		const explicitTypeFilters = inferTypeFilters(normalized.normalized);
		const intent = classifyIntent(normalized.original);
		let retrievalCategory = classifyRetrievalCategory(normalized.original);
		const intentTypeFilters = inferIntentTypeFilters(intent);
		let typeFilters = explicitTypeFilters.length > 0 ? explicitTypeFilters : intentTypeFilters;
		if (intent === 'service') {
			typeFilters = ['Service'];
		}

		if (explicitTypeFilters.length > 0 && !explicitTypeFilters.includes('Service')) {
			if (explicitTypeFilters.includes('Personnel')) {
				retrievalCategory = 'Personnel';
			} else {
				retrievalCategory = 'Location';
			}
		}

		if (intent === 'where') {
			retrievalCategory = 'Location';
		}

		if (intent === 'who') {
			retrievalCategory = 'Personnel';
		}

		const categoryFilters = inferCategoryFilters(retrievalCategory);
		const queryEmbedding = await this.embed(normalized.normalized || normalized.normalizedRaw || query);

		const normalizedMetadataFilters = {
			category: String(metadataFilters.category || '').trim().toLowerCase(),
			assigned_building: String(metadataFilters.assigned_building || metadataFilters.assignedBuilding || '').trim().toLowerCase(),
			floor_location: String(metadataFilters.floor_location || metadataFilters.floorLocation || '').trim().toLowerCase(),
		};

		const hasMetadataFilters = Boolean(
			normalizedMetadataFilters.category
			|| normalizedMetadataFilters.assigned_building
			|| normalizedMetadataFilters.floor_location
		);

		const matchesTypeFilters = (metadata) => {
			if (typeFilters.length === 0) return true;
			return typeFilters.includes(String(metadata?.type || ''));
		};

		const matchesCategoryFilters = (metadata) => {
			if (categoryFilters.length === 0) return true;
			const tags = String(metadata?.category_tags || '')
				.split(';')
				.map((token) => String(token || '').trim().toLowerCase())
				.filter(Boolean);
			if (tags.length === 0) return true;
			return tags.some((tag) => categoryFilters.includes(tag));
		};

		const matchesMetadataFilters = (metadata) => {
			if (!hasMetadataFilters) return true;

			const category = String(metadata?.category || '').trim().toLowerCase();
			const assignedBuilding = String(metadata?.assigned_building || '').trim().toLowerCase();
			const floorLocation = String(metadata?.floor_location || '').trim().toLowerCase();

			if (normalizedMetadataFilters.category && category !== normalizedMetadataFilters.category) {
				return false;
			}

			if (normalizedMetadataFilters.assigned_building) {
				const filterValue = normalizedMetadataFilters.assigned_building;
				if (!assignedBuilding.includes(filterValue) && !filterValue.includes(assignedBuilding || '__none__')) {
					return false;
				}
			}

			if (normalizedMetadataFilters.floor_location) {
				const filterValue = normalizedMetadataFilters.floor_location;
				if (!floorLocation.includes(filterValue) && !filterValue.includes(floorLocation || '__none__')) {
					return false;
				}
			}

			return true;
		};

		const searchFn = this.indexManager
			? this.indexManager.search.bind(this.indexManager)
			: this.vectorStore.search.bind(this.vectorStore);

		const rawVectorResults = searchFn(queryEmbedding, {
			topK: DEFAULT_TOP_K * PREFILTER_TOP_K_MULTIPLIER,
			typeFilters: [],
			categoryFilters: [],
			includeDeactivated,
			includeAdminUser,
		});

		const topVectorResults = rawVectorResults
			.filter((item) => matchesTypeFilters(item?.metadata))
			.filter((item) => matchesCategoryFilters(item?.metadata))
			.filter((item) => matchesMetadataFilters(item?.metadata))
			.slice(0, DEFAULT_TOP_K);

		const reranked = rerankResults(topVectorResults, normalized.normalized, typeFilters);
		const topSimilarity = Number(topVectorResults[0]?.similarity || 0);

		let retrievalMode = 'vector';
		let finalCandidates = reranked;
		let fallback = null;

		if (topSimilarity < this.similarityThreshold) {
			const canonicalDocuments = (this.indexManager
				? this.indexManager.getCanonicalDocuments({ includeDeactivated, includeAdminUser, categoryFilters })
				: indexState.canonicalDocuments.filter((doc) => {
					const type = String(doc?.type || '').toLowerCase();
					if (!includeAdminUser && (type === 'admin' || type === 'user')) return false;

					if (!includeDeactivated && doc.deactivated === true) return false;

					if (categoryFilters.length > 0) {
						const tags = String(doc?.category_tags || '')
							.split(';')
							.map((token) => String(token || '').trim().toLowerCase())
							.filter(Boolean);
						if (tags.length === 0) {
							return true;
						}
						if (!tags.some((tag) => categoryFilters.includes(tag))) {
							return false;
						}
					}

					return true;
				}));

			const filteredCanonicalDocuments = canonicalDocuments
				.filter((doc) => matchesTypeFilters(doc))
				.filter((doc) => matchesCategoryFilters(doc))
				.filter((doc) => matchesMetadataFilters(doc));

			fallback = exactMatchFallback({
				normalizedQuery: normalized.normalized,
				canonicalDocuments: filteredCanonicalDocuments,
				typeFilters,
			});

			if (fallback.matches.length > 0) {
				retrievalMode = 'exact_fallback';
				finalCandidates = fallback.matches.map((doc, index) => this.canonicalToResult(doc, 1 - (index * 0.01)));
			} else {
				retrievalMode = 'no_reliable_info';
				finalCandidates = [];
			}
		}

		const rankedCandidates = this.rankCandidatesBySimilarity(finalCandidates);
		const exploratoryRankedCandidates = this.rankCandidatesBySimilarity(reranked);
		const candidatePool = rankedCandidates.length > 0 ? rankedCandidates : exploratoryRankedCandidates;
		const toContextItem = (item) => ({
			is_active: item.metadata?.is_active !== false && item.metadata?.deactivated !== true,
			id: item.metadata?.source_id || item.metadata?.canonical_id || item.metadata?.id,
			type: item.metadata?.type,
			category: item.metadata?.category,
			canonical_name: item.metadata?.canonical_name,
			department_name: item.metadata?.department_name,
			assigned_building: item.metadata?.assigned_building,
			floor_location: item.metadata?.floor_location,
			number_of_floors: item.metadata?.number_of_floors,
			role_title: item.metadata?.role_title,
			aliases: item.metadata?.aliases,
			alias_keywords: item.metadata?.alias_keywords,
			category_tags: item.metadata?.category_tags,
			location: item.metadata?.location,
			description: item.metadata?.description,
			requirements: item.metadata?.requirements,
			process: item.metadata?.process,
			last_updated: item.metadata?.last_updated,
			source: item.metadata?.source,
			content: item.content,
			similarity: Number(item.similarity || 0),
			rerank_score: Number(item.rerankScore || 0),
			rerank_signals: item.rerankSignals || {},
		});

		const candidateContexts = this.selectTopUnique(candidatePool, 3).map(toContextItem);
		const finalContext = this.selectTopUnique(rankedCandidates, 1).map(toContextItem);

		return {
			vectorDb: VECTOR_DB_NAME,
			embeddingModel: EMBEDDING_MODEL,
			sqlConnectionConfigured: Boolean(SQL_CONNECTION),
			query,
			normalizedQuery: normalized.normalized,
			intent,
			retrievalCategory,
			explicitTypeFilters,
			intentTypeFilters,
			typeFilters,
			categoryFilters,
			metadataFilters: normalizedMetadataFilters,
			includeDeactivated,
			includeAdminUser,
			queryEmbeddingId,
			queryEmbedding,
			topVectorResults: topVectorResults.map((item) => ({
				id: item.metadata?.source_id || item.metadata?.canonical_id || item.metadata?.id,
				chunk_id: item.id,
				type: item.metadata?.type,
				category: item.metadata?.category,
				canonical_name: item.metadata?.canonical_name,
				department_name: item.metadata?.department_name,
				assigned_building: item.metadata?.assigned_building,
				floor_location: item.metadata?.floor_location,
				category_tags: item.metadata?.category_tags,
				is_active: item.metadata?.is_active !== false && item.metadata?.deactivated !== true,
				similarity: Number(item.similarity || 0),
			})),
			rerankedResults: reranked.map((item) => ({
				id: item.metadata?.source_id || item.metadata?.canonical_id || item.metadata?.id,
				chunk_id: item.id,
				type: item.metadata?.type,
				category: item.metadata?.category,
				canonical_name: item.metadata?.canonical_name,
				department_name: item.metadata?.department_name,
				assigned_building: item.metadata?.assigned_building,
				floor_location: item.metadata?.floor_location,
				category_tags: item.metadata?.category_tags,
				is_active: item.metadata?.is_active !== false && item.metadata?.deactivated !== true,
				similarity: Number(item.similarity || 0),
				rerankScore: Number(item.rerankScore || 0),
				rerankSignals: item.rerankSignals,
			})),
			retrievalMode,
			topSimilarity,
			fallback,
			candidateContexts,
			finalContext,
			hasReliableInfo: finalContext.length > 0 && finalContext[0].is_active !== false,
		};
	}
}

module.exports = {
	RetrievalPipeline,
	DEFAULT_THRESHOLD,
	DEFAULT_TOP_K,
};
