const DANGEROUS_PROTOCOLS = new Set(['javascript:', 'data:', 'file:']);

const sanitizeResourceUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const error = new Error('Resource URL must be a valid URL.');
    error.code = 'INVALID_RESOURCE_URL';
    throw error;
  }

  const protocol = String(parsed.protocol || '').toLowerCase();
  if (DANGEROUS_PROTOCOLS.has(protocol) || !['http:', 'https:'].includes(protocol)) {
    const error = new Error('Resource URL must use HTTP or HTTPS.');
    error.code = 'UNSAFE_RESOURCE_URL';
    throw error;
  }

  parsed.hash = parsed.hash || '';
  return parsed.toString();
};

const isSafeResourceUrl = (value) => {
  try {
    return Boolean(sanitizeResourceUrl(value));
  } catch {
    return false;
  }
};

module.exports = {
  sanitizeResourceUrl,
  isSafeResourceUrl,
};
