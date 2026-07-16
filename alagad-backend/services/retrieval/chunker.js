const estimateTokenCount = (text) => {
  if (!text) return 0;
  return String(text).split(/\s+/).filter(Boolean).length;
};

const splitSentences = (text) => {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  return cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
};

const chunkContent = (content, canonicalId, { minTokens = 400, maxTokens = 800 } = {}) => {
  const sentences = splitSentences(content);
  if (sentences.length === 0) return [];

  const chunks = [];
  let current = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);
    const shouldFlush = currentTokens >= minTokens && (currentTokens + sentenceTokens) > maxTokens;

    if (shouldFlush) {
      chunks.push(current.join(' ').trim());
      current = [];
      currentTokens = 0;
    }

    current.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (current.length > 0) {
    chunks.push(current.join(' ').trim());
  }

  // Fallback for single, punctuation-free long text.
  if (chunks.length === 0) {
    const words = String(content || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += maxTokens) {
      chunks.push(words.slice(i, i + maxTokens).join(' '));
    }
  }

  if (chunks.length === 1 && estimateTokenCount(chunks[0]) < maxTokens) {
    return [
      {
        id: `${canonicalId}::chunk::0`,
        canonical_id: canonicalId,
        content: chunks[0],
      },
    ];
  }

  return chunks.map((chunk, index) => ({
    id: `${canonicalId}::chunk::${index}`,
    canonical_id: canonicalId,
    content: chunk,
  }));
};

module.exports = {
  chunkContent,
  estimateTokenCount,
};
