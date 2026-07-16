const DEFAULT_LANGUAGE = 'english';
const SUPPORTED_LANGUAGES = new Set(['english', 'tagalog', 'cebuano']);
const STRICT_NO_INFO_RESPONSE = 'sorry I dont have the information';

const TAGALOG_MARKERS = new Set([
	'nasaan', 'saan', 'ano', 'sino', 'paano', 'kailan', 'bakit',
	'kailangan', 'serbisyo', 'opisina', 'silid', 'gusali', 'kagawaran',
	'departamento', 'hakbang', 'proseso', 'lokasyon', 'impormasyon',
	'kumuha', 'makuha', 'pagkuha',
]);

const CEBUANO_MARKERS = new Set([
	'asa', 'unsa', 'unsaon', 'kinsa', 'giunsa', 'ngano', 'kanus', 'kanus-a',
	'kinahanglan', 'serbisyo', 'opisina', 'kwarto', 'departamento',
	'lakang', 'proseso', 'lokasyon', 'impormasyon', 'pagkuha',
]);

const ENGLISH_MARKERS = new Set([
	'where', 'what', 'who', 'how', 'when', 'why', 'requirements',
	'process', 'steps', 'office', 'building', 'room', 'department',
	'service', 'location', 'details',
]);

const CEBUANO_UNIQUE = new Set(['asa', 'unsa', 'unsaon', 'kinsa', 'giunsa', 'ngano', 'kanus', 'kanus-a', 'kinahanglan']);
const TAGALOG_UNIQUE = new Set(['nasaan', 'saan', 'ano', 'sino', 'paano', 'kailan', 'bakit', 'kailangan', 'kumuha', 'makuha']);

const LEXICON_RULES = [
	{ pattern: /\bunsaon\s+pagkuha\b/gi, replacement: 'how to get' },
	{ pattern: /\bunsaon\s+pag\s*kuha\b/gi, replacement: 'how to get' },
	{ pattern: /\bunsaon\b/gi, replacement: 'how to' },
	{ pattern: /\bpaano\s+makuha\b/gi, replacement: 'how to get' },
	{ pattern: /\bpaano\s+kumuha\b/gi, replacement: 'how to get' },
	{ pattern: /\bunsa ang\b/gi, replacement: 'what is' },
	{ pattern: /\bano ang\b/gi, replacement: 'what is' },
	{ pattern: /\bkinsa si\b/gi, replacement: 'who is' },
	{ pattern: /\bsino si\b/gi, replacement: 'who is' },
	{ pattern: /\basa ang\b/gi, replacement: 'where is' },
	{ pattern: /\bnasaan ang\b/gi, replacement: 'where is' },
	{ pattern: /\bsaan ang\b/gi, replacement: 'where is' },
	{ pattern: /\bgiunsa\b/gi, replacement: 'how' },
	{ pattern: /\bpaano\b/gi, replacement: 'how' },
	{ pattern: /\bngano\b/gi, replacement: 'why' },
	{ pattern: /\bbakit\b/gi, replacement: 'why' },
	{ pattern: /\bkanus-a\b/gi, replacement: 'when' },
	{ pattern: /\bkanus\b/gi, replacement: 'when' },
	{ pattern: /\bkailan\b/gi, replacement: 'when' },
	{ pattern: /\bunsa\b/gi, replacement: 'what' },
	{ pattern: /\bano\b/gi, replacement: 'what' },
	{ pattern: /\bkinsa\b/gi, replacement: 'who' },
	{ pattern: /\bsino\b/gi, replacement: 'who' },
	{ pattern: /\basa\b/gi, replacement: 'where' },
	{ pattern: /\bnasaan\b/gi, replacement: 'where' },
	{ pattern: /\bsaan\b/gi, replacement: 'where' },
	{ pattern: /\bkinahanglan\b/gi, replacement: 'requirements' },
	{ pattern: /\bkailangan\b/gi, replacement: 'requirements' },
	{ pattern: /\bserbisyo\b/gi, replacement: 'service' },
	{ pattern: /\bopisina\b/gi, replacement: 'office' },
	{ pattern: /\bkwarto\b/gi, replacement: 'room' },
	{ pattern: /\bsilid\b/gi, replacement: 'room' },
	{ pattern: /\bgusali\b/gi, replacement: 'building' },
	{ pattern: /\bdepartamento\b/gi, replacement: 'department' },
	{ pattern: /\bkagawaran\b/gi, replacement: 'department' },
	{ pattern: /\bhakbang\b/gi, replacement: 'steps' },
	{ pattern: /\blakang\b/gi, replacement: 'steps' },
	{ pattern: /\bproseso\b/gi, replacement: 'process' },
	{ pattern: /\blokasyon\b/gi, replacement: 'location' },
	{ pattern: /\bimpormasyon\b/gi, replacement: 'information' },
	{ pattern: /\bpagkuha\b/gi, replacement: 'get' },
	{ pattern: /\bmakuha\b/gi, replacement: 'get' },
	{ pattern: /\bkumuha\b/gi, replacement: 'get' },
	{ pattern: /\bng\b/gi, replacement: 'of' },
];

