const { sharedVectorIndexManager } = require('./vectorIndexManager');
const {
  translateSuggestionList,
  translateQuerySuggestionText,
} = require('./languageService');
const { normalizeTextForMatch } = require('./textNormalizer');

const DEFAULT_SUGGESTION_LIMIT = 1;
const MIN_SUGGESTION_LIMIT = 1;
const MAX_SUGGESTION_LIMIT = 1;
const MIN_SIMILARITY_SCORE = 85;

const suggestionSelectionFrequency = new Map();

const normalize = (value) => normalizeTextForMatch(value);

const parseAliases = (aliases) => String(aliases || '')
  .split(';')
  .map((alias) => alias.trim())
  .filter(Boolean);

const getLastToken = (text) => {
  const match = String(text || '').match(/([a-z0-9]+)$/i);
  return match ? match[1] : '';
};

const inferQueryIntent = (query) => {
  const text = normalize(query);
  if (/\bwhere\b|\blocation\b/.test(text)) return 'where';
  if (/\bhow to get\b|\bhow to\b/.test(text)) return 'how_to_get';
  if (/\bwho\b/.test(text)) return 'who';
  if (/\brequirements\b/.test(text)) return 'requirements';
  if (/\bprocess\b|\bsteps\b|\bprocedure\b/.test(text)) return 'process';
  return 'generic';
};

const completeEntityPhrase = (query, entityName, aliases = []) => {
  const rawQuery = String(query || '').trim();
  const lastTokenRaw = getLastToken(rawQuery);
  const lastTokenNorm = normalize(lastTokenRaw);

  const entityCandidates = [String(entityName || '').trim(), ...aliases.map((alias) => String(alias || '').trim())]
    .filter(Boolean);
  const baseEntity = entityCandidates[0] || '';
  if (!rawQuery) return baseEntity;
  if (!baseEntity) return rawQuery;

  if (!lastTokenNorm) {
    return `${rawQuery}${rawQuery.endsWith(' ') ? '' : ' '}${baseEntity}`;
  }

  const entityWords = normalize(baseEntity).split(' ').filter(Boolean);
  let matchedWordIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < entityWords.length; i += 1) {
    const word = entityWords[i];
    const prefixHit = word.startsWith(lastTokenNorm) ? 1 : 0;
    const fuzzyHit = fuzzySimilarity(lastTokenNorm, word);
    const score = Math.max(prefixHit, fuzzyHit);
    if (score > bestScore) {
      bestScore = score;
      matchedWordIndex = i;
    }
  }

  if (matchedWordIndex < 0 || bestScore < 0.66) {
    return `${rawQuery}${rawQuery.endsWith(' ') ? '' : ' '}${baseEntity}`;
  }

  const normalizedEntityWords = normalize(baseEntity).split(' ').filter(Boolean);
  const matchedWord = normalizedEntityWords[matchedWordIndex] || '';
  const suffixInWord = matchedWord.startsWith(lastTokenNorm)
    ? matchedWord.slice(lastTokenNorm.length)
    : '';
  const tailWords = normalizedEntityWords.slice(matchedWordIndex + 1);

  const appendParts = [];
  if (suffixInWord) appendParts.push(suffixInWord);
  if (tailWords.length > 0) appendParts.push(tailWords.join(' '));

  const appendTail = appendParts.join(' ').trim();
  if (!appendTail) return rawQuery;

  if (suffixInWord && tailWords.length > 0) {
    return `${rawQuery}${suffixInWord} ${tailWords.join(' ')}`;
  }

  if (suffixInWord) {
    return `${rawQuery}${suffixInWord}`;
  }

  return `${rawQuery}${rawQuery.endsWith(' ') ? '' : ' '}${appendTail}`;
};

const composeQuerySuggestion = (query, entityName, aliases = [], type = 'item') => {
  const intent = inferQueryIntent(query);
  const completed = completeEntityPhrase(query, entityName, aliases);
  const normalizedCompleted = normalize(completed);

  if (intent === 'generic' && !String(query || '').trim()) {
    if (type === 'Service') return `how to get ${normalize(entityName)}?`;
    return `where is ${normalize(entityName)}?`;
  }

  const withQuestion = String(completed || '').trim();
  if (!withQuestion) return '';
  if (withQuestion.endsWith('?')) return withQuestion;
  if (/\bwhere\b|\bhow\b|\bwho\b|\bwhat\b|\brequirements\b|\bprocess\b|\bsteps\b/.test(normalizedCompleted)) {
    return `${withQuestion}?`;
  }
  return `${withQuestion}?`;
};

