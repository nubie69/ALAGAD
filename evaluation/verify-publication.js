'use strict';
const assert = require('node:assert/strict');
const { model, artifacts, dpiPNG } = require('./publication');
const { calculateMetrics } = require('./metrics');
const { viewer } = require('./export-publication');
// Controlled fixtures only; these are never saved as evaluation results.
const run = { mode: 'real-alagad-api', run_id: 'CONTROLLED-TEST', dataset_version: 'TEST', total_questions: 4,
  target_matching_policy: 'Controlled boolean fixture', predictions: [
    { question: '<script>alert(1)</script>', expected_intent: 'a', predicted_intent: 'a', target_correct: true },
    { question: 'b', expected_intent: 'a', predicted_intent: 'b', target_correct: true },
    { question: 'c', expected_intent: 'b', predicted_intent: 'b', target_correct: false },
    { question: 'd', expected_intent: 'b', predicted_intent: null, status: 'ERROR', error: 'Timeout' }
  ] };
const m = model(run), metrics = calculateMetrics(run.predictions.slice(0, 3));
assert.deepEqual(m.matrix, [[1, 1], [0, 1]]);
assert.equal(m.macro.f1, metrics.macro_f1);
assert.equal(m.accuracy, 2 / 3);
assert.equal(m.target, 2 / 3);
assert.equal(m.joint, 1 / 4); // The failed question stays in the joint denominator.
assert.equal(model({ ...run, target_matching_policy: null }).target, null);
const failed = model({ ...run, predictions: run.predictions.map(r => ({ ...r, predicted_intent: null, status: 'ERROR' })) });
assert.equal(failed.macro.f1, null);
assert.ok(artifacts(failed).find(f => f.id === 'intent-f1').svg.includes('Not evaluated'));
assert.ok(artifacts(model(null)).every(f => f.svg.includes('Not evaluated')));
const figures = artifacts(m);
assert.ok(figures.every(f => f.svg.includes('CONTROLLED-TEST') && f.svg.includes('TEST') && f.svg.includes('Sample size: 4')));
assert.ok(figures.find(f => f.id === 'confusion-matrix').svg.includes('Expected intents (rows)'));
assert.ok(figures.find(f => f.id === 'answer-review-1').svg.includes('&lt;script&gt;'));
assert.equal(m.answerCorrectness, null);
run.predictions[0].review = { correctness: 'correct' };
assert.equal(model(run).reviewed, 0);
run.predictions[0].reference_verified = true;
assert.equal(model(run).answerCorrectness, 1);
assert.equal(model(run).reviewed, 1);
assert.throws(() => model({ ...run, total_questions: 99 }));
assert.ok(!viewer({ ...run, predictions: [{ question: '</script>' }] }).includes('"question":"</script>"'));
const { Resvg } = require('@resvg/resvg-js');
const png = Buffer.from(dpiPNG(dpiPNG(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').render().asPng())));
let physicalChunks = 0;
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
  if (type === 'pHYs') { physicalChunks++; assert.equal(png.readUInt32BE(offset + 8), 11811); assert.equal(png.readUInt32BE(offset + 12), 11811); assert.equal(png[offset + 16], 1); }
  offset += length + 12;
}
assert.equal(physicalChunks, 1); // Replaces browser encoders' existing 96-DPI metadata.
console.log('PASS: metric agreement, failures, absent targets, no-run states, verified manual review, metadata, safe labels.');
