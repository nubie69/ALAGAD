const DEFAULT_LANGUAGE = 'english';
const SUPPORTED_LANGUAGES = new Set(['english', 'tagalog', 'cebuano']);
const STRICT_NO_INFO_RESPONSE = require('./campusBehavior').UNKNOWN;

// Question words and grammar carry more language evidence than borrowed campus terms.
const LANGUAGE_CUES = {
  english: new Set('where what who how when why please can could should would is are does do they their the my your get find'.split(' ')),
  tagalog: new Set('nasaan saan saang ano anong sino paano kailan bakit kailangan kumuha kukuha makuha mahahanap makikita pumunta makapunta doon diyan yung iyong inyong ito at bilang pakisuyo opo po'.split(' ')),
  cebuano: new Set('asa unsa unsang unsay unsaon kinsa giunsa ngano kanus-a kinahanglan makakuha makita makaadto adto didto dinhi diha nako akong imong nga og ug palihog kini kani'.split(' ')),
};
const QUESTION_CUES = new Set('where what who how when why nasaan saan saang ano anong sino paano kailan bakit asa unsa unsang unsay unsaon kinsa giunsa ngano kanus-a'.split(' '));
const BORROWED_TERMS = new Set('requirements process steps office building room department service services location details records enrollment documents'.split(' '));

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
	tagalog: require('./campusBehavior').UNKNOWN_TRANSLATIONS.tagalog,
	cebuano: require('./campusBehavior').UNKNOWN_TRANSLATIONS.cebuano,
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

const preserveResponseText = (value) => {
	// Preserve every verified step, requirement and paragraph.
	return String(value || '').trim();
};

const tokenize = (text) => normalizeWhitespace(
	String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9\s\-]/g, ' ')
)
	.split(' ')
	.filter(Boolean);

const isSupportedLanguage = (language) => SUPPORTED_LANGUAGES.has(String(language || '').toLowerCase());

const detectLanguage = (text) => {
  const tokens = tokenize(text);
  const scores = { english: 0, tagalog: 0, cebuano: 0 };
  const first = {};
  tokens.forEach((token, index) => {
    for (const [language, cues] of Object.entries(LANGUAGE_CUES)) {
      if (!cues.has(token)) continue;
      scores[language] += QUESTION_CUES.has(token) ? 3 : token === 'makaadto' ? 4 : 1;
      if (first[language] === undefined) first[language] = index;
    }
  });
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]
    || (first[a] ?? Infinity) - (first[b] ?? Infinity));
  const language = scores[ranked[0]] ? ranked[0] : DEFAULT_LANGUAGE;
  // Borrowed university terms identify mixed wording but cannot outweigh local grammar.
  const present = Object.keys(scores).filter(key => scores[key] > 0);
  if (language !== 'english' && tokens.some(token => BORROWED_TERMS.has(token)) && !present.includes('english')) present.push('english');
  return {
    language, scores,
    language_style: present.length > 1 ? 'mixed' : 'single',
    languages: present,
    reason: !tokens.length ? 'empty_default' : scores[ranked[0]] || tokens.some(token => BORROWED_TERMS.has(token)) ? 'current_query_cues' : 'fallback_default',
  };
};

const translateToEnglishLexicon = (text) => {
	let output = String(text || '');
	for (const rule of LEXICON_RULES) {
		output = output.replace(rule.pattern, rule.replacement);
	}
	return normalizeWhitespace(output);
};