const computeAppendText = (originalQuery, fullSuggestion) => {
  const source = String(originalQuery || '');
  const target = String(fullSuggestion || '');
  if (!source) return target;
  if (!target) return '';

  if (target.toLowerCase().startsWith(source.toLowerCase())) {
    return target.slice(source.length);
  }

  const lowerSource = source.toLowerCase();
  const lowerTarget = target.toLowerCase();
  const maxLen = Math.min(lowerSource.length, lowerTarget.length);
  let lcp = 0;
  while (lcp < maxLen && lowerSource[lcp] === lowerTarget[lcp]) lcp += 1;

  if (lcp > 0) {
    return target.slice(lcp);
  }

  return `${source.endsWith(' ') ? '' : ' '}${target}`;
};

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

const fuzzySimilarity = (query, candidate) => {
  const normalizedQuery = normalize(query);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
  return 1 - (distance / Math.max(normalizedQuery.length, normalizedCandidate.length));
};

const isStrongTypoMatch = (normalizedQuery, normalizedToken) => {
  if (!normalizedQuery || !normalizedToken) return false;
  if (normalizedQuery.length < 5 || normalizedToken.length < 5) return false;

  const distance = levenshteinDistance(normalizedQuery, normalizedToken);
  if (distance > 2) return false;

  const similarity = 1 - (distance / Math.max(normalizedQuery.length, normalizedToken.length));
  if (similarity < 0.72) return false;

  const prefixMatch = normalizedToken.slice(0, 2) === normalizedQuery.slice(0, 2);
  const suffixMatch = normalizedToken.slice(-2) === normalizedQuery.slice(-2);
  return prefixMatch || suffixMatch;
};

const scoreTermMatch = (normalizedQuery, normalizedTerm) => {
  if (!normalizedQuery || !normalizedTerm) return 0;

  let score = 0;

  if (normalizedTerm.startsWith(normalizedQuery)) {
    score = Math.max(score, 100);
  }

  const termTokens = normalizedTerm.split(' ').filter(Boolean);
  if (termTokens.some((token) => token.startsWith(normalizedQuery))) {
    score = Math.max(score, 96);
  }

  if (termTokens.some((token) => isStrongTypoMatch(normalizedQuery, token))) {
    score = Math.max(score, 90);
  }

  if (normalizedTerm.includes(normalizedQuery) || normalizedQuery.includes(normalizedTerm)) {
    score = Math.max(score, 88);
  }

  for (const token of termTokens) {
    const tokenFuzzy = fuzzySimilarity(normalizedQuery, token) * 100;
    if (tokenFuzzy >= 80) {
      score = Math.max(score, Math.min(96, tokenFuzzy + 8));
    }
  }

  const fuzzy = fuzzySimilarity(normalizedQuery, normalizedTerm) * 100;
  if (fuzzy >= 70) {
    score = Math.max(score, Math.min(97, fuzzy));
  }

  return Math.min(score, 100);
};

const scoreDocument = (query, canonicalName, aliases) => {
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 2);
  const queryParts = Array.from(new Set([
    normalizedQuery,
    ...queryTokens,
  ].filter(Boolean)));

  const normalizedCanonical = normalize(canonicalName);
  const normalizedAliases = aliases.map((alias) => normalize(alias)).filter(Boolean);
  const canonicalTokens = normalizedCanonical.split(' ').filter(Boolean);
  const aliasTokens = normalizedAliases.flatMap((alias) => alias.split(' ').filter(Boolean));
  const searchableTokens = [...canonicalTokens, ...aliasTokens];

  const termScores = [];
  for (const part of queryParts) {
    termScores.push(scoreTermMatch(part, normalizedCanonical) + 0.05);
    for (const alias of normalizedAliases) {
      termScores.push(scoreTermMatch(part, alias));
    }
  }

  let coverageHits = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    const tokenHit = normalizedCanonical.includes(token)
      || normalizedAliases.some((alias) => alias.includes(token))
      || searchableTokens.some((candidateToken) => fuzzySimilarity(token, candidateToken) >= 0.84)
      || searchableTokens.some((candidateToken) => isStrongTypoMatch(token, candidateToken));
    if (tokenHit) coverageHits += 1;
  }

  const coverageRatio = queryTokens.length > 0
    ? coverageHits / queryTokens.length
    : 0;
  const coverageBonus = Math.min(8, coverageRatio * 8);

  const baseScore = Math.max(...termScores, 0);
  return Math.min(100, baseScore + coverageBonus);
};

