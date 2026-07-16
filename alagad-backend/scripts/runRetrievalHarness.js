const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { buildIndexPayloadFromRecords } = require('../services/retrieval/documentIndexer');
const { recordsByType, queryCases } = require('../test/fixtures/retrievalFixture');

const run = async () => {
  const indexPayload = buildIndexPayloadFromRecords(recordsByType);
  const pipeline = new RetrievalPipeline({
    indexLoader: async () => indexPayload,
  });

  let passed = 0;
  for (const testCase of queryCases) {
    // eslint-disable-next-line no-await-in-loop
    const result = await pipeline.retrieve(testCase.query);
    const topId = result.finalContext[0]?.id || null;
    const ok = topId === testCase.expectedId;
    if (ok) passed += 1;

    const marker = ok ? 'PASS' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${marker} | query="${testCase.query}" | expected=${testCase.expectedId} | actual=${topId} | mode=${result.retrievalMode}`);
  }

  const accuracy = queryCases.length === 0 ? 0 : (passed / queryCases.length) * 100;
  // eslint-disable-next-line no-console
  console.log(`\nRetrieval accuracy: ${passed}/${queryCases.length} (${accuracy.toFixed(1)}%)`);

  if (passed !== queryCases.length) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Harness failed:', error);
  process.exitCode = 1;
});
