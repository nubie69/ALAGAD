'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { calculateMetrics } = require('./metrics');
const { predictIntent, validateEndpoint } = require('./adapters/existingChatApi');

const NATIVE_INTENTS = ['where', 'who', 'service', 'requirements', 'process', 'description',
  'where_process', 'unit_handler', 'deadline', 'processing_time', 'contact', 'faq', 'clarification', 'unknown'];

function parseArgs(args) {
  const options = { endpoint: process.env.ALAGAD_EVALUATION_URL || 'http://127.0.0.1:3001/api/chat',
    dataset: path.join(__dirname, 'test_questions.json'), timeoutMs: 45000, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help') { options.help = true; continue; }
    if (!['--url', '--dataset', '--timeout'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--url') options.endpoint = value;
    if (flag === '--dataset') options.dataset = path.resolve(value);
    if (flag === '--timeout') options.timeoutMs = Number(value);
  }
  options.endpoint = validateEndpoint(options.endpoint);
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300000) {
    throw new Error('--timeout must be an integer from 1 to 300000 milliseconds.');
  }
  return options;
}

function validateDataset(dataset) {
  if (!Array.isArray(dataset) || dataset.length === 0) throw new Error('Dataset must be a non-empty array.');
  const seen = new Set();
  dataset.forEach((row, index) => {
    if (!row || typeof row.question !== 'string' || !row.question.trim()) throw new Error(`Question ${index + 1} is empty.`);
    if (!NATIVE_INTENTS.includes(row.expected_intent)) throw new Error(`Question ${index + 1} has an unsupported expected_intent.`);
    if (row.language !== undefined && (typeof row.language !== 'string' || !row.language.trim())) throw new Error(`Invalid language at question ${index + 1}.`);
    if (row.conversationHistory !== undefined && (!Array.isArray(row.conversationHistory)
      || row.conversationHistory.some(item => !item || typeof item.text !== 'string' || !['user', 'bot'].includes(item.sender)))) {
      throw new Error(`Invalid conversationHistory at question ${index + 1}.`);
    }
    const key = JSON.stringify([row.question.trim().toLowerCase(), row.language || 'en', row.conversationHistory || []]);
    if (seen.has(key)) throw new Error(`Duplicate question/context at row ${index + 1}.`);
    seen.add(key);
  });
  return dataset;
}

const number = value => value === null ? 'N/A' : value.toFixed(4);
const percent = value => value === null ? 'N/A' : `${(value * 100).toFixed(2)}%`;

function formatReport(report) {
  const m = report.metrics;
  const lines = ['ALAGAD CHATBOT EVALUATION', `Date: ${report.finished_at}`, `Endpoint: ${report.endpoint}`,
    `Status: ${report.complete ? 'COMPLETE' : 'INCOMPLETE - failed requests are excluded from metrics'}`,
    `Total Questions: ${report.total_questions}`, `Evaluated: ${m.evaluated_questions}`, `Failed Requests: ${report.failed_requests}`,
    `Correct Predictions: ${m.correct_predictions}`, `Incorrect Predictions: ${m.incorrect_predictions}`,
    `${report.complete ? 'Overall Accuracy' : 'Accuracy on completed requests ONLY'}: ${percent(m.accuracy)}`,
    `Macro F1: ${number(m.macro_f1)}`, `Weighted F1: ${number(m.weighted_f1)}`, '',
    'Intent                 Support   TP   FP   FN  Precision  Recall      F1'];
  for (const item of m.per_intent) lines.push(`${item.intent.padEnd(22)} ${String(item.support).padStart(7)} ${String(item.tp).padStart(4)} ${String(item.fp).padStart(4)} ${String(item.fn).padStart(4)} ${number(item.precision).padStart(10)} ${number(item.recall).padStart(7)} ${number(item.f1).padStart(7)}`);
  const { labels, matrix } = m.confusion_matrix;
  const width = Math.max(8, ...labels.map(label => label.length)) + 2;
  lines.push('', 'CONFUSION MATRIX (rows = actual, columns = predicted)', ''.padEnd(width) + labels.map(label => label.padStart(width)).join(''));
  matrix.forEach((row, index) => lines.push(labels[index].padEnd(width) + row.map(count => String(count).padStart(width)).join('')));
  lines.push('', 'INCORRECT PREDICTIONS');
  if (!report.misclassified_questions.length) lines.push(m.evaluated_questions ? 'None among completed requests.' : 'No predictions available.');
  for (const row of report.misclassified_questions) lines.push(`Question: ${row.question}`, `Expected: ${row.expected_intent}`, `Predicted: ${row.predicted_intent}`, 'Status: INCORRECT', '');
  if (report.errors.length) {
    lines.push('REQUEST ERRORS');
    for (const row of report.errors) lines.push(`${row.question}: ${row.error}`);
  }
  lines.push('', `Native labels without ground-truth examples: ${report.uncovered_native_intents.join(', ') || 'none'}`,
    'These metrics measure native intent/routing labels, not factual correctness of answer text.',
    'Expected labels are manually authored. Do not relabel questions just to improve the score.');
  return lines.join('\n') + '\n';
}

async function evaluate(options) {
  const raw = await fs.readFile(options.dataset, 'utf8');
  const dataset = validateDataset(JSON.parse(raw));
  const started = new Date();
  const predictions = [];
  for (const [index, row] of dataset.entries()) {
    const entry = { id: row.id || index + 1, question: row.question, expected_intent: row.expected_intent,
      category: row.category || null, rationale: row.rationale || null };
    const start = Date.now();
    try {
      const result = await predictIntent({ question: row.question, language: row.language, conversationHistory: row.conversationHistory }, options);
      Object.assign(entry, result, { correct: result.predicted_intent === row.expected_intent, status: result.predicted_intent === row.expected_intent ? 'CORRECT' : 'INCORRECT' });
    } catch (error) {
      Object.assign(entry, { predicted_intent: null, correct: null, status: 'ERROR', error: error.message });
    }
    entry.duration_ms = Date.now() - start;
    predictions.push(entry);
    console.log(`[${index + 1}/${dataset.length}] Question: ${entry.question}\nExpected: ${entry.expected_intent}\nPredicted: ${entry.predicted_intent ?? '(no prediction)'}\nResult: ${entry.status}${entry.error ? ` - ${entry.error}` : ''}\n`);
  }
  const labels = [...new Set(dataset.map(row => row.expected_intent))].sort();
  const scored = predictions.filter(row => row.status !== 'ERROR');
  const errors = predictions.filter(row => row.status === 'ERROR');
  const report = {
    schema_version: 1, mode: 'real-alagad-api', started_at: started.toISOString(), finished_at: new Date().toISOString(),
    endpoint: options.endpoint, dataset: path.relative(__dirname, options.dataset),
    dataset_sha256: createHash('sha256').update(raw).digest('hex'), timeout_ms: options.timeoutMs,
    complete: errors.length === 0, total_questions: dataset.length, failed_requests: errors.length,
    prediction_coverage: scored.length / dataset.length,
    label_policy: 'Native ALAGAD response.intent. Macro labels = dataset expected labels union actual predicted labels. Zero denominator = 0. Request errors excluded; no predictions yields null aggregate scores.',
    uncovered_native_intents: NATIVE_INTENTS.filter(label => !labels.includes(label)),
    metrics: calculateMetrics(scored, labels), predictions,
    misclassified_questions: scored.filter(row => !row.correct), errors,
  };
  const directory = path.join(__dirname, 'results');
  await fs.mkdir(directory, { recursive: true });
  const runId = `${report.finished_at.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const json = JSON.stringify(report, null, 2) + '\n';
  const readable = formatReport(report);
  await fs.writeFile(path.join(directory, `${runId}.json`), json, { flag: 'wx' });
  await fs.writeFile(path.join(directory, `${runId}.txt`), readable, { flag: 'wx' });
  await fs.writeFile(path.join(directory, 'latest_results.json'), json);
  await fs.writeFile(path.join(directory, 'latest_results.txt'), readable);
  console.log(readable);
  console.log(`Saved: ${path.join(directory, 'latest_results.json')}`);
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node evaluation/evaluate.js [--url http://127.0.0.1:3001/api/chat] [--dataset path.json] [--timeout 45000]\nRequires the existing backend. Does not start servers, seed data, train models, or rebuild indexes.');
    return;
  }
  console.log('Evaluating the real ALAGAD API. Normal server audit logging and configured model calls may occur.');
  const report = await evaluate(options);
  if (!report.complete) process.exitCode = 2;
}

if (require.main === module) main().catch(error => { console.error(`Evaluation failed: ${error.message}`); process.exitCode = 1; });
module.exports = { NATIVE_INTENTS, parseArgs, validateDataset, formatReport, evaluate };