const NO_INFO_TRANSLATIONS = {
	tagalog: STRICT_NO_INFO_RESPONSE,
	cebuano: STRICT_NO_INFO_RESPONSE,
};

const RESPONSE_LABEL_TRANSLATIONS = {
	tagalog: {
		Service: 'Serbisyo',
		Details: 'Detalye',
		Requirements: 'Mga kailangan',
		Process: 'Proseso',
		Contact: 'Contact',
		Sources: 'Mga source',
		Location: 'Lokasyon',
	},
	cebuano: {
		Service: 'Serbisyo',
		Details: 'Detalye',
		Requirements: 'Mga kinahanglanon',
		Process: 'Proseso',
		Contact: 'Kontak',
		Sources: 'Mga gigikanan',
		Location: 'Lokasyon',
	},
};

const CATEGORY_TRANSLATIONS = {
	tagalog: {
		Building: 'Gusali',
		Department: 'Kagawaran',
		Office: 'Opisina',
		Room: 'Silid',
		Service: 'Serbisyo',
		Personnel: 'Tauhan',
	},
	cebuano: {
		Building: 'Gusali',
		Department: 'Departamento',
		Office: 'Opisina',
		Room: 'Kwarto',
		Service: 'Serbisyo',
		Personnel: 'Personnel',
	},
};

const SUGGESTION_TRANSLATION_RULES = {
	tagalog: [
		{ pattern: /\boffice\b/gi, replacement: 'opisina' },
		{ pattern: /\bdepartment\b/gi, replacement: 'kagawaran' },
		{ pattern: /\bbuilding\b/gi, replacement: 'gusali' },
		{ pattern: /\broom\b/gi, replacement: 'silid' },
		{ pattern: /\bservice\b/gi, replacement: 'serbisyo' },
		{ pattern: /\bof the\b/gi, replacement: 'ng' },
		{ pattern: /\bof\b/gi, replacement: 'ng' },
	],
	cebuano: [
		{ pattern: /\boffice\b/gi, replacement: 'opisina' },
		{ pattern: /\bdepartment\b/gi, replacement: 'departamento' },
		{ pattern: /\bbuilding\b/gi, replacement: 'gusali' },
		{ pattern: /\broom\b/gi, replacement: 'kwarto' },
		{ pattern: /\bservice\b/gi, replacement: 'serbisyo' },
		{ pattern: /\bof the\b/gi, replacement: 'sa' },
		{ pattern: /\bof\b/gi, replacement: 'sa' },
	],
};

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const keepConciseResponse = (value, maxSentences = 2) => {
	const normalized = normalizeWhitespace(value);
	if (!normalized) return '';

	const sentenceParts = (normalized.match(/[^.!?]+[.!?]?/g) || [])
		.map((part) => part.trim())
		.filter(Boolean);

	if (sentenceParts.length === 0) return normalized;
	return normalizeWhitespace(sentenceParts.slice(0, Math.max(1, maxSentences)).join(' '));
};

const tokenize = (text) => normalizeWhitespace(
	String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9\s\-]/g, ' ')
)
	.split(' ')
	.filter(Boolean);

const countMatches = (tokens, dictionary) => tokens.reduce((count, token) => (
	dictionary.has(token) ? count + 1 : count
), 0);

const countUniqueMatches = (tokens, dictionary) => tokens.reduce((count, token) => (
	dictionary.has(token) ? count + 1 : count
), 0);

const isSupportedLanguage = (language) => SUPPORTED_LANGUAGES.has(String(language || '').toLowerCase());

