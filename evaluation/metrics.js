'use strict';

const divide = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator;

function calculateMetrics(predictions, declaredLabels = []) {
  for (const row of predictions) {
    if (typeof row.expected_intent !== 'string' || !row.expected_intent.trim()
      || typeof row.predicted_intent !== 'string' || !row.predicted_intent.trim()) {
      throw new Error('Metrics require actual, non-empty expected and predicted labels.');
    }
  }
  const labels = [...new Set([...declaredLabels, ...predictions.flatMap(
    row => [row.expected_intent, row.predicted_intent]
  )])].sort();
  const indices = new Map(labels.map((label, index) => [label, index]));
  const matrix = labels.map(() => labels.map(() => 0));
  for (const row of predictions) matrix[indices.get(row.expected_intent)][indices.get(row.predicted_intent)] += 1;
  const per_intent = labels.map((intent, index) => {
    const tp = matrix[index][index];
    const support = matrix[index].reduce((sum, count) => sum + count, 0);
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    const fp = predicted - tp;
    const fn = support - tp;
    const precision = divide(tp, tp + fp);
    const recall = divide(tp, tp + fn);
    return { intent, support, tp, fp, fn, precision, recall, f1: divide(2 * precision * recall, precision + recall) };
  });
  const total = predictions.length;
  const correct = per_intent.reduce((sum, item) => sum + item.tp, 0);
  return {
    evaluated_questions: total,
    correct_predictions: correct,
    incorrect_predictions: total - correct,
    accuracy: total ? correct / total : null,
    macro_f1: total ? divide(per_intent.reduce((sum, item) => sum + item.f1, 0), labels.length) : null,
    weighted_f1: total ? per_intent.reduce((sum, item) => sum + item.f1 * item.support, 0) / total : null,
    per_intent,
    confusion_matrix: { row_axis: 'actual', column_axis: 'predicted', labels, matrix },
  };
}

module.exports = { calculateMetrics };
