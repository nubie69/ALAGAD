const express = require('express');
const OpenAI = require('openai');
const { protect, authorize } = require('../middleware/authMiddleware');
const Settings = require('../models/Settings');

const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { sharedVectorIndexManager } = require('../services/retrieval/vectorIndexManager');
const {
  get_building,
  get_room,
  get_personnel,
  get_service_details,
  get_faq_details,
  fetchStructuredByType,
} = require('../services/retrieval/deterministicFetch');
const {
  STRICT_SYSTEM_PROMPT,
  buildStrictPrompt,
  NO_RELIABLE_INFO_RESPONSE,
} = require('../services/retrieval/promptTemplates');
const { logAudit, logAlert } = require('../services/retrieval/auditLogger');
const {
  detectLanguage,
  translateQueryToEnglish,
  translateEnglishResponse,
  translateToEnglishLexicon,
} = require('../services/retrieval/languageService');
const {
  getAutocompleteSuggestions,
  registerSuggestionSelection,
} = require('../services/retrieval/autocompleteService');
const { normalizeStakeholders, stakeholderMatches, detectStakeholderFromQuery } = require('../services/retrieval/stakeholderUtils');
const {
  isCurrentVerifiedKnowledge,
  resolveResponsibleOffice,
  sourceOfficeMatches,
} = require('../services/retrieval/knowledgePolicy');

const router = express.Router();
const pipeline = new RetrievalPipeline();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const MATCH_SCORE_THRESHOLD = Number(process.env.MATCH_SCORE_THRESHOLD || 80);
const HELP_DESK_REFERRAL_RESPONSE = "I'm unable to verify the complete information from the available university records. Please contact or go to the specific department help desk for accurate assistance.";
const RESPONSE_TYPES = Object.freeze({
  VERIFIED_ANSWER: 'VERIFIED_ANSWER',
  PARTIAL_INFORMATION: 'PARTIAL_INFORMATION',
  HELP_DESK_REFERRAL: 'HELP_DESK_REFERRAL',
  NO_MATCH: 'NO_MATCH',
  CONFLICTING_INFORMATION: 'CONFLICTING_INFORMATION',
});
// Ask a concise question when multiple service candidates remain plausible.
const SINGLE_CLOSEST_MATCH_MODE = false;
const UNIT_HANDLES_INTENT_RE = /\b((?:what|which|unsa|ano)\s+unit\b.*\b(?:handle|handles|responsible|in\s+charge|manage|manages)\b|\bunit\b.*\b(?:handle|handles|responsible|in\s+charge|manage|manages)\b)\b/i;
const SERVICE_WHERE_PROCESS_INTENT_RE = /\b(where\s+to\s+process|where\s+(?:can\s+i\s+)?(?:process|apply|get|request|avail)|asa\b.*\b(?:process|proseso|service|serbisyo)\b|saan\b.*\b(?:process|proseso|service|serbisyo)\b)\b/i;
const SERVICE_REQUIREMENTS_INTENT_RE = /\b(requirements?|needed|need|kinahanglan|kailangan)\b/i;
const SERVICE_PROCESS_INTENT_RE = /\b(process|step(?:\s+by\s+step)?|steps?|procedure|how(?:\s+to)?|paano|giunsa|proseso|hakbang|lakang)\b/i;
const SERVICE_DESCRIPTION_INTENT_RE = /\b(description|about|what\s+is|what'?s|unsa\s+ang|ano\s+ang)\b/i;
const DEADLINE_INTENT_RE = /\b(deadline|due\s+date|until\s+when|last\s+day|cutoff|cut-off|kanus-a|kailan|hanggang\s+kailan)\b/i;
const PROCESSING_TIME_INTENT_RE = /\b(processing\s+time|how\s+long|duration|turnaround|release|when\s+can\s+i\s+(?:claim|get)|pila\s+ka\s+adlaw|gaano\s+katagal)\b/i;
const CONTACT_INTENT_RE = /\b(contact|phone|email|number|hotline|call|message|kontak|tawag)\b/i;
const SERVICE_INTENT_SIGNAL_SET = new Set(['unit_handler', 'requirements', 'process', 'description', 'where_process', 'deadline', 'processing_time', 'contact', 'service']);
const SERVICE_VAGUE_TERMS = new Set([
  'how', 'to', 'apply', 'application', 'process', 'steps', 'step', 'requirements', 'requirement', 'where', 'what', 'which', 'service', 'unit', 'handles', 'handle', 'responsible', 'for', 'the', 'a', 'an',
  'paano', 'giunsa', 'unsa', 'ano', 'saan', 'asa', 'proseso', 'kailangan', 'kinahanglan',
]);
const FOLLOW_UP_START_RE = /^(?:i\s+mean|how\s+about|what\s+about|and\b|also\b|then\b|about\b|regarding\b|siya\b|kani\b|kini\b|mao\s+ni\b)/i;
const CONTEXT_PRONOUN_RE = /\b(him|her|it|that|this|there|siya|kani|kini|niya)\b/i;
const GENERIC_SHORT_QUERY_RE = /^(?:where|who|what|how|requirements?|process|description|saan|asa|sino|kinsa|ano|unsa)\??$/i;
const MATCH_STOPWORDS = new Set([
  'where', 'what', 'who', 'how', 'when', 'find', 'locate', 'location',
  'can', 'please', 'the', 'and', 'for', 'from', 'with', 'about',
  'saan', 'asa', 'ano', 'unsa', 'kinsa', 'sino', 'paano', 'giunsa',
]);

const WHERE_INTENT_RE = /\b(where|location|locate|find|nasaan|saan|asa)\b/i;
const WHO_INTENT_RE = /\b(who|sino|kinsa|person|personnel|faculty|staff|professor|dean|instructor|teacher)\b/i;
const SERVICE_INTENT_RE = /\b(how|what|requirements?|process|steps?|procedure|service|services|transcript|certificate|renewal|paano|giunsa|unsa|ano|kinahanglan|kailangan|proseso|hakbang|lakang)\b/i;

const inferIntentFromQuery = (query, contextItem) => {
  const text = String(query || '').toLowerCase();
  const byType = String(contextItem?.type || '').toLowerCase();

  const isServiceContext = byType === 'service';
  const hasUnitHandles = UNIT_HANDLES_INTENT_RE.test(text);
  const hasWhereProcess = SERVICE_WHERE_PROCESS_INTENT_RE.test(text);
  const hasProcess = SERVICE_PROCESS_INTENT_RE.test(text);
  const hasRequirements = SERVICE_REQUIREMENTS_INTENT_RE.test(text);
  const hasDescription = SERVICE_DESCRIPTION_INTENT_RE.test(text);
  const hasDeadline = DEADLINE_INTENT_RE.test(text);
  const hasProcessingTime = PROCESSING_TIME_INTENT_RE.test(text);
  const hasContact = CONTACT_INTENT_RE.test(text);

  // Strict overlap priority: Process > Requirements > Description > Location > Personnel
  if (isServiceContext && hasDeadline) return 'deadline';
  if (isServiceContext && hasProcessingTime) return 'processing_time';
  if (isServiceContext && hasContact) return 'contact';
  if (isServiceContext && hasUnitHandles) return 'unit_handler';
  if (isServiceContext && hasWhereProcess && !hasRequirements && !hasDescription) return 'where_process';
  if (isServiceContext && hasProcess) return 'process';
  if (isServiceContext && hasRequirements) return 'requirements';
  if (isServiceContext && hasDescription) return 'description';

  if (hasUnitHandles) return 'unit_handler';
  if (WHERE_INTENT_RE.test(text) && isServiceContext) return 'where_process';
  if (WHERE_INTENT_RE.test(text)) return 'where';
  if (WHO_INTENT_RE.test(text)) return 'who';
  if (SERVICE_PROCESS_INTENT_RE.test(text)) return 'process';
  if (DEADLINE_INTENT_RE.test(text)) return 'deadline';
  if (PROCESSING_TIME_INTENT_RE.test(text)) return 'processing_time';
  if (CONTACT_INTENT_RE.test(text)) return 'contact';
  if (SERVICE_REQUIREMENTS_INTENT_RE.test(text)) return 'requirements';
  if (SERVICE_DESCRIPTION_INTENT_RE.test(text) && isServiceContext) return 'description';
  if (SERVICE_INTENT_RE.test(text)) return 'service';

  if (byType === 'department') return 'where';
  if (byType === 'office') return 'where';
  if (byType === 'service') return 'description';
  if (byType === 'faq') return 'faq';
  if (byType === 'personnel') return 'who';
  if (byType === 'room') return 'where';
  if (byType === 'building') return 'where';

  return 'unknown';
};

const normalizeTokenSet = (text) => new Set(
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
);

const detectHallucinationRisk = (response, contextItems) => {
  const answer = String(response || '');
  if (!answer || answer === NO_RELIABLE_INFO_RESPONSE) {
    return { risk: false, coverage: 1 };
  }

  const answerTokens = normalizeTokenSet(answer);
  if (answerTokens.size === 0) return { risk: false, coverage: 1 };

  const contextCorpus = (contextItems || [])
    .map((item) => {
      const structured = item.structured ? JSON.stringify(item.structured) : '';
      return `${item.canonical_name || ''} ${item.aliases || ''} ${item.content || ''} ${structured}`;
    })
    .join(' ');

  const contextTokens = normalizeTokenSet(contextCorpus);
  if (contextTokens.size === 0) return { risk: true, coverage: 0 };

  let overlap = 0;
  for (const token of answerTokens) {
    if (contextTokens.has(token)) overlap += 1;
  }

  const coverage = overlap / answerTokens.size;
  return { risk: coverage < 0.55, coverage };
};

const stripSourcesFromResponse = (text) => {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !/^\s*(sources|mga source|mga gigikanan)\s*:/i.test(line));
  return lines.join('\n').trim();
};