const detectLanguage = (text) => {
	const tokens = tokenize(text);
	if (tokens.length === 0) {
		return {
			language: DEFAULT_LANGUAGE,
			scores: { english: 0, tagalog: 0, cebuano: 0 },
			reason: 'empty_default',
		};
	}

	const scores = {
		english: countMatches(tokens, ENGLISH_MARKERS),
		tagalog: countMatches(tokens, TAGALOG_MARKERS),
		cebuano: countMatches(tokens, CEBUANO_MARKERS),
	};

	const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	const topScore = sorted[0][1];
	const secondScore = sorted[1][1];

	if (topScore === 0) {
		return {
			language: DEFAULT_LANGUAGE,
			scores,
			reason: 'fallback_default',
		};
	}

	if (topScore > secondScore) {
		return {
			language: sorted[0][0],
			scores,
			reason: 'majority_score',
		};
	}

	const cebuanoUniqueHits = countUniqueMatches(tokens, CEBUANO_UNIQUE);
	const tagalogUniqueHits = countUniqueMatches(tokens, TAGALOG_UNIQUE);
	if (cebuanoUniqueHits > tagalogUniqueHits) {
		return {
			language: 'cebuano',
			scores,
			reason: 'tie_breaker_unique_markers',
		};
	}

	if (tagalogUniqueHits > cebuanoUniqueHits) {
		return {
			language: 'tagalog',
			scores,
			reason: 'tie_breaker_unique_markers',
		};
	}

	if (scores.english > 0) {
		return {
			language: 'english',
			scores,
			reason: 'tie_breaker_english',
		};
	}

	return {
		language: DEFAULT_LANGUAGE,
		scores,
		reason: 'tie_breaker_default',
	};
};

const translateToEnglishLexicon = (text) => {
	let output = String(text || '');
	for (const rule of LEXICON_RULES) {
		output = output.replace(rule.pattern, rule.replacement);
	}
	return normalizeWhitespace(output);
};

const runOpenAiTranslation = async ({ openaiClient, model, text, sourceLanguage, targetLanguage, styleHint }) => {
	const completion = await openaiClient.chat.completions.create({
		model,
		temperature: 0,
		messages: [
			{
				role: 'system',
				content: [
					'You are a translation engine.',
					'Return only the translated text with no extra explanation.',
					'Translate only the chatbot answer text.',
					'Do not translate interface labels, buttons, or system instructions.',
					'Keep the translated reply short, natural, and professional (1-2 concise sentences).',
					'Preserve proper nouns, IDs, room numbers, and source identifiers exactly.',
					styleHint || '',
				].join(' '),
			},
			{
				role: 'user',
				content: `Translate from ${sourceLanguage} to ${targetLanguage}:\n${String(text || '').trim()}`,
			},
		],
	});

	return normalizeWhitespace(completion?.choices?.[0]?.message?.content || '');
};

const translateQueryToEnglish = async ({ query, detectedLanguage, openaiClient, model, options = {} }) => {
	const sourceLanguage = isSupportedLanguage(detectedLanguage) ? detectedLanguage : DEFAULT_LANGUAGE;
	const original = String(query || '').trim();
	const fastMode = Boolean(options?.fastMode);

	if (sourceLanguage === 'english') {
		return {
			text: original,
			sourceLanguage,
			targetLanguage: 'english',
			translated: false,
			method: 'none',
		};
	}

	if (openaiClient && !fastMode) {
		try {
			const translated = await runOpenAiTranslation({
				openaiClient,
				model,
				text: original,
				sourceLanguage,
				targetLanguage: 'English',
				styleHint: 'Keep concise and faithful to original intent for retrieval.',
			});
			if (translated) {
				return {
					text: translated,
					sourceLanguage,
					targetLanguage: 'english',
					translated: true,
					method: 'openai',
				};
			}
		} catch (error) {
			const fallback = translateToEnglishLexicon(original);
			return {
				text: fallback || original,
				sourceLanguage,
				targetLanguage: 'english',
				translated: normalizeWhitespace(fallback).toLowerCase() !== original.toLowerCase(),
				method: fallback ? 'openai_failed_lexicon' : 'openai_failed_identity',
				error: error.message,
			};
		}
	}

	const fallback = translateToEnglishLexicon(original);
	return {
		text: fallback || original,
		sourceLanguage,
		targetLanguage: 'english',
		translated: normalizeWhitespace(fallback).toLowerCase() !== original.toLowerCase(),
		method: fallback ? 'lexicon' : 'identity',
	};
};

const translateResponseLabelsFallback = (englishText, targetLanguage) => {
	const labels = RESPONSE_LABEL_TRANSLATIONS[targetLanguage] || {};
	const lines = String(englishText || '').split('\n');

	return lines.map((line) => {
		for (const [englishLabel, translatedLabel] of Object.entries(labels)) {
			if (line.startsWith(`${englishLabel}:`)) {
				return `${translatedLabel}:${line.slice(englishLabel.length + 1)}`;
			}
		}
		return line;
	}).join('\n');
};

