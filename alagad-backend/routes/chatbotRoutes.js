const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const Building = require('../models/Building');
const Room = require('../models/Room');
const Office = require('../models/Office');
const Department = require('../models/Department');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_MODEL_ALTERNATE = process.env.OPENAI_MODEL_ALTERNATE || 'gpt-4o';

const createChatCompletionWithFallback = async (payload) => {
  if (!openai) return null;

  const candidateModels = [OPENAI_MODEL, OPENAI_MODEL_ALTERNATE]
    .map((model) => String(model || '').trim())
    .filter(Boolean)
    .filter((model, index, arr) => arr.indexOf(model) === index);

  let lastError;
  for (const model of candidateModels) {
    try {
      return await openai.chat.completions.create({ ...payload, model });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const SERVICE_CACHE_TTL_MS = Number(process.env.CHAT_SERVICE_CACHE_TTL_MS || 60000);
const DEEP_SERVICE_REVIEW_ENABLED = String(process.env.CHAT_DEEP_SERVICE_REVIEW || 'true').toLowerCase() !== 'false';
const DEEP_SERVICE_REVIEW_MIN_GAP = Number(process.env.CHAT_DEEP_SERVICE_REVIEW_MIN_GAP || 35);
const serviceCache = {
  expiresAt: 0,
  data: [],
};
const translationCache = new Map();

const REPLIES = {
  en: {
    nonCampus: 'I can only assist with campus-related information.',
    notFound: 'Sorry, that information is not available in the campus database.',
    clarify: 'Can you clarify what you mean?',
    clarifyHint: 'Please specify if you need details, location, process/step-by-step, requirements, or personnel contact.',
    noSteps: 'No process information is available in the campus database.',
    noRequirements: 'No requirements information is available in the campus database.',
    noDescription: 'No description is available in the campus database.',
    labels: {
      name: 'Name',
      description: 'Description',
      location: 'Location',
      assignedBuilding: 'Assigned Building',
      serviceName: 'Service Name',
      requirements: 'Requirements',
      process: 'Process',
      title: 'Title',
      officeDepartment: 'Office/Department',
      contactInformation: 'Contact Information',
    },
    infoNotAvailable: 'Information not available',
  },
  tl: {
    nonCampus: 'Makatutulong lang ako sa campus-related na impormasyon.',
    notFound: 'Paumanhin, hindi available ang impormasyong iyon sa campus database.',
    clarify: 'Maaari mo bang linawin ang ibig mong sabihin?',
    clarifyHint: 'Pakisabi kung kailangan mo ng detalye, lokasyon, proseso/hakbang, requirements, o contact ng personnel.',
    noSteps: 'Walang available na proseso sa campus database.',
    noRequirements: 'Walang available na requirements sa campus database.',
    noDescription: 'Walang available na paglalarawan sa campus database.',
    labels: {
      name: 'Pangalan',
      description: 'Paglalarawan',
      location: 'Lokasyon',
      assignedBuilding: 'Nakatalagang Gusali',
      serviceName: 'Pangalan ng Serbisyo',
      requirements: 'Mga Requirement',
      process: 'Proseso',
      title: 'Pamagat',
      officeDepartment: 'Opisina/Kagawaran',
      contactInformation: 'Impormasyon sa Pakikipag-ugnayan',
    },
    infoNotAvailable: 'Walang available na impormasyon',
  },
  ceb: {
    nonCampus: 'Makatabang ra ko sa campus-related nga impormasyon.',
    notFound: 'Pasayloa, dili available ang maong impormasyon sa campus database.',
    clarify: 'Pwede nimo klarohon unsa imong pasabot?',
    clarifyHint: 'Palihog isulti kung unsa imong kinahanglan: detalye, lokasyon, proseso/lakang, requirements, o contact sa personnel.',
    noSteps: 'Walay available nga proseso sa campus database.',
    noRequirements: 'Walay available nga mga requirement sa campus database.',
    noDescription: 'Walay available nga deskripsyon sa campus database.',
    labels: {
      name: 'Ngalan',
      description: 'Deskripsyon',
      location: 'Lokasyon',
      assignedBuilding: 'Assigned Building',
      serviceName: 'Ngalan sa Serbisyo',
      requirements: 'Mga Requirement',
      process: 'Proseso',
      title: 'Titulo',
      officeDepartment: 'Opisina/Departamento',
      contactInformation: 'Impormasyon sa Kontak',
    },
    infoNotAvailable: 'Walay available nga impormasyon',
  },
};

const COMMON_TYPOS = {
  whre: 'where',
  wer: 'where',
  wre: 'where',
  ofce: 'office',
  offce: 'office',
  ofis: 'office',
  registrr: 'registrar',
  registar: 'registrar',
  buidling: 'building',
  bulding: 'building',
  depatment: 'department',
  deparment: 'department',
  departmnt: 'department',
  depertment: 'department',
  profesr: 'professor',
  profe: 'prof',
  sched: 'schedule',
  deans: 'dean',
  jhn: 'john',
  smth: 'smith',
  reqs: 'requirements',
  req: 'requirement',
  docs: 'documents',
  bldg: 'building',
  dept: 'department',
};

const QUERY_ALIASES = {
  tor: ['transcript', 'records'],
  cor: ['certificate', 'registration'],
  coe: ['certificate', 'enrollment'],
  coc: ['certificate', 'candidacy'],
  id: ['identification', 'card'],
  idcard: ['identification', 'card'],
  reg: ['registrar'],
  registrar: ['registration'],
  enroll: ['enrollment'],
  enrol: ['enrollment'],
  admission: ['admissions'],
  cashiering: ['cashier'],
  opisina: ['office'],
  tanggapan: ['office'],
  silid: ['room'],
  kwarto: ['room'],
  gusali: ['building'],
  kagawaran: ['department'],
  departamento: ['department'],
  proseso: ['process'],
  hakbang: ['steps'],
  lakang: ['steps'],
  kinahanglan: ['requirements'],
  kailangan: ['requirements'],
};

const CAMPUS_KEYWORDS = [
  'building', 'room', 'office', 'department', 'faculty', 'staff', 'professor', 'dean', 'service', 'registrar',
  'library', 'clinic', 'canteen', 'cashier', 'admissions', 'enrollment', 'transcript', 'certificate', 'requirements',
  'process', 'steps', 'directions', 'navigate', 'map', 'locate',
  'saan', 'nasaan', 'opisina', 'silid', 'kuwarto', 'gusali', 'serbisyo', 'tanggapan', 'direksyon',
  'asa', 'dinhi', 'adto', 'kwarto', 'direksiyon',
];

const SERVICE_KEYWORDS = ['service', 'process', 'steps', 'requirements', 'request', 'apply', 'transcript', 'certificate', 'how', 'paano', 'hakbang', 'proseso', 'kuha', 'unsaon', 'lakang'];
const PERSONNEL_KEYWORDS = ['personnel', 'faculty', 'staff', 'professor', 'dean', 'instructor', 'teacher', 'head', 'guro', 'maestra', 'maestro'];
const BUILDING_KEYWORDS = ['building', 'bldg', 'gusali', 'blok', 'hall'];
const DEPARTMENT_KEYWORDS = ['department', 'dept', 'kagawaran', 'departamento', 'college'];
const OFFICE_KEYWORDS = ['office', 'opisina', 'registrar', 'cashier', 'clinic', 'guidance'];
const ROOM_KEYWORDS = ['room', 'silid', 'kwarto', 'classroom', 'laboratory', 'lab'];

const detectLanguage = (message, preferred) => {
  const preferredLower = typeof preferred === 'string' ? preferred.toLowerCase() : '';
  const text = (message || '').toLowerCase();

  const cebMatches = (text.match(/\b(asa|ngano|unsa|pila|adto|dinhi|palihog|salamat|kinsa|kanus)\b/g) || []).length;
  const tlMatches = (text.match(/\b(saan|paano|ano|nasaan|pakisuyo|salamat|opo|po|sino|bakit)\b/g) || []).length;

  if (cebMatches > tlMatches && cebMatches > 0) return 'ceb';
  if (tlMatches > cebMatches && tlMatches > 0) return 'tl';
  if (tlMatches > 0) return 'tl';
  if (cebMatches > 0) return 'ceb';

  if (preferredLower === 'en' || preferredLower === 'tl' || preferredLower === 'ceb') return preferredLower;
  return 'en';
};

const getReplyPack = (lang) => REPLIES[lang] || REPLIES.en;

const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeText = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  return normalized
    .split(' ')
    .map((word) => COMMON_TYPOS[word] || word)
    .join(' ')
    .trim();
};

const levenshteinDistance = (a, b) => {
  const s = String(a || '');
  const t = String(b || '');
  if (!s) return t.length;
  if (!t) return s.length;

  const matrix = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[s.length][t.length];
};

const tokenHasNearMatch = (tokens, candidate, maxDistance = 2) => {
  const key = normalizeText(candidate);
  if (!key) return false;

  if (key.length <= 3) {
    return tokens.some((token) => token === key);
  }

  return tokens.some((token) => {
    if (token.length <= 2) return token === key;
    if (token === key) return true;
    if (Math.abs(token.length - key.length) > maxDistance) return false;
    return levenshteinDistance(token, key) <= maxDistance;
  });
};

const hasFuzzyKeyword = (message, keywords) => {
  const tokens = normalizeText(message).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  return keywords.some((keyword) => tokenHasNearMatch(tokens, keyword));
};

const isLikelyQuery = (message, regex, keywords) => regex.test(message) || hasFuzzyKeyword(message, keywords);

const extractSearchTokens = (message) => {
  const text = normalizeText(message);
  const words = text.split(' ').filter(Boolean);
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'is', 'are',
    'where', 'what', 'how', 'who', 'when', 'why', 'find', 'locate', 'show', 'tell',
    'saan', 'ano', 'paano', 'nasaan', 'bakit', 'sino',
    'asa', 'unsa', 'ngano', 'kinsa', 'kanus',
    'please', 'help', 'hi', 'hello', 'me', 'my', 'your', 'po', 'opo', 'palihog',
  ]);

  const baseTokens = Array.from(new Set(words.filter((w) => w.length >= 2 && !stop.has(w))));
  const expanded = new Set(baseTokens);

  for (const token of baseTokens) {
    const alias = QUERY_ALIASES[token];
    if (!alias) continue;
    const aliasList = Array.isArray(alias) ? alias : [alias];
    for (const value of aliasList) {
      const normalizedAlias = normalizeText(value);
      if (!normalizedAlias) continue;
      for (const part of normalizedAlias.split(' ')) {
        if (part && part.length >= 2) expanded.add(part);
      }
    }
  }

  return Array.from(expanded).slice(0, 14);
};

