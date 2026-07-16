const {
	normalizeWhitespace,
	stripDiacritics,
	normalizeTokenForMatch,
} = require('./textNormalizer');

const TYPE_SYNONYMS = {
	Building: ['building', 'buildings', 'bldg', 'hall', 'gusali'],
	Department: ['department', 'departments', 'dept', 'college', 'unit', 'kagawaran', 'departamento'],
	Office: ['office', 'offices', 'unit', 'registrar', 'cashier', 'clinic', 'guidance', 'opisina', 'tanggapan'],
	Room: ['room', 'rooms', 'classroom', 'laboratory', 'lab', 'silid', 'kwarto'],
	Personnel: ['person', 'personnel', 'faculty', 'staff', 'professor', 'instructor', 'teacher', 'dean', 'who', 'sino', 'kinsa'],
	Service: [
		'service', 'services', 'requirements', 'process', 'steps', 'procedure',
		'validate', 'validation', 'exam', 'examination', 'register', 'registration',
	],
};

const PHRASE_SYNONYMS = [
	['id renewal', 'student id renewal'],
	['id card renewal', 'student id renewal'],
	['tor', 'transcript of records'],
	['coe', 'certificate of enrollment'],
	['cor', 'certificate of registration'],
	['coc', 'certificate of candidacy'],
	['enrolment', 'enrollment'],
	['registrar office', 'registrar'],
	['dept', 'department'],
	['cs dept', 'computer science department'],
	['it dept', 'information technology department'],
	['comp sci', 'computer science'],
	['head of department', 'department head'],
	['exam', 'examination'],
	['exams', 'examination'],
	['register', 'registration'],
	['validation', 'validate'],
	['validating', 'validate'],
	['validated', 'validate'],
];

const STOPWORDS = new Set([
	'the', 'a', 'an', 'is', 'are', 'where', 'what', 'who', 'when', 'why', 'how',
	'find', 'locate', 'show', 'tell', 'can', 'i', 'me', 'my', 'for', 'of', 'to', 'in', 'on', 'at',
]);

const INTENT_TYPE_FILTERS = Object.freeze({
	where: ['Office', 'Department', 'Building', 'Room', 'Personnel'],
	who: ['Personnel'],
	service: ['Service'],
});

const RETRIEVAL_CATEGORIES = Object.freeze({
	SERVICE: 'Service',
	PROCESS: 'Process',
	REQUIREMENTS: 'Requirements',
	PERSONNEL: 'Personnel',
	LOCATION: 'Location',
	DESCRIPTION: 'Description',
});

const CATEGORY_FILTERS = Object.freeze({
	[RETRIEVAL_CATEGORIES.SERVICE]: ['service'],
	[RETRIEVAL_CATEGORIES.PROCESS]: ['process'],
	[RETRIEVAL_CATEGORIES.REQUIREMENTS]: ['requirements'],
	[RETRIEVAL_CATEGORIES.PERSONNEL]: ['personnel'],
	[RETRIEVAL_CATEGORIES.LOCATION]: ['location'],
	[RETRIEVAL_CATEGORIES.DESCRIPTION]: ['description'],
});

