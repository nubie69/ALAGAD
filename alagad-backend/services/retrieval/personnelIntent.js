const FacultyStaff = require('../../models/FacultyStaff');
const { understand, detectRequest } = require('./intentRequest');
const { payload, answerFromRecord, UNKNOWN } = require('./campusBehavior');

const STOP = new Set(('who what where is are the a an of to in at as for does do hold holds position role title personnel person assigned works work find can i me my please ang mga sa ng ni si ko ako akong nako nga na bilang yung this that them it department-name and ug og contact information phone email number how reach about tell dr mr mrs ms sir maam hours schedule available availability time dapit located').split(' '));
const words = value => understand(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const subjectWords = value => words(value).filter(word => !STOP.has(word));
const sameWord = (a, b) => a === b || (a.length > 4 && b === `${a}s`) || (b.length > 4 && a === `${b}s`);
const contains = (needles, text) => {
  const tokens = words(text);
  return needles.length > 0 && needles.every(needle => tokens.some(token => sameWord(needle, token)));
};
const nameTerms = message => subjectWords(message).filter(term =>
  !['office', 'department', 'university', 'campus', 'buksu', 'professor', 'faculty', 'instructor', 'teacher'].includes(term));
const matchesName = (terms, name) => {
  const tokens = words(name);
  return terms.length > 0 && terms.every(term => tokens.includes(term));
};
function isNamedPersonnelQuery(message, people = []) {
  const terms = nameTerms(message);
  return /\b(?:personnel|person|professor|faculty|instructor|teacher|dr|mr|mrs|ms|sir|maam|si)\b/i.test(message)
    || people.some(person => matchesName(terms, person.name || person.canonical_name));
}

function personnelContext(person) {
  const office = person.office && person.office.isActive !== false ? person.office : null;
  const department = person.departmentId && person.departmentId.active !== false ? person.departmentId : null;
  const departmentName = department?.name || person.department || '';
  const unit = office?.name || departmentName;
  const building = office?.building?.name || department?.building?.name;
  return { id: String(person._id), type: 'Personnel', canonical_name: person.name,
    location: [unit, building].filter(Boolean).join(', '), assigned_building: building,
    department_name: departmentName, verification_status: 'verified',
    structured: { name: person.name, role: person.title, office_id: office?._id ? String(office._id) : null,
      office_name: office?.name, department_id: department?._id ? String(department._id) : null,
      department: departmentName, building_name: building, contact: person.contactInfo } };
}

function resolvePersonnel(message, request, people, language) {
  const terms = subjectWords(message).filter(term => !['personnel_position', 'personnel_location'].includes(request.intent)
    || !['office', 'department', 'university', 'campus', 'buksu'].includes(term));
  if (!terms.length) return payload('clarification', language === 'tagalog' ? 'Aling tao, posisyon, o opisina ang tinutukoy mo?'
    : language === 'cebuano' ? 'Unsang tawo, posisyon, o opisina ang imong gipasabot?' : 'Which person, position, or office do you mean?');
  const active = people.filter(person => person.isActive !== false);
  let matches;
  if (request.intent === 'position_personnel') {
    const roleTerms = subjectWords(understand(message).split(/\b(?:of|sa|ng|in)\b/)[0]);
    // "Who is Juan Dela Cruz?" asks about that person, not a title holder.
    matches = active.filter(person => matchesName(nameTerms(message), person.name));
    if (!matches.length && !/\b(?:dr|mr|mrs|ms|sir|maam)\b/i.test(message)) matches = active.filter(person => {
      // A matching office alone cannot establish that an employee holds the requested title.
      const titleTerms = subjectWords(person.title).filter(term => term !== 'university');
      const requestedTitle = roleTerms.filter(term => term !== 'university');
      return titleTerms.length === requestedTitle.length && contains(requestedTitle, titleTerms.join(' '))
        && contains(terms, [person.title, person.office?.name, person.departmentId?.name, person.department].filter(Boolean).join(' '));
    });
  } else if (request.intent === 'office_personnel') {
    matches = active.filter(person => contains(terms, person.office?.isActive === false ? '' : person.office?.name)
      || contains(terms, person.departmentId?.active === false ? '' : person.departmentId?.name || person.department));
    const units = new Map();
    for (const person of matches) {
      const useOffice = contains(terms, person.office?.name);
      const unit = useOffice ? person.office : person.departmentId;
      const unitName = unit?.name || person.department;
      const key = `${useOffice ? 'office' : 'department'}:${unit?._id || unitName}`;
      if (!units.has(key)) units.set(key, { id: String(unit?._id || ''), type: useOffice ? 'Office' : 'Department', canonical_name: unitName, structured: { personnel_names: [] } });
      units.get(key).structured.personnel_names.push(person.name);
    }
    if (units.size === 1) return answerFromRecord(message, [...units.values()][0], [], language);
    if (units.size > 1) return payload('clarification', `${language === 'tagalog' ? 'Aling opisina o department ang tinutukoy mo' : language === 'cebuano' ? 'Unsang opisina o department ang imong gipasabot' : 'Which office or department do you mean'}: ${[...units.values()].map(unit => unit.canonical_name).join('; ')}?`);
  } else {
    matches = active.filter(person => matchesName(nameTerms(message), person.name));
  }
  if (!matches?.length) return payload('unknown', UNKNOWN, { requested_information: request.requested_information, responseType: 'NO_MATCH' });
  if (matches.length > 1) return payload('clarification', `${language === 'tagalog' ? 'Alin ang tinutukoy mo' : language === 'cebuano' ? 'Asa niini ang imong gipasabot' : 'Which one do you mean'}: ${matches.slice(0, 5).map(person => `${person.name} (${person.title}, ${person.office?.name || person.departmentId?.name || person.department || ''})`).join('; ')}?`);
  return answerFromRecord(message, personnelContext(matches[0]), [], language);
}

async function fetchPersonnelIntent(message, request, language, { onlyIfNamed = false } = {}) {
  const people = await FacultyStaff.find({ isActive: { $ne: false } })
    .populate({ path: 'office', select: 'name building isActive', populate: { path: 'building', select: 'name' } })
    .populate({ path: 'departmentId', select: 'name building active', populate: { path: 'building', select: 'name' } })
    .lean();
  if (onlyIfNamed) {
    if (!isNamedPersonnelQuery(message, people)) return null;
    // Determine requested fields with the subject now confirmed as personnel.
    request = detectRequest(message, { type: 'Personnel' });
  }
  return resolvePersonnel(message, request, people, language);
}

module.exports = { fetchPersonnelIntent, resolvePersonnel, personnelContext, subjectWords, isNamedPersonnelQuery };
