const STAKEHOLDER_VALUES = Object.freeze([
  'student',
  'faculty',
  'staff',
  'visitor',
  'applicant',
  'parent_guardian',
  'alumni',
  'other',
]);

const STAKEHOLDER_ALIASES = Object.freeze({
  student: ['student', 'students', 'learner', 'enrolled', 'estudyante', 'mag-aaral', 'mag aaral'],
  faculty: ['faculty', 'teacher', 'professor', 'instructor', 'dean', 'chairperson', 'guro'],
  staff: ['staff', 'employee', 'personnel', 'worker', 'admin staff'],
  visitor: ['visitor', 'visitors', 'guest', 'guests', 'bisita'],
  applicant: ['applicant', 'applicants', 'admission', 'admissions', 'incoming student', 'freshman', 'transferee', 'shiftee'],
  parent_guardian: ['parent', 'parents', 'guardian', 'guardians', 'mother', 'father', 'nanay', 'tatay'],
  alumni: ['alumni', 'alumnus', 'alumna', 'graduate', 'graduates'],
});

const cleanStakeholder = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!normalized) return '';
  if (normalized === 'parent' || normalized === 'guardian' || normalized === 'parents_guardians') {
    return 'parent_guardian';
  }
  return STAKEHOLDER_VALUES.includes(normalized) ? normalized : normalized;
};

const normalizeStakeholders = (value) => {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(/[;,]/);

  return Array.from(new Set(raw
    .map(cleanStakeholder)
    .filter(Boolean)));
};

const stakeholderMatches = (recordStakeholders = [], detectedStakeholder = '') => {
  const detected = cleanStakeholder(detectedStakeholder);
  if (!detected) return true;

  const normalized = normalizeStakeholders(recordStakeholders);
  if (normalized.length === 0) return true;
  if (normalized.includes('other')) return true;
  return normalized.includes(detected);
};

const detectStakeholderFromQuery = (query) => {
  const text = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  const matches = [];
  for (const [stakeholder, aliases] of Object.entries(STAKEHOLDER_ALIASES)) {
    for (const alias of aliases) {
      const phrase = String(alias || '').toLowerCase();
      if (!phrase) continue;
      const pattern = new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
      if (pattern.test(text)) {
        matches.push(stakeholder);
        break;
      }
    }
  }

  const unique = Array.from(new Set(matches));
  return unique.length === 1 ? unique[0] : null;
};

module.exports = {
  STAKEHOLDER_VALUES,
  normalizeStakeholders,
  stakeholderMatches,
  detectStakeholderFromQuery,
};
