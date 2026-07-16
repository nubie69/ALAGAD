const { InMemoryVectorStore } = require('./vectorStore');
const {
  buildIndexPayloadFromDatabase,
  buildIndexPayloadForSingleRecord,
  saveLastIndexedByTypeAndId,
} = require('./documentIndexer');
const { sharedEmbeddingProvider } = require('./embeddingProvider');
const { logAudit, logAlert } = require('./auditLogger');

const INDEX_TTL_MS = Number(process.env.RETRIEVAL_INDEX_TTL_MS || 60000);

class VectorIndexManager {
  constructor() {
    this.vectorStore = new InMemoryVectorStore();
    this.state = {
      loadedAt: 0,
      canonicalDocuments: [],
      vectorCount: 0,
    };

    this.rebuildPromise = null;
  }

  toVectorDocument(chunk, embedding, lastIndexedIso) {
    const recordId = String(chunk?.metadata?.record_id || chunk?.canonical_id || '').trim();
    const deactivated = Boolean(chunk?.metadata?.deactivated);
    return {
      id: String(chunk.id),
      embedding,
      content: chunk.content,
      metadata: {
        record_id: recordId,
        type: chunk?.metadata?.type,
        category: chunk?.metadata?.category,
        canonical_name: chunk?.metadata?.canonical_name,
        role_title: chunk?.metadata?.role_title,
        aliases: chunk?.metadata?.aliases,
        alias_keywords: chunk?.metadata?.alias_keywords,
        category_tags: chunk?.metadata?.category_tags,
        department_name: chunk?.metadata?.department_name,
        assigned_building: chunk?.metadata?.assigned_building,
        floor_location: chunk?.metadata?.floor_location,
        number_of_floors: chunk?.metadata?.number_of_floors,
        location: chunk?.metadata?.location,
        description: chunk?.metadata?.description,
        requirements: chunk?.metadata?.requirements,
        process: chunk?.metadata?.process,
        chunk_index: Number(chunk?.chunk_index ?? chunk?.metadata?.chunk_index ?? 0),
        content: chunk.content,
        last_updated: chunk?.metadata?.last_updated,
        last_indexed: lastIndexedIso,
        deactivated,
        is_active: typeof chunk?.metadata?.is_active === 'boolean'
          ? chunk.metadata.is_active
          : !deactivated,
        source: chunk?.metadata?.source,
        source_id: recordId,
        canonical_id: recordId,
      },
    };
  }

  getCanonicalDocuments({ includeDeactivated = false, includeAdminUser = false, categoryFilters = [] } = {}) {
    const categoryFilterSet = new Set((categoryFilters || []).map((item) => String(item || '').toLowerCase()));
    const hasCategoryFilter = categoryFilterSet.size > 0;

    return this.state.canonicalDocuments.filter((doc) => {
      const type = String(doc?.type || '').toLowerCase();
      if (!includeAdminUser && (type === 'admin' || type === 'user')) return false;
      if (!includeDeactivated && doc.deactivated === true) return false;

      if (hasCategoryFilter) {
        const categoryTags = String(doc?.category_tags || '')
          .split(';')
          .map((token) => String(token || '').trim().toLowerCase())
          .filter(Boolean);
        if (categoryTags.length === 0) {
          return true;
        }
        if (!categoryTags.some((tag) => categoryFilterSet.has(tag))) {
          return false;
        }
      }

      return true;
    });
  }

  search(queryEmbedding, options = {}) {
    return this.vectorStore.search(queryEmbedding, options);
  }

  isActiveChunk(chunk) {
    return Boolean(chunk?.metadata?.deactivated !== true);
  }

  async rebuildFromDatabase() {
    const payload = await buildIndexPayloadFromDatabase();
    const lastIndexedIso = new Date().toISOString();
    const vectorDocuments = [];

    for (const chunk of payload.chunkDocuments || []) {
      if (!this.isActiveChunk(chunk)) continue;
      // eslint-disable-next-line no-await-in-loop
      const embedding = await sharedEmbeddingProvider.embedText(chunk.content);
      vectorDocuments.push(this.toVectorDocument(chunk, embedding, lastIndexedIso));
    }

    this.vectorStore.clear();
    this.vectorStore.upsertMany(vectorDocuments);

    this.state = {
      loadedAt: Date.now(),
      canonicalDocuments: Array.isArray(payload.canonicalDocuments) ? payload.canonicalDocuments : [],
      vectorCount: vectorDocuments.length,
    };

    return this.state;
  }

  async ensureFreshIndex({ ttlMs = INDEX_TTL_MS } = {}) {
    const stale = (Date.now() - this.state.loadedAt) > ttlMs;
    if (!stale && this.state.vectorCount > 0) {
      return this.state;
    }

    if (this.rebuildPromise) {
      return this.rebuildPromise;
    }

    this.rebuildPromise = this.rebuildFromDatabase();
    try {
      return await this.rebuildPromise;
    } finally {
      this.rebuildPromise = null;
    }
  }

