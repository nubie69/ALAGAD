const FAQ = require('../models/FAQ');
const { EMBEDDING_MODEL, sharedEmbeddingProvider } = require('./retrieval/embeddingProvider');
const { InMemoryVectorStore } = require('./retrieval/vectorStore');

const DEFAULT_FAQ_TOP_K = Number(process.env.FAQ_RETRIEVAL_TOP_K || 5);
const DEFAULT_FAQ_NUM_CANDIDATES = Number(process.env.FAQ_VECTOR_NUM_CANDIDATES || 100);
const FAQ_VECTOR_INDEX_NAME = process.env.FAQ_VECTOR_INDEX_NAME || 'faq_embedding_vector_index';
const FAQ_ATLAS_VECTOR_SEARCH_ENABLED = String(process.env.FAQ_ATLAS_VECTOR_SEARCH_ENABLED || 'false').toLowerCase() === 'true';
const FAQ_SIMILARITY_THRESHOLD = Number.isFinite(Number(process.env.FAQ_SIMILARITY_THRESHOLD))
  ? Number(process.env.FAQ_SIMILARITY_THRESHOLD)
  : 0.82;

const vectorStore = new InMemoryVectorStore();
const VERIFIED_STATUS_FILTER = {
  $or: [
    { status: 'verified' },
    { status: { $exists: false } },
    { status: '' },
    { status: null },
  ],
};

const hasUsableEmbedding = (value) => Array.isArray(value) && value.length > 0
  && value.every((item) => Number.isFinite(Number(item)));

const normalizeScore = (value) => {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
};

const buildFaqQuestionText = (faq) => [
  faq?.name || faq?.question,
  ...(Array.isArray(faq?.alternativeQuestions) ? faq.alternativeQuestions : []),
  ...(Array.isArray(faq?.keywords) ? faq.keywords : []),
  faq?.category,
].map((item) => String(item || '').trim()).filter(Boolean).join(' ');

const buildFaqEmbedding = async (question) => {
  const text = String(question || '').trim();
  if (!text) return [];
  return sharedEmbeddingProvider.embedText(text);
};

const attachFaqEmbedding = async (payload, question = buildFaqQuestionText(payload)) => {
  const embedding = await buildFaqEmbedding(question);
  return {
    ...payload,
    embedding,
    embeddingModel: EMBEDDING_MODEL,
    embeddingUpdatedAt: new Date(),
  };
};

const toPlainFaq = (faq) => {
  if (!faq) return null;
  if (typeof faq.toObject === 'function') {
    return faq.toObject({ virtuals: true });
  }
  return faq;
};

const populateFaqQuery = (query) => query
  .populate({
    path: 'office',
    select: 'name department building room floor contactInfo geometry',
    populate: [
      { path: 'building', select: 'name geometry numberOfFloors' },
      { path: 'room', select: 'name floor building geometry' },
    ],
  })
  .populate('department', 'name code building floor');

const formatVerifiedFaq = (faq, score = 0) => {
  const item = toPlainFaq(faq);
  if (!item) return null;
  const office = item.office && typeof item.office === 'object' ? item.office : null;
  const department = item.department && typeof item.department === 'object' ? item.department : null;
  const officeBuilding = office?.building && typeof office.building === 'object' ? office.building : null;
  const officeRoom = office?.room && typeof office.room === 'object' ? office.room : null;

  return {
    id: String(item._id || item.id || ''),
    question: String(item.name || item.question || '').trim(),
    name: String(item.name || item.question || '').trim(),
    answer: String(item.verifiedAnswer || item.answer || '').trim(),
    verifiedAnswer: String(item.verifiedAnswer || item.answer || '').trim(),
    officeId: office?._id ? String(office._id) : (item.office ? String(item.office) : null),
    officeName: String(office?.name || '').trim(),
    departmentId: department?._id ? String(department._id) : (item.department ? String(item.department) : null),
    departmentName: String(department?.name || office?.department || '').trim(),
    buildingName: String(officeBuilding?.name || '').trim(),
    roomName: String(officeRoom?.name || '').trim(),
    floor: office?.floor ?? officeRoom?.floor ?? department?.floor ?? null,
    locationName: String(office?.name || officeBuilding?.name || department?.name || '').trim(),
    similarity: normalizeScore(score),
    status: 'verified',
    verified: item.verified === true,
    isActive: item.isActive !== false,
    lastVerified: item.lastVerified || null,
    embeddingModel: item.embeddingModel || EMBEDDING_MODEL,
  };
};

const findVerifiedFaqById = async (id) => {
  if (!id) return null;
  return populateFaqQuery(FAQ.findOne({
    _id: id,
    verified: true,
    isActive: { $ne: false },
    status: { $in: ['published', 'verified', '', null] },
    ...VERIFIED_STATUS_FILTER,
  })).lean();
};