const SERVICE_WHERE_PROCESS_RE = /\b(where\s+to\s+process|where\s+(?:can\s+i\s+)?(?:process|apply|get|request|avail)|asa\b.*\b(?:process|proseso|service|serbisyo)\b|saan\b.*\b(?:process|proseso|service|serbisyo)\b)\b/;
const SERVICE_UNIT_HANDLES_RE = /\b((?:what|which|unsa|ano)\s+unit\b.*\b(?:handle|handles|responsible|in\s+charge|manage|manages)\b|\bunit\b.*\b(?:handle|handles|responsible|in\s+charge|manage|manages)\b)\b/;
const SERVICE_REQUIREMENTS_RE = /\b(requirements?|needed|need|kinahanglan|kailangan)\b/;
const SERVICE_PROCESS_RE = /\b(process|step(?:\s+by\s+step)?|steps?|procedure|how(?:\s+to)?|paano|giunsa|proseso|hakbang|lakang)\b/;
const SERVICE_DESCRIPTION_RE = /\b(description|about|what\s+is|what'?s|unsa\s+ang|ano\s+ang)\b/;
const LOCATION_RE = /\b(where|location|locate|find|nasaan|saan|asa)\b/;
const PERSONNEL_RE = /\b(who|sino|kinsa)\b/;
const GENERIC_SERVICE_RE = /\b(service|services|transcript|certificate|renewal|validation|validate|process|requirements?)\b/;

const normalizeQuery = (input) => {
	const original = String(input || '');
	let normalized = stripDiacritics(original).toLowerCase();

	for (const [source, target] of PHRASE_SYNONYMS) {
		const sourceEscaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		normalized = normalized.replace(new RegExp(`\\b${sourceEscaped}\\b`, 'g'), target);
	}

	// Remove punctuation while preserving useful identifier characters.
	normalized = normalized
		.replace(/[^a-z0-9\s_\-#]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	const tokens = normalizeWhitespace(normalized)
		.split(' ')
		.filter(Boolean);
	const baseFormTokens = tokens.map((token) => normalizeTokenForMatch(token)).filter(Boolean);

	const filteredTokens = baseFormTokens.filter((token) => !STOPWORDS.has(token));
	const normalizedFiltered = filteredTokens.join(' ').trim();
	const normalizedRaw = baseFormTokens.join(' ').trim();

	return {
		original,
		normalizedRaw: normalizedRaw || normalized,
		normalized: normalizedFiltered || normalizedRaw || normalized,
		tokens: filteredTokens.length > 0 ? filteredTokens : baseFormTokens,
	};
};

const classifyIntent = (input) => {
	const normalizedInput = normalizeWhitespace(stripDiacritics(input).toLowerCase());
	const normalizedTokens = normalizedInput
		.split(' ')
		.filter(Boolean)
		.map((token) => normalizeTokenForMatch(token));
	const normalizedBaseText = normalizedTokens.join(' ');
	if (!normalizedInput) return 'unknown';

	// Strict overlap priority: Process > Requirements > Description > Location > Personnel
	if (SERVICE_PROCESS_RE.test(normalizedBaseText)) {
		return 'service';
	}

	if (SERVICE_REQUIREMENTS_RE.test(normalizedBaseText)) {
		return 'service';
	}

	if (SERVICE_DESCRIPTION_RE.test(normalizedBaseText)
		&& (GENERIC_SERVICE_RE.test(normalizedBaseText) || /\bwhat\s+is\b/.test(normalizedBaseText))) {
		return 'service';
	}

	if (SERVICE_UNIT_HANDLES_RE.test(normalizedBaseText)) {
		return 'service';
	}

	if (SERVICE_WHERE_PROCESS_RE.test(normalizedBaseText)) {
		return 'service';
	}

	if (LOCATION_RE.test(normalizedBaseText)) {
		return 'where';
	}

	if (PERSONNEL_RE.test(normalizedBaseText)) {
		return 'who';
	}

	if (/\b(how|what|paano|giunsa|unsa|ano|requirements?|process|steps?|procedure|service|services|validate|validation|description|about)\b/.test(normalizedBaseText)) {
		return 'service';
	}

	return 'unknown';
};

const classifyRetrievalCategory = (input) => {
	const normalizedInput = normalizeWhitespace(stripDiacritics(input).toLowerCase());
	const normalizedTokens = normalizedInput
		.split(' ')
		.filter(Boolean)
		.map((token) => normalizeTokenForMatch(token));
	const normalizedBaseText = normalizedTokens.join(' ');
	if (!normalizedBaseText) return RETRIEVAL_CATEGORIES.DESCRIPTION;

	if (PERSONNEL_RE.test(normalizedBaseText)) {
		return RETRIEVAL_CATEGORIES.PERSONNEL;
	}

	if (SERVICE_PROCESS_RE.test(normalizedBaseText)) {
		return RETRIEVAL_CATEGORIES.PROCESS;
	}

	if (SERVICE_REQUIREMENTS_RE.test(normalizedBaseText)) {
		return RETRIEVAL_CATEGORIES.REQUIREMENTS;
	}

	if (SERVICE_DESCRIPTION_RE.test(normalizedBaseText)
		&& (GENERIC_SERVICE_RE.test(normalizedBaseText) || /\bwhat\s+is\b/.test(normalizedBaseText))) {
		return RETRIEVAL_CATEGORIES.DESCRIPTION;
	}

	if (LOCATION_RE.test(normalizedBaseText) || SERVICE_WHERE_PROCESS_RE.test(normalizedBaseText)) {
		return RETRIEVAL_CATEGORIES.LOCATION;
	}

	if (GENERIC_SERVICE_RE.test(normalizedBaseText) || SERVICE_UNIT_HANDLES_RE.test(normalizedBaseText)) {
		return RETRIEVAL_CATEGORIES.SERVICE;
	}

	const inferredIntent = classifyIntent(input);
	if (inferredIntent === 'who') return RETRIEVAL_CATEGORIES.PERSONNEL;
	if (inferredIntent === 'where') return RETRIEVAL_CATEGORIES.LOCATION;
	return RETRIEVAL_CATEGORIES.DESCRIPTION;
};

const inferCategoryFilters = (category) => {
	const key = String(category || '').trim();
	const filters = CATEGORY_FILTERS[key];
	return Array.isArray(filters) ? [...filters] : [];
};

const inferIntentTypeFilters = (intent) => {
	const key = String(intent || '').toLowerCase();
	const filters = INTENT_TYPE_FILTERS[key];
	return Array.isArray(filters) ? [...filters] : [];
};

const inferTypeFilters = (normalizedQuery) => {
	const tokens = new Set(normalizeWhitespace(normalizedQuery).split(' ').filter(Boolean));
	const inferred = [];

	for (const [type, words] of Object.entries(TYPE_SYNONYMS)) {
		const hit = words.some((word) => tokens.has(word));
		if (hit) inferred.push(type);
	}

	return inferred;
};

module.exports = {
	TYPE_SYNONYMS,
	RETRIEVAL_CATEGORIES,
	normalizeQuery,
	classifyIntent,
	classifyRetrievalCategory,
	inferTypeFilters,
	inferIntentTypeFilters,
	inferCategoryFilters,
};
