const { normalizeTextForMatch } = require('./textNormalizer');

const parseAliases = (aliases) => String(aliases || '')
  .split(';')
  .map((alias) => normalizeTextForMatch(alias))
  .filter(Boolean);

const isExactTextMatch = (query, value) => {
  const q = normalizeTextForMatch(query);
  const v = normalizeTextForMatch(value);
  if (!q || !v) return false;
  return q === v;
};

const includesPhrase = (query, value) => {
  const q = normalizeTextForMatch(query);
  const v = normalizeTextForMatch(value);
  if (!q || !v) return false;
  return v.includes(q) || q.includes(v);
};

const calculateStalenessPenalty = (lastUpdated) => {
  if (!lastUpdated) return 0.05;
  const timestamp = new Date(lastUpdated).getTime();
  if (Number.isNaN(timestamp)) return 0.05;

  const ageDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (ageDays <= 30) return 0;
  if (ageDays <= 180) return 0.03;
  if (ageDays <= 365) return 0.07;
  if (ageDays <= 730) return 0.12;
  return 0.2;
};

const rerankResults = (results, normalizedQuery, inferredTypeFilters) => {
  const typeFilterSet = new Set(inferredTypeFilters || []);

  return (results || [])
    .map((entry) => {
      const metadata = entry.metadata || {};
      const canonicalName = String(metadata.canonical_name || '');
      const aliases = parseAliases(metadata.aliases);
      const exactCanonical = isExactTextMatch(normalizedQuery, canonicalName);
      const exactAlias = aliases.some((alias) => isExactTextMatch(normalizedQuery, alias));
      const phraseCanonical = includesPhrase(normalizedQuery, canonicalName);
      const phraseAlias = aliases.some((alias) => includesPhrase(normalizedQuery, alias));
      const sameTypeBoost = typeFilterSet.size > 0 && typeFilterSet.has(metadata.type) ? 0.08 : 0;
      const stalenessPenalty = calculateStalenessPenalty(metadata.last_updated);

      let rerankScore = Number(entry.similarity || 0);
      if (exactCanonical) rerankScore += 0.35;
      if (exactAlias) rerankScore += 0.28;
      if (phraseCanonical) rerankScore += 0.12;
      if (phraseAlias) rerankScore += 0.08;
      rerankScore += sameTypeBoost;
      rerankScore -= stalenessPenalty;

      return {
        ...entry,
        rerankScore,
        rerankSignals: {
          exactCanonical,
          exactAlias,
          phraseCanonical,
          phraseAlias,
          sameTypeBoost,
          stalenessPenalty,
        },
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
};

module.exports = {
  rerankResults,
  calculateStalenessPenalty,
};