const searchWithAtlasVector = async ({ queryEmbedding, topK, numCandidates }) => {
  const results = await FAQ.aggregate([
    {
      $vectorSearch: {
        index: FAQ_VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates,
        limit: topK,
      },
    },
    {
      $match: {
        verified: true,
        isActive: { $ne: false },
        ...VERIFIED_STATUS_FILTER,
      },
    },
    {
      $addFields: {
        similarity: { $meta: 'vectorSearchScore' },
      },
    },
    {
      $project: {
        embedding: 0,
      },
    },
  ]);

  const hydrated = [];
  for (const result of results) {
    // eslint-disable-next-line no-await-in-loop
    const faq = await findVerifiedFaqById(result._id);
    if (faq) hydrated.push({ faq, similarity: result.similarity });
  }
  return hydrated;
};

const searchWithStoredEmbeddings = async ({ queryEmbedding, topK }) => {
  const faqs = await populateFaqQuery(FAQ.find({
    verified: true,
    isActive: { $ne: false },
    status: { $in: ['published', 'verified', '', null] },
    embedding: { $exists: true, $ne: [] },
    ...VERIFIED_STATUS_FILTER,
  }).select('+embedding +embeddingModel +embeddingUpdatedAt')).lean();

  vectorStore.clear();
  vectorStore.upsertMany(faqs
    .filter((faq) => hasUsableEmbedding(faq.embedding))
    .map((faq) => ({
      id: String(faq._id),
      embedding: faq.embedding.map(Number),
      content: buildFaqQuestionText(faq),
      metadata: {
        record_id: String(faq._id),
      },
      faq,
    })));

  return vectorStore.search(queryEmbedding, { topK })
    .map((item) => ({
      faq: item.faq,
      similarity: item.similarity,
    }));
};

const searchVerifiedFaqs = async (query, {
  topK = DEFAULT_FAQ_TOP_K,
  threshold = FAQ_SIMILARITY_THRESHOLD,
  allowAtlasVectorSearch = FAQ_ATLAS_VECTOR_SEARCH_ENABLED,
} = {}) => {
  const text = String(query || '').trim();
  if (!text) {
    return {
      matched: false,
      faq: null,
      topResults: [],
      queryEmbedding: [],
      threshold,
      searchMode: 'empty_query',
    };
  }

  const queryEmbedding = await buildFaqEmbedding(text);
  if (!hasUsableEmbedding(queryEmbedding)) {
    return {
      matched: false,
      faq: null,
      topResults: [],
      queryEmbedding,
      threshold,
      searchMode: 'missing_embedding',
    };
  }

  let searchMode = 'stored_embedding_cosine';
  let results = [];

  if (allowAtlasVectorSearch) {
    try {
      results = await searchWithAtlasVector({
        queryEmbedding,
        topK,
        numCandidates: DEFAULT_FAQ_NUM_CANDIDATES,
      });
      searchMode = 'mongodb_atlas_vector_search';
    } catch (error) {
      results = await searchWithStoredEmbeddings({ queryEmbedding, topK });
      searchMode = 'stored_embedding_cosine_fallback';
    }
  } else {
    results = await searchWithStoredEmbeddings({ queryEmbedding, topK });
  }

  const topResults = results
    .map((item) => formatVerifiedFaq(item.faq, item.similarity))
    .filter((item) => item && item.verified === true && item.isActive !== false)
    .sort((left, right) => Number(right.similarity || 0) - Number(left.similarity || 0))
    .slice(0, topK);

  const best = topResults[0] || null;

  return {
    matched: Boolean(best && Number(best.similarity || 0) >= threshold),
    faq: best && Number(best.similarity || 0) >= threshold ? best : null,
    topResults,
    queryEmbedding,
    threshold,
    searchMode,
  };
};

const migrateMissingFaqEmbeddings = async ({ dryRun = false } = {}) => {
  const faqs = await FAQ.find({
    verified: true,
    isActive: { $ne: false },
    status: { $in: ['published', 'verified', '', null] },
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embeddingModel: { $in: ['', null] } },
      { status: { $exists: false } },
      { status: '' },
      { status: null },
    ],
  }).select('+embedding +embeddingModel +embeddingUpdatedAt');

  let updated = 0;
  const skipped = [];

  for (const faq of faqs) {
    const question = buildFaqQuestionText(faq);
    if (!question) {
      skipped.push(String(faq._id));
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const embedding = await buildFaqEmbedding(question);
    if (!hasUsableEmbedding(embedding)) {
      skipped.push(String(faq._id));
      continue;
    }

    if (!dryRun) {
      faq.embedding = embedding;
      faq.embeddingModel = EMBEDDING_MODEL;
      faq.embeddingUpdatedAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await faq.save();
    }
    updated += 1;
  }

  return {
    scanned: faqs.length,
    updated,
    skipped,
    dryRun,
    embeddingModel: EMBEDDING_MODEL,
  };
};

module.exports = {
  FAQ_SIMILARITY_THRESHOLD,
  FAQ_VECTOR_INDEX_NAME,
  buildFaqEmbedding,
  attachFaqEmbedding,
  searchVerifiedFaqs,
  migrateMissingFaqEmbeddings,
};
