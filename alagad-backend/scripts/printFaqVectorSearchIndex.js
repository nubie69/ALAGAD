const dotenv = require('dotenv');
const {
  FAQ_VECTOR_INDEX_NAME,
  buildFaqEmbedding,
} = require('../services/faqSemanticRetrieval');
const { EMBEDDING_MODEL } = require('../services/retrieval/embeddingProvider');

dotenv.config();

const main = async () => {
  const sampleEmbedding = await buildFaqEmbedding('ALAGAD FAQ vector search dimension check');
  const dimensions = sampleEmbedding.length;

  if (!dimensions) {
    throw new Error('Unable to determine FAQ embedding dimensions.');
  }

  console.log(JSON.stringify({
    name: FAQ_VECTOR_INDEX_NAME,
    embeddingModel: EMBEDDING_MODEL,
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: dimensions,
          similarity: 'cosine',
        },
        {
          type: 'filter',
          path: 'verified',
        },
        {
          type: 'filter',
          path: 'status',
        },
        {
          type: 'filter',
          path: 'isActive',
        },
      ],
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
