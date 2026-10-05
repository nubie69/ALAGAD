'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseArgs, validateDataset } = require('./evaluate');
const { INTENT_MAP, targetResult } = require('./pilot-policy');
const dataset = validateDataset(JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'pilot_questions.json'), 'utf8')));
assert.equal(dataset.length, 15);
assert.deepEqual(dataset.reduce((s, r) => (s[r.language] = (s[r.language] || 0) + 1, s), {}), { English: 11, Cebuano: 3, Tagalog: 1 });
assert.ok(dataset.every(r => r.reference_verified === false));
assert.ok(dataset[11].query.includes('Mariluo'));
assert.ok([3, 4, 11].every(i => dataset[i].review_note));
assert.ok(parseArgs([]).dataset.endsWith('pilot_questions.json'));
assert.equal(INTENT_MAP.service_process, 'process');
assert.equal(INTENT_MAP.service_requirements, 'requirements');
assert.equal(INTENT_MAP.position_personnel, 'personnel_by_position');
const records = { services: [{ _id: 'service-1', name: 'EXEMPTION SLIP' }], personnel: [
  { _id: 'person-1', name: 'Actual Person', title: 'Director', office: { _id: 'office-1', name: 'Student Leadership & Development Unit (SLEDEVU)' } },
  { _id: 'person-2', name: 'Other Person', title: 'Director', office: { _id: 'office-2', name: 'Wrong Office' } }
] };
const base = { target_capture_available: true, entity_type: 'position', predicted_target: 'Director', entity_name: 'Actual Person' };
assert.equal(targetResult(dataset[9], base, records).target_correct, true);
assert.equal(targetResult(dataset[9], { ...base, entity_name: 'Other Person' }, records).target_correct, false);
assert.equal(targetResult(dataset[9], { ...base, entity_name: 'Missing Person' }, records).target_correct, null);
assert.equal(targetResult(dataset[9], { ...base, predicted_target: null, entity_name: null }, records).target_correct, false);
const service = targetResult(dataset[0], { predicted_target: 'EXEMPTION SLIP', target_capture_available: true }, records);
assert.equal(service.predicted_target_id, 'service-1');
assert.equal(service.target_correct, true);
assert.equal(targetResult(dataset[0], { predicted_target: 'Other slip', target_capture_available: true }, records).target_correct, false);
assert.equal(targetResult(dataset[0], { predicted_target: null, target_capture_available: false }, records).target_correct, null);
console.log('PASS: exact pilot data, semantic mapping, target IDs, role + unit matching, missing capture evidence, preserved review notes.');