const extractServiceHintTokens = (message) => {
  const text = normalizeText(message);
  const words = text.split(' ').filter(Boolean);
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'is', 'are',
    'what', 'how', 'who', 'when', 'why', 'please', 'help',
    'service', 'services', 'process', 'steps', 'step', 'procedure', 'apply', 'application',
    'requirements', 'requirement', 'required', 'needed', 'documents', 'document',
    'get', 'getting', 'need',
  ]);

  return extractSearchTokens(words.filter((w) => !stop.has(w)).join(' ')).slice(0, 14);
};

const getTokenBigrams = (tokens) => {
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (left && right) bigrams.push(`${left} ${right}`);
  }
  return bigrams;
};

const getScoreGap = (topMatches) => {
  if (!Array.isArray(topMatches) || topMatches.length < 2) return Number.POSITIVE_INFINITY;
  return Number(topMatches[0]?.score || 0) - Number(topMatches[1]?.score || 0);
};

const hasEntityTokenAnchor = (message, entityName) => {
  const queryTokens = extractSearchTokens(message).map(normalizeHintToken).filter((token) => token.length >= 3);
  const nameTokens = normalizeText(entityName).split(' ').filter((token) => token.length >= 3);
  if (queryTokens.length === 0 || nameTokens.length === 0) return false;
  return queryTokens.some((token) => hasNearTokenInName(token, nameTokens));
};

const normalizeHintToken = (token) => {
  const t = String(token || '').trim();
  if (!t) return '';

  const aliases = {
    admissions: 'admission',
    enrolment: 'enrollment',
    slips: 'slip',
    permits: 'permit',
    certificates: 'certificate',
    transcripts: 'transcript',
    enrol: 'enrollment',
    enroll: 'enrollment',
    bldg: 'building',
    dept: 'department',
    opisina: 'office',
    silid: 'room',
    kwarto: 'room',
    gusali: 'building',
    proseso: 'process',
    hakbang: 'steps',
    lakang: 'steps',
    kinahanglan: 'requirements',
    kailangan: 'requirements',
  };

  return aliases[t] || t;
};

const hasNearTokenInName = (token, nameTokens) => {
  const key = normalizeHintToken(token);
  if (!key) return false;

  return (nameTokens || []).some((nameToken) => {
    if (!nameToken) return false;
    if (nameToken === key) return true;
    if (nameToken.includes(key) || key.includes(nameToken)) return true;

    const maxDistance = key.length >= 7 ? 2 : 1;
    if (Math.abs(nameToken.length - key.length) > maxDistance) return false;
    return levenshteinDistance(nameToken, key) <= maxDistance;
  });
};

const hasShortTokenDirectMatch = (message, targetText) => {
  const queryTokens = extractSearchTokens(message)
    .map(normalizeHintToken)
    .filter((token) => token && token.length >= 2 && token.length <= 4);
  if (queryTokens.length === 0) return false;

  const targetTokens = normalizeText(targetText).split(' ').filter(Boolean);
  if (targetTokens.length === 0) return false;

  return queryTokens.some((token) => targetTokens.includes(token));
};

const SERVICE_ALIAS_HINTS = {
  tor: ['tor', 'transcript of records', 'transcript'],
  coe: ['coe', 'certificate of enrollment', 'enrollment certificate'],
  cor: ['cor', 'certificate of registration', 'registration certificate'],
  coc: ['coc', 'certificate of candidacy', 'candidacy certificate'],
  id: ['id', 'identification card', 'school id'],
};