const runOpenAiTranslation = async ({ openaiClient, model, text, sourceLanguage, targetLanguage, styleHint, officialNames = [] }) => {
  let protectedText = String(text || '').trim();
  const names = [...new Set(officialNames.filter(name => typeof name === 'string' && name.trim()))]
    .sort((a, b) => b.length - a.length);
  const protectedNames = [];
  for (const name of names) {
    if (!protectedText.includes(name)) continue;
    const token = `__ALAGAD_NAME_${protectedNames.length}__`;
    protectedText = protectedText.split(name).join(token);
    protectedNames.push({ token, name });
  }
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
					'Translate every sentence and list item. Preserve line breaks, numbering, facts and intent; never summarize or omit steps.',
					'Preserve official service, personnel, office, department, building and room names, TOR, IDs and placeholders exactly. Translate only the surrounding explanation.',
					styleHint || '',
				].join(' '),
			},
			{
				role: 'user',
				content: `Translate from ${sourceLanguage} to ${targetLanguage}:\n${protectedText}`,
			},
		],
	});

	let translated = String(completion?.choices?.[0]?.message?.content || '').trim();
  for (const { token, name } of protectedNames) {
    if (!translated.includes(token)) throw new Error('Translation did not preserve an official name');
    translated = translated.split(token).join(name);
  }
  return translated;
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
		return normalizedTarget === 'tagalog' ? `Si ${name} ang pinuno ng ${unit}.` : `Si ${name} ang pangulo sa ${unit}.`;
	}

	const wherePersonMatch = source.match(/^(.+?) can be found at (.+)\.$/i);
	if (wherePersonMatch) {
		const name = String(wherePersonMatch[1] || '').trim();
		const location = String(wherePersonMatch[2] || '').trim();
		return normalizedTarget === 'tagalog' ? `Matatagpuan si ${name} sa ${location}.` : `Makita si ${name} sa ${location}.`;
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
			return `Ang proseso para sa ${serviceName} ay ${processText}.`;
		}
		return `Ang proseso sa ${serviceName} mao ang ${processText}.`;
	}

	const unitHandlerMatch = source.match(/^The unit that handles (.+?) is (.+)\.$/i);
	if (unitHandlerMatch) {
		const serviceName = String(unitHandlerMatch[1] || '').trim();
		const unitName = String(unitHandlerMatch[2] || '').trim();
		if (normalizedTarget === 'tagalog') {
			return `Ang unit na nangangasiwa sa ${serviceName} ay ${unitName}.`;
		}
		return `Ang unit nga nagdumala sa ${serviceName} mao ang ${unitName}.`;
	}

	const whereProcessMatch = source.match(/^(.+?) can be processed at (.+)\.$/i);
	if (whereProcessMatch) {
		const serviceName = String(whereProcessMatch[1] || '').trim();
		const location = String(whereProcessMatch[2] || '').trim();
		return normalizedTarget === 'tagalog' ? `Maaaring iproseso ang ${serviceName} sa ${location}.` : `Mahimong iproseso ang ${serviceName} sa ${location}.`;
	}

	const descriptionMatch = source.match(/^(.+?) is (.+)\.$/i);
	if (descriptionMatch) {
		const subject = String(descriptionMatch[1] || '').trim();
		const description = String(descriptionMatch[2] || '').trim();
		return normalizedTarget === 'tagalog' ? `Ang ${subject} ay ${description}.` : `Ang ${subject} mao ang ${description}.`;
	}

	return '';
};

const translateEnglishResponse = async ({ englishText, targetLanguage, openaiClient, model, noInfoText, officialNames = [], forceTranslation = false }) => {
	const normalizedTarget = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_LANGUAGE;
	const source = String(englishText || '').trim();

	if (normalizedTarget === 'english' && !forceTranslation) {
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
			const styleHint = normalizedTarget === 'english' ? 'Use English. Keep every verified detail and list item.' : normalizedTarget === 'tagalog'
				? 'Use Tagalog grammar and explanations. Retain commonly used English university terms and official names. Use simple, common Tagalog words like: saan, sino, ano, kailangan, proseso. Keep every verified detail and list item.'
				: 'Use Cebuano grammar and explanations. Retain commonly used English university terms and official names. Use simple, common Cebuano words like: asa, kinsa, unsa, kinahanglan, proseso. Keep every verified detail and list item.';

			const translated = await runOpenAiTranslation({
				openaiClient,
				model,
				text: source,
				sourceLanguage: forceTranslation ? 'the language of the supplied text (which may be mixed)' : 'English',
				targetLanguage: { english: 'English', tagalog: 'Tagalog', cebuano: 'Cebuano' }[normalizedTarget],
				styleHint,
                officialNames,
			});

			if (translated) {
				return {
					text: preserveResponseText(translated),
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
					text: preserveResponseText(templateFallback),
					sourceLanguage: 'english',
					targetLanguage: normalizedTarget,
					translated: true,
					method: 'openai_failed_template_fallback',
					error: error.message,
				};
			}

			const fallbackText = translateResponseLabelsFallback(source, normalizedTarget);
			return {
				text: preserveResponseText(fallbackText),
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
			text: preserveResponseText(templateFallback),
			sourceLanguage: 'english',
			targetLanguage: normalizedTarget,
			translated: true,
			method: 'template_fallback',
		};
	}

	const fallbackText = translateResponseLabelsFallback(source, normalizedTarget);
	return {
		text: preserveResponseText(fallbackText),
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
			display_name: canonicalName,
			aliases_display: aliases,
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

	return normalizeWhitespace(output);
};

const officialNamesFromRecords = (records = []) => [...new Set(records.flatMap(record => {
  const s = record.structured || {};
  return [record.canonical_name, record.assigned_building, record.department_name, record.source_office,
    s.name, s.office_name, s.building_name, s.department, s.role, ...(s.personnel_names || [])];
}).filter(value => typeof value === 'string' && value.trim()))];

module.exports = {
    officialNamesFromRecords,
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
