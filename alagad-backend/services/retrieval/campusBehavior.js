const UNKNOWN = "I couldn't find the information you're looking for. Please visit your department and ask them about your concern.";
const SCHEDULE_UNKNOWN = "I don't have verified schedule information for that office. Please check with the office directly for the latest schedule.";
const OUT_OF_SCOPE = "I'm designed mainly to help with BukSU campus navigation and information. You can ask me about campus buildings, offices, rooms, facilities, services, or directions.";

const normalize = (text) => String(text || '').toLowerCase()
  .replace(/\b(registrr|registar)\b/g, 'registrar').replace(/\b(wer|wheres)\b/g, 'where')
  .replace(/[?!.,]/g, '').replace(/\s+/g, ' ').trim();
const NAV = /\b(?:navigate|directions|take me|lead me|show me the way|how can i reach|how (?:do i |can i )?(?:get|go)\b.*(?:to|there)|how go|want to go|magpa-guide|pag-adto|pag adto)\b/;
const SCHEDULE = /\b(?:what time|office hours|opening hours|open(?:s)?|clos(?:e|es|ing)|schedule|when can i visit)\b/;
const SERVICE = /\b(?:service|transcript|tor|where (?:can i|do i|to) (?:get|request|pay|enroll|apply)|i need|need (?:tor|transcript)|who (?:handles|manages)|who should i|which office|school fees|tuition|counseling)\b/;
const REF = /\b(?:it|there|they|them|doon|didto|that (?:place|office|building|service)|this (?:place|office|building|service))\b/;

const { detectRequest, understand } = require('./intentRequest');
const classify = detectRequest;

function payload(intent, reply, extra = {}) {
  return { intent, entity_type: null, entity: null, service: null, entityName: null,
    location: null, navigation: false, requires_navigation: false,
    needs_clarification: intent === 'clarification', steps: [], reply, ...extra };
}

function earlyReply(message, context = {}, language = 'english') {
  const local = (english, tagalog, cebuano) => ({ english, tagalog, cebuano }[language] || english);
  const text = normalize(message);
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening)(?: alagad)?$/.test(text)) {
    return payload('greeting', local("Hello! I'm ALAGAD, your BukSU campus navigation and information assistant. How can I help you?",
      'Kumusta! Ako si ALAGAD, ang iyong gabay sa campus at impormasyon ng BukSU. Paano kita matutulungan?',
      'Kumusta! Ako si ALAGAD, imong giya sa campus ug impormasyon sa BukSU. Unsa akong matabang nimo?'));
  }
  if (/^(?:thank you|thanks|salamat|okay thanks|got it)(?: alagad)?$/.test(text)) {
    return payload('thanks', local("You're welcome! Let me know if you need help finding another place on campus.",
      'Walang anuman! Sabihin mo kung kailangan mo ng tulong sa paghahanap ng ibang lugar sa campus.',
      'Walay sapayan! Ingna ko kung kinahanglan nimo og tabang sa pagpangita og laing lugar sa campus.'));
  }
  const referenceText = understand(String(message).replace(/\bIT\b/g, 'department-name'));
  if (!context.lastEntity && (REF.test(referenceText) || /^(?:where is the office|where is the building|navigate me|take me|office|building|room)$/.test(text))) {
    return payload('clarification', local('Which campus place or service do you mean?', 'Aling lugar o serbisyo sa campus ang tinutukoy mo?', 'Unsang lugar o serbisyo sa campus ang imong gipasabot?'));
  }
  if (/\b(?:lebron|nba|capital of|write my assignment|tell me a joke|weather in)\b/.test(text)) {
    return payload('out_of_scope', local(OUT_OF_SCOPE, 'Tumutulong ako sa paghahanap ng mga lugar at impormasyon sa BukSU. Maaari kang magtanong tungkol sa mga gusali, opisina, silid, serbisyo, o direksyon sa campus.', 'Motabang ko sa pagpangita og mga lugar ug impormasyon sa BukSU. Mahimo kang mangutana bahin sa mga building, opisina, kwarto, serbisyo, o direksyon sa campus.'));
  }
  return null;
}