const resolveServiceAliasMatch = (message, services) => {
  const queryTokens = extractSearchTokens(message).map(normalizeHintToken).filter(Boolean);
  if (queryTokens.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const service of (services || [])) {
    const name = String(service?.name || '');
    const description = String(service?.description || '');
    const nameKey = normalizeText(name);
    const descKey = normalizeText(description);
    const combined = `${nameKey} ${descKey}`.trim();
    if (!combined) continue;

    let score = 0;
    for (const token of queryTokens) {
      const hints = SERVICE_ALIAS_HINTS[token];
      if (!hints) continue;

      for (const hint of hints) {
        const hintKey = normalizeText(hint);
        if (!hintKey) continue;
        if (nameKey.includes(hintKey)) score += 140;
        else if (combined.includes(hintKey)) score += 90;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = service;
    }
  }

  return bestScore >= 120 ? best : null;
};

const CAMPUS_KEYWORDS_RE = /\b(building|bldg|room|office|department|faculty|staff|professor|dean|service|registrar|library|clinic|canteen|cashier|admissions|enrollment|tor|transcript|certificate|request|requirements|process|steps|directions|navigate|navigation|map|locate|where)\b|\b(saan|nasaan|opisina|silid|kuwarto|gusali|serbisyo|tanggapan|direksyon|mag-navigate)\b|\b(asa|dinhi|adto|opisina|kwarto|building|serbisyo|direksiyon|mag-navigate)\b/i;

const SERVICE_QUERY_RE = /\b(service|process|steps|requirements|request|get|apply|tor|transcript|certificate|how)\b|\b(paano|hakbang|proseso|kuha)\b|\b(unsaon|proseso|lakang)\b/i;
const PERSONNEL_QUERY_RE = /\b(personnel|faculty|staff|professor|dean|instructor|teacher|head|find)\b|\b(guro|dean|personnel|faculty)\b|\b(maestra|maestro|dean|personnel)\b/i;
const BUILDING_QUERY_RE = /\b(building|bldg|hall|structure|where is the building)\b|\b(gusali|building)\b|\b(tukod|building)\b/i;
const DEPARTMENT_QUERY_RE = /\b(department|dept|college|program office)\b|\b(kagawaran|departamento)\b|\b(departamento|department)\b/i;
const OFFICE_QUERY_RE = /\b(office|registrar|cashier|guidance|admissions|dean office)\b|\b(opisina|tanggapan)\b|\b(opisina|tanggapan)\b/i;
const ROOM_QUERY_RE = /\b(room|classroom|laboratory|lab|lecture room)\b|\b(silid|kuwarto)\b|\b(kwarto|room)\b/i;
const PERSON_NAME_HINT_RE = /\b(dr\.?|prof\.?|professor|mr\.?|mrs\.?|ms\.?|maam|sir)\b/i;
const REQUIREMENTS_INTENT_RE = /\b(requirement|requirements|required|needed|documents|document|need to get|requirements for|needed for)\b|\b(kailangan|requirements|dokumento|mga dokumento)\b|\b(kinahanglan|requirements|dokumento|mga dokumento)\b/i;
const STEPS_INTENT_RE = /\b(how to|how do i|how can i|process|steps|step|procedure|apply|application|get|kuha)\b|\b(paano|hakbang|proseso|apply)\b|\b(unsaon|lakang|proseso)\b/i;
const DESCRIPTION_INTENT_RE = /\b(what is|what|describe|description|all about|meaning of|about)\b|\b(ano|ano ang|ibig sabihin)\b|\b(unsa|pasabot|mahitungod)\b/i;
const DETAILS_EXPLICIT_RE = /\b(what is|describe|description|details|detail|all about|meaning of|about)\b|\b(ano ang|ibig sabihin|detalye|tungkol)\b|\b(unsa ang|pasabot|detalye|mahitungod)\b/i;
const PERSONNEL_INTENT_RE = /\b(who is|person in charge|in charge|responsible for|who handles|who manages|faculty|staff|professor|dean|instructor|teacher)\b|\b(sino)\b|\b(kinsa)\b/i;
const ROOM_OFFICE_INTENT_RE = /\b(where is|location|where can i find|room|office)\b|\b(saan|nasaan|lokasyon|silid|opisina)\b|\b(asa|lokasyon|kwarto|opisina)\b/i;
const LOCATION_INTENT_RE = /\b(where|location|locate|located|find|office|room|building|saan|nasaan|lokasyon|asa|diin|kwarto|opisina)\b/i;
const CONTACT_INTENT_RE = /\b(contact|phone|email|number|how to contact|kontak|ugnayan|tawag)\b/i;
const TITLE_INTENT_RE = /\b(title|position|role|who is|head|dean|professor|instructor|guro|maestra|maestro|katungdanan)\b/i;

const LOCATION_INFO_KEYWORDS = ['where', 'location', 'locate', 'find', 'saan', 'nasaan', 'lokasyon', 'asa', 'diin'];
const DETAILS_INFO_KEYWORDS = ['details', 'detail', 'description', 'about', 'info', 'information', 'detalye'];
const CONTACT_INFO_KEYWORDS = ['contact', 'phone', 'email', 'number', 'kontak', 'ugnayan'];
const TITLE_INFO_KEYWORDS = ['title', 'position', 'role', 'head', 'dean', 'professor', 'instructor'];

const NOT_AVAILABLE_TEXT = 'Not available in my data.';

const formatValue = (value) => {
  const clean = String(value || '').trim();
  return clean || NOT_AVAILABLE_TEXT;
};

const formatListInline = (items) => {
  if (!Array.isArray(items)) return NOT_AVAILABLE_TEXT;
  const clean = items
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return clean.length > 0 ? clean.join('; ') : NOT_AVAILABLE_TEXT;
};

const getUnsupportedFieldMessage = (entityType) => {
  const mapping = {
    building: {
      allowed: 'name, details, or location',
      tip: 'details, location, or name',
      plural: 'buildings',
    },
    department: {
      allowed: 'name, details, or location',
      tip: 'details, location, or name',
      plural: 'departments',
    },
    office: {
      allowed: 'name, details, or location',
      tip: 'details, location, or name',
      plural: 'offices',
    },
    room: {
      allowed: 'name, details, or located-in building',
      tip: 'details or which building the room is in',
      plural: 'rooms',
    },
    personnel: {
      allowed: 'name, title, location, or contact',
      tip: 'title, location, or contact',
      plural: 'personnel records',
    },
    service: {
      allowed: 'details, requirements, or process',
      tip: 'service details, requirements, or process',
      plural: 'services',
    },
  };

  const selected = mapping[entityType] || mapping.building;
  return `I can only provide ${selected.allowed} for ${selected.plural}. Try asking for ${selected.tip}.`;
};

const isInvalidFieldRequestForIntent = (intent, requestedInfo) => {
  if (!requestedInfo) return false;

  if (intent === 'building' || intent === 'department' || intent === 'office' || intent === 'room') {
    return Boolean(requestedInfo.wantsContact || requestedInfo.wantsTitle || requestedInfo.wantsRequirements || requestedInfo.wantsSteps);
  }

  if (intent === 'service') {
    return Boolean(requestedInfo.wantsContact || requestedInfo.wantsTitle || requestedInfo.wantsLocation);
  }

  if (intent === 'personnel') {
    return Boolean(requestedInfo.wantsRequirements || requestedInfo.wantsSteps);
  }

  return false;
};

const extractStepsFromText = (text) => {
  if (!text || typeof text !== 'string') return [];

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const requirementsHeaderIndex = rawLines.findIndex((line) => /^requirements?\s*:?$/i.test(line) || /^requirements?\s*:/i.test(line));
  const processLines = requirementsHeaderIndex >= 0 ? rawLines.slice(0, requirementsHeaderIndex) : rawLines;
  const steps = [];

  for (const line of processLines) {
    const numbered = line.match(/^\d+\s*[\).:-]\s*(.+)$/);
    if (numbered) {
      steps.push(numbered[1].trim());
      continue;
    }

    const bulleted = line.match(/^[-*•]\s+(.+)$/);
    if (bulleted) {
      steps.push(bulleted[1].trim());
    }
  }

  if (steps.length > 0) return steps;
  return processLines;
};

const normalizeStepText = (value) => String(value || '')
  .replace(/^\s*\d+\s*[\).:-]\s*/g, '')
  .replace(/^\s*[-*•]\s+/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const ensureSentence = (text) => {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (/[.!?]$/.test(clean)) return clean;
  return `${clean}.`;
};

const detectServiceIntent = (message) => {
  const text = normalizeText(message);
  if (!text) return 'description';

  const hasRequirements = REQUIREMENTS_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, ['requirement', 'required', 'needed', 'documents', 'document', 'kailangan', 'kinahanglan']);
  const hasSteps = STEPS_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, ['how', 'process', 'steps', 'procedure', 'apply', 'paano', 'hakbang', 'proseso', 'unsaon', 'lakang']);
  const hasDescription = DESCRIPTION_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, ['what', 'describe', 'description', 'meaning', 'about', 'ano', 'unsa']);

  if (hasRequirements) return 'requirements';
  if (hasSteps) return 'steps';
  if (hasDescription) return 'description';
  return 'description';
};

const detectRequestedInfo = (message, intent) => {
  const text = normalizeText(message);

  const wantsLocation = LOCATION_INTENT_RE.test(text)
    || ROOM_OFFICE_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, LOCATION_INFO_KEYWORDS);
  const wantsDetails = DETAILS_EXPLICIT_RE.test(text)
    || hasFuzzyKeyword(text, DETAILS_INFO_KEYWORDS);
  const wantsRequirements = REQUIREMENTS_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, ['requirement', 'required', 'needed', 'documents', 'kailangan', 'kinahanglan']);
  const wantsSteps = STEPS_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, ['steps', 'step', 'process', 'procedure', 'how', 'paano', 'unsaon', 'lakang']);
  const wantsContact = CONTACT_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, CONTACT_INFO_KEYWORDS);
  const wantsTitle = TITLE_INTENT_RE.test(text)
    || hasFuzzyKeyword(text, TITLE_INFO_KEYWORDS);

  if (intent === 'service') {
    const hasSpecificAsk = wantsLocation || wantsDetails || wantsRequirements || wantsSteps;
    return {
      wantsLocation,
      wantsDetails: hasSpecificAsk ? wantsDetails : true,
      wantsRequirements,
      wantsSteps,
      wantsContact,
      wantsTitle,
    };
  }

  if (intent === 'personnel') {
    const hasSpecificAsk = wantsLocation || wantsDetails || wantsContact || wantsTitle;
    return {
      wantsLocation: hasSpecificAsk ? wantsLocation : true,
      wantsDetails: hasSpecificAsk ? wantsDetails : true,
      wantsRequirements: false,
      wantsSteps: false,
      wantsContact: hasSpecificAsk ? wantsContact : true,
      wantsTitle: hasSpecificAsk ? wantsTitle : true,
    };
  }

  const hasSpecificAsk = wantsLocation || wantsDetails;
  return {
    wantsLocation: hasSpecificAsk
      ? wantsLocation
      : (intent === 'building' || intent === 'department' || intent === 'office' || intent === 'room'),
    wantsDetails: hasSpecificAsk ? wantsDetails : true,
    wantsRequirements: false,
    wantsSteps: false,
    wantsContact,
    wantsTitle,
  };
};