  updateCanonicalRecord(canonicalDoc) {
    const recordId = String(canonicalDoc?.record_id || canonicalDoc?.id || '').trim();
    if (!recordId) return;

    const retained = this.state.canonicalDocuments.filter((doc) => String(doc.record_id || doc.id) !== recordId);
    this.state.canonicalDocuments = [...retained, canonicalDoc];
  }

  async upsertRecordByType(type, recordId) {
    const payload = await buildIndexPayloadForSingleRecord(type, recordId);
    const lastIndexed = new Date();
    const lastIndexedIso = lastIndexed.toISOString();

    if (!payload.recordId) {
      logAlert({
        alert_type: 'vector_upsert_missing_record',
        type,
        record_id: String(recordId || ''),
      });
      return { success: false, recordId: String(recordId || ''), vectorIds: [], chunkCount: 0 };
    }

    const canonicalDoc = Array.isArray(payload.canonicalDocuments) && payload.canonicalDocuments.length > 0
      ? payload.canonicalDocuments[0]
      : null;
    const shouldEmbedActiveRecord = Boolean(canonicalDoc && canonicalDoc.deactivated !== true);

    const removed = this.vectorStore.removeByRecordId(payload.recordId);

    if (!shouldEmbedActiveRecord) {
      for (const doc of payload.canonicalDocuments || []) {
        this.updateCanonicalRecord({
          ...doc,
          last_indexed: lastIndexedIso,
        });
      }

      this.state.vectorCount = this.vectorStore.listDocuments().length;
      this.state.loadedAt = Date.now();
      await saveLastIndexedByTypeAndId(type, payload.recordId, lastIndexed);

      logAudit({
        event: 'vector_upsert_record',
        record_id: payload.recordId,
        type,
        removed_previous_vectors: removed,
        chunk_count: 0,
        vector_ids: [],
        indexed_canonical: [],
        indexed_active: false,
        success: true,
      });

      return {
        success: true,
        recordId: payload.recordId,
        vectorIds: [],
        chunkCount: 0,
        indexedActive: false,
      };
    }

    const vectorIds = [];
    const vectorDocuments = [];
    for (const chunk of payload.chunkDocuments || []) {
      if (!this.isActiveChunk(chunk)) continue;
      // eslint-disable-next-line no-await-in-loop
      const embedding = await sharedEmbeddingProvider.embedText(chunk.content);
      const vectorDoc = this.toVectorDocument(chunk, embedding, lastIndexedIso);
      vectorDocuments.push(vectorDoc);
      vectorIds.push(vectorDoc.id);
    }

    this.vectorStore.upsertMany(vectorDocuments);

    for (const canonicalDoc of payload.canonicalDocuments || []) {
      this.updateCanonicalRecord({
        ...canonicalDoc,
        last_indexed: lastIndexedIso,
      });
    }

    this.state.vectorCount = this.vectorStore.listDocuments().length;
    this.state.loadedAt = Date.now();

    await saveLastIndexedByTypeAndId(type, payload.recordId, lastIndexed);

    const indexedCanonical = (payload.canonicalDocuments || []).map((doc) => ({
      record_id: String(doc?.record_id || doc?.id || ''),
      canonical_name: String(doc?.canonical_name || ''),
      aliases: String(doc?.aliases || ''),
    }));

    logAudit({
      event: 'vector_upsert_record',
      record_id: payload.recordId,
      type,
      removed_previous_vectors: removed,
      chunk_count: vectorDocuments.length,
      vector_ids: vectorIds,
      indexed_canonical: indexedCanonical,
      success: true,
    });

    return {
      success: true,
      recordId: payload.recordId,
      vectorIds,
      chunkCount: vectorDocuments.length,
    };
  }

  async markRecordDeactivated(type, recordId, deactivated = true) {
    const shouldDeactivate = Boolean(deactivated);
    const affected = shouldDeactivate
      ? this.vectorStore.removeByRecordId(recordId)
      : this.vectorStore.markRecordDeactivated(recordId, false);
    const canonicalDocs = this.state.canonicalDocuments.map((doc) => {
      if (String(doc.record_id || doc.id) !== String(recordId)) return doc;
      return {
        ...doc,
        deactivated: shouldDeactivate,
        is_active: !shouldDeactivate,
        last_indexed: new Date().toISOString(),
      };
    });

    this.state.canonicalDocuments = canonicalDocs;
    this.state.vectorCount = this.vectorStore.listDocuments().length;
    this.state.loadedAt = Date.now();

    const lastIndexed = new Date();
    await saveLastIndexedByTypeAndId(type, recordId, lastIndexed);

    logAudit({
      event: 'vector_mark_deactivated',
      record_id: String(recordId || ''),
      type,
      affected_vectors: affected,
      deactivated: shouldDeactivate,
      success: true,
    });

    return {
      success: true,
      affected,
      deactivated: shouldDeactivate,
    };
  }
}

const sharedVectorIndexManager = new VectorIndexManager();

module.exports = {
  INDEX_TTL_MS,
  VectorIndexManager,
  sharedVectorIndexManager,
};