function ambiguousLocations(query, records) {
  const text = ` ${normalize(query)} `;
  const matches = records.filter(record => ['office', 'room', 'building', 'department'].includes(String(record.type).toLowerCase()))
    .filter(record => {
      const names = [record.canonical_name, ...(Array.isArray(record.aliases) ? record.aliases : String(record.aliases || '').split(';'))];
      return names.some(name => normalize(name) && text.includes(` ${normalize(name)} `));
    });
  const specific = matches.filter(record => record.assigned_building && text.includes(` ${normalize(record.assigned_building)} `));
  const narrowed = specific.length ? specific : matches;
  const unique = [...new Map(narrowed.map(record => [`${record.type}:${record.id || record.record_id}`, record])).values()];
  return unique.length > 1 ? unique : [];
}

const UNKNOWN_TRANSLATIONS = {
  english: UNKNOWN,
  tagalog: "Hindi ko mahanap ang impormasyong kailangan mo. Mangyaring pumunta sa iyong department at magtanong tungkol sa iyong concern.",
  cebuano: "Wala nako makita ang impormasyon nga imong gipangita. Palihog adto sa imong department ug pangutana bahin sa imong concern.",
};
const languageKey = language => ({ en: 'english', tl: 'tagalog', ceb: 'cebuano' }[language] || language || 'english');
const unknownReply = language => UNKNOWN_TRANSLATIONS[languageKey(language)] || UNKNOWN;
const labels = {
  english: { process: 'Process for', requirements: 'Requirements for', location: 'Location', assigned: 'is officially assigned to', position: 'is listed as', personnel: 'Personnel assigned as', officePersonnel: 'Personnel assigned to', navigation: 'Select Navigate to let the campus map calculate a route to' },
  tagalog: { process: 'Proseso para sa', requirements: 'Mga kailangan para sa', location: 'Lokasyon', assigned: 'ay opisyal na naka-assign sa', position: 'ay nakalista bilang', personnel: 'Ang naka-assign bilang', officePersonnel: 'Mga naka-assign sa', navigation: 'Piliin ang Navigate para kalkulahin ng campus map ang ruta papunta sa' },
  cebuano: { process: 'Proseso para sa', requirements: 'Mga kinahanglan para sa', location: 'Lokasyon', assigned: 'opisyal nga naka-assign sa', position: 'nakalista isip', personnel: 'Ang naka-assign isip', officePersonnel: 'Mga naka-assign sa', navigation: 'Pilia ang Navigate aron makalkula sa campus map ang ruta padulong sa' },
};