const extractRequirementsFromText = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const reqIndex = lines.findIndex((line) => /^requirements?\s*:?$/i.test(line) || /^requirements?\s*:/i.test(line));
  if (reqIndex < 0) return [];

  const reqLines = lines.slice(reqIndex + 1);
  const requirements = [];
  for (const line of reqLines) {
    const numbered = line.match(/^\d+\s*[).:-]\s*(.+)$/);
    if (numbered) {
      requirements.push(numbered[1].trim());
      continue;
    }

    const bulleted = line.match(/^[-*•]\s+(.+)$/);
    if (bulleted) {
      requirements.push(bulleted[1].trim());
      continue;
    }

    if (/^steps?\s*:?$/i.test(line) || /^process\s*:?$/i.test(line)) break;
    requirements.push(line);
  }

  return requirements.map((item) => String(item || '').trim()).filter(Boolean);
};

const buildRequirementsResponse = ({ serviceName, requirements }) => {
  const normalizedRequirements = (requirements || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [
    `The requirements to get ${serviceName} are:`,
    ...normalizedRequirements.map((item) => `- ${item}`),
  ].join('\n');
};

const buildStepsResponse = ({ serviceName, steps }) => {
  const normalizedSteps = (steps || [])
    .map(normalizeStepText)
    .filter(Boolean);

  return [
    `To get ${serviceName}:`,
    ...normalizedSteps.map((step, index) => `${index + 1}. ${ensureSentence(step)}`),
  ].join('\n');
};

const buildDescriptionResponse = ({ serviceName, description }) => {
  const cleanDescription = ensureSentence(description);
  return `${serviceName} is ${cleanDescription}`;
};

const buildNotFoundReply = (replyPack) => `${replyPack.clarify}\n${replyPack.clarifyHint || ''}`.trim();
const buildClarificationReply = (replyPack) => replyPack.clarify;

const toFieldLine = (label, value, fallback) => `${label}: ${String(value || '').trim() || fallback}`;

const toMultiLineSection = (label, items, fallback) => {
  const lines = Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return [
    `${label}:`,
    lines.length > 0 ? lines.join('\n') : fallback,
  ].join('\n');
};

const ordinalFloor = (floorNumber) => {
  const n = Number(floorNumber);
  if (!Number.isFinite(n) || n <= 0) return '';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
};

const formatEntityLocation = (entity) => {
  const buildingName = entity?.building?.name || '';
  const floor = ordinalFloor(entity?.floor);
  if (buildingName && floor) return `${buildingName}, ${floor} Floor`;
  if (buildingName) return buildingName;
  if (floor) return `${floor} Floor`;
  return '';
};

const detectIntent = (message) => {
  const text = normalizeText(message);
  if (!text) return 'unknown';

  const scores = {
    building: 0,
    department: 0,
    office: 0,
    room: 0,
    service: 0,
    personnel: 0,
  };

  if (isLikelyQuery(text, BUILDING_QUERY_RE, BUILDING_KEYWORDS)) scores.building += 2;
  if (isLikelyQuery(text, DEPARTMENT_QUERY_RE, DEPARTMENT_KEYWORDS)) scores.department += 2;
  if (isLikelyQuery(text, OFFICE_QUERY_RE, OFFICE_KEYWORDS)) scores.office += 2;
  if (isLikelyQuery(text, ROOM_QUERY_RE, ROOM_KEYWORDS)) scores.room += 2;

  if (PERSONNEL_INTENT_RE.test(text) || isLikelyQuery(text, PERSONNEL_QUERY_RE, PERSONNEL_KEYWORDS)) {
    scores.personnel += 3;
  }

  if (PERSON_NAME_HINT_RE.test(text)) {
    scores.personnel += 2;
  }

  const isServiceKeywordLike = isLikelyQuery(text, SERVICE_QUERY_RE, SERVICE_KEYWORDS);
  const isServiceDescriptionLike = DESCRIPTION_INTENT_RE.test(text) && isServiceKeywordLike;
  if (REQUIREMENTS_INTENT_RE.test(text) || STEPS_INTENT_RE.test(text) || isServiceDescriptionLike || isServiceKeywordLike) {
    scores.service += 3;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top[1] <= 0) return 'unknown';
  if (second && second[1] === top[1]) return 'unknown';

  return top[0];
};

const isLowConfidence = (entries, minGap = 18, minTopScore = 120) => {
  if (!Array.isArray(entries) || entries.length < 2) return false;
  const topScore = Number(entries[0]?.score || 0);
  if (topScore >= minTopScore) return false;
  return getScoreGap(entries) < minGap;
};

const buildStructuredEntityResponse = ({
  replyPack,
  name,
  description,
  location,
  isDepartment = false,
  includeDescription = true,
  includeLocation = true,
}) => {
  const labels = replyPack.labels;
  const lines = [toFieldLine(labels.name, name, replyPack.infoNotAvailable)];
  if (includeDescription) lines.push(toFieldLine(labels.description, description, replyPack.infoNotAvailable));
  if (includeLocation) lines.push(toFieldLine(isDepartment ? labels.assignedBuilding : labels.location, location, replyPack.infoNotAvailable));
  return lines.join('\n');
};

const buildPersonnelResponse = ({
  replyPack,
  person,
  includeTitle = true,
  includeOfficeDepartment = true,
  includeContact = true,
}) => {
  const labels = replyPack.labels;
  const officeName = String(person?.office?.name || '').trim();
  const officeDept = String(person?.office?.department || '').trim();
  const officeBuilding = String(person?.office?.building?.name || '').trim();
  const officeDepartment = [officeName, officeDept || officeBuilding].filter(Boolean).join(', ');

  const lines = [toFieldLine(labels.name, person?.name, replyPack.infoNotAvailable)];
  if (includeTitle) lines.push(toFieldLine(labels.title, person?.title, replyPack.infoNotAvailable));
  if (includeOfficeDepartment) lines.push(toFieldLine(labels.officeDepartment, person?.department || officeDepartment, replyPack.infoNotAvailable));
  if (includeContact) lines.push(toFieldLine(labels.contactInformation, person?.contactInfo, replyPack.infoNotAvailable));
  return lines.join('\n');
};

const buildServiceResponse = ({
  replyPack,
  serviceName,
  description,
  requirements,
  process,
  serviceLocation,
  includeDescription = true,
  includeRequirements = true,
  includeProcess = true,
  includeLocation = false,
}) => {
  const labels = replyPack.labels;
  const sections = [toFieldLine(labels.serviceName, serviceName, replyPack.infoNotAvailable)];
  if (includeDescription) sections.push(toFieldLine(labels.description, description, replyPack.noDescription));
  if (includeLocation) sections.push(toFieldLine(labels.location, serviceLocation, replyPack.infoNotAvailable));
  if (includeRequirements) sections.push(toMultiLineSection(labels.requirements, requirements, replyPack.noRequirements));
  if (includeProcess) sections.push(toMultiLineSection(labels.process, process, replyPack.noSteps));
  return sections.join('\n\n');
};

const extractPersonnelHintTokens = (message) => {
  const text = normalizeText(message);
  const words = text.split(' ').filter(Boolean);
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'is', 'are',
    'who', 'what', 'where', 'find', 'locate', 'show', 'tell',
    'personnel', 'faculty', 'staff', 'professor', 'instructor', 'teacher', 'head', 'dean',
    'contact', 'office', 'department', 'position', 'title', 'role',
    'sino', 'kinsa', 'saan', 'asa', 'please', 'help', 'po', 'opo',
  ]);

  return Array.from(new Set(words.filter((w) => w.length >= 3 && !stop.has(w)))).slice(0, 8);
};