const translateStructuredTemplateFallback = (englishText, targetLanguage) => {
	const normalizedTarget = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_LANGUAGE;
	if (normalizedTarget === 'english') return '';

	const source = normalizeWhitespace(String(englishText || ''));
	if (!source) return '';

	const whoMatch = source.match(/^(.+?) is the head of (.+)\.$/i);
	if (whoMatch) {
		const name = String(whoMatch[1] || '').trim();
		const unit = String(whoMatch[2] || '').trim();
		return `Si ${name} is the head of ${unit}.`;
	}

	const wherePersonMatch = source.match(/^(.+?) can be found at (.+)\.$/i);
	if (wherePersonMatch) {
		const name = String(wherePersonMatch[1] || '').trim();
		const location = String(wherePersonMatch[2] || '').trim();
		return `${name} can be found sa ${location}.`;
	}

	const requirementsMatch = source.match(/^To get (.+?), you should have these requirements: (.+)\.$/i);
	if (requirementsMatch) {
		const serviceName = String(requirementsMatch[1] || '').trim();
		const requirements = String(requirementsMatch[2] || '').trim();
		if (normalizedTarget === 'tagalog') {
			return `Para makuha ang ${serviceName}, kailangan mo ang requirements na ito: ${requirements}.`;
		}
		return `Aron makuha ang ${serviceName}, kinahanglan nimo ang requirements nga: ${requirements}.`;
	}

	const processMatch = source.match(/^The process for (.+?) is (.+)\.$/i);
	if (processMatch) {
		const serviceName = String(processMatch[1] || '').trim();
		const processText = String(processMatch[2] || '').trim();
		if (normalizedTarget === 'tagalog') {
			return `Ang proseso for ${serviceName} is ${processText}.`;
		}
		return `Ang proseso sa ${serviceName} is ${processText}.`;
	}

	const unitHandlerMatch = source.match(/^The unit that handles (.+?) is (.+)\.$/i);
	if (unitHandlerMatch) {
		const serviceName = String(unitHandlerMatch[1] || '').trim();
		const unitName = String(unitHandlerMatch[2] || '').trim();
		if (normalizedTarget === 'tagalog') {
			return `Ang unit na nagha-handle ng ${serviceName} is ${unitName}.`;
		}
		return `Ang unit nga mo-handle sa ${serviceName} is ${unitName}.`;
	}

	const whereProcessMatch = source.match(/^(.+?) can be processed at (.+)\.$/i);
	if (whereProcessMatch) {
		const serviceName = String(whereProcessMatch[1] || '').trim();
		const location = String(whereProcessMatch[2] || '').trim();
		return `${serviceName} can be processed sa ${location}.`;
	}

	const descriptionMatch = source.match(/^(.+?) is (.+)\.$/i);
	if (descriptionMatch) {
		const subject = String(descriptionMatch[1] || '').trim();
		const description = String(descriptionMatch[2] || '').trim();
		return `${subject} is ${description}.`;
	}

	return '';
};

const translateEnglishResponse = async ({ englishText, targetLanguage, openaiClient, model, noInfoText }) => {
	const normalizedTarget = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_LANGUAGE;
	const source = String(englishText || '').trim();

	if (normalizedTarget === 'english') {
		return {
			text: source,
			sourceLanguage: 'english',
			targetLanguage: 'english',
			translated: false,
			method: 'none',
		};
	}

	if (source === String(noInfoText || '').trim()) {
		return {
			text: NO_INFO_TRANSLATIONS[normalizedTarget] || source || STRICT_NO_INFO_RESPONSE,
			sourceLanguage: 'english',
			targetLanguage: normalizedTarget,
			translated: normalizedTarget !== 'english',
			method: 'fixed_no_info_passthrough',
		};
	}

	if (openaiClient) {
		try {
			const styleHint = normalizedTarget === 'tagalog'
				? 'Use natural Taglish (Tagalog + English mix). Use simple, common Tagalog words like: saan, sino, ano, kailangan, proseso. Keep it short and professional.'
				: 'Use natural Cebuano + English mix. Use simple, common Cebuano words like: asa, kinsa, unsa, kinahanglan, proseso. Keep it short and professional.';

			const translated = await runOpenAiTranslation({
				openaiClient,
				model,
				text: source,
				sourceLanguage: 'English',
				targetLanguage: normalizedTarget === 'tagalog' ? 'Tagalog' : 'Cebuano',
				styleHint,
			});

			if (translated) {
				return {
					text: keepConciseResponse(translated),
					sourceLanguage: 'english',
					targetLanguage: normalizedTarget,
					translated: true,
					method: 'openai',
				};
			}
		} catch (error) {
			const templateFallback = translateStructuredTemplateFallback(source, normalizedTarget);
			if (templateFallback) {
				return {
					text: keepConciseResponse(templateFallback),
					sourceLanguage: 'english',
					targetLanguage: normalizedTarget,
					translated: true,
					method: 'openai_failed_template_fallback',
					error: error.message,
				};
			}

			const fallbackText = translateResponseLabelsFallback(source, normalizedTarget);
			return {
				text: keepConciseResponse(fallbackText),
				sourceLanguage: 'english',
				targetLanguage: normalizedTarget,
				translated: fallbackText !== source,
				method: 'openai_failed_label_fallback',
				error: error.message,
			};
		}
	}

	const templateFallback = translateStructuredTemplateFallback(source, normalizedTarget);
	if (templateFallback) {
		return {
			text: keepConciseResponse(templateFallback),
			sourceLanguage: 'english',
			targetLanguage: normalizedTarget,
			translated: true,
			method: 'template_fallback',
		};
	}

	const fallbackText = translateResponseLabelsFallback(source, normalizedTarget);
	return {
		text: keepConciseResponse(fallbackText),
		sourceLanguage: 'english',
		targetLanguage: normalizedTarget,
		translated: fallbackText !== source,
		method: 'label_fallback',
	};
};

