const OpenAI = require('openai');
const { embedTextDeterministic } = require('./hashEmbedding');

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'hash-embedding-v1';

const shouldUseOpenAIEmbeddings = () => {
  const provider = String(process.env.RETRIEVAL_EMBEDDINGS_PROVIDER || '').toLowerCase();
  return provider === 'openai' && Boolean(process.env.OPENAI_API_KEY);
};

class EmbeddingProvider {
  constructor() {
    this.model = EMBEDDING_MODEL;
    this.openai = shouldUseOpenAIEmbeddings()
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  async embedText(text) {
    if (!this.openai) {
      return embedTextDeterministic(text);
    }

    const response = await this.openai.embeddings.create({
      model: this.model,
      input: String(text || ''),
    });

    return response?.data?.[0]?.embedding || [];
  }
}

const sharedEmbeddingProvider = new EmbeddingProvider();

module.exports = {
  EMBEDDING_MODEL,
  EmbeddingProvider,
  sharedEmbeddingProvider,
};