const getPersonnelScore = (message, person) => {
  const name = person?.name || '';
  const title = person?.title || '';
  const officeName = person?.office?.name || '';
  const officeDept = person?.office?.department || '';
  const dept = person?.department || officeDept || '';

  const nameScore = scoreNameMatch(message, name);
  const titleScore = scoreNameMatch(message, title);
  const deptScore = scoreNameMatch(message, dept);
  const officeScore = scoreNameMatch(message, officeName);

  const hintTokens = extractPersonnelHintTokens(message).map(normalizeHintToken).filter(Boolean);
  const nameTokens = normalizeText(name).split(' ').filter(Boolean);
  const titleTokens = normalizeText(title).split(' ').filter(Boolean);
  const deptTokens = normalizeText(dept).split(' ').filter(Boolean);
  const officeTokens = normalizeText(officeName).split(' ').filter(Boolean);

  const nameOverlap = hintTokens.reduce((count, token) => (hasNearTokenInName(token, nameTokens) ? count + 1 : count), 0);
  const titleOverlap = hintTokens.reduce((count, token) => (hasNearTokenInName(token, titleTokens) ? count + 1 : count), 0);
  const deptOverlap = hintTokens.reduce((count, token) => (hasNearTokenInName(token, deptTokens) ? count + 1 : count), 0);
  const officeOverlap = hintTokens.reduce((count, token) => (hasNearTokenInName(token, officeTokens) ? count + 1 : count), 0);

  let score = (nameScore * 1.35) + (titleScore * 1.05) + (deptScore * 0.95) + (officeScore * 0.85);
  score += (nameOverlap * 90) + (titleOverlap * 55) + (deptOverlap * 40) + (officeOverlap * 30);

  if (hintTokens.length >= 2 && (nameOverlap + titleOverlap + deptOverlap + officeOverlap) === 0) {
    score -= 220;
  }
  if (hintTokens.length >= 2 && nameOverlap === 0 && nameScore < 130 && titleOverlap === 0) {
    score -= 80;
  }

  return score;
};

const getPersonnelEntries = (message, people, max = 3) => (people || [])
  .map((person) => ({ person, score: getPersonnelScore(message, person) }))
  .filter((entry) => entry.score >= 60)
  .sort((a, b) => b.score - a.score)
  .slice(0, max);

const getLocationScore = (message, item) => {
  const location = formatEntityLocation(item);
  return Math.max(
    scoreNameMatch(message, item?.name || ''),
    scoreNameMatch(message, item?.description || ''),
    scoreNameMatch(message, item?.department || ''),
    scoreNameMatch(message, location)
  );
};

const getLocationEntries = (message, items, max = 3) => (items || [])
  .map((item) => ({ item, score: getLocationScore(message, item) }))
  .filter((entry) => entry.score >= 42)
  .sort((a, b) => b.score - a.score)
  .slice(0, max);

const getBuildingEntries = (message, buildings, max = 3) => (buildings || [])
  .map((building) => ({ building, score: Math.max(scoreNameMatch(message, building?.name || ''), scoreNameMatch(message, building?.description || '')) }))
  .filter((entry) => entry.score >= 40)
  .sort((a, b) => b.score - a.score)
  .slice(0, max);

const getDepartmentEntries = (message, departments, max = 3) => (departments || [])
  .map((department) => ({
    department,
    score: Math.max(
      scoreNameMatch(message, department?.name || ''),
      scoreNameMatch(message, department?.code || ''),
      scoreNameMatch(message, department?.description || ''),
      scoreNameMatch(message, department?.building?.name || '')
    ),
  }))
  .filter((entry) => entry.score >= 35)
  .sort((a, b) => b.score - a.score)
  .slice(0, max);

const getEntityLocation = (item) => {
  const location = formatEntityLocation(item);
  if (location) return location;
  return String(item?.department || '').trim();
};

const getDepartmentAssignedBuilding = (department) => {
  const buildingName = String(department?.building?.name || '').trim();
  const floor = ordinalFloor(department?.floor);
  if (buildingName && floor) return `${buildingName}, ${floor} Floor`;
  if (buildingName) return buildingName;
  return '';
};

const getPersonnelNavigationLocation = (person) => {
  const officeName = String(person?.office?.name || '').trim();
  const buildingName = String(person?.office?.building?.name || '').trim();
  if (officeName && buildingName) return `${officeName}, ${buildingName}`;
  if (officeName) return officeName;
  if (buildingName) return buildingName;
  return '';
};

const scoreNameMatch = (message, name) => {
  const messageKey = normalizeText(message);
  const nameKey = normalizeText(name);
  if (!messageKey || !nameKey) return 0;

  if (messageKey === nameKey) return 200;
  if (messageKey.includes(nameKey)) return 160;
  if (nameKey.includes(messageKey) && messageKey.length >= 4) return 130;

  const tokens = extractSearchTokens(message);
  let score = 0;

  for (const token of tokens) {
    if (nameKey.includes(token)) score += Math.min(20, token.length * 2);
  }

  const messageTokens = extractSearchTokens(message).filter((token) => token.length >= 3);
  const nameTokens = nameKey.split(' ').filter((token) => token.length >= 3);

  for (const messageToken of messageTokens) {
    for (const nameToken of nameTokens) {
      if (!messageToken || !nameToken) continue;
      const distance = levenshteinDistance(messageToken, nameToken);
      if (distance === 1) score += 18;
      else if (distance === 2) score += 10;
    }
  }

  return score;
};

