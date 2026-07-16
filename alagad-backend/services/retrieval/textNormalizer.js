const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const stripDiacritics = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const LEMMA_OVERRIDES = Object.freeze({
  exam: 'examination',
  exams: 'examination',
  examination: 'examination',
  examinations: 'examination',
  validation: 'validate',
  validations: 'validate',
  validated: 'validate',
  validating: 'validate',
  validator: 'validate',
  validators: 'validate',
  registers: 'register',
  registering: 'register',
  registration: 'register',
  registrations: 'register',
  registered: 'register',
  requirements: 'requirement',
  services: 'service',
  offices: 'office',
  departments: 'department',
  buildings: 'building',
  rooms: 'room',
  personnel: 'personnel',
});

const normalizeTokenForMatch = (token) => {
  const raw = String(token || '').trim().toLowerCase();
  if (!raw) return '';

  if (LEMMA_OVERRIDES[raw]) return LEMMA_OVERRIDES[raw];

  let value = raw;

  if (value.length > 7 && value.endsWith('ization')) {
    value = `${value.slice(0, -7)}ize`;
  } else if (value.length > 6 && value.endsWith('ation')) {
    value = `${value.slice(0, -5)}ate`;
  } else if (value.length > 5 && value.endsWith('ing')) {
    value = value.slice(0, -3);
    if (/(.)\1$/.test(value)) value = value.slice(0, -1);
    if (/(at|it|iz|id)$/.test(value)) value = `${value}e`;
  } else if (value.length > 4 && value.endsWith('ed')) {
    value = value.slice(0, -2);
    if (/(.)\1$/.test(value)) value = value.slice(0, -1);
    if (/(at|it|iz|id)$/.test(value)) value = `${value}e`;
  }

  if (value.length > 4 && value.endsWith('ies')) {
    value = `${value.slice(0, -3)}y`;
  } else if (value.length > 4 && value.endsWith('es') && !/(ses|xes|zes|ches|shes)$/.test(value)) {
    value = value.slice(0, -1);
  } else if (value.length > 4 && value.endsWith('s') && !/(ss|is|us|as)$/.test(value)) {
    value = value.slice(0, -1);
  }

  return LEMMA_OVERRIDES[value] || value;
};

const tokenizeForMatch = (value) => normalizeWhitespace(
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
)
  .split(' ')
  .filter(Boolean)
  .map((token) => normalizeTokenForMatch(token))
  .filter(Boolean);

const normalizeTextForMatch = (value) => tokenizeForMatch(value).join(' ');

module.exports = {
  normalizeWhitespace,
  stripDiacritics,
  normalizeTokenForMatch,
  tokenizeForMatch,
  normalizeTextForMatch,
};
