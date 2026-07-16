const SQL_EXACT_FALLBACK = 'SELECT * FROM items WHERE canonical_name = ? OR aliases LIKE ? LIMIT 5';
const MIN_FALLBACK_SIMILARITY = 0.85;

const { normalizeTextForMatch } = require('./textNormalizer');

const normalize = (value) => normalizeTextForMatch(value);

const parseAliases = (aliases) => String(aliases || '')
  .split(';')
  .map((alias) => normalize(alias))
  .filter(Boolean);

const GENERIC_QUERY_TOKENS = new Set([
  'service', 'services', 'process', 'steps', 'step', 'requirements', 'requirement', 'details', 'detail',
  'contact', 'location', 'where', 'what', 'how', 'find', 'get', 'request',
]);

const toTokenSet = (value) => new Set(normalize(value).split(' ').filter(Boolean));

const levenshteinDistance = (a, b) => {
  const source = normalize(a);
  const target = normalize(b);
  if (!source) return target.length;
  if (!target) return source.length;

  const rows = source.length + 1;
  const cols = target.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
};

const fuzzySimilarity = (a, b) => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  const distance = levenshteinDistance(left, right);
  return 1 - (distance / Math.max(left.length, right.length));
};

const isStrongTypoMatch = (query, term) => {
  const normalizedQuery = normalize(query);
  const normalizedTerm = normalize(term);
  if (!normalizedQuery || !normalizedTerm) return false;
  if (normalizedQuery.length < 5 || normalizedTerm.length < 5) return false;

  const distance = levenshteinDistance(normalizedQuery, normalizedTerm);
  if (distance > 2) return false;

  const similarity = 1 - (distance / Math.max(normalizedQuery.length, normalizedTerm.length));
  if (similarity < 0.72) return false;

  const prefixMatch = normalizedQuery.slice(0, 2) === normalizedTerm.slice(0, 2);
  const suffixMatch = normalizedQuery.slice(-2) === normalizedTerm.slice(-2);
  return prefixMatch || suffixMatch;
};

const scoreTermMatch = (query, term) => {
  const normalizedQuery = normalize(query);
  const normalizedTerm = normalize(term);
  if (!normalizedQuery || !normalizedTerm) return 0;

  if (normalizedTerm === normalizedQuery) return 1;
  if (normalizedTerm.includes(normalizedQuery) || normalizedQuery.includes(normalizedTerm)) return 0.9;
  if (tokenSubsetMatch(normalizedQuery, normalizedTerm)) return 0.88;

  const termTokens = normalizedTerm.split(' ').filter(Boolean);
  let best = fuzzySimilarity(normalizedQuery, normalizedTerm);

  for (const token of termTokens) {
    const tokenSimilarity = fuzzySimilarity(normalizedQuery, token);
    if (tokenSimilarity >= 0.85) {
      best = Math.max(best, Math.min(0.97, tokenSimilarity + 0.05));
    }
    if (isStrongTypoMatch(normalizedQuery, token)) {
      best = Math.max(best, 0.9);
    }
  }

  return best;
};

const tokenSubsetMatch = (query, value) => {
  const queryTokens = Array.from(toTokenSet(query)).filter((token) => !GENERIC_QUERY_TOKENS.has(token));
  const targetTokens = toTokenSet(value);
  if (queryTokens.length === 0 || targetTokens.size === 0) return false;
  return queryTokens.every((token) => targetTokens.has(token));
};

const toTimestamp = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const exactMatchFallback = ({ normalizedQuery, canonicalDocuments, typeFilters = [] }) => {
  const query = normalize(normalizedQuery);
  const queryParts = Array.from(new Set([
    query,
    ...query.split(' ').filter((token) => token.length >= 3),
  ]));

  const queryTokens = query
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_QUERY_TOKENS.has(token));
  const filterSet = new Set(typeFilters || []);
  const hasTypeFilter = filterSet.size > 0;

  const candidates = (canonicalDocuments || []).filter((doc) => {
    if (!hasTypeFilter) return true;
    return filterSet.has(doc.type);
  });

  const matches = candidates
    .map((doc) => {
      const canonical = normalize(doc.canonical_name);
      const aliases = parseAliases(doc.aliases);

      let bestScore = 0;
      for (const part of queryParts) {
        bestScore = Math.max(bestScore, scoreTermMatch(part, canonical));
        for (const alias of aliases) {
          bestScore = Math.max(bestScore, scoreTermMatch(part, alias));
        }
      }

      const targetTokens = [canonical, ...aliases]
        .join(' ')
        .split(' ')
        .filter(Boolean);

      let coverageHits = 0;
      for (const queryToken of queryTokens) {
        const tokenHit = targetTokens.some((targetToken) => (
          targetToken.includes(queryToken)
          || fuzzySimilarity(queryToken, targetToken) >= 0.84
          || isStrongTypoMatch(queryToken, targetToken)
        ));
        if (tokenHit) coverageHits += 1;
      }

      const coverageRatio = queryTokens.length > 0 ? (coverageHits / queryTokens.length) : 0;
      const coverageBonus = Math.min(0.08, coverageRatio * 0.08);
      bestScore = Math.min(1, bestScore + coverageBonus);

      return {
        doc,
        bestScore,
      };
    })
    .filter((entry) => entry.bestScore >= MIN_FALLBACK_SIMILARITY)
    .sort((a, b) => {
      const scoreDiff = b.bestScore - a.bestScore;
      if (scoreDiff !== 0) return scoreDiff;

      const freshnessDiff = toTimestamp(b?.doc?.last_updated || b?.doc?.last_indexed)
        - toTimestamp(a?.doc?.last_updated || a?.doc?.last_indexed);
      if (freshnessDiff !== 0) return freshnessDiff;

      return String(a?.doc?.record_id || a?.doc?.id || '')
        .localeCompare(String(b?.doc?.record_id || b?.doc?.id || ''));
    })
    .map((entry) => entry.doc)
    .slice(0, 5);

  return {
    sql: SQL_EXACT_FALLBACK,
    params: [normalizedQuery, `%${normalizedQuery}%`],
    matches,
  };
};

module.exports = {
  SQL_EXACT_FALLBACK,
  exactMatchFallback,
};
