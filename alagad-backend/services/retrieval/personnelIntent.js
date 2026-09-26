const FacultyStaff = require('../../models/FacultyStaff');
const { understand } = require('./intentRequest');
const { payload, answerFromRecord, unknownReply } = require('./campusBehavior');

const STOP = new Set(('who what where is are the a an of to in at as for does do hold holds position role title personnel person assigned works work find can i me my please ang mga sa ng ni si ko ako akong nako nga na bilang yung this that them it department-name').split(' '));
const words = value => understand(value).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const subjectWords = value => words(value).filter(word => !STOP.has(word));
const sameWord = (a, b) => a === b || (a.length > 4 && b === `${a}s`) || (b.length > 4 && a === `${b}s`);
const contains = (needles, text) => {
  const tokens = words(text);
  return needles.length > 0 && needles.every(needle => tokens.some(token => sameWord(needle, token)));
};

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
    matches = active.filter(person => {
      // A matching office alone cannot establish that an employee holds the requested title.
      return contains(roleTerms, person.title)
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
    matches = active.filter(person => contains(terms, person.name));
  }
  if (!matches?.length) return payload('unknown', unknownReply(language), { requested_information: request.requested_information, responseType: 'NO_MATCH' });
  if (matches.length > 1) return payload('clarification', `${language === 'tagalog' ? 'Alin ang tinutukoy mo' : language === 'cebuano' ? 'Asa niini ang imong gipasabot' : 'Which one do you mean'}: ${matches.slice(0, 5).map(person => `${person.name} (${person.title}, ${person.office?.name || person.departmentId?.name || person.department || ''})`).join('; ')}?`);
  return answerFromRecord(message, personnelContext(matches[0]), [], language);
}

async function fetchPersonnelIntent(message, request, language) {
  const people = await FacultyStaff.find({ isActive: { $ne: false } })
    .populate({ path: 'office', select: 'name building isActive', populate: { path: 'building', select: 'name' } })
    .populate({ path: 'departmentId', select: 'name building active', populate: { path: 'building', select: 'name' } })
    .lean();
  return resolvePersonnel(message, request, people, language);
}

module.exports = { fetchPersonnelIntent, resolvePersonnel, personnelContext, subjectWords };