const translateSuggestionTextFallback = (text, targetLanguage) => {
	const normalizedTarget = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_LANGUAGE;
	if (normalizedTarget === 'english') return String(text || '').trim();

	let output = String(text || '');
	const rules = SUGGESTION_TRANSLATION_RULES[normalizedTarget] || [];
	for (const rule of rules) {
		output = output.replace(rule.pattern, rule.replacement);
	}
	return normalizeWhitespace(output);
};

const translateSuggestionList = (suggestions, targetLanguage) => {
	const normalizedTarget = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_LANGUAGE;
	const categoryMap = CATEGORY_TRANSLATIONS[normalizedTarget] || {};

	return (suggestions || []).map((item) => {
		const type = String(item?.type || '').trim();
		const canonicalName = String(item?.canonical_name || '').trim();
		const aliases = Array.isArray(item?.aliases) ? item.aliases : [];

		return {
			...item,
			language: normalizedTarget,
			category: type,
			category_display: categoryMap[type] || type,
			display_name: translateSuggestionTextFallback(canonicalName, normalizedTarget),
			aliases_display: aliases.map((alias) => translateSuggestionTextFallback(alias, normalizedTarget)),
		};
	});
};

const translateQuerySuggestionText = (englishText, targetLanguage) => {
	const normalizedTarget = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_LANGUAGE;
	const original = String(englishText || '').trim();
	if (normalizedTarget === 'english') return original;

	let output = original;
	if (normalizedTarget === 'tagalog') {
		output = output
			.replace(/^where is\s+/i, 'nasaan ang ')
			.replace(/^how to get\s+/i, 'paano kumuha ng ')
			.replace(/^who is\s+/i, 'sino si ')
			.replace(/^what are the requirements for\s+/i, 'ano ang mga kailangan para sa ')
			.replace(/^requirements for\s+/i, 'mga kailangan para sa ')
			.replace(/^process for\s+/i, 'proseso para sa ')
			.replace(/^steps for\s+/i, 'mga hakbang para sa ');
	} else if (normalizedTarget === 'cebuano') {
		output = output
			.replace(/^where is\s+/i, 'asa ang ')
			.replace(/^how to get\s+/i, 'unsaon pagkuha sa ')
			.replace(/^who is\s+/i, 'kinsa si ')
			.replace(/^what are the requirements for\s+/i, 'unsa ang mga kinahanglanon para sa ')
			.replace(/^requirements for\s+/i, 'mga kinahanglanon para sa ')
			.replace(/^process for\s+/i, 'proseso para sa ')
			.replace(/^steps for\s+/i, 'mga lakang para sa ');
	}

	output = translateSuggestionTextFallback(output, normalizedTarget);
	return normalizeWhitespace(output);
};

module.exports = {
	DEFAULT_LANGUAGE,
	STRICT_NO_INFO_RESPONSE,
	detectLanguage,
	isSupportedLanguage,
	translateToEnglishLexicon,
	translateQueryToEnglish,
	translateEnglishResponse,
	translateSuggestionTextFallback,
	translateSuggestionList,
	translateQuerySuggestionText,
};