const getBestMatch = (message, items, nameGetter) => {
  let bestItem = null;
  let bestScore = 0;

  for (const item of items) {
    const name = nameGetter(item);
    const score = scoreNameMatch(message, name);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return { item: bestItem, score: bestScore };
};

const getTopServiceMatches = (message, services, max = 3) => {
  const hintTokens = extractServiceHintTokens(message).map(normalizeHintToken).filter(Boolean);
  const hintBigrams = getTokenBigrams(hintTokens);
  const shortQueryTokens = extractSearchTokens(message)
    .map(normalizeHintToken)
    .filter((token) => token && token.length >= 2 && token.length <= 4)
    .filter((token) => !['info', 'need', 'step', 'req', 'reqs'].includes(token));

  return (services || [])
    .map((service) => {
      const serviceName = String(service?.name || '');
      const serviceDescription = String(service?.description || '');
      const serviceRequirements = Array.isArray(service?.requirements) ? service.requirements.join(' ') : '';
      const serviceSteps = Array.isArray(service?.steps) ? service.steps.join(' ') : '';
      const serviceOffice = String(service?.office?.name || '');
      const serviceDepartment = String(service?.department || service?.office?.department || '');
      const serviceCorpus = [
        serviceName,
        serviceDescription,
        serviceRequirements,
        serviceSteps,
        serviceOffice,
        serviceDepartment,
      ].join(' ');

      const serviceNameKey = normalizeText(serviceName);
      const serviceNameTokens = serviceNameKey.split(' ').filter(Boolean);
      const serviceCorpusKey = normalizeText(serviceCorpus);
      const serviceCorpusTokens = serviceCorpusKey.split(' ').filter(Boolean);

      const baseScore = scoreNameMatch(message, serviceName);
      const corpusScore = scoreNameMatch(message, serviceCorpus);

      const overlapCountName = hintTokens.reduce(
        (count, token) => (hasNearTokenInName(token, serviceNameTokens) ? count + 1 : count),
        0
      );
      const overlapCountCorpus = hintTokens.reduce(
        (count, token) => (hasNearTokenInName(token, serviceCorpusTokens) ? count + 1 : count),
        0
      );

      const hasBigram = hintBigrams.some((bigram) => {
        if (serviceNameKey.includes(bigram)) return true;
        const [left, right] = bigram.split(' ');
        if (!left || !right) return false;
        for (let i = 0; i < serviceNameTokens.length - 1; i += 1) {
          const a = serviceNameTokens[i];
          const b = serviceNameTokens[i + 1];
          if (hasNearTokenInName(left, [a]) && hasNearTokenInName(right, [b])) return true;
        }
        return false;
      });
      const hasCorpusBigram = hintBigrams.some((bigram) => serviceCorpusKey.includes(bigram));
      const shortTokenNameHitCount = shortQueryTokens.reduce(
        (count, token) => (serviceNameTokens.includes(token) ? count + 1 : count),
        0
      );

      let finalScore = (baseScore * 1.05)
        + (corpusScore * 0.65)
        + (overlapCountName * 42)
        + (overlapCountCorpus * 16)
        + (hasBigram ? 60 : 0)
        + (hasCorpusBigram ? 25 : 0)
        + (shortTokenNameHitCount * 130);

      const overlapCount = Math.max(overlapCountName, overlapCountCorpus);

      // If the query includes concrete service hints, strongly penalize unrelated service names.
      if (hintTokens.length >= 2 && overlapCountCorpus === 0 && baseScore < 150 && corpusScore < 170) {
        finalScore -= 170;
      }
      if (shortQueryTokens.length > 0 && shortTokenNameHitCount === 0 && overlapCount === 0 && baseScore < 130) {
        finalScore -= 90;
      }

      return { service, score: finalScore, overlapCount };
    })
    .filter((entry) => entry.score >= 52)
    .filter((entry) => (hintTokens.length >= 2 ? entry.overlapCount > 0 || entry.score >= 205 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
};

const shouldRunDeepServiceReview = (message, topMatches) => {
  if (!DEEP_SERVICE_REVIEW_ENABLED) return false;
  if (!Array.isArray(topMatches) || topMatches.length === 0) return false;

  const hintTokens = extractServiceHintTokens(message).map(normalizeHintToken).filter(Boolean);
  const scoreGap = getScoreGap(topMatches);
  const best = topMatches[0];
  const bestOverlap = Number(best?.overlapCount || 0);

  if (topMatches.length > 1 && scoreGap < DEEP_SERVICE_REVIEW_MIN_GAP && bestOverlap <= 1) return true;
  if (hintTokens.length >= 2 && bestOverlap < Math.ceil(hintTokens.length / 2)) return true;
  return false;
};

const getCachedServices = async () => {
  const now = Date.now();
  if (serviceCache.expiresAt > now && Array.isArray(serviceCache.data) && serviceCache.data.length > 0) {
    return serviceCache.data;
  }

  const activeFilter = { isActive: { $ne: false } };
  const services = await Service.find(activeFilter)
    .select('name description requirements steps office department')
    .populate('office', 'name department')
    .sort({ name: 1 })
    .limit(500)
    .lean();

  serviceCache.data = services;
  serviceCache.expiresAt = now + SERVICE_CACHE_TTL_MS;
  return services;
};

const parseJsonArray = (text) => {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const parseJsonObject = (text) => {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const parseFirstJsonObject = (text) => {
  const direct = parseJsonObject(text);
  if (direct) return direct;

  const input = String(text || '').trim();
  if (!input) return null;
  const match = input.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return parseJsonObject(match[0]);
};

const selectServiceMatchWithDeepReview = async (englishMessage, topMatches) => {
  if (!Array.isArray(topMatches) || topMatches.length === 0) return null;
  if (!openai) return topMatches[0];

  try {
    const candidatePayload = topMatches.map((entry) => ({
      name: String(entry?.service?.name || '').trim(),
      description: String(entry?.service?.description || '').trim().slice(0, 280),
      overlapCount: Number(entry?.overlapCount || 0),
      score: Number(entry?.score || 0),
    }));

    const completion = await createChatCompletionWithFallback({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'Pick the best matching campus service for the user query from candidates.',
            'Return JSON only with: {"selectedName":"string","confidence":"high|medium|low"}.',
            'Rules:',
            '- Select only from provided candidate names.',
            '- Prioritize exact phrase meaning and specific service words.',
            '- If uncertain, set confidence to low.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({ query: englishMessage, candidates: candidatePayload }),
        },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseFirstJsonObject(raw);
    if (!parsed) return topMatches[0];

    const selectedName = normalizeText(parsed.selectedName || '');
    const confidence = String(parsed.confidence || '').toLowerCase();

    const selected = topMatches.find((entry) => normalizeText(entry?.service?.name || '') === selectedName);
    const chosen = selected || topMatches[0];

    const hintTokens = extractServiceHintTokens(englishMessage).map(normalizeHintToken).filter(Boolean);
    if (confidence === 'low') return null;
    if (hintTokens.length >= 2 && Number(chosen?.overlapCount || 0) === 0) return null;

    return chosen;
  } catch (_error) {
    return topMatches[0];
  }
};

const translateToEnglishForUnderstanding = async (userLang, text) => {
  const cleaned = String(text || '').trim();
  if (!cleaned) return '';
  if (userLang === 'en' || !openai) return cleaned;

  const cacheKey = `to-en::${userLang}::${cleaned}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  try {
    const source = userLang === 'tl' ? 'Tagalog' : 'Cebuano';
    const completion = await createChatCompletionWithFallback({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Translate ${source} text to concise, natural English. Keep names/places unchanged. Return plain text only.`,
        },
        {
          role: 'user',
          content: cleaned,
        },
      ],
    });

    const translated = completion?.choices?.[0]?.message?.content?.trim() || cleaned;
    if (translationCache.size >= 200) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (_error) {
    return cleaned;
  }
};

const classifyDomainAndIntentWithLLM = async (englishMessage) => {
  const text = String(englishMessage || '').trim();
  if (!text || !openai) return null;

  try {
    const completion = await createChatCompletionWithFallback({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'Classify campus query intent. Return JSON only with this shape:',
            '{"intent":"building|department|office|room|service|personnel|unknown","serviceIntent":"requirements|steps|description|unknown","confidence":"high|medium|low"}',
            'Rules:',
            '- intent=personnel for people/contact/in-charge queries.',
            '- intent=service for service requirements/process/description queries.',
            '- intent=building, department, office, room only when explicit or strongly implied.',
            '- If ambiguous between intent types, set intent="unknown" and confidence="low".',
            '- serviceIntent is only for intent=service, else "unknown".',
          ].join('\n'),
        },
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseFirstJsonObject(raw);
    if (!parsed) return null;

    const validIntents = new Set(['building', 'department', 'office', 'room', 'service', 'personnel', 'unknown']);
    const validServiceIntents = new Set(['requirements', 'steps', 'description', 'unknown']);
    const validConfidence = new Set(['high', 'medium', 'low']);
    const intent = validIntents.has(parsed.intent) ? parsed.intent : 'unknown';
    const serviceIntent = validServiceIntents.has(parsed.serviceIntent) ? parsed.serviceIntent : 'unknown';
    const confidence = validConfidence.has(parsed.confidence) ? parsed.confidence : 'low';
    return { intent, serviceIntent, confidence };
  } catch (_error) {
    return null;
  }
};

const translateItems = async (userLang, items) => {
  const cleaned = (items || []).map((item) => String(item || '').trim());
  if (userLang === 'en' || cleaned.length === 0 || !openai) return cleaned;

  const cacheKey = `${userLang}::${cleaned.join('||')}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  try {
    const target = userLang === 'tl' ? 'Tagalog' : 'Cebuano';
    const completion = await createChatCompletionWithFallback({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Translate each item into ${target}. Use simple everyday words. Return JSON array only.`,
        },
        {
          role: 'user',
          content: JSON.stringify(cleaned),
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseJsonArray(content);
    if (!parsed || parsed.length !== cleaned.length) return cleaned;

    const normalized = parsed.map((item, idx) => String(item || '').trim() || cleaned[idx]);
    if (translationCache.size >= 200) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, normalized);
    return normalized;
  } catch (_error) {
    return cleaned;
  }
};

const isProbablyCampusQuestion = async (message) => {
  if (!message || typeof message !== 'string') return false;
  if (CAMPUS_KEYWORDS_RE.test(message)) return true;
  if (hasFuzzyKeyword(message, CAMPUS_KEYWORDS)) return true;

  const tokens = extractSearchTokens(message);
  if (tokens.length === 0) return false;

  const pattern = tokens.map(escapeRegExp).join('|');
  if (!pattern) return false;

  const nameRegex = new RegExp(pattern, 'i');
  const activeFilter = { isActive: { $ne: false } };
  const departmentActiveFilter = { active: { $ne: false } };

  const [building, office, room, service, personnel, department] = await Promise.all([
    Building.findOne({ ...activeFilter, name: nameRegex }).select('_id'),
    Office.findOne({ ...activeFilter, name: nameRegex }).select('_id'),
    Room.findOne({ ...activeFilter, name: nameRegex }).select('_id'),
    Service.findOne({ ...activeFilter, name: nameRegex }).select('_id'),
    FacultyStaff.findOne({ ...activeFilter, name: nameRegex }).select('_id'),
    Department.findOne({ ...departmentActiveFilter, name: nameRegex }).select('_id'),
  ]);

  return Boolean(building || office || room || service || personnel || department);
};