const registerSuggestionSelection = (recordId) => {
  const id = String(recordId || '').trim();
  if (!id) return 0;
  const next = (suggestionSelectionFrequency.get(id) || 0) + 1;
  suggestionSelectionFrequency.set(id, next);
  return next;
};

const buildAutocompleteSuggestions = ({
  originalQuery,
  query,
  canonicalDocuments,
  limit = DEFAULT_SUGGESTION_LIMIT,
  language = 'english',
}) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const normalizedLanguage = String(language || 'english').toLowerCase();

  const ranked = [];
  for (const doc of (canonicalDocuments || [])) {
    const id = String(doc?.record_id || doc?.id || '').trim();
    if (!id) continue;

    const type = String(doc?.type || '').trim();
    const lowerType = type.toLowerCase();
    if (lowerType === 'admin' || lowerType === 'user') continue;
    if (doc?.deactivated === true) continue;

    const canonicalName = String(doc?.canonical_name || '').trim();
    if (!canonicalName) continue;

    const aliases = parseAliases(doc?.aliases);
    const frequency = suggestionSelectionFrequency.get(id) || 0;
    const similarityScore = scoreDocument(normalizedQuery, canonicalName, aliases);
    if (similarityScore < MIN_SIMILARITY_SCORE) continue;

    ranked.push({
      id,
      type,
      canonical_name: canonicalName,
      aliases: aliases.slice(0, 3),
      frequency,
      similarity_score: similarityScore,
      score: similarityScore,
    });
  }

  const resolvedLimit = Math.max(
    MIN_SUGGESTION_LIMIT,
    Math.min(MAX_SUGGESTION_LIMIT, Number(limit) || DEFAULT_SUGGESTION_LIMIT)
  );

  const top = ranked
    .sort((a, b) => {
      if (b.similarity_score !== a.similarity_score) return b.similarity_score - a.similarity_score;
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.canonical_name.localeCompare(b.canonical_name);
    })
    .slice(0, resolvedLimit);

  const translated = translateSuggestionList(top, language);
  const rawUserQuery = String(originalQuery || query || '').trim();

  return translated.map((item) => {
    const canonicalNameForLanguage = String(item.display_name || item.canonical_name || '').trim();
    const aliasesForLanguage = Array.isArray(item.aliases_display) && item.aliases_display.length > 0
      ? item.aliases_display
      : (Array.isArray(item.aliases) ? item.aliases : []);

    const englishSuggestion = composeQuerySuggestion(
      normalizedQuery,
      item.canonical_name,
      Array.isArray(item.aliases) ? item.aliases : [],
      item.type
    );

    let suggestionInLanguage = translateQuerySuggestionText(englishSuggestion, language);
    if (rawUserQuery && normalizedLanguage === 'english') {
      const completedInTypedLanguage = composeQuerySuggestion(
        rawUserQuery,
        canonicalNameForLanguage,
        aliasesForLanguage,
        item.type
      );
      suggestionInLanguage = completedInTypedLanguage || suggestionInLanguage;
    }

    const appendText = computeAppendText(rawUserQuery, suggestionInLanguage);

    return {
      ...item,
      suggested_query: suggestionInLanguage,
      append_text: appendText,
      template_source: inferQueryIntent(normalizedQuery),
    };
  });
};

const getAutocompleteSuggestions = async ({
  originalQuery,
  query,
  language = 'english',
  limit = DEFAULT_SUGGESTION_LIMIT,
  includeDeactivated = false,
  includeAdminUser = false,
} = {}) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  await sharedVectorIndexManager.ensureFreshIndex();
  const canonicalDocuments = sharedVectorIndexManager.getCanonicalDocuments({
    includeDeactivated,
    includeAdminUser,
  });

  return buildAutocompleteSuggestions({
    originalQuery,
    query: normalizedQuery,
    canonicalDocuments,
    limit,
    language,
  });
};

const resetSuggestionSelectionFrequency = () => {
  suggestionSelectionFrequency.clear();
};

module.exports = {
  DEFAULT_SUGGESTION_LIMIT,
  MIN_SIMILARITY_SCORE,
  buildAutocompleteSuggestions,
  getAutocompleteSuggestions,
  registerSuggestionSelection,
  resetSuggestionSelectionFrequency,
};