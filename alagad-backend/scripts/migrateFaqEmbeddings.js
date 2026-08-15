const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { migrateMissingFaqEmbeddings } = require('../services/faqSemanticRetrieval');

dotenv.config();

const main = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required to migrate FAQ embeddings.');
  }

  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(mongoUri);
  const result = await migrateMissingFaqEmbeddings({ dryRun });
  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => null);
  });
