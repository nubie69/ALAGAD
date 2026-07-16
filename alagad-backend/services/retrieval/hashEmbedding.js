const DEFAULT_DIMENSIONS = Number(process.env.RETRIEVAL_EMBEDDING_DIM || 256);

const tokenize = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean);

const fnv1a = (input) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const l2Normalize = (vector) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (magnitude === 0) return vector.slice();
  return vector.map((value) => value / magnitude);
};

const embedTextDeterministic = (text, dimensions = DEFAULT_DIMENSIONS) => {
  const tokens = tokenize(text);
  const vector = new Array(dimensions).fill(0);

  for (const token of tokens) {
    const baseHash = fnv1a(token);
    const index = baseHash % dimensions;
    const sign = ((baseHash >>> 8) & 1) === 0 ? 1 : -1;
    const weight = 1 + Math.min(token.length, 10) / 10;
    vector[index] += sign * weight;
  }

  return l2Normalize(vector);
};

module.exports = {
  embedTextDeterministic,
  l2Normalize,
};
