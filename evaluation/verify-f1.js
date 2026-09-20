'use strict';

// Controlled metric verification only. Never writes to real evaluation results.
const assert = require('node:assert/strict');
const http = require('node:http');
const { calculateMetrics } = require('./metrics');
const { validateDataset, parseArgs, formatReport } = require('./evaluate');
const { predictIntent } = require('./adapters/existingChatApi');
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const rows = (expected, predicted) => expected.map((expected_intent, index) => ({ expected_intent, predicted_intent: predicted[index] }));

async function verify() {
  const expected = ['navigation', 'navigation', 'office_info', 'office_info'];
  const perfect = calculateMetrics(rows(expected, expected));
  assert.equal(perfect.accuracy, 1);
  assert.equal(perfect.macro_f1, 1);
  assert.equal(perfect.weighted_f1, 1);
  perfect.per_intent.forEach(item => { assert.equal(item.f1, 1); assert.equal(item.fp, 0); assert.equal(item.fn, 0); });
  assert.deepEqual(perfect.confusion_matrix.matrix, [[2, 0], [0, 2]]);
  console.log('PASS A: perfect predictions -> accuracy 100%, macro/weighted F1 1.0000');

  const partial = calculateMetrics(rows(expected, ['navigation', 'office_info', 'office_info', 'office_info']));
  assert.equal(partial.accuracy, 0.75);
  closeTo(partial.per_intent[0].precision, 1);
  closeTo(partial.per_intent[0].recall, 0.5);
  closeTo(partial.per_intent[0].f1, 2 / 3);
  closeTo(partial.per_intent[1].precision, 2 / 3);
  closeTo(partial.per_intent[1].recall, 1);
  closeTo(partial.per_intent[1].f1, 0.8);
  closeTo(partial.macro_f1, 11 / 15);
  closeTo(partial.weighted_f1, 11 / 15);
  assert.deepEqual(partial.confusion_matrix.matrix, [[1, 1], [0, 2]]);
  console.log('PASS B: one error -> accuracy 75%, macro/weighted F1 0.7333');

  const wrong = calculateMetrics(rows(expected, ['office_info', 'office_info', 'navigation', 'navigation']));
  assert.equal(wrong.accuracy, 0);
  assert.equal(wrong.macro_f1, 0);
  assert.equal(wrong.weighted_f1, 0);
  wrong.per_intent.forEach(item => assert.equal(item.f1, 0));
  assert.deepEqual(wrong.confusion_matrix.matrix, [[0, 2], [2, 0]]);
  console.log('PASS C: every prediction wrong -> accuracy and all F1 scores 0');

  const imbalance = calculateMetrics(rows(['a', 'a', 'a', 'b'], ['a', 'a', 'b', 'b']));
  closeTo(imbalance.macro_f1, 11 / 15);
  closeTo(imbalance.weighted_f1, 23 / 30);
  const unseen = calculateMetrics(rows(['a', 'a'], ['new_label', 'new_label']), ['a', 'absent']);
  assert.equal(unseen.macro_f1, 0);
  assert.equal(unseen.per_intent.find(item => item.intent === 'new_label').fp, 2);
  assert.equal(unseen.per_intent.find(item => item.intent === 'a').fn, 2);
  assert.equal(unseen.per_intent.find(item => item.intent === 'absent').f1, 0);
  assert.equal(calculateMetrics([], ['a']).accuracy, null);
  assert.equal(calculateMetrics([], ['a']).macro_f1, null);
  assert.throws(() => calculateMetrics([{ expected_intent: 'a', predicted_intent: null }]));
  console.log('PASS: unequal support, unexpected labels, empty results, and zero denominators');

  assert.throws(() => validateDataset([]));
  assert.throws(() => validateDataset([{ question: 'Where?', expected_intent: 'fake' }]));
  assert.throws(() => validateDataset([{ question: ' ', expected_intent: 'where' }]));
  assert.throws(() => validateDataset([{ question: 'Where?', expected_intent: 'where' }, { question: 'where?', expected_intent: 'where' }]));
  assert.throws(() => parseArgs(['--timeout', '0']));
  assert.throws(() => parseArgs(['--url', 'file:///tmp/test']));
  console.log('PASS: dataset and CLI validation');

  // A local mock is ONLY for adapter transport verification, never a chatbot score.
  let received;
  let responseMode = 'valid';
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    if (responseMode === 'error') { res.writeHead(503); res.end('{}'); return; }
    res.end(JSON.stringify(responseMode === 'missing' ? { reply: 'No intent' } : { intent: 'where', reply: 'Adapter test response' }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const options = { endpoint: `http://127.0.0.1:${server.address().port}/api/chat`, timeoutMs: 1000 };
    const result = await predictIntent({ question: 'Where is the Library?', expected_intent: 'unknown' }, options);
    assert.equal(result.predicted_intent, 'where');
    assert.equal(received.expected_intent, undefined);
    assert.equal(received.message, 'Where is the Library?');
    assert.equal(received.selectedSuggestion, null);
    assert.deepEqual(received.conversationHistory, []);
    responseMode = 'missing';
    await assert.rejects(predictIntent({ question: 'test' }, options), /no valid intent/);
    responseMode = 'error';
    await assert.rejects(predictIntent({ question: 'test' }, options), /503/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  const emptyReport = formatReport({ metrics: calculateMetrics([], ['unknown']), complete: false, total_questions: 1,
    failed_requests: 1, misclassified_questions: [], errors: [{ question: 'test', error: 'network unavailable' }], uncovered_native_intents: [] });
  assert.match(emptyReport, /INCOMPLETE/);
  assert.match(emptyReport, /N\/A/);
  console.log('PASS: real adapter does not send ground truth; failures are never unknown predictions');
  console.log('\nAll verification checks passed. These are controlled tests, not ALAGAD accuracy results.');
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
