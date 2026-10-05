'use strict';
const INTENT_MAP = {
  service_requirements: 'requirements', service_process: 'process',
  service_location: 'service_location', personnel_location: 'personnel_location',
  position_personnel: 'personnel_by_position',
};
const PILOT_INTENTS = ['requirements', 'process', 'service_location', 'personnel_location', 'personnel_by_position'];
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
// Fixed aliases for supplied targets; never generated from predictions or answer text.
const ALIASES = {
  'ID Re-issuance': ['ID RE-ISSUANCE'],
  'Validation and Activation of School ID': ['Validation & Activation of School ID (Identification Card)'],
  'Permit to Stay Overnight and Extended Use of University Facilities': ['ISSUANCE OF PERMIT TO STAY OVERNIGHT AND EXTENDED USE OF UNIVERSITY FACILITIES'],
  'Entrance Examination Application': ['Entrance Examination Application for Incoming 1st Year Students & Transferees'],
  'Online Enrollment of New and Transferee Students': ['Online Enrollment of New & Transferee Students'],
};
const POSITIONS = {
  'Director of Student Leadership and Development': { role: 'Director', units: ['Student Leadership & Development Unit (SLEDEVU)', 'Student Leadership and Development'] },
  'Head of the IT Office': { role: 'Head', units: ['IT Office'] },
};
const names = expected => [expected, ...(ALIASES[expected] || [])].map(normalize);
const unit = person => person.office || person.departmentId || { name: person.department };
const sameUnit = (person, spec) => spec.units.map(normalize).includes(normalize(unit(person)?.name));
function targetResult(row, result, records = {}) {
  if (row.expected_intent === 'personnel_by_position') {
    const spec = POSITIONS[row.expected_target];
    const actualPeople = (records.personnel || []).filter(p => normalize(p.name) === normalize(result.entity_name));
    const expectedPeople = spec ? (records.personnel || []).filter(p => normalize(p.title) === normalize(spec.role) && sameUnit(p, spec)) : [];
    const person = actualPeople.length === 1 ? actualPeople[0] : null;
    const actualUnit = person && unit(person);
    const predicted = result.entity_type === 'position' ? result.predicted_target : null;
    const id = person && actualUnit?._id && normalize(person.title) === normalize(predicted)
      ? `${normalize(predicted)}@${actualUnit._id}` : null;
    const expectedIds = [...new Set(expectedPeople.map(p => unit(p)?._id ? `${normalize(spec.role)}@${unit(p)._id}` : null).filter(Boolean))];
    return { predicted_target: predicted, predicted_target_id: id, predicted_target_unit: actualUnit?.name || null,
      expected_target_id: expectedIds.length === 1 ? expectedIds[0] : null,
      target_correct: !result.target_capture_available || (predicted && !person) ? null : Boolean(spec && person && normalize(predicted) === normalize(spec.role) && sameUnit(person, spec)),
      target_match_method: 'Actual routed position plus unit of uniquely resolved returned personnel record; personnel identity is not the scored target.' };
  }
  const expectedNames = names(row.expected_target);
  const pool = row.expected_intent === 'personnel_location' ? records.personnel || [] : records.services || [];
  const expected = pool.filter(r => expectedNames.includes(normalize(r.name)));
  const actual = pool.filter(r => normalize(r.name) === normalize(result.predicted_target));
  const expectedId = expected.length === 1 ? String(expected[0]._id) : null;
  const predictedId = result.predicted_target_id || (actual.length === 1 ? String(actual[0]._id) : null);
  return { predicted_target: result.predicted_target, expected_target_id: expectedId, predicted_target_id: predictedId,
    target_correct: result.target_capture_available ? (expectedId && predictedId ? expectedId === predictedId : expectedNames.includes(normalize(result.predicted_target))) : null,
    target_match_method: expectedId && predictedId ? 'Unique database record IDs' : 'Normalized full target name with fixed documented aliases; no fuzzy/answer matching' };
}
async function loadRecords(options) {
  const root = new URL(options.endpoint); root.pathname = '/api/';
  const responses = await Promise.allSettled(['services', 'faculty'].map(async name => {
    const response = await fetch(new URL(name, root), { signal: AbortSignal.timeout(options.timeoutMs) });
    if (!response.ok) throw Error(`Target snapshot ${name}: HTTP ${response.status}`);
    const rows = await response.json(); if (!Array.isArray(rows)) throw Error(`Target snapshot ${name}: invalid response`);
    return rows.filter(r => r.isActive !== false);
  }));
  return { services: responses[0].status === 'fulfilled' ? responses[0].value : [],
    personnel: responses[1].status === 'fulfilled' ? responses[1].value : [],
    errors: responses.filter(r => r.status === 'rejected').map(r => r.reason.message) };
}
module.exports = { INTENT_MAP, PILOT_INTENTS, normalize, ALIASES, POSITIONS, targetResult, loadRecords };