// Select fields before formatting. Never give a generator the rest of the record.
function answerFromRecord(message, item, relatedRecords = [], language = 'english') {
  if (!item) return null;
  const type = String(item.type || '').toLowerCase();
  if (['faq', 'resource'].includes(type)) return null;
  if (/\b(?:deadline|processing time|how long|download)\b/i.test(message)) return null;
  const request = classify(message, item);
  const s = item.structured || {};
  const name = s.name || item.canonical_name;
  const lang = languageKey(language);
  const t = labels[lang] || labels.english;
  const office = s.office_name || s.department || item.department_name;
  const location = item.location || item.assigned_building || s.building_name;
  const role = s.role || item.role_title;
  const target = type === 'service' || type === 'personnel'
    ? (s.office_id ? { id: s.office_id, type: 'office', name: s.office_name }
      : s.department_id ? (s.building_name ? { type: 'building', name: s.building_name } : null)
        : office ? { name: office, type: 'office' } : null)
    : { id: item.id, type, name };
  const lines = [];
  const missing = [];
  const add = (intent, value) => {
    if (value) lines.push(value);
    else { lines.push(unknownReply(lang)); missing.push(intent); }
  };
  for (const intent of request.intents) {
    switch (intent) {
      case 'service_process':
        add(intent, type === 'service' && s.process_steps?.length
          ? `${t.process} ${name}:\n${s.process_steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}` : null);
        break;
      case 'service_requirements':
        add(intent, type === 'service' && s.requirements?.length
          ? `${t.requirements} ${name}:\n${s.requirements.map(value => `\u2022 ${value}`).join('\n')}` : null);
        break;
      case 'service_description':
      case 'general_information': {
        let description = s.details || item.description;
        if (/\boffices\b.*\b(?:inside|building)\b/i.test(message) && type === 'building') {
          description = relatedRecords.filter(record => String(record.type).toLowerCase() === 'office'
            && normalize(record.assigned_building) === normalize(name)).map(record => record.canonical_name).join('; ');
        } else if (/\b(?:services|offer|what can i do)\b/i.test(message) && type !== 'service') {
          description = relatedRecords.filter(record => String(record.type).toLowerCase() === 'service'
            && [record.source_office, record.department_name, String(record.location || '').split(',')[0]].some(value => normalize(value) === normalize(name)))
            .map(record => record.canonical_name).join('; ');
        }
        add(intent, description);
        break;
      }
      case 'service_location':
        add(intent, type === 'service' && office ? `${name}: ${office}.${location ? ` ${t.location}: ${location}.` : ''}` : null);
        break;
      case 'personnel_location':
        add(intent, type === 'personnel' && office ? `${name} ${t.assigned} ${office}.${location ? ` ${t.location}: ${location}.` : ''}` : null);
        break;
      case 'personnel_position':
        add(intent, type === 'personnel' && role ? `${name} ${t.position} ${role}.` : null);
        break;
      case 'position_personnel':
        add(intent, type === 'personnel' && role ? `${t.personnel} ${role}: ${name}.` : null);
        break;
      case 'office_personnel': {
        const people = Array.isArray(s.personnel_names) ? s.personnel_names : [];
        add(intent, people.length ? `${t.officePersonnel} ${name}: ${people.join('; ')}.` : null);
        break;
      }
      case 'find_location':
        add(intent, location ? (lang === 'tagalog' ? `Ang ${name} ay matatagpuan sa ${location}.`
          : lang === 'cebuano' ? `Ang ${name} nahimutang sa ${location}.`
            : `${name} is located at ${location}.`) : null);
        break;
      case 'navigation':
        add(intent, target ? `${t.navigation} ${target.name}.` : null);
        break;
      case 'schedule':
        add(intent, typeof (s.hours || s.office_hours) === 'string' ? `${name}: ${s.hours || s.office_hours}` : null);
        break;
      case 'contact_information':
        add(intent, s.contact ? `${name}: ${s.contact}` : null);
        break;
      default: add(intent, null);
    }
  }
  const canNavigate = Boolean(target && request.intents.some(intent => ['navigation', 'find_location', 'service_location', 'personnel_location'].includes(intent))
    && !missing.some(intent => ['navigation', 'find_location', 'service_location', 'personnel_location'].includes(intent)));
  return payload(request.intent, [...new Set(lines)].join('\n\n') || unknownReply(lang), {
    entity_type: request.intent === 'position_personnel' ? 'position' : type,
    entity: request.intent === 'position_personnel' ? role : name, entityName: name,
    service: type === 'service' ? name : null,
    location: canNavigate ? location || null : null,
    navigation: canNavigate, requires_navigation: request.navigation && canNavigate,
    navigationTarget: canNavigate ? target : null,
    steps: request.intents.includes('service_process') && Array.isArray(s.process_steps) ? s.process_steps : [],
    intents: request.intents, requested_information: request.requested_information,
    responseLanguage: lang, language: { english: 'en', tagalog: 'tl', cebuano: 'ceb' }[lang] || 'en',
    responseType: missing.length ? (missing.length === request.intents.length ? 'NO_MATCH' : 'PARTIAL_INFORMATION') : 'VERIFIED_ANSWER',
    verificationStatus: missing.length ? 'incomplete' : 'verified', missing_information: missing,
  });
}

module.exports = { classify, earlyReply, answerFromRecord, ambiguousLocations, payload, normalize, understand,
  REF, UNKNOWN, SCHEDULE_UNKNOWN, OUT_OF_SCOPE, unknownReply, UNKNOWN_TRANSLATIONS };