const sanitizeGeneratedResponse = (text) => {
  const cleaned = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\s*(user\s*query|answer|context(?:_json)?|instructions?)\s*:/i.test(line))
    .filter((line) => !/^\s*(strict\s+answer\s+template|context_json)\s*$/i.test(line));

  const joined = cleaned.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return NO_RELIABLE_INFO_RESPONSE;
  if (/^no information found\.?$/i.test(joined)) return NO_RELIABLE_INFO_RESPONSE;
  if (/^sorry\s+i\s+dont\s+have\s+the\s+information\.?$/i.test(joined)) return NO_RELIABLE_INFO_RESPONSE;
  if (/^sorry\s+i\s+couldnt\s+find\s+that\s+information\.?$/i.test(joined)) return NO_RELIABLE_INFO_RESPONSE;
  if (/^sorry,?\s*i\s+couldn[’']?t\s+find\s+that\s+information\.?$/i.test(joined)) return NO_RELIABLE_INFO_RESPONSE;
  if (/^sorry,\s*i\s*can[’']t find that information in the system\.?$/i.test(joined)) return NO_RELIABLE_INFO_RESPONSE;
  return joined;
};

const buildReferralOfficeLabel = (responsibleOffice = '') => {
  const office = String(responsibleOffice || '').trim();
  if (!office) return 'the specific department help desk';
  if (/help\s*desk/i.test(office)) return office;
  if (/(office|department|unit|college)$/i.test(office)) return `${office} help desk`;
  return `${office} department help desk`;
};

const buildLocalizedReferralText = (language, responsibleOffice = '') => {
  const lang = normalizeLanguageHint(language) || 'english';
  const officeLabel = buildReferralOfficeLabel(responsibleOffice);
  if (lang === 'tagalog') {
    return `Hindi ko ma-verify ang kumpletong impormasyon mula sa available na university records. Para sa accurate na tulong, makipag-ugnayan o pumunta sa ${officeLabel}.`;
  }
  if (lang === 'cebuano') {
    return `Dili nako ma-verify ang kompleto nga impormasyon gikan sa available nga university records. Para sa sakto nga tabang, palihog kontaka o adtoa ang ${officeLabel}.`;
  }
  return `I'm unable to verify the complete information from the available university records. Please contact or go to ${officeLabel} for accurate assistance.`;
};

const getHelpDeskContact = async () => {
  const settings = await Settings.findOne().select('helpDesk').lean().catch(() => null);
  const helpDesk = settings?.helpDesk || {};
  return {
    phone: String(helpDesk.phone || '').trim(),
    email: String(helpDesk.email || '').trim(),
    officeLocation: String(helpDesk.officeLocation || '').trim(),
    officialLink: String(helpDesk.officialLink || '').trim(),
  };
};

const buildHelpDeskReferralPayload = async ({
  intent = 'unknown',
  responseType = RESPONSE_TYPES.HELP_DESK_REFERRAL,
  reason = 'insufficient_verified_information',
  language = 'english',
  responsibleOffice = '',
} = {}) => {
  const helpDesk = await getHelpDeskContact();
  const reply = buildLocalizedReferralText(language, responsibleOffice);
  return {
    intent,
    location: null,
    entityName: null,
    responseLanguage: language,
    reply,
    navigation: false,
    steps: [],
    responseType,
    verificationStatus: 'unverified',
    verificationNotice: null,
    helpDesk,
    metadata: {
      responseType,
      verificationStatus: 'unverified',
      reason,
    },
  };
};

const normalizeVerificationStatus = (value) => String(value || 'verified').trim().toLowerCase();

const isAuthoritativeContext = (contextItem) => {
  if (!contextItem || contextItem.is_active === false) return false;
  return isCurrentVerifiedKnowledge({
    ...contextItem,
    verification_status: contextItem.verification_status || contextItem.structured?.verificationStatus,
    status: contextItem.status || contextItem.structured?.status,
    expiration_date: contextItem.expiration_date || contextItem.structured?.expirationDate,
  });
};

const hasValue = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).length > 0;
  return String(value || '').trim().length > 0;
};

const serviceRequiredFieldsForIntent = (intent) => {
  const key = String(intent || '').toLowerCase();
  if (key === 'requirements') return ['name', 'requirements'];
  if (key === 'process') return ['name', 'process_steps'];
  if (key === 'where_process') return ['name', 'office_or_department', 'building'];
  if (key === 'unit_handler') return ['name', 'office_or_department'];
  if (key === 'deadline') return ['name', 'deadline'];
  if (key === 'processing_time') return ['name', 'processing_time'];
  if (key === 'contact') return ['name', 'contact'];
  if (key === 'description' || key === 'service') return ['name', 'details'];
  return ['name'];
};

const getStructuredFieldValue = (contextItem, field) => {
  const structured = contextItem?.structured || {};
  if (field === 'office_or_department') {
    return structured.office_name || structured.department || contextItem?.department_name || '';
  }
  if (field === 'building') {
    return structured.building_name || contextItem?.assigned_building || '';
  }
  if (field === 'deadline') {
    return structured.deadline || contextItem?.deadline || '';
  }
  if (field === 'processing_time') {
    return structured.processingTime || structured.processing_time || contextItem?.processing_time || '';
  }
  return structured[field];
};

const detectRequestedInfoFields = (query, intent) => {
  const text = String(query || '').toLowerCase();
  const fields = new Set(serviceRequiredFieldsForIntent(intent));
  if (SERVICE_REQUIREMENTS_INTENT_RE.test(text)) fields.add('requirements');
  if (SERVICE_PROCESS_INTENT_RE.test(text)) fields.add('process_steps');
  if (SERVICE_WHERE_PROCESS_INTENT_RE.test(text) || WHERE_INTENT_RE.test(text)) {
    fields.add('office_or_department');
    fields.add('building');
  }
  if (DEADLINE_INTENT_RE.test(text)) fields.add('deadline');
  if (PROCESSING_TIME_INTENT_RE.test(text)) fields.add('processing_time');
  if (CONTACT_INTENT_RE.test(text)) fields.add('contact');
  return Array.from(fields);
};

const evaluateInformationCompleteness = ({
  contextItem,
  intent,
  confidenceScore = 0,
  requestedFields = null,
  stakeholder = null,
  responsibleOffice = null,
} = {}) => {
  if (!contextItem) {
    return {
      sufficient: false,
      verificationStatus: 'unverified',
      missingFields: ['record'],
      reason: 'no_record',
    };
  }

  if (!isAuthoritativeContext(contextItem)) {
    return {
      sufficient: false,
      verificationStatus: normalizeVerificationStatus(contextItem.verification_status || contextItem.structured?.verificationStatus),
      missingFields: [],
      reason: 'record_not_verified',
    };
  }

  if (stakeholder && !stakeholderMatches(normalizeStakeholders(contextItem.stakeholders || contextItem.stakeholder), stakeholder)) {
    return {
      sufficient: false,
      verificationStatus: 'unverified',
      missingFields: [],
      reason: 'stakeholder_not_supported',
    };
  }

  if (responsibleOffice && !sourceOfficeMatches(contextItem, responsibleOffice)) {
    return {
      sufficient: false,
      verificationStatus: 'unverified',
      missingFields: [],
      reason: 'responsible_office_not_supported',
    };
  }

  const type = String(contextItem.type || '').toLowerCase();
  if (type === 'faq') {
    const structured = contextItem.structured || {};
    const missingFields = ['question', 'answer'].filter((field) => !hasValue(structured[field]));
    if (missingFields.length > 0) {
      return {
        sufficient: false,
        verificationStatus: 'partial',
        missingFields,
        reason: 'missing_required_fields',
      };
    }
  }
  const requiredFields = type === 'service'
    ? (Array.isArray(requestedFields) && requestedFields.length > 0 ? requestedFields : serviceRequiredFieldsForIntent(intent))
    : (String(intent || '').toLowerCase() === 'where' ? ['canonical_name', 'location'] : ['canonical_name']);
  const missingFields = requiredFields.filter((field) => {
    if (field === 'canonical_name') return !hasValue(contextItem.canonical_name);
    if (field === 'location') return !hasValue(contextItem.location || contextItem.assigned_building);
    return !hasValue(getStructuredFieldValue(contextItem, field));
  });

  if (missingFields.length > 0) {
    return {
      sufficient: false,
      verificationStatus: 'partial',
      missingFields,
      reason: 'missing_required_fields',
    };
  }

  if (confidenceScore < (MATCH_SCORE_THRESHOLD / 100)) {
    return {
      sufficient: false,
      verificationStatus: 'low_confidence',
      missingFields: [],
      reason: 'insufficient_semantic_similarity',
    };
  }

  return {
    sufficient: true,
    verificationStatus: 'verified',
    missingFields: [],
    reason: 'verified',
  };
};

const normalizeConflictValue = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const getConflictComparableFields = (item = {}) => {
  const structured = item.structured || {};
  return {
    location: item.location || item.assigned_building || structured.building_name || structured.office_name || '',
    deadline: item.deadline || structured.deadline || '',
    processing_time: item.processing_time || structured.processingTime || structured.processing_time || '',
    requirements: Array.isArray(structured.requirements)
      ? structured.requirements.join('; ')
      : String(item.requirements || ''),
    process: Array.isArray(structured.process_steps)
      ? structured.process_steps.join('; ')
      : String(item.process || ''),
  };
};

const detectConflictingInformation = (candidates = []) => {
  const active = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && item.is_active !== false)
    .slice(0, 3);

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i];
      const right = active[j];
      const sameType = String(left.type || '').toLowerCase() === String(right.type || '').toLowerCase();
      const sameName = normalizeConflictValue(left.canonical_name) === normalizeConflictValue(right.canonical_name);
      if (!sameType || !sameName) continue;

      const leftFields = getConflictComparableFields(left);
      const rightFields = getConflictComparableFields(right);
      for (const field of ['location', 'deadline', 'processing_time', 'requirements', 'process']) {
        const leftValue = normalizeConflictValue(leftFields[field]);
        const rightValue = normalizeConflictValue(rightFields[field]);
        if (!leftValue || !rightValue || leftValue === rightValue) continue;
        return {
          hasConflict: true,
          field,
          records: [
            { id: left.id, value: leftFields[field] },
            { id: right.id, value: rightFields[field] },
          ],
        };
      }
    }
  }

  return { hasConflict: false, field: null, records: [] };
};

const shouldShowInformationNotice = (contextItem, intent) => {
  const type = String(contextItem?.type || '').toLowerCase();
  const key = String(intent || '').toLowerCase();
  return type === 'service' || ['requirements', 'process', 'where_process', 'unit_handler'].includes(key);
};

const buildVerificationNotice = (contextItem, intent) => {
  if (!shouldShowInformationNotice(contextItem, intent)) return null;
  return {
    title: 'Information Notice',
    text: 'This answer is based on available university records. For official or updated information, please verify with the concerned office.',
  };
};

const buildSourceAwareAnswer = (answer, contextItem) => {
  const base = sanitizeGeneratedResponse(answer);
  if (!base || base === NO_RELIABLE_INFO_RESPONSE) return base;

  const sourceOffice = resolveResponsibleOffice(contextItem);
  const type = String(contextItem?.type || '').toLowerCase();
  if (!sourceOffice || !['faq', 'service'].includes(type)) return base;
  if (/^according to\b/i.test(base)) return base;

  return `According to verified information from ${sourceOffice}, ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const emphasizeTerm = (text, term) => {
  const source = String(text || '');
  const rawTerm = String(term || '').trim();
  if (!source || !rawTerm || rawTerm.length < 3) return source;
  if (source.includes(`**${rawTerm}**`)) return source;

  const matcher = new RegExp(`(${escapeRegExp(rawTerm)})`, 'gi');
  return source
    .split(/(\*\*[^*]+\*\*)/g)
    .map((segment) => {
      if (/^\*\*[^*]+\*\*$/.test(segment)) return segment;
      return segment.replace(matcher, '**$1**');
    })
    .join('');
};

const applyResponseEmphasis = (text, contextItem) => {
  let output = String(text || '').trim();
  if (!output || !contextItem) return output;

  const type = String(contextItem?.type || '').toLowerCase();
  const structured = contextItem?.structured || {};
  const terms = new Set();

  if (type === 'service') {
    terms.add(String(structured?.name || contextItem?.canonical_name || '').trim());
    terms.add(String(structured?.office_name || '').trim());
    terms.add(String(structured?.department || contextItem?.department_name || '').trim());
  }

  if (type === 'office') {
    terms.add(String(contextItem?.canonical_name || '').trim());
  }

  for (const term of terms) {
    output = emphasizeTerm(output, term);
  }

  return output;
};

const asCleanList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const normalizeUnicodeArtifacts = (value) => String(value || '')
  .replace(/â€™/g, "'")
  .replace(/â€œ|â€/g, '"')
  .replace(/â€“/g, '-')
  .replace(/â€”/g, '-');

const normalizeFragment = (value) => String(value || '')
  .replace(/\r?\n/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;!?])/g, '$1')
  .trim();

const stripTrailingPunctuation = (value) => normalizeFragment(value).replace(/[.?!,:;]+$/g, '').trim();

const ensureSentence = (value) => {
  const base = normalizeFragment(value);
  if (!base) return '';
  const withCapital = `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
};

