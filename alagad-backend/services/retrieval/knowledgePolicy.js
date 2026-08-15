const VERIFIED_STATUSES = new Set(['verified', 'published']);
const NON_AUTHORITATIVE_STATUSES = new Set([
  'draft',
  'pending',
  'pending_review',
  'pending_verification',
  'unverified',
  'rejected',
  'archived',
  'outdated',
  'conflicting',
]);

const clean = (value) => String(value || '').trim();

const normalizeStatus = (value) => {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!normalized) return '';
  if (normalized === 'pending_review') return 'pending_verification';
  if (normalized === 'publish' || normalized === 'published') return 'published';
  return normalized;
};

const toTimestamp = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isExpired = (value, now = new Date()) => {
  const expiresAt = toTimestamp(value);
  if (!expiresAt) return false;
  return expiresAt < now.getTime();
};

const isVerifiedStatus = (value, fallback = 'verified') => {
  const normalized = normalizeStatus(value || fallback);
  return VERIFIED_STATUSES.has(normalized);
};

const isNonAuthoritativeStatus = (value) => {
  const normalized = normalizeStatus(value);
  return normalized ? NON_AUTHORITATIVE_STATUSES.has(normalized) : false;
};

const isCurrentVerifiedKnowledge = (record = {}, now = new Date()) => {
  if (!record || record.is_active === false || record.deactivated === true) return false;

  const verificationStatus = normalizeStatus(record.verification_status || record.verificationStatus || 'verified');
  const publicationStatus = normalizeStatus(record.status || record.knowledge_status || record.knowledgeStatus || '');

  if (isNonAuthoritativeStatus(verificationStatus)) return false;
  if (publicationStatus && isNonAuthoritativeStatus(publicationStatus)) return false;
  if (!isVerifiedStatus(verificationStatus)) return false;
  if (publicationStatus && !isVerifiedStatus(publicationStatus)) return false;
  if (isExpired(record.expiration_date || record.expirationDate, now)) return false;

  return true;
};

const normalizeComparable = (value) => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\b(?:office|department|unit|college|of|the)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const splitAliases = (value) => String(value || '')
  .split(/[;,]/)
  .map(clean)
  .filter(Boolean);

const resolveResponsibleOffice = (item = {}) => clean(
  item.source_office
    || item.sourceOffice
    || item.structured?.sourceOffice
    || item.structured?.officeName
    || item.structured?.office_name
    || item.officeName
    || item.department_name
    || item.structured?.department
    || ''
);

const sourceOfficeMatches = (item = {}, officeName = '') => {
  const target = normalizeComparable(officeName);
  if (!target) return true;

  const candidates = [
    resolveResponsibleOffice(item),
    item.canonical_name,
    item.department_name,
    item.location,
    item.aliases,
  ].flatMap((value) => splitAliases(value));

  return candidates.some((candidate) => {
    const normalized = normalizeComparable(candidate);
    return normalized && (normalized === target || normalized.includes(target) || target.includes(normalized));
  });
};

const detectResponsibleOfficeFromQuery = (query, documents = []) => {
  const normalizedQuery = normalizeComparable(query);
  if (!normalizedQuery) return null;

  const candidates = new Map();
  for (const doc of documents || []) {
    const names = [
      resolveResponsibleOffice(doc),
      String(doc?.type || '').toLowerCase() === 'office' ? doc?.canonical_name : '',
      String(doc?.type || '').toLowerCase() === 'department' ? doc?.canonical_name : '',
    ].filter(Boolean);

    for (const name of names) {
      const normalized = normalizeComparable(name);
      if (!normalized || normalized.length < 3) continue;
      const current = candidates.get(normalized) || { name, normalized, score: 0 };
      if (normalizedQuery.includes(normalized)) current.score = Math.max(current.score, normalized.length);
      for (const token of normalized.split(/\s+/).filter((item) => item.length >= 4)) {
        if (normalizedQuery.includes(token)) current.score = Math.max(current.score, token.length);
      }
      candidates.set(normalized, current);
    }
  }

  const best = Array.from(candidates.values())
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.normalized.length - left.normalized.length)[0];

  return best?.name || null;
};

module.exports = {
  normalizeStatus,
  isExpired,
  isVerifiedStatus,
  isCurrentVerifiedKnowledge,
  resolveResponsibleOffice,
  sourceOfficeMatches,
  detectResponsibleOfficeFromQuery,
};