const isOnlyLocationRequest = (requestedInfo) => Boolean(
  requestedInfo?.wantsLocation
  && !requestedInfo?.wantsDetails
  && !requestedInfo?.wantsRequirements
  && !requestedInfo?.wantsSteps
  && !requestedInfo?.wantsContact
  && !requestedInfo?.wantsTitle
);

const isOnlyDetailsRequest = (requestedInfo) => Boolean(
  requestedInfo?.wantsDetails
  && !requestedInfo?.wantsLocation
  && !requestedInfo?.wantsRequirements
  && !requestedInfo?.wantsSteps
  && !requestedInfo?.wantsContact
  && !requestedInfo?.wantsTitle
);

const isOnlyContactRequest = (requestedInfo) => Boolean(
  requestedInfo?.wantsContact
  && !requestedInfo?.wantsLocation
  && !requestedInfo?.wantsTitle
  && !requestedInfo?.wantsDetails
);

const isOnlyTitleRequest = (requestedInfo) => Boolean(
  requestedInfo?.wantsTitle
  && !requestedInfo?.wantsLocation
  && !requestedInfo?.wantsContact
  && !requestedInfo?.wantsDetails
);

const getBuildingLocation = (building) => {
  const coords = Array.isArray(building?.geometry?.coordinates)
    ? building.geometry.coordinates
    : null;
  if (coords && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  if (Number.isFinite(building?.numberOfFloors) && building.numberOfFloors > 0) {
    return `${ordinalFloor(building.numberOfFloors)} Floor (building total)`;
  }

  return '';
};

const getDepartmentLocation = (department) => {
  const buildingName = String(department?.building?.name || '').trim();
  const floor = ordinalFloor(department?.floor);
  const room = String(department?.room || '').trim();
  const pieces = [buildingName];
  if (room) pieces.push(`Room ${room}`);
  if (floor) pieces.push(`${floor} Floor`);
  return pieces.filter(Boolean).join(', ');
};

const getOfficeLocation = (office) => {
  const buildingName = String(office?.building?.name || '').trim();
  const roomName = String(office?.room?.name || '').trim();
  const floor = ordinalFloor(office?.floor);
  const pieces = [buildingName, roomName, floor ? `${floor} Floor` : ''];
  return pieces.filter(Boolean).join(', ');
};

const getRoomBuilding = (room) => String(room?.building?.name || '').trim();

const getPersonnelLocation = (person) => {
  const officeName = String(person?.office?.name || '').trim();
  const buildingName = String(person?.office?.building?.name || '').trim();
  const dept = String(person?.department || '').trim();
  return [officeName, buildingName || dept].filter(Boolean).join(', ');
};

// @desc    Chat with campus assistant (database-driven)
// @route   POST /api/chat
// @access  Public (Guest only)
router.post('/', async (req, res) => {
  try {
    const { message, language = 'en' } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userLang = detectLanguage(message, language);
    const r = getReplyPack(userLang);
    const trimmedMessage = message.trim();
    const englishQuery = await translateToEnglishForUnderstanding(userLang, trimmedMessage);

    const campusLikely = await isProbablyCampusQuestion(englishQuery);

    const ruleIntent = detectIntent(englishQuery);
    const shouldUseLLMClassifier = ruleIntent === 'unknown';
    const llmClass = shouldUseLLMClassifier
      ? await classifyDomainAndIntentWithLLM(englishQuery)
      : null;

    const intent = ruleIntent !== 'unknown'
      ? ruleIntent
      : ((llmClass?.confidence === 'low') ? 'unknown' : (llmClass?.intent || 'unknown'));

    const requestedInfo = detectRequestedInfo(englishQuery, intent);

    if (intent !== 'unknown' && isInvalidFieldRequestForIntent(intent, requestedInfo)) {
      return res.json({
        intent,
        location: null,
        reply: getUnsupportedFieldMessage(intent),
        navigation: false,
        steps: [],
      });
    }

    if (intent === 'unknown') {
      return res.json({
        intent: 'unknown',
        location: null,
        reply: campusLikely ? buildClarificationReply(r) : r.nonCampus,
        navigation: false,
        steps: [],
      });
    }

    if (intent === 'personnel') {
      const people = await FacultyStaff.find({ isActive: { $ne: false } })
        .populate({ path: 'office', select: 'name department building', populate: { path: 'building', select: 'name' } })
        .sort({ name: 1 })
        .limit(500)
        .lean();

      const entries = getPersonnelEntries(englishQuery, people, 3);
      if (entries.length === 0) {
        return res.json({
          intent: 'personnel',
          location: null,
          reply: buildNotFoundReply(r),
          navigation: false,
          steps: [],
        });
      }

      if (isLowConfidence(entries, 35)) {
        return res.json({
          intent: 'personnel',
          location: null,
          reply: buildClarificationReply(r),
          navigation: false,
          steps: [],
        });
      }

      const bestPerson = entries[0].person;
      const personLocation = getPersonnelLocation(bestPerson);
      const personTitle = String(bestPerson?.title || '').trim();
      const personContact = String(bestPerson?.contactInfo || '').trim();
      const normalizedQuery = normalizeText(englishQuery);

      const explicitLocationAsk = /\b(where|location|locate|located|find|saan|nasaan|asa|diin|lokasyon)\b/.test(normalizedQuery);
      const explicitContactAsk = /\b(contact|phone|email|number|kontak|ugnayan|tawag)\b/.test(normalizedQuery);
      const explicitTitleAsk = /\b(title|position|role|katungdanan)\b/.test(normalizedQuery);
      const explicitGeneralAsk = /\b(tell me about|about|who is|profile|information|details|detalye)\b/.test(normalizedQuery);

      const explicitPieceAsk = explicitLocationAsk || explicitContactAsk || explicitTitleAsk;
      const isGeneralPersonnelAsk = explicitGeneralAsk || !explicitPieceAsk;

      let replyLines = [];
      if (isGeneralPersonnelAsk) {
        replyLines = [
          `Name: ${formatValue(bestPerson?.name)}`,
          `Title: ${formatValue(personTitle)}`,
          `Location: ${formatValue(personLocation)}`,
          `Contact: ${formatValue(personContact)}`,
        ];
      } else {
        if (explicitTitleAsk) replyLines.push(`Title: ${formatValue(personTitle)}`);
        if (explicitLocationAsk) replyLines.push(`Location: ${formatValue(personLocation)}`);
        if (explicitContactAsk) replyLines.push(`Contact: ${formatValue(personContact)}`);
      }

      const reply = replyLines.join('\n');
      const locationToReturn = explicitLocationAsk ? personLocation : '';

      return res.json({
        intent: 'personnel',
        location: locationToReturn || null,
        reply,
        navigation: Boolean(locationToReturn),
        steps: [],
      });
    }

    if (intent === 'building') {
      const buildings = await Building.find({ isActive: { $ne: false } })
        .select('name description department numberOfFloors geometry')
        .sort({ name: 1 })
        .limit(500)
        .lean();

      const entries = getBuildingEntries(englishQuery, buildings, 3);
      if (entries.length === 0) {
        return res.json({
          intent: 'building',
          location: null,
          reply: buildNotFoundReply(r),
          navigation: false,
          steps: [],
        });
      }

      if (isLowConfidence(entries, 12)) {
        return res.json({
          intent: 'building',
          location: null,
          reply: buildClarificationReply(r),
          navigation: false,
          steps: [],
        });
      }

      const building = entries[0].building;
      const locationText = getBuildingLocation(building);

      let reply = '';
      if (isOnlyLocationRequest(requestedInfo)) {
        reply = `Location: ${formatValue(locationText)}`;
      } else if (isOnlyDetailsRequest(requestedInfo)) {
        reply = `Details: ${formatValue(building?.description)}`;
      } else {
        reply = [
          `Building: ${formatValue(building?.name)}`,
          `Details: ${formatValue(building?.description)}`,
          `Location: ${formatValue(locationText)}`,
        ].join('\n');
      }

      const locationToReturn = requestedInfo.wantsLocation ? locationText : '';

      return res.json({
        intent: 'building',
        location: locationToReturn || null,
        reply,
        navigation: Boolean(locationToReturn),
        steps: [],
      });
    }

    if (intent === 'department') {
      const departments = await Department.find({ active: { $ne: false } })
        .populate({ path: 'building', select: 'name' })
        .sort({ name: 1 })
        .limit(500)
        .lean();

      const entries = getDepartmentEntries(englishQuery, departments, 3);
      if (entries.length === 0) {
        return res.json({
          intent: 'department',
          location: null,
          reply: buildNotFoundReply(r),
          navigation: false,
          steps: [],
        });
      }

      const departmentAnchor = hasEntityTokenAnchor(englishQuery, entries[0]?.department?.name || '');
      if (isLowConfidence(entries, 10) && !departmentAnchor) {
        return res.json({
          intent: 'department',
          location: null,
          reply: buildClarificationReply(r),
          navigation: false,
          steps: [],
        });
      }

      const department = entries[0].department;
      const locationText = getDepartmentLocation(department);

      const deptName = String(department?.name || '').trim();
      const headRecord = deptName
        ? await FacultyStaff.findOne({
          isActive: { $ne: false },
          department: { $regex: new RegExp(`^${escapeRegExp(deptName)}$`, 'i') },
          title: { $regex: /(head|chair|dean)/i },
        }).select('name title').lean()
        : null;

      const detailsParts = [];
      if (String(department?.description || '').trim()) detailsParts.push(String(department.description).trim());
      if (headRecord?.name) {
        const headTitle = String(headRecord?.title || '').trim();
        detailsParts.push(`Head: ${headRecord.name}${headTitle ? ` (${headTitle})` : ''}`);
      }
      const detailsText = detailsParts.join(' ').trim();

      let reply = '';
      if (isOnlyLocationRequest(requestedInfo)) {
        reply = `Location: ${formatValue(locationText)}`;
      } else if (isOnlyDetailsRequest(requestedInfo)) {
        reply = `Details: ${formatValue(detailsText)}`;
      } else {
        reply = [
          `Department: ${formatValue(department?.name)}`,
          `Details: ${formatValue(detailsText)}`,
          `Location: ${formatValue(locationText)}`,
        ].join('\n');
      }

      const locationToReturn = requestedInfo.wantsLocation ? locationText : '';

      return res.json({
        intent: 'department',
        location: locationToReturn || null,
        reply,
        navigation: Boolean(locationToReturn),
        steps: [],
      });
    }

    if (intent === 'office') {
      const offices = await Office.find({ isActive: { $ne: false } })
        .populate({ path: 'building', select: 'name' })
        .populate({ path: 'room', select: 'name' })
        .sort({ name: 1 })
        .limit(500)
        .lean();

      const entries = getLocationEntries(englishQuery, offices, 3);
      if (entries.length === 0) {
        return res.json({
          intent: 'office',
          location: null,
          reply: buildNotFoundReply(r),
          navigation: false,
          steps: [],
        });
      }

      if (isLowConfidence(entries, 12)) {
        return res.json({
          intent: 'office',
          location: null,
          reply: buildClarificationReply(r),
          navigation: false,
          steps: [],
        });
      }

      const office = entries[0].item;
      const locationText = getOfficeLocation(office);
      const detailsText = [String(office?.description || '').trim(), String(office?.contactInfo || '').trim()]
        .filter(Boolean)
        .join(' | ');

      let reply = '';
      if (isOnlyLocationRequest(requestedInfo)) {
        reply = `Location: ${formatValue(locationText)}`;
      } else if (isOnlyDetailsRequest(requestedInfo)) {
        reply = `Details: ${formatValue(detailsText)}`;
      } else {
        reply = [
          `Office: ${formatValue(office?.name)}`,
          `Details: ${formatValue(detailsText)}`,
          `Location: ${formatValue(locationText)}`,
        ].join('\n');
      }

      const locationToReturn = requestedInfo.wantsLocation ? locationText : '';

      return res.json({
        intent: 'office',
        location: locationToReturn || null,
        reply,
        navigation: Boolean(locationToReturn),
        steps: [],
      });
    }

    if (intent === 'room') {
      const rooms = await Room.find({ isActive: { $ne: false } })
        .populate({ path: 'building', select: 'name' })
        .sort({ name: 1 })
        .limit(500)
        .lean();

      const entries = getLocationEntries(englishQuery, rooms, 3);
      if (entries.length === 0) {
        return res.json({
          intent: 'room',
          location: null,
          reply: buildNotFoundReply(r),
          navigation: false,
          steps: [],
        });
      }

      if (isLowConfidence(entries, 12)) {
        return res.json({
          intent: 'room',
          location: null,
          reply: buildClarificationReply(r),
          navigation: false,
          steps: [],
        });
      }

      const room = entries[0].item;
      const locatedInText = getRoomBuilding(room);

      let reply = '';
      if (isOnlyLocationRequest(requestedInfo)) {
        reply = `Located in: ${formatValue(locatedInText)}`;
      } else if (isOnlyDetailsRequest(requestedInfo)) {
        reply = `Details: ${formatValue(room?.description)}`;
      } else {
        reply = [
          `Room: ${formatValue(room?.name)}`,
          `Details: ${formatValue(room?.description)}`,
          `Located in: ${formatValue(locatedInText)}`,
        ].join('\n');
      }

      const locationToReturn = requestedInfo.wantsLocation ? locatedInText : '';

      return res.json({
        intent: 'room',
        location: locationToReturn || null,
        reply,
        navigation: Boolean(locationToReturn),
        steps: [],
      });
    }

    if (intent !== 'service') {
      return res.json({
        intent: 'unknown',
        location: null,
        reply: buildClarificationReply(r),
        navigation: false,
        steps: [],
      });
    }

    const services = await getCachedServices();

    let topMatches = getTopServiceMatches(englishQuery, services, 3);
    const aliasMatchedService = resolveServiceAliasMatch(englishQuery, services);
    if (aliasMatchedService) {
      const aliasId = String(aliasMatchedService?._id || '');
      const deduped = topMatches.filter((entry) => String(entry?.service?._id || '') !== aliasId);
      const aliasBoosted = {
        service: aliasMatchedService,
        score: Number(topMatches[0]?.score || 0) + 260,
        overlapCount: 3,
      };
      topMatches = [aliasBoosted, ...deduped].slice(0, 3);
    }

    if (topMatches.length === 0) {
      return res.json({
        intent: 'service',
        location: null,
        reply: buildNotFoundReply(r),
        navigation: false,
        steps: [],
      });
    }

    const topServiceName = String(topMatches[0]?.service?.name || '');
    const hasAcronymDirectHit = hasShortTokenDirectMatch(englishQuery, topServiceName)
      && Number(topMatches[0]?.overlapCount || 0) > 0;

    let bestMatch = topMatches[0];
    if (!hasAcronymDirectHit && shouldRunDeepServiceReview(englishQuery, topMatches)) {
      const reviewed = await selectServiceMatchWithDeepReview(englishQuery, topMatches);
      if (reviewed) bestMatch = reviewed;
    }

    const service = bestMatch.service;
    const rawName = String(service?.name || '').trim();
    const rawDescription = String(service?.description || '').trim();
    const rawRequirements = Array.isArray(service?.requirements) && service.requirements.length > 0
      ? service.requirements
      : extractRequirementsFromText(rawDescription);
    const rawSteps = Array.isArray(service?.steps) && service.steps.length > 0
      ? service.steps
      : extractStepsFromText(rawDescription);
    const cleanedRequirements = rawRequirements.map((item) => String(item || '').trim()).filter(Boolean);
    const cleanedSteps = rawSteps.map(normalizeStepText).filter(Boolean).map(ensureSentence);

    const includeServiceRequirements = requestedInfo.wantsRequirements;
    const includeServiceSteps = requestedInfo.wantsSteps;
    const includeServiceDetails = requestedInfo.wantsDetails || (!includeServiceRequirements && !includeServiceSteps);

    const serviceReplyLines = [`Service: ${formatValue(rawName)}`];
    if (includeServiceDetails) serviceReplyLines.push(`Details: ${formatValue(rawDescription)}`);
    if (includeServiceRequirements) serviceReplyLines.push(`Requirements: ${formatListInline(cleanedRequirements)}`);
    if (includeServiceSteps) serviceReplyLines.push(`Process: ${formatListInline(cleanedSteps)}`);

    const serviceReply = serviceReplyLines.join('\n');

    return res.json({
      intent: 'service',
      location: null,
      reply: serviceReply,
      navigation: false,
      steps: includeServiceSteps ? cleanedSteps : [],
    });
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      error: error.message || 'Error processing chat request',
    });
  }
});

module.exports = router;
