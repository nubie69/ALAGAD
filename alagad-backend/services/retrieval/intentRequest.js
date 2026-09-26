// Normalize question wording only. Official entity names and facts come from records.
function understand(value) {
  let text = String(value || '').toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').replace(/\b(registrr|registar)\b/g, 'registrar');
  const rules = [
    [/\b(?:para saan|para asa)\b/g, 'purpose'],
    [/\b(?:paano (?:ako )?(?:pumunta|makapunta)|unsaon (?:nako |ko )?pag[- ]adto|how ko makaadto|dalhin mo ako|dal[- ]a ko|magpa[- ]guide)\b/g, 'navigate'],
    [/\b(?:saan|saang|nasaan|asa|where|wer|wheres)\b/g, 'where'],
    [/\b(?:paano|unsaon|giunsa)\b/g, 'how'],
    [/\b(?:sino|kinsa)\b/g, 'who'],
    [/\b(?:ano|anong|unsa|unsang|unsay)\b/g, 'what'],
    [/\b(?:proseso|mag[- ]process)\b/g, 'process'],
    [/\b(?:hakbang|lakang)\b/g, 'steps'],
    [/\b(?:kailangan|kinahanglan)\b/g, 'requirements'],
    [/\b(?:naka[- ]assign|assigned)\b/g, 'assigned'],
    [/\b(?:naghahandle|nag[- ]handle)\b/g, 'handles'],
    [/\b(?:nagtatrabaho|nagtrabaho)\b/g, 'work'],
    [/\b(?:trabaho)\b/g, 'position'],
    [/\b(?:mahahanap|makikita|makita)\b/g, 'find'],
    [/\b(?:kumuha|kukuha|makakuha|pagkuha|makuha)\b/g, 'get'],
    [/\b(?:magbayad|magbabayad)\b/g, 'pay'],
    [/\b(?:opisina|tanggapan)\b/g, 'office'],
    [/\b(?:departamento|kagawaran)\b/g, 'department'],
    [/\b(?:serbisyo)\b/g, 'service'],
    [/\b(?:ito|ani|kani|kini)\b/g, 'this'],
    [/\b(?:doon|diyan|didto|diha)\b/g, 'there'],
    [/\b(?:sila|nila|niya|siya)\b/g, 'them'],
  ];
  for (const [pattern, replacement] of rules) text = text.replace(pattern, replacement);
  return text.replace(/[?!.,]/g, '').replace(/\s+/g, ' ').trim();
}

const FIELDS = {
  service_process: ['process'], service_requirements: ['requirements'], service_description: ['description'],
  service_location: ['office', 'location'], find_location: ['location'], navigation: ['destination'],
  personnel_location: ['assigned_office', 'location'], position_personnel: ['personnel_name'],
  personnel_position: ['position'], office_personnel: ['personnel_name'], schedule: ['schedule'],
  contact_information: ['contact_information'], general_information: ['description'],
};

function detectRequest(message, item) {
  const text = understand(message);
  const type = String(item?.type || '').toLowerCase();
  const navigation = /\b(?:navigate|directions|take me|lead me|show me the way|how can i reach|how (?:do i |can i )?(?:get|go)\b.*(?:to|there)|how go|want to go)\b/.test(text);
  const service = type === 'service' || /\b(?:service|tor|transcript|enrollment|school records|tuition|fees|counseling)\b/.test(text)
    || (!navigation && /\b(?:pay|apply|enroll|request)\b/.test(text))
    || (!navigation && /\bwhere\b.*\bget\b/.test(text));
  const asksWhere = /\b(?:where|location|looking for|find|show me)\b/.test(text);
  const handles = /\b(?:handles?|responsible|which office|what office|what unit)\b/.test(text) && !/\bassigned\b/.test(text);
  const requirements = /\b(?:requirements?|documents?|what (?:do i )?need|what should i (?:bring|prepare))\b/.test(text);
  const process = !navigation && !asksWhere && !handles && /\b(?:how|process|steps?|procedure)\b/.test(text)
    && !/\bhow (?:long|to contact)\b/.test(text);
  const contact = /\b(?:contact|phone|email|hotline|contact information|kontak)\b/.test(text);
  const schedule = /\b(?:what time|hours|open(?:s)?|clos(?:e|es|ing)|schedule|when can i visit)\b/.test(text);
  const who = /\bwho\b/.test(text);
  const officePersonnel = who && /\b(?:works? in|assigned (?:to|in)|assigned (?:sa|ang sa)|assigned sa)\b/.test(text)
    && !/\b(?:assigned as|assigned (?:na|nga)|position)\b/.test(text);
  const personnelPosition = !who && (/\b(?:position|role|title)\b/.test(text)
    || (type === 'personnel' && /\bwhat does\b/.test(text)));
  const personnelLocation = /\boffice\b.*\bassigned\b/.test(text) || (asksWhere
    && (type === 'personnel' || /\bsi\b/.test(text) || /\bwhere\b.*\bwork\b/.test(text)));
  const serviceHelper = who && service && /\b(?:help|request|process)\b/.test(text);
  const intents = [];
  if (navigation) intents.push('navigation');
  else {
    if (requirements) intents.push('service_requirements');
    if (process) intents.push('service_process');
    if (contact) intents.push('contact_information');
    if (schedule) intents.push('schedule');
    if (officePersonnel) intents.push('office_personnel');
    else if (personnelPosition) intents.push('personnel_position');
    else if (who && !handles && !serviceHelper) intents.push('position_personnel');
    else if (personnelLocation) intents.push('personnel_location');
    else if (asksWhere || handles) intents.push(service || handles ? 'service_location' : 'find_location');
    if (!intents.length) {
      const description = /\b(?:what|purpose|describe|description|about|offer)\b/.test(text);
      intents.push(description ? (service ? 'service_description' : 'general_information') : service ? 'service_location' : 'find_location');
    }
  }
  return { intent: intents[0], intents, requested_information: [...new Set(intents.flatMap(intent => FIELDS[intent] || []))],
    navigation, schedule, requirements, service: service || handles, person: who || handles, process,
    information: intents.some(intent => ['service_description', 'general_information'].includes(intent)),
    location: intents.some(intent => ['find_location', 'service_location', 'personnel_location'].includes(intent)),
    followUp: /\b(?:it|there|they|them|this|that)\b/.test(text), text };
}

module.exports = { understand, detectRequest, FIELDS };
