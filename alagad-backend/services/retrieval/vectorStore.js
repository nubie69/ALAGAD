class InMemoryVectorStore {
  constructor() {
    this.documentsById = new Map();
  }

  clear() {
    this.documentsById.clear();
  }

  listDocuments() {
    return Array.from(this.documentsById.values());
  }

  upsertMany(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || !Array.isArray(item.embedding)) continue;
      if (!item.id) continue;
      this.documentsById.set(String(item.id), item);
    }
  }

  markRecordDeactivated(recordId, deactivated = true) {
    const recordKey = String(recordId || '').trim();
    if (!recordKey) return 0;

    let updated = 0;
    for (const [id, doc] of this.documentsById.entries()) {
      if (String(doc?.metadata?.record_id || '') !== recordKey) continue;
      this.documentsById.set(id, {
        ...doc,
        metadata: {
          ...doc.metadata,
          deactivated: Boolean(deactivated),
          last_indexed: new Date().toISOString(),
        },
      });
      updated += 1;
    }

    return updated;
  }

  removeByRecordId(recordId) {
    const recordKey = String(recordId || '').trim();
    if (!recordKey) return 0;

    let removed = 0;
    for (const [id, doc] of this.documentsById.entries()) {
      if (String(doc?.metadata?.record_id || '') !== recordKey) continue;
      this.documentsById.delete(id);
      removed += 1;
    }

    return removed;
  }

  cosineSimilarity(a, b) {
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < length; i += 1) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    const cosine = dot / (Math.sqrt(magA) * Math.sqrt(magB));
    return (cosine + 1) / 2;
  }

  search(queryEmbedding, {
    topK = 10,
    typeFilters = [],
    categoryFilters = [],
    includeDeactivated = false,
    includeAdminUser = false,
  } = {}) {
    const filterSet = new Set(typeFilters || []);
    const categoryFilterSet = new Set((categoryFilters || []).map((item) => String(item || '').toLowerCase()));
    const hasTypeFilter = filterSet.size > 0;
    const hasCategoryFilter = categoryFilterSet.size > 0;

    const getCategoryTags = (doc) => String(doc?.metadata?.category_tags || '')
      .split(';')
      .map((token) => String(token || '').trim().toLowerCase())
      .filter(Boolean);

    const scored = this.listDocuments()
      .filter((doc) => {
        if (!includeDeactivated && doc?.metadata?.deactivated === true) return false;
        const type = String(doc?.metadata?.type || '').toLowerCase();
        if (!includeAdminUser && (type === 'admin' || type === 'user')) return false;
        if (hasTypeFilter && !filterSet.has(doc.metadata.type)) return false;

        if (!hasCategoryFilter) return true;

        const categoryTags = getCategoryTags(doc);
        if (categoryTags.length === 0) return true;
        return categoryTags.some((tag) => categoryFilterSet.has(tag));
      })
      .map((doc) => ({
        ...doc,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return scored;
  }
}

module.exports = {
  InMemoryVectorStore,
};