const polishGrammar = (value) => {
  const sanitized = sanitizeGeneratedResponse(normalizeUnicodeArtifacts(value));
  if (!sanitized || sanitized === NO_RELIABLE_INFO_RESPONSE) return NO_RELIABLE_INFO_RESPONSE;
  return ensureSentence(sanitized);
};

const normalizePersonName = (value) => normalizeFragment(normalizeUnicodeArtifacts(value))
  .split(' ')
  .map((token) => {
    if (!token) return '';
    if (/^[A-Z]{2,}$/.test(token)) return token;
    if (/^[a-z]+\.$/.test(token)) {
      return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
    }
    if (/^[a-z][a-z'’-]*$/.test(token)) {
      return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
    }
    return token;
  })
  .join(' ')
  .trim();

const normalizeHeadUnit = (value) => {
  const text = normalizeFragment(normalizeUnicodeArtifacts(value));
  if (!text) return '';

  if (/^the\s+it$/i.test(text)) return 'IT';
  if (/^the\s+[A-Z]{2,}$/.test(text)) return text.replace(/^the\s+/i, '');
  return text;
};

const normalizeFloorLabel = (value) => {
  const text = normalizeFragment(value);
  if (!text) return '';
  if (/floor/i.test(text)) return text;
  if (/^\d+$/.test(text)) return `Floor ${text}`;
  return text;
};

const deriveLocationComponents = (contextItem) => {
  const structured = contextItem?.structured || {};
  const locationParts = String(contextItem?.location || '')
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  const unitName = String(
    structured.department
      || structured.office_name
      || (locationParts.length > 1 ? locationParts[0] : '')
      || ''
  ).trim();

  const locationBuilding = locationParts.length > 1
    ? locationParts.slice(1).join(', ')
    : locationParts[0] || '';

  const assignedBuilding = String(
    contextItem?.assigned_building
      || structured.building_name
      || locationBuilding
      || ''
  ).trim();

  const floorLocation = normalizeFloorLabel(
    contextItem?.floor_location
      || structured.floor
      || ''
  );

  return {
    unitName,
    assignedBuilding,
    floorLocation,
    locationParts,
  };
};

const buildLocationText = ({ unitName, assignedBuilding, floorLocation }) => {
  const segments = [];
  const normalizedUnit = String(unitName || '').trim();
  const normalizedBuilding = String(assignedBuilding || '').trim();

  if (normalizedUnit) segments.push(normalizedUnit);
  if (normalizedBuilding && normalizedBuilding.toLowerCase() !== normalizedUnit.toLowerCase()) {
    segments.push(normalizedBuilding);
  }

  let locationText = segments.join(', ').trim();
  if (!locationText) {
    locationText = normalizedBuilding || normalizedUnit;
  }

  if (!locationText) return '';

  if (floorLocation) {
    return `${locationText}, ${floorLocation}`;
  }

  return locationText;
};

const isMetadataLine = (text) => /^(where to secure|step\s*\d+|client\s*steps?|agency\s*action|action\s*agency|fees?\s*to\s*be\s*paid|processing\s*time|person\s*responsible|responsible\s*person|total\s*processing\s*time|total\s*fees?|classification|type\s*of\s*transaction|who\s*may\s*avail|office\s*or\s*division|department|office|building)\s*:*/i.test(String(text || '').trim());

const cleanRequirementItem = (item) => {
  const text = stripTrailingPunctuation(normalizeUnicodeArtifacts(item));
  if (!text) return '';

  const withoutBullet = text
    .replace(/^[-*•]+\s*/, '')
    .replace(/^[a-z]\s*[.)]\s*/i, '')
    .trim();

  if (!withoutBullet || isMetadataLine(withoutBullet)) return '';
  return withoutBullet;
};

const extractPrimaryDescription = (value) => {
  const text = normalizeUnicodeArtifacts(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  const beforeMetadata = text.split(/\b(?:Office\s+or\s+Division|Classification|Type\s+of\s+Transaction|Who\s+may\s+avail)\s*:/i)[0].trim();
  const candidate = beforeMetadata || text;
  const firstSentence = candidate.match(/[^.!?]+[.!?]/)?.[0] || candidate;
  return stripTrailingPunctuation(firstSentence);
};

const extractProcessActions = (steps) => {
  const raw = asCleanList(steps).map((item) => normalizeUnicodeArtifacts(item));
  const parsed = [];
  let currentStepNumber = null;

  for (const line of raw) {
    const stepMatch = String(line || '').match(/^step\s*(\d+)\s*:?\s*(.*)$/i);
    if (stepMatch) {
      currentStepNumber = Number(stepMatch[1]);
      const inline = stripTrailingPunctuation(stepMatch[2]);
      if (inline && !isMetadataLine(inline)) {
        parsed.push({ step: currentStepNumber, text: inline, source: 'generic' });
      }
      continue;
    }

    const clientMatch = String(line || '').match(/^clients?\s*steps?\s*:\s*(.+)$/i);
    if (clientMatch) {
      const clientText = stripTrailingPunctuation(clientMatch[1]);
      if (clientText) {
        parsed.push({ step: currentStepNumber, text: clientText, source: 'client' });
      }
      continue;
    }

    const cleaned = stripTrailingPunctuation(line);
    if (!cleaned || isMetadataLine(cleaned)) continue;
    parsed.push({ step: currentStepNumber, text: cleaned, source: 'generic' });
  }

  const preferred = parsed.some((entry) => entry.source === 'client')
    ? parsed.filter((entry) => entry.source === 'client')
    : parsed;

  let autoStep = 1;
  const sequenced = preferred.map((entry) => {
    const step = Number.isFinite(entry.step) && entry.step > 0 ? entry.step : autoStep;
    if (!Number.isFinite(entry.step) || entry.step <= 0) {
      autoStep += 1;
    }
    return { step, text: entry.text };
  });

  return sequenced
    .sort((left, right) => left.step - right.step)
    .map((entry) => entry.text);
};

const toSentenceList = (items) => {
  const list = asCleanList(items);
  const normalized = list.map((item) => stripTrailingPunctuation(item)).filter(Boolean);
  if (normalized.length === 0) return '';
  if (normalized.length === 1) return normalized[0];
  if (normalized.length === 2) return `${normalized[0]} and ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(', ')}, and ${normalized[normalized.length - 1]}`;
};

const toProcessParagraph = (steps) => {
  const normalized = asCleanList(steps)
    .map((step) => stripTrailingPunctuation(step))
    .filter(Boolean);

  if (normalized.length === 0) return '';

  const asClause = (step) => {
    const clean = stripTrailingPunctuation(step);
    if (!clean) return '';
    if (/^[A-Z]{2,}/.test(clean)) return clean;
    return `${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  };

  if (normalized.length === 1) {
    return `first, ${asClause(normalized[0])}`;
  }

  return normalized.map((step, index) => {
    const clause = asClause(step);
    if (index === 0) return `first, ${clause}`;
    if (index === normalized.length - 1) return `finally, ${clause}`;
    return `next, ${clause}`;
  }).join('; ');
};

const buildServiceIntentAnswer = (contextItem, intent, fallbackText = NO_RELIABLE_INFO_RESPONSE) => {
  if (!contextItem || String(contextItem.type || '').toLowerCase() !== 'service') {
    return sanitizeGeneratedResponse(fallbackText);
  }

  const structured = contextItem.structured || {};
  const serviceName = String(structured.name || contextItem.canonical_name || '').trim();
  const {
    unitName,
    assignedBuilding,
    floorLocation,
  } = deriveLocationComponents(contextItem);
  const officeOrDepartment = unitName;
  const locationText = buildLocationText({
    unitName: officeOrDepartment,
    assignedBuilding,
    floorLocation,
  });
  const details = String(structured.details || contextItem.content || '').trim();
  const contact = String(structured.contact || contextItem.contact || '').trim();
  const requirements = asCleanList(structured.requirements)
    .map((item) => cleanRequirementItem(item))
    .filter(Boolean);
  const processSteps = extractProcessActions(structured.process_steps);
  const normalizedIntent = String(intent || '').toLowerCase();

  if (!serviceName) return NO_RELIABLE_INFO_RESPONSE;

  if (normalizedIntent === 'requirements') {
    if (requirements.length === 0) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`To get ${serviceName}, you should have these requirements: ${toSentenceList(requirements)}`);
  }

  if (normalizedIntent === 'unit_handler') {
    if (!officeOrDepartment) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`The unit that handles ${serviceName} is ${officeOrDepartment}`);
  }

  if (normalizedIntent === 'where_process') {
    if (!locationText || !assignedBuilding) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`${serviceName} can be processed at ${locationText}`);
  }

  if (normalizedIntent === 'deadline') {
    const deadline = String(structured.deadline || contextItem.deadline || '').trim();
    if (!deadline) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`The verified deadline for ${serviceName} is ${deadline}`);
  }

  if (normalizedIntent === 'processing_time') {
    const processingTime = String(structured.processingTime || structured.processing_time || contextItem.processing_time || '').trim();
    if (!processingTime) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`The verified processing time for ${serviceName} is ${processingTime}`);
  }

  if (normalizedIntent === 'contact') {
    if (!contact) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`For ${serviceName}, you may contact ${contact}`);
  }

  if (normalizedIntent === 'description' || normalizedIntent === 'service') {
    const description = extractPrimaryDescription(details);
    if (!description) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`${serviceName} is ${description}`);
  }

  if (processSteps.length === 0) {
    return NO_RELIABLE_INFO_RESPONSE;
  }

  const processParagraph = toProcessParagraph(processSteps);
  if (!processParagraph) return NO_RELIABLE_INFO_RESPONSE;
  return polishGrammar(`The process for ${serviceName} is ${processParagraph}`);
};

const FIELD_LABELS = Object.freeze({
  requirements: 'requirements',
  process_steps: 'procedure',
  office_or_department: 'responsible office or department',
  building: 'location',
  deadline: 'deadline',
  processing_time: 'processing time',
  contact: 'contact information',
  details: 'description',
});

const humanizeMissingFields = (fields = []) => {
  const labels = Array.from(new Set((fields || []).map((field) => FIELD_LABELS[field] || String(field || '').replace(/_/g, ' ')).filter(Boolean)));
  if (labels.length === 0) return 'the complete information';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
};

const buildPartialVerifiedServiceAnswer = ({ contextItem, requestedFields = [], missingFields = [] }) => {
  if (!contextItem || String(contextItem.type || '').toLowerCase() !== 'service') return '';

  const candidateIntents = [
    ['requirements', 'requirements'],
    ['process_steps', 'process'],
    ['office_or_department', 'where_process'],
    ['deadline', 'deadline'],
    ['processing_time', 'processing_time'],
    ['contact', 'contact'],
    ['details', 'description'],
  ];
  const missingSet = new Set(missingFields);
  const requestedSet = new Set(requestedFields);
  const verifiedParts = [];

  for (const [field, intent] of candidateIntents) {
    if (!requestedSet.has(field) || missingSet.has(field)) continue;
    const answer = buildServiceIntentAnswer(contextItem, intent);
    if (answer && answer !== NO_RELIABLE_INFO_RESPONSE) {
      verifiedParts.push(stripTrailingPunctuation(answer));
    }
  }

  if (verifiedParts.length === 0) return '';

  return polishGrammar(`ALAGAD can verify ${verifiedParts.join('. ')}. However, I could not verify ${humanizeMissingFields(missingFields)} from the available university data. Please contact the Help Desk for the most accurate information.`);
};

const FAQ_PRIORITY_MARGIN = 0.03;

const prioritizeVerifiedFaqCandidates = (candidates = []) => {
  const activeCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && candidate.is_active !== false);
  if (activeCandidates.length <= 1) return activeCandidates;

  const top = activeCandidates[0];
  const topScore = Number(top?.adjusted_score || top?.similarity || 0);
  const faqCandidate = activeCandidates.find((candidate) => {
    if (String(candidate?.type || '').toLowerCase() !== 'faq') return false;
    const status = normalizeVerificationStatus(candidate?.verification_status || candidate?.structured?.verificationStatus);
    if (status !== 'verified') return false;
    const candidateScore = Number(candidate?.adjusted_score || candidate?.similarity || 0);
    return candidateScore + FAQ_PRIORITY_MARGIN >= topScore;
  });

  if (!faqCandidate || faqCandidate === top) return activeCandidates;
  return [
    faqCandidate,
    ...activeCandidates.filter((candidate) => candidate !== faqCandidate),
  ];
};

const buildPersonnelWhoWhereAnswer = (contextItem, intent, fallbackText = NO_RELIABLE_INFO_RESPONSE) => {
  if (!contextItem || String(contextItem.type || '').toLowerCase() !== 'personnel') {
    return sanitizeGeneratedResponse(fallbackText);
  }

  const structured = contextItem.structured || {};
  const name = normalizePersonName(String(structured.name || contextItem.canonical_name || '').trim());
  const officeOrDepartment = normalizeHeadUnit(String(
    structured.department
      || structured.office_name
      || deriveLocationComponents(contextItem).unitName
      || ''
  ).trim());
  const { assignedBuilding, floorLocation } = deriveLocationComponents(contextItem);
  const locationText = buildLocationText({
    unitName: officeOrDepartment,
    assignedBuilding,
    floorLocation,
  });

  if (String(intent || '').toLowerCase() === 'where') {
    if (!name || !locationText || !assignedBuilding) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`${name} can be found at ${locationText}`);
  }

  if (!name || !officeOrDepartment) return NO_RELIABLE_INFO_RESPONSE;
  return polishGrammar(`${name} is the head of ${officeOrDepartment}`);
};

const buildEntityWhereAnswer = (contextItem, fallbackText = NO_RELIABLE_INFO_RESPONSE) => {
  if (!contextItem) return sanitizeGeneratedResponse(fallbackText);

  const type = String(contextItem.type || '').toLowerCase();
  if (type === 'service') return sanitizeGeneratedResponse(fallbackText);
  if (type === 'personnel') return buildPersonnelWhoWhereAnswer(contextItem, 'where', fallbackText);

  const name = String(contextItem.canonical_name || '').trim();
  const { unitName, assignedBuilding, floorLocation, locationParts } = deriveLocationComponents(contextItem);

  if (!name) return NO_RELIABLE_INFO_RESPONSE;

  if (type === 'building') {
    const buildingLocation = buildLocationText({
      unitName: '',
      assignedBuilding: assignedBuilding || name,
      floorLocation,
    });
    if (!buildingLocation) return NO_RELIABLE_INFO_RESPONSE;
    return polishGrammar(`${name} is assigned to ${buildingLocation}`);
  }

  const effectiveUnit = unitName || (locationParts.length > 1 ? locationParts[0] : '');
  const locationText = buildLocationText({
    unitName: effectiveUnit,
    assignedBuilding,
    floorLocation,
  });

  if (!locationText || !assignedBuilding) return NO_RELIABLE_INFO_RESPONSE;
  return polishGrammar(`${name} can be found at ${locationText}`);
};

const buildDeterministicFallbackAnswer = (contextItems) => {
  if (!Array.isArray(contextItems) || contextItems.length === 0) {
    return NO_RELIABLE_INFO_RESPONSE;
  }

  const top = contextItems[0];
  const type = String(top.type || 'item');
  const canonicalName = String(top.canonical_name || 'Unknown').trim() || 'Unknown';
  const location = String(top.location || 'Not available').trim() || 'Not available';
  const details = String(top.content || 'Not available').trim() || 'Not available';

  if (type === 'Service' && top.structured) {
    const service = top.structured;
    const serviceName = String(service.name || canonicalName).trim() || canonicalName;
    const serviceDetails = String(service.details || details).trim() || 'Not available';
    const requirements = Array.isArray(service.requirements) && service.requirements.length > 0
      ? service.requirements.join('; ')
      : 'Not available';
    const steps = Array.isArray(service.process_steps) && service.process_steps.length > 0
      ? service.process_steps.join('; ')
      : 'Not available';
    const contact = String(service.contact || 'Not available').trim() || 'Not available';

    return [
      `${serviceName} is a campus service.`,
      `Details: ${serviceDetails}.`,
      `Requirements: ${requirements}.`,
      `Process: ${steps}.`,
      `Contact: ${contact}.`,
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  if (type === 'Personnel' && top.structured) {
    const person = top.structured;
    const name = String(person.name || canonicalName).trim() || canonicalName;
    const role = String(person.role || '').trim();
    const office = String(person.office_name || top.location || '').trim();
    const contact = String(person.contact || 'Not available').trim() || 'Not available';

    const identity = role
      ? `${name} is the ${role}.`
      : `${name} is part of campus personnel.`;
    const officeSentence = office ? `Office: ${office}.` : '';

    return [
      identity,
      officeSentence,
      `Contact: ${contact}.`,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  return [
    `${type}: ${canonicalName}.`,
    `Location: ${location}.`,
    `Details: ${details}.`,
  ].join(' ').replace(/\s+/g, ' ').trim();
};

const generateStrictAnswer = async ({ userQuery, contextItems }) => {
  const modelPrompt = buildStrictPrompt({ userQuery, contextItems });

  if (!openai) {
    return {
      modelPrompt,
      modelResponse: buildDeterministicFallbackAnswer(contextItems),
      usedModel: false,
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: STRICT_SYSTEM_PROMPT },
        { role: 'user', content: modelPrompt },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content;
    const modelResponse = stripSourcesFromResponse(String(content || '').trim()) || NO_RELIABLE_INFO_RESPONSE;

    return {
      modelPrompt,
      modelResponse,
      usedModel: true,
    };
  } catch (error) {
    logAlert({
      alert_type: 'model_generation_fallback',
      model: CHAT_MODEL,
      message: error.message,
      stack: error.stack,
    });

    return {
      modelPrompt,
      modelResponse: buildDeterministicFallbackAnswer(contextItems),
      usedModel: false,
      modelError: error.message,
    };
  }
};

const hydrateStructuredContext = async (items) => {
  const hydrated = [];
  for (const item of (items || [])) {
    const structured = await fetchStructuredByType(item.type, item.id);
    hydrated.push({ ...item, structured });
  }
  return hydrated;
};

const normalizeLanguageHint = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'en' || raw === 'english') return 'english';
  if (raw === 'tl' || raw === 'fil' || raw === 'tagalog') return 'tagalog';
  if (raw === 'ceb' || raw === 'cebuano') return 'cebuano';
  return null;
};

const resolveDetectedLanguage = ({ hintLanguage, languageDetection }) => {
  const hint = normalizeLanguageHint(hintLanguage);
  const detection = languageDetection || {};
  const detected = String(detection.language || 'english').toLowerCase();
  const scores = detection.scores || {};

  if (!hint) return detected;
  if (detection.reason === 'fallback_default') return hint;

  // Prefer the user's current non-English query hint for code-mixed input
  // when it has any marker support in the detector scores.
  if (hint !== 'english' && detected === 'english') {
    const hintScore = Number(scores?.[hint] || 0);
    if (hintScore > 0) return hint;
  }

  return detected;
};

const containsTextInsensitive = (source, fragment) => {
  const haystack = String(source || '').toLowerCase();
  const needle = String(fragment || '').toLowerCase();
  if (!haystack || !needle) return false;
  return haystack.includes(needle);
};

const buildLocalizedDetailSentence = ({ key, language, values = {} }) => {
  const lang = normalizeLanguageHint(language) || 'english';

  if (key === 'service_location') {
    if (lang === 'tagalog') return `Maaari itong iproseso sa ${values.location}`;
    if (lang === 'cebuano') return `Mahimo kini i-process sa ${values.location}`;
    return `You can process this at ${values.location}`;
  }

  if (key === 'requirements_preview') {
    if (lang === 'tagalog') return `Karaniwang kailangan ang ${values.requirements}`;
    if (lang === 'cebuano') return `Kasagarang kinahanglan ang ${values.requirements}`;
    return `Common requirements include ${values.requirements}`;
  }

  if (key === 'contact') {
    if (lang === 'tagalog') return `Maaari mong kontakin ang ${values.contact}`;
    if (lang === 'cebuano') return `Pwede nimo kontakon ang ${values.contact}`;
    return `You may contact ${values.contact}`;
  }

  if (key === 'personnel_location') {
    if (lang === 'tagalog') return `Makikita si ${values.name} sa ${values.location}`;
    if (lang === 'cebuano') return `Makita si ${values.name} sa ${values.location}`;
    return `${values.name} can be found at ${values.location}`;
  }

  if (key === 'generic_location') {
    if (lang === 'tagalog') return `Matatagpuan ito sa ${values.location}`;
    if (lang === 'cebuano') return `Makita kini sa ${values.location}`;
    return `It is located at ${values.location}`;
  }

  return '';
};

const appendLocalizedDetail = ({ text, contextItem, intent, targetLanguage }) => {
  const base = sanitizeGeneratedResponse(text);
  if (!base || base === NO_RELIABLE_INFO_RESPONSE) return base;
  if (!contextItem) return base;

  const type = String(contextItem?.type || '').toLowerCase();
  const structured = contextItem?.structured || {};
  const name = String(structured?.name || contextItem?.canonical_name || '').trim();
  const { unitName, assignedBuilding, floorLocation } = deriveLocationComponents(contextItem);
  const locationText = buildLocationText({ unitName, assignedBuilding, floorLocation });
  const requirementItems = asCleanList(structured?.requirements)
    .map((item) => cleanRequirementItem(item))
    .filter(Boolean)
    .slice(0, 2);
  const requirementPreview = toSentenceList(requirementItems);
  const contact = String(structured?.contact || '').trim();

  const extras = [];
  const addDetail = (key, values) => {
    const draft = buildLocalizedDetailSentence({ key, language: targetLanguage, values });
    const clean = polishGrammar(draft);
    if (!clean || clean === NO_RELIABLE_INFO_RESPONSE) return;
    const dedupeTarget = stripTrailingPunctuation(clean);
    if (containsTextInsensitive(base, dedupeTarget)) return;
    if (extras.some((entry) => containsTextInsensitive(entry, dedupeTarget))) return;
    extras.push(clean);
  };

  if (type === 'service') {
    if (locationText && String(intent || '').toLowerCase() !== 'where_process') {
      addDetail('service_location', { location: locationText });
    }
    if (requirementPreview && String(intent || '').toLowerCase() !== 'requirements') {
      addDetail('requirements_preview', { requirements: requirementPreview });
    }
    if (contact) {
      addDetail('contact', { contact });
    }
  } else if (type === 'personnel') {
    if (locationText && String(intent || '').toLowerCase() !== 'where' && name) {
      addDetail('personnel_location', { name, location: locationText });
    }
    if (contact) {
      addDetail('contact', { contact });
    }
  } else if (locationText && String(intent || '').toLowerCase() !== 'where') {
    addDetail('generic_location', { location: locationText });
  }

  if (extras.length === 0) return base;
  return `${base} ${extras.slice(0, 2).join(' ')}`.trim();
};

const normalizeConversationHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
    .map((entry) => ({
      sender: String(entry?.sender || entry?.role || '').trim().toLowerCase(),
      text: String(entry?.text || '').trim(),
      intent: String(entry?.intent || '').trim().toLowerCase(),
      language: normalizeLanguageHint(entry?.language),
      locationName: String(entry?.locationName || '').trim(),
      entityName: String(entry?.entityName || '').trim(),
    }))
    .filter((entry) => entry.text);
};

const extractEntityFromAnswerText = (text) => {
  const source = String(text || '').trim();
  if (!source) return '';

  const patterns = [
    /^(.+?) is the head of /i,
    /^(.+?) can be found at /i,
    /^To get (.+?), you should have these requirements:/i,
    /^The process for (.+?) is /i,
    /^(.+?) can be processed at /i,
    /^(.+?) is /i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return String(match[1] || '').replace(/[.?!,:;]+$/g, '').trim();
    }
  }

  return '';
};

const resolveConversationContext = (history) => {
  const normalizedHistory = normalizeConversationHistory(history);
  const reversed = [...normalizedHistory].reverse();

  const context = {
    lastUserQuery: '',
    lastBotReply: '',
    lastIntent: '',
    lastEntity: '',
    lastLanguage: null,
  };

  for (const entry of reversed) {
    if (!context.lastLanguage && entry.language) {
      context.lastLanguage = entry.language;
    }

    if (!context.lastIntent && entry.intent) {
      context.lastIntent = entry.intent;
    }

    if (!context.lastEntity) {
      const fromStructured = String(entry.entityName || entry.locationName || '').trim();
      const fromText = extractEntityFromAnswerText(entry.text);
      context.lastEntity = fromStructured || fromText;
    }

    if (!context.lastUserQuery && entry.sender === 'user') {
      context.lastUserQuery = entry.text;
    }

    if (!context.lastBotReply && (entry.sender === 'bot' || entry.sender === 'assistant')) {
      context.lastBotReply = entry.text;
    }
  }

  return context;
};

const isLikelyFollowUpQuery = (query) => {
  const text = String(query || '').trim();
  if (!text) return false;

  const tokenCount = text.split(/\s+/).filter(Boolean).length;
  if (GENERIC_SHORT_QUERY_RE.test(text)) return true;
  if (FOLLOW_UP_START_RE.test(text)) return true;
  if (CONTEXT_PRONOUN_RE.test(text) && tokenCount <= 12) return true;
  return tokenCount <= 5;
};

const intentToQueryHint = (intent) => {
  const key = String(intent || '').toLowerCase();
  if (key === 'where_process') return 'where to process';
  if (key === 'where') return 'where';
  if (key === 'who') return 'who';
  if (key === 'requirements') return 'requirements';
  if (key === 'process') return 'process';
  if (key === 'description') return 'description';
  if (key === 'service') return 'service';
  return '';
};

const normalizeQuerySpace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const buildConversationAwareQuery = ({ message, conversationContext }) => {
  const query = normalizeQuerySpace(message);
  if (!query) return '';
  if (!isLikelyFollowUpQuery(query)) return query;

  const queryLower = query.toLowerCase();
  const parts = [query];

  const lastEntity = String(conversationContext?.lastEntity || '').trim();
  if (lastEntity && !queryLower.includes(lastEntity.toLowerCase())) {
    parts.push(lastEntity);
  }

  const intentHint = intentToQueryHint(conversationContext?.lastIntent);
  if (intentHint && !queryLower.includes(intentHint)) {
    parts.push(intentHint);
  }

  const lastUserQuery = String(conversationContext?.lastUserQuery || '').trim();
  if (lastUserQuery && lastUserQuery.toLowerCase() !== queryLower) {
    parts.push(lastUserQuery);
  }

  return normalizeQuerySpace(parts.join(' '));
};

const buildClarificationQuestion = (targetLanguage, optionNames = []) => {
  const lang = normalizeLanguageHint(targetLanguage) || 'english';
  const options = optionNames.filter(Boolean).slice(0, 2);
  if (options.length < 2) {
    if (lang === 'tagalog') return 'Pwede mo bang i-clarify kung anong service ang tinutukoy mo?';
    if (lang === 'cebuano') return 'Pwede nimo i-clarify unsang service ang imong pasabot?';
    return 'Could you clarify what you mean?';
  }

  if (lang === 'tagalog') {
    return `Ang ibig mong sabihin ba ay ${options[0]} o ${options[1]}?`;
  }
  if (lang === 'cebuano') {
    return `Pasabot ba nimo ang ${options[0]} o ${options[1]}?`;
  }
  return `Do you mean ${options[0]} or ${options[1]}?`;
};

const normalizeMatchText = (value) => normalizeQuerySpace(
  translateToEnglishLexicon(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
);

const parseAliasList = (aliases) => String(aliases || '')
  .split(';')
  .map((alias) => normalizeMatchText(alias))
  .filter(Boolean);

const isServiceIntentSignal = (intentSignal) => SERVICE_INTENT_SIGNAL_SET.has(String(intentSignal || '').toLowerCase());

const isTooVagueServiceQuery = (queryText) => {
  const tokens = normalizeMatchText(queryText)
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const contentTokens = tokens.filter((token) => !SERVICE_VAGUE_TERMS.has(token));
  return contentTokens.length < 2;
};

const hasExactServiceMatchInQuery = (queryText, serviceCandidates = []) => {
  const normalizedQuery = normalizeMatchText(queryText);
  if (!normalizedQuery) return false;

  for (const candidate of serviceCandidates) {
    const canonical = normalizeMatchText(candidate?.canonical_name);
    const aliases = parseAliasList(candidate?.aliases);
    const terms = [canonical, ...aliases].filter(Boolean);

    for (const term of terms) {
      if (normalizedQuery === term) return true;
      if (term.length >= 3 && normalizedQuery.includes(term)) return true;
    }
  }

  return false;
};

const isLexicallyCloseMatch = ({ message, retrievalQuery, contextItem }) => {
  const normalizedQuery = normalizeMatchText(`${message || ''} ${retrievalQuery || ''}`);
  if (!normalizedQuery) return false;

  const canonical = normalizeMatchText(contextItem?.canonical_name);
  const aliases = parseAliasList(contextItem?.aliases);
  const terms = [canonical, ...aliases].filter((term) => term && term.length >= 3);
  if (terms.length === 0) return false;

  for (const term of terms) {
    if (normalizedQuery === term) return true;
    if (term.length >= 4 && normalizedQuery.includes(term)) return true;
    if (normalizedQuery.length >= 5 && term.includes(normalizedQuery)) return true;
  }

  return false;
};

const hasRecentClarificationPrompt = (conversationHistory = []) => {
  const normalizedHistory = normalizeConversationHistory(conversationHistory);
  const reversed = [...normalizedHistory].reverse();
  const lastBot = reversed.find((entry) => entry.sender === 'bot' || entry.sender === 'assistant');
  return String(lastBot?.intent || '').toLowerCase() === 'clarification';
};

const decideServiceClarification = ({
  queryIntentSignal,
  message,
  retrievalQuery,
  rankedContextCandidates,
  conversationHistory,
  minSimilarity = MATCH_SCORE_THRESHOLD / 100,
}) => {
  if (!isServiceIntentSignal(queryIntentSignal)) {
    return { shouldAsk: false, reason: 'non_service_intent', candidates: [] };
  }

  if (hasRecentClarificationPrompt(conversationHistory)) {
    return { shouldAsk: false, reason: 'already_asked_once', candidates: [] };
  }

  const serviceCandidates = (Array.isArray(rankedContextCandidates) ? rankedContextCandidates : [])
    .filter((candidate) => String(candidate?.type || '').toLowerCase() === 'service')
    .filter((candidate) => candidate?.is_active !== false)
    .filter((candidate) => Number(candidate?.similarity || 0) >= minSimilarity)
    .slice(0, 3);

  if (serviceCandidates.length === 0) {
    return { shouldAsk: false, reason: 'no_service_candidates', candidates: [] };
  }

  if (hasExactServiceMatchInQuery(retrievalQuery || message, serviceCandidates)) {
    return { shouldAsk: false, reason: 'exact_service_match', candidates: serviceCandidates.slice(0, 2) };
  }

  const vague = isTooVagueServiceQuery(retrievalQuery || message);
  if (vague && serviceCandidates.length >= 2) {
    return { shouldAsk: true, reason: 'vague_query', candidates: serviceCandidates.slice(0, 2) };
  }

  if (serviceCandidates.length >= 2) {
    const top = serviceCandidates[0];
    const second = serviceCandidates[1];
    const similarityGap = Math.abs(Number(top?.similarity || 0) - Number(second?.similarity || 0));
    const adjustedGap = Math.abs(Number(top?.adjusted_score || 0) - Number(second?.adjusted_score || 0));
    const namesDiffer = normalizeMatchText(top?.canonical_name) !== normalizeMatchText(second?.canonical_name);

    if (namesDiffer && similarityGap <= 0.01 && adjustedGap <= 0.015) {
      return { shouldAsk: true, reason: 'equally_close_services', candidates: [top, second] };
    }
  }

  return { shouldAsk: false, reason: 'direct_best_service', candidates: serviceCandidates.slice(0, 2) };
};

const deriveQueryIntentSignal = (query) => {
  const text = String(query || '').toLowerCase();
  if (!text) return 'unknown';

  if (DEADLINE_INTENT_RE.test(text)) return 'deadline';
  if (PROCESSING_TIME_INTENT_RE.test(text)) return 'processing_time';
  if (CONTACT_INTENT_RE.test(text)) return 'contact';
  if (UNIT_HANDLES_INTENT_RE.test(text)) return 'unit_handler';
  if (SERVICE_PROCESS_INTENT_RE.test(text)) return 'process';
  if (SERVICE_REQUIREMENTS_INTENT_RE.test(text)) return 'requirements';
  if (SERVICE_DESCRIPTION_INTENT_RE.test(text)) return 'description';
  if (SERVICE_WHERE_PROCESS_INTENT_RE.test(text)) return 'where_process';
  if (WHERE_INTENT_RE.test(text)) return 'where';
  if (WHO_INTENT_RE.test(text)) return 'who';
  if (SERVICE_INTENT_RE.test(text)) return 'service';
  return 'unknown';
};

const tokenizeComparable = (value) => Array.from(new Set(
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !MATCH_STOPWORDS.has(token))
));

const computeLevenshteinDistance = (leftValue, rightValue) => {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost,
      );
      diagonal = temp;
    }
  }
  return previous[right.length];
};

const computeTokenSimilarity = (queryToken, candidateToken) => {
  const left = String(queryToken || '').trim();
  const right = String(candidateToken || '').trim();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 3 || right.length < 3) return 0;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 0;
  const distance = computeLevenshteinDistance(left, right);
  return Math.max(0, 1 - (distance / maxLength));
};

const computeTokenOverlapRatio = (queryText, candidateText) => {
  const queryTokens = tokenizeComparable(queryText);
  const candidateTokens = new Set(tokenizeComparable(candidateText));
  if (queryTokens.length === 0 || candidateTokens.size === 0) return 0;

  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }
  return hits / queryTokens.length;
};

const computeFuzzyTokenOverlapRatio = (queryText, candidateText) => {
  const queryTokens = tokenizeComparable(queryText);
  const candidateTokens = tokenizeComparable(candidateText);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  let totalScore = 0;
  for (const queryToken of queryTokens) {
    let bestScore = 0;
    for (const candidateToken of candidateTokens) {
      const similarity = computeTokenSimilarity(queryToken, candidateToken);
      if (similarity > bestScore) bestScore = similarity;
      if (bestScore === 1) break;
    }
    if (bestScore >= 0.72) {
      totalScore += bestScore;
    }
  }

  return totalScore / queryTokens.length;
};

const intentTypeBoost = (intentSignal, candidateType) => {
  const type = String(candidateType || '').toLowerCase();
  const intent = String(intentSignal || '').toLowerCase();

  if (intent === 'who' && type === 'personnel') return 0.12;
  if (['unit_handler', 'requirements', 'process', 'description', 'where_process', 'deadline', 'processing_time', 'contact', 'service'].includes(intent) && type === 'service') return 0.12;
  if (intent === 'where' && ['office', 'department', 'building', 'room', 'personnel'].includes(type)) return 0.05;
  return 0;
};

const toTimestamp = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const rankContextCandidatesByIntentAndLanguage = ({
  candidates,
  message,
  retrievalQuery,
  targetLanguage,
}) => {
  const activeCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && candidate.is_active !== false);
  if (activeCandidates.length === 0) return [];

  const intentSignal = deriveQueryIntentSignal(retrievalQuery || message);
  const language = normalizeLanguageHint(targetLanguage) || 'english';
  const queryForLanguage = language === 'english'
    ? String(message || '')
    : translateToEnglishLexicon(String(message || ''));

  return activeCandidates
    .map((candidate) => {
      const similarity = Number(candidate?.similarity || 0);
      const candidateText = [
        candidate?.canonical_name,
        candidate?.role_title,
        candidate?.aliases,
        candidate?.location,
        candidate?.description,
        candidate?.requirements,
        candidate?.process,
        candidate?.stakeholders,
        candidate?.deadline,
        candidate?.processing_time,
        candidate?.content,
      ].filter(Boolean).join(' ');

      const retrievalOverlap = computeTokenOverlapRatio(retrievalQuery, candidateText);
      const languageOverlap = computeTokenOverlapRatio(queryForLanguage, candidateText);
      const fuzzyRetrievalOverlap = computeFuzzyTokenOverlapRatio(retrievalQuery, candidateText);
      const fuzzyLanguageOverlap = computeFuzzyTokenOverlapRatio(queryForLanguage, candidateText);
      const adjustedScore = similarity
        + intentTypeBoost(intentSignal, candidate?.type)
        + (retrievalOverlap * 0.06)
        + (languageOverlap * 0.04)
        + (fuzzyRetrievalOverlap * 0.08)
        + (fuzzyLanguageOverlap * 0.05);

      return {
        ...candidate,
        adjusted_score: adjustedScore,
      };
    })
    .sort((left, right) => {
      const scoreDiff = Number(right?.adjusted_score || 0) - Number(left?.adjusted_score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const similarityDiff = Number(right?.similarity || 0) - Number(left?.similarity || 0);
      if (similarityDiff !== 0) return similarityDiff;

      const freshnessDiff = toTimestamp(right?.last_updated) - toTimestamp(left?.last_updated);
      if (freshnessDiff !== 0) return freshnessDiff;

      return String(left?.id || '').localeCompare(String(right?.id || ''));
    });
};

router.get('/suggestions', async (req, res) => {
  try {
    const partialQuery = String(req.query?.q || req.query?.query || '').trim();
    const limit = 1;

    if (!partialQuery) {
      return res.json({
        suggestions: [],
        detected_language: 'english',
        query_for_search: '',
      });
    }

    const hintLanguage = normalizeLanguageHint(req.query?.language);
    const languageDetection = detectLanguage(partialQuery);
    const detectedLanguage = resolveDetectedLanguage({
      hintLanguage,
      languageDetection,
    });

    const queryTranslation = await translateQueryToEnglish({
      query: partialQuery,
      detectedLanguage,
      openaiClient: openai,
      model: CHAT_MODEL,
      options: { fastMode: true },
    });

    const queryForSearch = String(queryTranslation.text || partialQuery).trim() || partialQuery;
    const suggestions = await getAutocompleteSuggestions({
      originalQuery: partialQuery,
      query: queryForSearch,
      language: detectedLanguage,
      limit,
      includeAdminUser: false,
      includeDeactivated: false,
    });

    logAudit({
      event: 'autocomplete_query',
      partial_query: partialQuery,
      detected_language: detectedLanguage,
      language_detection_scores: languageDetection.scores,
      language_detection_reason: languageDetection.reason,
      query_for_search: queryForSearch,
      query_translation_method: queryTranslation.method,
      suggestion_ids: suggestions.map((item) => item.id),
      suggestions_returned: suggestions.map((item) => ({
        id: item.id,
        canonical_name: item.canonical_name,
        category: item.category,
        similarity_score: item.similarity_score,
        suggested_query: item.suggested_query,
        append_text: item.append_text,
        template_source: item.template_source,
      })),
      suggestion_count: suggestions.length,
      success: true,
    });

    return res.json({
      suggestions,
      detected_language: detectedLanguage,
      query_for_search: queryForSearch,
    });
  } catch (error) {
    logAlert({
      alert_type: 'autocomplete_error',
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      error: error.message || 'Failed to fetch autocomplete suggestions',
    });
  }
});

router.post('/suggestions/select', async (req, res) => {
  try {
    const partialQuery = String(req.body?.partial_query || '').trim();
    const selected = req.body?.selected_suggestion || req.body?.selectedSuggestion || {};
    const selectedId = String(selected?.id || '').trim();
    const selectedName = String(selected?.canonical_name || selected?.display_name || '').trim();
    const selectedCategory = String(selected?.category || '').trim();
    const selectedSuggestedQuery = String(selected?.suggested_query || '').trim();
    const selectedAppendText = String(selected?.append_text || '').trim();
    const selectedTemplateSource = String(selected?.template_source || '').trim();
    const selectedSimilarityScore = Number(selected?.similarity_score || selected?.score || 0);

    if (!selectedId) {
      return res.status(400).json({ error: 'selected_suggestion.id is required' });
    }

    const frequency = registerSuggestionSelection(selectedId);

    logAudit({
      event: 'autocomplete_selection',
      partial_query: partialQuery,
      suggestion_id: selectedId,
      suggestion_name: selectedName,
      suggestion_category: selectedCategory,
      similarity_score: selectedSimilarityScore,
      suggested_query: selectedSuggestedQuery,
      append_text: selectedAppendText,
      template_source: selectedTemplateSource,
      selection_count: frequency,
      success: true,
    });

    return res.json({
      success: true,
      suggestion_id: selectedId,
      selection_count: frequency,
    });
  } catch (error) {
    logAlert({
      alert_type: 'autocomplete_selection_error',
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      error: error.message || 'Failed to record suggestion selection',
    });
  }
});

router.post('/index/rebuild', protect, authorize('super_admin'), async (req, res) => {
  try {
    const state = await sharedVectorIndexManager.rebuildFromDatabase();
    logAudit({
      event: 'vector_bulk_rebuild',
      trigger: 'explicit_request',
      actor: String(req?.user?._id || ''),
      vector_count: state.vectorCount,
      canonical_count: state.canonicalDocuments.length,
      success: true,
    });

    return res.json({
      message: 'Vector index rebuilt successfully',
      vector_count: state.vectorCount,
      canonical_count: state.canonicalDocuments.length,
      loaded_at: state.loadedAt,
    });
  } catch (error) {
    logAlert({
      alert_type: 'vector_bulk_rebuild_failure',
      trigger: 'explicit_request',
      actor: String(req?.user?._id || ''),
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      error: error.message || 'Failed to rebuild vector index',
    });
  }
});

router.get('/functions/get_building/:id', async (req, res) => {
  try {
    const payload = await get_building(req.params.id);
    if (!payload) return res.status(404).json({ error: 'Building not found' });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch building' });
  }
});

router.get('/functions/get_room/:id', async (req, res) => {
  try {
    const payload = await get_room(req.params.id);
    if (!payload) return res.status(404).json({ error: 'Room not found' });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch room' });
  }
});

router.get('/functions/get_personnel/:id', async (req, res) => {
  try {
    const payload = await get_personnel(req.params.id);
    if (!payload) return res.status(404).json({ error: 'Personnel not found' });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch personnel' });
  }
});

router.get('/functions/get_service_details/:id', async (req, res) => {
  try {
    const payload = await get_service_details(req.params.id);
    if (!payload) return res.status(404).json({ error: 'Service not found' });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch service details' });
  }
});

router.post('/', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const hintLanguage = normalizeLanguageHint(req.body?.language);
    const conversationHistory = normalizeConversationHistory(req.body?.conversationHistory);
    const conversationContext = resolveConversationContext(conversationHistory);
    const selectedSuggestion = req.body?.selectedSuggestion && typeof req.body.selectedSuggestion === 'object'
      ? req.body.selectedSuggestion
      : null;
    const selectedSuggestionId = String(selectedSuggestion?.id || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (selectedSuggestionId) {
      registerSuggestionSelection(selectedSuggestionId);
    }

    const languageDetection = detectLanguage(message);
    const detectedLanguage = resolveDetectedLanguage({
      hintLanguage,
      languageDetection,
    });
    const contextualizedInput = buildConversationAwareQuery({
      message,
      conversationContext,
    });

    const queryTranslation = await translateQueryToEnglish({
      // Use resolved conversation references for follow-up retrieval (for example, "Where is it?").
      query: contextualizedInput,
      detectedLanguage,
      openaiClient: openai,
      model: CHAT_MODEL,
    });

    const retrievalQuery = String(queryTranslation.text || message).trim() || message;
    const detectedStakeholder = detectStakeholderFromQuery(`${message} ${retrievalQuery}`);
    const retrieval = await pipeline.retrieve(retrievalQuery, {
      stakeholder: detectedStakeholder,
    });
    const queryIntentSignal = deriveQueryIntentSignal(retrievalQuery || message);
    const rankedContextCandidates = prioritizeVerifiedFaqCandidates(rankContextCandidatesByIntentAndLanguage({
      candidates: retrieval.candidateContexts,
      message,
      retrievalQuery,
      targetLanguage: detectedLanguage,
    }));
    const bestContext = rankedContextCandidates[0] || retrieval.finalContext[0] || null;
    const bestSimilarityScore = Number(bestContext?.similarity || 0);
    const bestAdjustedScoreRaw = Number(bestContext?.adjusted_score || bestContext?.rerank_score || 0);
    const bestAdjustedScore = Math.max(0, Math.min(1, bestAdjustedScoreRaw));
    const bestConfidenceScore = Math.max(bestSimilarityScore, bestAdjustedScore);
    const bestConfidencePercent = Math.round(bestConfidenceScore * 100);
    const bestSimilarityPercent = Math.round(bestSimilarityScore * 100);
    const bestContextActive = bestContext?.is_active !== false;
    const bestLexicalMatch = isLexicallyCloseMatch({
      message,
      retrievalQuery,
      contextItem: bestContext,
    });
    const hasQualifiedMatch = Boolean(bestContext)
      && bestContextActive
      && (bestConfidenceScore >= (MATCH_SCORE_THRESHOLD / 100) || bestLexicalMatch);

    if (!hasQualifiedMatch) {
      const referralPayload = await buildHelpDeskReferralPayload({
        intent: 'unknown',
        responseType: RESPONSE_TYPES.NO_MATCH,
        reason: 'no_qualified_retrieval_match',
        language: detectedLanguage,
      });

      logAlert({
        alert_type: 'low_confidence_retrieval',
        query: message,
        detected_language: detectedLanguage,
        query_for_retrieval: retrievalQuery,
        query_translation_method: queryTranslation.method,
        contextualized_query: contextualizedInput,
        normalized_query: retrieval.normalizedQuery,
        top_similarity: retrieval.topSimilarity,
        best_similarity_score: bestSimilarityPercent,
        best_confidence_score: bestConfidencePercent,
        best_lexical_match: bestLexicalMatch,
        best_context_active: bestContextActive,
        threshold: MATCH_SCORE_THRESHOLD,
        fallback: retrieval.fallback,
      });

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        language_detection_scores: languageDetection.scores,
        language_detection_reason: languageDetection.reason,
        conversation_history_length: conversationHistory.length,
        conversation_context: conversationContext,
        contextualized_query: contextualizedInput,
        query_for_retrieval: retrievalQuery,
        normalized_query: retrieval.normalizedQuery,
        query_embedding_id: retrieval.queryEmbeddingId,
        embedding_vector: retrieval.queryEmbedding,
        top_k_ids: retrieval.topVectorResults.map((item) => item.id),
        similarity_scores: retrieval.topVectorResults.map((item) => item.similarity),
        reranker_scores: retrieval.rerankedResults.map((item) => item.rerankScore),
        final_context: [],
        chosen_match: null,
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        chosen_lexical_match: bestLexicalMatch,
        model_prompt: null,
        model_response: NO_RELIABLE_INFO_RESPONSE,
        response_text: referralPayload.reply,
        response_type: referralPayload.responseType,
        verification_status: referralPayload.verificationStatus,
        model_response_language: 'english',
        final_response_language: detectedLanguage,
        translation_steps: {
          query: queryTranslation,
          response: null,
        },
        retrieval_category: retrieval.retrievalCategory,
        retrieval_mode: retrieval.retrievalMode,
        vector_db: retrieval.vectorDb,
        embedding_model: retrieval.embeddingModel,
        category_filters: retrieval.categoryFilters,
        metadata_filters: retrieval.metadataFilters,
      });

      return res.json(referralPayload);
    }

    const conflict = detectConflictingInformation(rankedContextCandidates);
    if (conflict.hasConflict) {
      const conflictReply = `I found conflicting information about the ${conflict.field} in the available university records. Please verify the current information with the Help Desk.`;
      const helpDesk = await getHelpDeskContact();

      logAlert({
        alert_type: 'conflicting_retrieval_records',
        query: message,
        detected_language: detectedLanguage,
        query_for_retrieval: retrievalQuery,
        field: conflict.field,
        records: conflict.records,
      });

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        language_detection_scores: languageDetection.scores,
        language_detection_reason: languageDetection.reason,
        conversation_history_length: conversationHistory.length,
        conversation_context: conversationContext,
        contextualized_query: contextualizedInput,
        query_for_retrieval: retrievalQuery,
        normalized_query: retrieval.normalizedQuery,
        final_context: [],
        conflicting_records: conflict.records,
        chosen_match: null,
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        response_type: RESPONSE_TYPES.CONFLICTING_INFORMATION,
        verification_status: 'conflicting',
        response_text: conflictReply,
        retrieval_category: retrieval.retrievalCategory,
        retrieval_mode: retrieval.retrievalMode,
        vector_db: retrieval.vectorDb,
        embedding_model: retrieval.embeddingModel,
      });

      return res.json({
        intent: 'unknown',
        location: null,
        entityName: null,
        responseLanguage: detectedLanguage,
        reply: conflictReply,
        navigation: false,
        steps: [],
        responseType: RESPONSE_TYPES.CONFLICTING_INFORMATION,
        verificationStatus: 'conflicting',
        verificationNotice: null,
        helpDesk,
        metadata: {
          responseType: RESPONSE_TYPES.CONFLICTING_INFORMATION,
          verificationStatus: 'conflicting',
          question: message,
          retrievedRecords: conflict.records,
          retrievalScore: bestConfidencePercent,
          knowledgeSource: 'ALAGAD retrieval index',
          timestamp: new Date().toISOString(),
        },
      });
    }

    const serviceClarification = decideServiceClarification({
      queryIntentSignal,
      message,
      retrievalQuery,
      rankedContextCandidates,
      conversationHistory,
      minSimilarity: MATCH_SCORE_THRESHOLD / 100,
    });
    if (!SINGLE_CLOSEST_MATCH_MODE && serviceClarification.shouldAsk) {
      const clarificationReply = buildClarificationQuestion(
        detectedLanguage,
        serviceClarification.candidates.map((item) => item.canonical_name)
      );

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        language_detection_scores: languageDetection.scores,
        language_detection_reason: languageDetection.reason,
        conversation_history_length: conversationHistory.length,
        conversation_context: conversationContext,
        contextualized_query: contextualizedInput,
        query_for_retrieval: retrievalQuery,
        normalized_query: retrieval.normalizedQuery,
        clarification_reason: serviceClarification.reason,
        ambiguity_candidates: serviceClarification.candidates.map((candidate) => ({
          id: candidate.id,
          type: candidate.type,
          canonical_name: candidate.canonical_name,
          similarity: candidate.similarity,
          adjusted_score: candidate.adjusted_score,
        })),
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        chosen_lexical_match: bestLexicalMatch,
        model_response: null,
        response_text: clarificationReply,
        retrieval_category: retrieval.retrievalCategory,
        retrieval_mode: retrieval.retrievalMode,
        vector_db: retrieval.vectorDb,
        embedding_model: retrieval.embeddingModel,
        category_filters: retrieval.categoryFilters,
        metadata_filters: retrieval.metadataFilters,
      });

      return res.json({
        intent: 'clarification',
        location: null,
        entityName: null,
        responseLanguage: detectedLanguage,
        reply: clarificationReply,
        navigation: false,
        steps: [],
      });
    }

    const contextWithStructured = await hydrateStructuredContext([bestContext]);

    // Service answers must always include deterministic service JSON when a service was retrieved.
    for (const item of contextWithStructured) {
      if (item.type === 'Service' && !item.structured) {
        const required = await get_service_details(item.id);
        item.structured = required;
      }
    }

    const primary = contextWithStructured[0] || null;
    const intent = inferIntentFromQuery(retrievalQuery, primary);
    const requestedFields = String(primary?.type || '').toLowerCase() === 'service'
      ? detectRequestedInfoFields(retrievalQuery || message, intent)
      : [];
    const completeness = evaluateInformationCompleteness({
      contextItem: primary,
      intent,
      confidenceScore: bestLexicalMatch ? 1 : bestConfidenceScore,
      requestedFields,
      stakeholder: retrieval.detectedStakeholder,
      responsibleOffice: retrieval.detectedResponsibleOffice,
    });

    if (!completeness.sufficient) {
      const partialEnglishReply = completeness.reason === 'missing_required_fields'
        ? buildPartialVerifiedServiceAnswer({
            contextItem: primary,
            requestedFields,
            missingFields: completeness.missingFields,
          })
        : '';
      const partialTranslation = partialEnglishReply
        ? await translateEnglishResponse({
            englishText: partialEnglishReply,
            targetLanguage: detectedLanguage,
            openaiClient: openai,
            model: CHAT_MODEL,
            noInfoText: NO_RELIABLE_INFO_RESPONSE,
          })
        : null;
      const referralPayload = await buildHelpDeskReferralPayload({
        intent,
        responseType: completeness.reason === 'missing_required_fields'
          ? RESPONSE_TYPES.PARTIAL_INFORMATION
          : RESPONSE_TYPES.HELP_DESK_REFERRAL,
        reason: completeness.reason,
        language: detectedLanguage,
        responsibleOffice: resolveResponsibleOffice(primary),
      });
      if (partialTranslation?.text) {
        referralPayload.reply = sanitizeGeneratedResponse(stripSourcesFromResponse(partialTranslation.text));
        referralPayload.responseLanguage = partialTranslation.targetLanguage;
        referralPayload.verificationStatus = 'partial';
        referralPayload.metadata.verificationStatus = 'partial';
      }

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        language_detection_scores: languageDetection.scores,
        language_detection_reason: languageDetection.reason,
        conversation_history_length: conversationHistory.length,
        conversation_context: conversationContext,
        contextualized_query: contextualizedInput,
        query_for_retrieval: retrievalQuery,
        normalized_query: retrieval.normalizedQuery,
        query_embedding_id: retrieval.queryEmbeddingId,
        top_k_ids: retrieval.topVectorResults.map((item) => item.id),
        similarity_scores: retrieval.topVectorResults.map((item) => item.similarity),
        reranker_scores: retrieval.rerankedResults.map((item) => item.rerankScore),
        final_context: contextWithStructured,
        chosen_match: primary ? {
          id: primary.id,
          type: primary.type,
          canonical_name: primary.canonical_name,
          is_active: primary.is_active,
        } : null,
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        chosen_lexical_match: bestLexicalMatch,
        missing_fields: completeness.missingFields,
        requested_fields: requestedFields,
        detected_stakeholder: retrieval.detectedStakeholder,
        verification_reason: completeness.reason,
        response_type: referralPayload.responseType,
        verification_status: referralPayload.verificationStatus,
        response_text: referralPayload.reply,
        retrieval_category: retrieval.retrievalCategory,
        retrieval_mode: retrieval.retrievalMode,
        vector_db: retrieval.vectorDb,
        embedding_model: retrieval.embeddingModel,
        type_filters: retrieval.typeFilters,
        category_filters: retrieval.categoryFilters,
        metadata_filters: retrieval.metadataFilters,
        fallback: retrieval.fallback,
      });

      return res.json(referralPayload);
    }

    if (String(primary?.type || '').toLowerCase() === 'faq') {
      if (!primary.structured) {
        primary.structured = await get_faq_details(primary.id);
      }

      const faq = primary.structured || {};
      const resources = Array.isArray(faq.resources) ? faq.resources : [];
      const relatedFaqs = Array.isArray(faq.relatedFaqs) ? faq.relatedFaqs : [];
      const asksForDownload = /\b(download|form|link|document|pdf|docx?|website|view)\b/i.test(`${message} ${retrievalQuery}`);
      const noResourceNotice = asksForDownload && resources.length === 0
        ? ' I can provide the available information, but I could not verify a downloadable resource in the available university information. Please contact the Help Desk or the assigned office for the official form.'
        : '';
      const faqAnswer = buildSourceAwareAnswer(
        `${String(faq.answer || '').trim()}${noResourceNotice}`.trim(),
        {
          ...primary,
          structured: faq,
          source_office: faq.sourceOffice || primary?.source_office,
        }
      );
      const faqTranslation = await translateEnglishResponse({
        englishText: faqAnswer,
        targetLanguage: detectedLanguage,
        openaiClient: openai,
        model: CHAT_MODEL,
        noInfoText: NO_RELIABLE_INFO_RESPONSE,
      });
      const faqReply = sanitizeGeneratedResponse(stripSourcesFromResponse(faqTranslation.text));

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        contextualized_query: contextualizedInput,
        query_for_retrieval: retrievalQuery,
        normalized_query: retrieval.normalizedQuery,
        final_context: contextWithStructured,
        chosen_match: {
          id: primary.id,
          type: primary.type,
          canonical_name: primary.canonical_name,
          is_active: primary.is_active,
        },
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        chosen_lexical_match: bestLexicalMatch,
        model_response: faqAnswer,
        response_text: faqReply,
        response_type: RESPONSE_TYPES.VERIFIED_ANSWER,
        verification_status: 'verified',
        knowledge_source: faq.sourceOffice || primary?.source_office || 'ALAGAD FAQ',
        final_response_language: faqTranslation.targetLanguage,
        retrieval_category: retrieval.retrievalCategory,
        retrieval_mode: retrieval.retrievalMode,
        vector_db: retrieval.vectorDb,
        embedding_model: retrieval.embeddingModel,
      });

      return res.json({
        intent: 'faq',
        location: faq.officeName || faq.departmentName || null,
        entityName: String(faq.question || primary?.canonical_name || '').trim() || null,
        responseLanguage: faqTranslation.targetLanguage,
        reply: faqReply,
        navigation: false,
        steps: [],
        faq: {
          id: faq.id,
          question: faq.question,
          category: faq.category,
          officeName: faq.officeName,
          departmentName: faq.departmentName,
          lastVerified: faq.lastVerified,
        },
        relatedFaqs,
        resources,
        responseType: RESPONSE_TYPES.VERIFIED_ANSWER,
        verificationStatus: 'verified',
        verificationNotice: buildVerificationNotice(primary, intent),
        helpDesk: await getHelpDeskContact(),
        metadata: {
          question: message,
          retrievedRecords: [{
            id: primary.id,
            type: primary.type,
            name: primary.canonical_name,
            source: faq.sourceOffice || primary?.source_office || 'ALAGAD FAQ',
            stakeholder: primary?.stakeholder || faq.stakeholder || null,
          }],
          retrievalScore: bestConfidencePercent,
          verificationStatus: 'verified',
          responseType: RESPONSE_TYPES.VERIFIED_ANSWER,
          knowledgeSource: faq.sourceOffice || primary?.source_office || 'ALAGAD FAQ',
          stakeholder: primary?.stakeholder || faq.stakeholder || retrieval.detectedStakeholder || null,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const responseGeneration = await generateStrictAnswer({
      userQuery: retrievalQuery,
      contextItems: contextWithStructured,
    });

    const generatedEnglishResponse = polishGrammar(responseGeneration.modelResponse);
    const primaryType = String(primary?.type || '').toLowerCase();
    const isPersonnelWhoWhere = primaryType === 'personnel'
      && (intent === 'who' || intent === 'where');
    const isEntityWhere = intent === 'where' && primaryType !== 'service';
    const isServiceIntent = primaryType === 'service'
      && (intent === 'unit_handler' || intent === 'requirements' || intent === 'process' || intent === 'description' || intent === 'where_process' || intent === 'deadline' || intent === 'processing_time' || intent === 'contact' || intent === 'service');
    const responseCandidate = isServiceIntent
      ? buildServiceIntentAnswer(primary, intent, generatedEnglishResponse)
      : (isPersonnelWhoWhere
        ? buildPersonnelWhoWhereAnswer(primary, intent, generatedEnglishResponse)
        : (isEntityWhere
          ? buildEntityWhereAnswer(primary, generatedEnglishResponse)
          : generatedEnglishResponse));
    const sanitizedEnglishResponse = polishGrammar(responseCandidate);
    if (!sanitizedEnglishResponse || sanitizedEnglishResponse === NO_RELIABLE_INFO_RESPONSE) {
      const referralPayload = await buildHelpDeskReferralPayload({
        intent,
        responseType: RESPONSE_TYPES.PARTIAL_INFORMATION,
        reason: 'answer_validation_failed',
        language: detectedLanguage,
        responsibleOffice: resolveResponsibleOffice(primary),
      });

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        query_for_retrieval: retrievalQuery,
        final_context: contextWithStructured,
        chosen_match: {
          id: bestContext.id,
          type: bestContext.type,
          canonical_name: bestContext.canonical_name,
          is_active: bestContext.is_active,
        },
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        model_prompt: responseGeneration.modelPrompt,
        model_response: responseGeneration.modelResponse,
        response_text: referralPayload.reply,
        response_type: referralPayload.responseType,
        verification_status: referralPayload.verificationStatus,
        verification_reason: 'answer_validation_failed',
      });

      return res.json(referralPayload);
    }

    const hallucination = detectHallucinationRisk(sanitizedEnglishResponse, contextWithStructured);
    if (hallucination.risk) {
      const referralPayload = await buildHelpDeskReferralPayload({
        intent,
        responseType: RESPONSE_TYPES.HELP_DESK_REFERRAL,
        reason: 'answer_not_supported_by_context',
        language: detectedLanguage,
        responsibleOffice: resolveResponsibleOffice(primary),
      });

      logAlert({
        alert_type: 'possible_hallucination',
        query: message,
        detected_language: detectedLanguage,
        query_for_retrieval: retrievalQuery,
        response_coverage: hallucination.coverage,
        model_response: responseGeneration.modelResponse,
        context_ids: contextWithStructured.map((item) => item.id),
      });

      logAudit({
        original_query: message,
        selected_suggestion: selectedSuggestion,
        detected_language: detectedLanguage,
        query_for_retrieval: retrievalQuery,
        final_context: contextWithStructured,
        chosen_match: {
          id: bestContext.id,
          type: bestContext.type,
          canonical_name: bestContext.canonical_name,
          is_active: bestContext.is_active,
        },
        chosen_similarity_score: bestSimilarityPercent,
        chosen_confidence_score: bestConfidencePercent,
        model_prompt: responseGeneration.modelPrompt,
        model_response: sanitizedEnglishResponse,
        response_text: referralPayload.reply,
        response_type: referralPayload.responseType,
        verification_status: referralPayload.verificationStatus,
        response_coverage: hallucination.coverage,
      });

      return res.json(referralPayload);
    }

    const sourceAwareEnglishResponse = buildSourceAwareAnswer(sanitizedEnglishResponse, primary);
    const responseTranslation = await translateEnglishResponse({
      englishText: sourceAwareEnglishResponse,
      targetLanguage: detectedLanguage,
      openaiClient: openai,
      model: CHAT_MODEL,
      noInfoText: NO_RELIABLE_INFO_RESPONSE,
    });
    const sanitizedResponseText = sanitizeGeneratedResponse(stripSourcesFromResponse(responseTranslation.text));
    const detailedResponseText = appendLocalizedDetail({
      text: sanitizedResponseText,
      contextItem: primary,
      intent,
      targetLanguage: responseTranslation.targetLanguage,
    });
    const emphasizedResponseText = applyResponseEmphasis(detailedResponseText, primary);

    logAudit({
      original_query: message,
      selected_suggestion: selectedSuggestion,
      detected_language: detectedLanguage,
      language_detection_scores: languageDetection.scores,
      language_detection_reason: languageDetection.reason,
      conversation_history_length: conversationHistory.length,
      conversation_context: conversationContext,
      contextualized_query: contextualizedInput,
      query_for_retrieval: retrievalQuery,
      normalized_query: retrieval.normalizedQuery,
      query_embedding_id: retrieval.queryEmbeddingId,
      embedding_vector: retrieval.queryEmbedding,
      top_k_ids: retrieval.topVectorResults.map((item) => item.id),
      similarity_scores: retrieval.topVectorResults.map((item) => item.similarity),
      reranker_scores: retrieval.rerankedResults.map((item) => item.rerankScore),
      final_context: contextWithStructured,
      chosen_match: {
        id: bestContext.id,
        type: bestContext.type,
        canonical_name: bestContext.canonical_name,
        is_active: bestContext.is_active,
      },
      ranked_candidates: rankedContextCandidates.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        canonical_name: candidate.canonical_name,
        similarity: candidate.similarity,
        adjusted_score: candidate.adjusted_score,
      })),
      chosen_similarity_score: bestSimilarityPercent,
      chosen_confidence_score: bestConfidencePercent,
      chosen_lexical_match: bestLexicalMatch,
      model_prompt: responseGeneration.modelPrompt,
        model_response: sourceAwareEnglishResponse,
      response_text: emphasizedResponseText,
      response_type: RESPONSE_TYPES.VERIFIED_ANSWER,
      verification_status: 'verified',
      knowledge_source: primary?.source_office || primary?.source || primary?.structured?.sourceOffice || 'ALAGAD records',
      model_response_language: 'english',
      final_response_language: responseTranslation.targetLanguage,
      translation_steps: {
        query: queryTranslation,
        response: responseTranslation,
      },
      retrieval_category: retrieval.retrievalCategory,
      retrieval_mode: retrieval.retrievalMode,
      vector_db: retrieval.vectorDb,
      embedding_model: retrieval.embeddingModel,
      type_filters: retrieval.typeFilters,
      category_filters: retrieval.categoryFilters,
      metadata_filters: retrieval.metadataFilters,
      fallback: retrieval.fallback,
    });

    const location = primary?.location || null;
    const steps = primary?.type === 'Service' && Array.isArray(primary?.structured?.process_steps)
      ? primary.structured.process_steps
      : [];

    return res.json({
      intent,
      location,
      entityName: String(primary?.canonical_name || '').trim() || null,
      responseLanguage: responseTranslation.targetLanguage,
      reply: emphasizedResponseText,
      navigation: Boolean(location),
      steps,
      responseType: RESPONSE_TYPES.VERIFIED_ANSWER,
      verificationStatus: 'verified',
      verificationNotice: buildVerificationNotice(primary, intent),
      helpDesk: await getHelpDeskContact(),
      metadata: {
        question: message,
        retrievedRecords: contextWithStructured.map((item) => ({
          id: item.id,
          type: item.type,
          name: item.canonical_name,
          source: item.source_office || item.source || item.structured?.sourceOffice,
          stakeholder: item.stakeholder || item.structured?.stakeholder || null,
        })),
        retrievalScore: bestConfidencePercent,
        verificationStatus: 'verified',
        responseType: RESPONSE_TYPES.VERIFIED_ANSWER,
        knowledgeSource: primary?.source_office || primary?.source || primary?.structured?.sourceOffice || 'ALAGAD records',
        stakeholder: primary?.stakeholder || primary?.structured?.stakeholder || retrieval.detectedStakeholder || null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logAlert({
      alert_type: 'chat_route_error',
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      error: error.message || 'Error processing chat request',
    });
  }
});

module.exports = router;
module.exports.__testables = {
  inferIntentFromQuery,
  applyResponseEmphasis,
  buildServiceIntentAnswer,
  buildPersonnelWhoWhereAnswer,
  buildEntityWhereAnswer,
  resolveConversationContext,
  buildConversationAwareQuery,
  buildClarificationQuestion,
  isTooVagueServiceQuery,
  hasExactServiceMatchInQuery,
  hasRecentClarificationPrompt,
  decideServiceClarification,
  isLikelyFollowUpQuery,
  deriveQueryIntentSignal,
  resolveDetectedLanguage,
  appendLocalizedDetail,
  rankContextCandidatesByIntentAndLanguage,
  evaluateInformationCompleteness,
  detectRequestedInfoFields,
  buildPartialVerifiedServiceAnswer,
  prioritizeVerifiedFaqCandidates,
  detectConflictingInformation,
  buildVerificationNotice,
  buildSourceAwareAnswer,
  buildLocalizedReferralText,
  buildReferralOfficeLabel,
  computeTokenSimilarity,
  computeFuzzyTokenOverlapRatio,
  RESPONSE_TYPES,
  NO_RELIABLE_INFO_RESPONSE,
};
