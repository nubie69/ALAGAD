const Building = require('../../models/Building');
const Department = require('../../models/Department');
const Office = require('../../models/Office');
const Room = require('../../models/Room');
const FacultyStaff = require('../../models/FacultyStaff');
const Service = require('../../models/Service');
const { chunkContent } = require('./chunker');
const { translateToEnglishLexicon } = require('./languageService');

const TYPE_TO_COLLECTION = {
  Building: 'buildings',
  Department: 'departments',
  Office: 'offices',
  Room: 'rooms',
  Personnel: 'personnel',
  Service: 'services',
};

const PERSONNEL_NICKNAMES = Object.freeze({
  alexander: ['alex'],
  benjamin: ['ben'],
  christopher: ['chris'],
  daniel: ['dan'],
  elizabeth: ['liz', 'beth'],
  jane: ['janie'],
  john: ['jon', 'johnny'],
  joseph: ['joe', 'joey'],
  jonathan: ['jon'],
  maria: ['mary'],
  michael: ['mike'],
  nicholas: ['nick'],
  patricia: ['pat', 'trish'],
  robert: ['rob', 'bob'],
  william: ['will', 'bill'],
});

const TITLE_SYNONYMS = Object.freeze({
  professor: ['prof', 'instructor', 'teacher'],
  instructor: ['prof', 'teacher'],
  dean: ['college head', 'head'],
  chair: ['chairperson', 'department head', 'head'],
  director: ['head', 'lead'],
});

const HONORIFICS = new Set([
  'dr', 'dra', 'engr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'sir', 'maam',
]);

const CATEGORY_TAGS_BY_TYPE = Object.freeze({
  Building: ['location', 'description'],
  Department: ['location', 'description'],
  Office: ['location', 'description'],
  Room: ['location', 'description'],
  Personnel: ['personnel', 'location', 'description'],
  Service: ['service', 'process', 'requirements', 'location', 'description'],
});

const CATEGORY_BY_TYPE = Object.freeze({
  Building: 'building',
  Department: 'department',
  Office: 'department',
  Room: 'room',
  Personnel: 'personnel',
  Service: 'service',
});

const MULTILINGUAL_CATEGORY_KEYWORDS = Object.freeze({
  service: ['service', 'services', 'serbisyo'],
  process: ['process', 'procedure', 'steps', 'proseso', 'hakbang', 'lakang'],
  requirements: ['requirements', 'required', 'kailangan', 'kinahanglan'],
  personnel: ['personnel', 'person', 'faculty', 'staff', 'sino', 'kinsa'],
  location: ['location', 'where', 'saan', 'asa', 'nasaan'],
  description: ['description', 'details', 'about', 'ano', 'unsa'],
});

const toIso = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const clean = (value) => String(value || '').trim();
const englishIndexText = (value) => translateToEnglishLexicon(clean(value));
const uniqueList = (values) => Array.from(new Set((values || []).map((item) => clean(item)).filter(Boolean)));

const buildMultilingualAliasKeywords = ({ canonicalName, aliases = [], categoryTags = [], departmentName = '' }) => {
  const base = uniqueList([canonicalName, departmentName, ...aliases]);
  const expanded = new Set(base);

  for (const categoryTag of (categoryTags || [])) {
    const keywords = MULTILINGUAL_CATEGORY_KEYWORDS[String(categoryTag || '').toLowerCase()] || [];
    for (const keyword of keywords) {
      expanded.add(clean(keyword));
    }
  }

  return uniqueList(Array.from(expanded));
};

const tokenize = (value) => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const typoVariants = (word) => {
  const token = clean(word).toLowerCase();
  if (token.length < 4) return [];

  const variants = new Set();
  // One-character deletion typo
  variants.add(`${token.slice(0, 1)}${token.slice(2)}`);
  // Adjacent transposition typo
  if (token.length >= 4) {
    variants.add(`${token[0]}${token[2]}${token[1]}${token.slice(3)}`);
  }

  return Array.from(variants).filter((item) => item && item !== token);
};

const incompleteVariants = (word) => {
  const token = clean(word).toLowerCase();
  if (token.length < 4) return [];

  const variants = new Set();
  if (token.length >= 4) variants.add(token.slice(0, 3));
  if (token.length >= 5) variants.add(token.slice(0, 4));
  if (token.length >= 6) variants.add(token.slice(0, token.length - 1));

  return Array.from(variants).filter((item) => item && item !== token);
};

const withAliasVariants = (values) => {
  const aliases = new Set((values || []).map((item) => clean(item)).filter(Boolean));

  for (const alias of Array.from(aliases)) {
    const words = tokenize(alias);
    if (words.length === 0) continue;

    if (words.length >= 2) {
      const acronym = words.map((w) => w[0]).join('').toUpperCase();
      if (acronym.length >= 2) aliases.add(acronym);
    }

    for (let i = 0; i < words.length; i += 1) {
      const variants = typoVariants(words[i]);
      if (variants.length === 0) continue;
      const mutated = [...words];
      mutated[i] = variants[0];
      aliases.add(mutated.join(' '));
    }

    for (let i = 0; i < words.length; i += 1) {
      const variants = incompleteVariants(words[i]);
      if (variants.length === 0) continue;

      for (const variant of variants) {
        // token-level incomplete input
        aliases.add(variant);
        // phrase-level incomplete input (e.g., "jan doe")
        const mutated = [...words];
        mutated[i] = variant;
        aliases.add(mutated.join(' '));
      }
    }
  }

  return Array.from(aliases);
};

const buildPersonnelAliases = ({ name, title, department, officeName }) => {
  const fullName = clean(name);
  const role = clean(title);
  const dept = clean(department);
  const office = clean(officeName);

  const aliases = new Set([
    fullName,
    role,
    dept,
    office,
    `${fullName} ${role}`,
  ].filter(Boolean));

  const rawNameTokens = tokenize(fullName);
  const nameTokens = rawNameTokens.filter((token) => !HONORIFICS.has(token));

  if (nameTokens.length > 0) {
    aliases.add(nameTokens.join(' '));
    aliases.add(nameTokens[0]);
    aliases.add(nameTokens[nameTokens.length - 1]);

    if (nameTokens.length >= 2) {
      const first = nameTokens[0];
      const last = nameTokens[nameTokens.length - 1];
      aliases.add(`${first} ${last}`);

      const nicknameList = PERSONNEL_NICKNAMES[first] || [];
      for (const nickname of nicknameList) {
        aliases.add(nickname);
        aliases.add(`${nickname} ${last}`);
      }
    }
  }

  for (const token of tokenize(role)) {
    const synonymList = TITLE_SYNONYMS[token] || [];
    for (const synonym of synonymList) {
      aliases.add(synonym);
      if (nameTokens[0]) {
        aliases.add(`${nameTokens[0]} ${synonym}`);
      }
    }
  }

  return withAliasVariants(Array.from(aliases));
};

const asLocationFromCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return '';
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
};

const toAliasString = (values) => Array.from(new Set((values || [])
  .map((value) => clean(value))
  .filter(Boolean)))
  .join('; ');

const toCanonicalDocument = ({
  id,
  type,
  category,
  canonical_name,
  role_title,
  aliases,
  alias_keywords,
  category_tags,
  department_name,
  assigned_building,
  floor_location,
  number_of_floors,
  location,
  last_updated,
  last_indexed,
  deactivated,
  source,
  content,
  description,
  requirements,
  process,
  is_active,
}) => ({
  id: String(id),
  record_id: String(id),
  type,
  category: clean(category),
  canonical_name: englishIndexText(canonical_name),
  role_title: englishIndexText(role_title),
  aliases: toAliasString((Array.isArray(aliases) ? aliases : String(aliases || '').split(';')).map((value) => englishIndexText(value))),
  alias_keywords: toAliasString(Array.isArray(alias_keywords) ? alias_keywords : String(alias_keywords || '').split(';')),
  category_tags: toAliasString(Array.isArray(category_tags) ? category_tags : String(category_tags || '').split(';')),
  department_name: clean(department_name),
  assigned_building: clean(assigned_building),
  floor_location: clean(floor_location),
  number_of_floors: clean(number_of_floors),
  location: clean(location),
  description: englishIndexText(description),
  requirements: toAliasString((Array.isArray(requirements) ? requirements : String(requirements || '').split(';')).map((value) => englishIndexText(value))),
  process: toAliasString((Array.isArray(process) ? process : String(process || '').split(';')).map((value) => englishIndexText(value))),
  is_active: typeof is_active === 'boolean' ? is_active : !Boolean(deactivated),
  last_updated: toIso(last_updated),
  last_indexed: toIso(last_indexed),
  deactivated: Boolean(deactivated),
  source,
  content: englishIndexText(content),
});

const createChunkedDocuments = (canonicalDocument) => {
  const chunks = chunkContent(canonicalDocument.content, canonicalDocument.id, { minTokens: 400, maxTokens: 800 });
  if (chunks.length === 0) {
    return [{
      id: `${canonicalDocument.id}:0`,
      canonical_id: canonicalDocument.id,
      chunk_index: 0,
      metadata: canonicalDocument,
      content: canonicalDocument.content,
    }];
  }

  return chunks.map((chunk, chunkIndex) => ({
    id: `${canonicalDocument.id}:${chunkIndex}`,
    canonical_id: canonicalDocument.id,
    chunk_index: chunkIndex,
    metadata: {
      ...canonicalDocument,
      id: `${canonicalDocument.id}:${chunkIndex}`,
      canonical_id: canonicalDocument.id,
      chunk_index: chunkIndex,
    },
    content: chunk.content,
  }));
};

const isDeactivatedRecord = (type, item) => {
  if (type === 'Department') {
    return item?.active === false || item?.is_active === false;
  }
  return item?.isActive === false || item?.is_active === false;
};

const buildCanonicalDocumentsFromRecords = (recordsByType) => {
  const canonicalDocuments = [];

  for (const item of (recordsByType.buildings || [])) {
    const roleTitle = 'Building';
    const inactive = isDeactivatedRecord('Building', item);
    const categoryTags = CATEGORY_TAGS_BY_TYPE.Building;
    const aliases = withAliasVariants([item.name, item.department]);
    canonicalDocuments.push(toCanonicalDocument({
      id: item._id,
      type: 'Building',
      category: CATEGORY_BY_TYPE.Building,
      canonical_name: item.name,
      role_title: roleTitle,
      aliases,
      alias_keywords: buildMultilingualAliasKeywords({
        canonicalName: item.name,
        aliases,
        categoryTags,
        departmentName: item.department,
      }),
      category_tags: categoryTags,
      department_name: item.department,
      assigned_building: item.name,
      floor_location: '',
      number_of_floors: item.numberOfFloors,
      location: asLocationFromCoordinates(item?.geometry?.coordinates),
      description: clean(item.description),
      requirements: [],
      process: [],
      is_active: !inactive,
      last_updated: item.updatedAt,
      last_indexed: item.last_indexed,
      deactivated: inactive,
      source: 'buildings',
      content: [
        `Building: ${clean(item.name)}`,
        `Role/Title: ${roleTitle}`,
        `Description: ${clean(item.description)}`,
        `Department: ${clean(item.department)}`,
        `Floors: ${item.numberOfFloors || ''}`,
        `Coordinates: ${asLocationFromCoordinates(item?.geometry?.coordinates)}`,
      ].join('. '),
    }));
  }

  for (const item of (recordsByType.departments || [])) {
    const buildingName = clean(item?.building?.name);
    const roleTitle = clean(item.code) || 'Department';
    const inactive = isDeactivatedRecord('Department', item);
    const categoryTags = CATEGORY_TAGS_BY_TYPE.Department;
    const aliases = withAliasVariants([item.name, item.code, `${item.name} department`]);
    canonicalDocuments.push(toCanonicalDocument({
      id: item._id,
      type: 'Department',
      category: CATEGORY_BY_TYPE.Department,
      canonical_name: item.name,
      role_title: roleTitle,
      aliases,
      alias_keywords: buildMultilingualAliasKeywords({
        canonicalName: item.name,
        aliases,
        categoryTags,
        departmentName: item.name,
      }),
      category_tags: categoryTags,
      department_name: item.name,
      assigned_building: buildingName,
      floor_location: item.floor,
      number_of_floors: '',
      location: buildingName || clean(item.room),
      description: clean(item.description),
      requirements: [],
      process: [],
      is_active: !inactive,
      last_updated: item.updatedAt,
      last_indexed: item.last_indexed,
      deactivated: inactive,
      source: 'departments',
      content: [
        `Department: ${clean(item.name)}`,
        `Role/Title: ${roleTitle}`,
        `Code: ${clean(item.code)}`,
        `Description: ${clean(item.description)}`,
        `Building: ${buildingName}`,
        `Floor: ${item.floor || ''}`,
      ].join('. '),
    }));
  }

  for (const item of (recordsByType.offices || [])) {
    const buildingName = clean(item?.building?.name);
    const roomName = clean(item?.room?.name);
    const roleTitle = clean(item.department) || 'Office';
    const inactive = isDeactivatedRecord('Office', item);
    const categoryTags = CATEGORY_TAGS_BY_TYPE.Office;
    const aliases = withAliasVariants([item.name, item.department, `${item.name} office`, roomName]);
    canonicalDocuments.push(toCanonicalDocument({
      id: item._id,
      type: 'Office',
      category: CATEGORY_BY_TYPE.Office,
      canonical_name: item.name,
      role_title: roleTitle,
      aliases,
      alias_keywords: buildMultilingualAliasKeywords({
        canonicalName: item.name,
        aliases,
        categoryTags,
        departmentName: item.department,
      }),
      category_tags: categoryTags,
      department_name: item.department,
      assigned_building: buildingName,
      floor_location: item.floor,
      number_of_floors: '',
      location: [buildingName, roomName].filter(Boolean).join(', '),
      description: clean(item.description),
      requirements: [],
      process: [],
      is_active: !inactive,
      last_updated: item.updatedAt,
      last_indexed: item.last_indexed,
      deactivated: inactive,
      source: 'offices',
      content: [
        `Office: ${clean(item.name)}`,
        `Role/Title: ${roleTitle}`,
        `Department: ${clean(item.department)}`,
        `Description: ${clean(item.description)}`,
        `Contact: ${clean(item.contactInfo)}`,
        `Building: ${buildingName}`,
        `Room: ${roomName}`,
        `Floor: ${item.floor || ''}`,
      ].join('. '),
    }));
  }

  for (const item of (recordsByType.rooms || [])) {
    const buildingName = clean(item?.building?.name);
    const roleTitle = 'Room';
    const inactive = isDeactivatedRecord('Room', item);
    const categoryTags = CATEGORY_TAGS_BY_TYPE.Room;
    const aliases = withAliasVariants([item.name, `${item.name} room`, item.department]);
    canonicalDocuments.push(toCanonicalDocument({
      id: item._id,
      type: 'Room',
      category: CATEGORY_BY_TYPE.Room,
      canonical_name: item.name,
      role_title: roleTitle,
      aliases,
      alias_keywords: buildMultilingualAliasKeywords({
        canonicalName: item.name,
        aliases,
        categoryTags,
        departmentName: item.department,
      }),
      category_tags: categoryTags,
      department_name: item.department,
      assigned_building: buildingName,
      floor_location: item.floor,
      number_of_floors: '',
      location: buildingName,
      description: clean(item.description),
      requirements: [],
      process: [],
      is_active: !inactive,
      last_updated: item.updatedAt,
      last_indexed: item.last_indexed,
      deactivated: inactive,
      source: 'rooms',
      content: [
        `Room: ${clean(item.name)}`,
        `Role/Title: ${roleTitle}`,
        `Description: ${clean(item.description)}`,
        `Department: ${clean(item.department)}`,
        `Building: ${buildingName}`,
        `Floor: ${item.floor || ''}`,
      ].join('. '),
    }));
  }

  for (const item of (recordsByType.personnel || [])) {
    const officeName = clean(item?.office?.name);
    const buildingName = clean(item?.office?.building?.name);
    const officeFloor = clean(item?.office?.floor);
    const role = clean(item.title);
    const roleTitle = role || 'Personnel';
    const inactive = isDeactivatedRecord('Personnel', item);
    const categoryTags = CATEGORY_TAGS_BY_TYPE.Personnel;
    const aliases = buildPersonnelAliases({
      name: item.name,
      title: role,
      department: item.department,
      officeName,
    });
    canonicalDocuments.push(toCanonicalDocument({
      id: item._id,
      type: 'Personnel',
      category: CATEGORY_BY_TYPE.Personnel,
      canonical_name: item.name,
      role_title: roleTitle,
      aliases,
      alias_keywords: buildMultilingualAliasKeywords({
        canonicalName: item.name,
        aliases,
        categoryTags,
        departmentName: item.department,
      }),
      category_tags: categoryTags,
      department_name: item.department,
      assigned_building: buildingName,
      floor_location: officeFloor,
      number_of_floors: '',
      location: [officeName, buildingName].filter(Boolean).join(', '),
      description: clean(item.department),
      requirements: [],
      process: [],
      is_active: !inactive,
      last_updated: item.updatedAt,
      last_indexed: item.last_indexed,
      deactivated: inactive,
      source: 'faculty_staff',
      content: [
        `Personnel: ${clean(item.name)}`,
        `Role/Title: ${roleTitle}`,
        `Department: ${clean(item.department)}`,
        `Contact: ${clean(item.contactInfo)}`,
        `Office: ${officeName}`,
        `Building: ${buildingName}`,
      ].join('. '),
    }));
  }

  for (const item of (recordsByType.services || [])) {
    const officeName = clean(item?.office?.name);
    const buildingName = clean(item?.office?.building?.name);
    const officeFloor = clean(item?.office?.floor);
    const requirements = Array.isArray(item.requirements) ? item.requirements.join('; ') : '';
    const steps = Array.isArray(item.steps) ? item.steps.join('; ') : '';
    const name = clean(item.name);
    const roleTitle = clean(item.department) || officeName || 'Service';
    const inactive = isDeactivatedRecord('Service', item);
    const categoryTags = CATEGORY_TAGS_BY_TYPE.Service;
    const acronym = name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase();
    const aliases = withAliasVariants([item.name, acronym, `${name} service`, item.department, officeName, buildingName]);

    canonicalDocuments.push(toCanonicalDocument({
      id: item._id,
      type: 'Service',
      category: CATEGORY_BY_TYPE.Service,
      canonical_name: item.name,
      role_title: roleTitle,
      aliases,
      alias_keywords: buildMultilingualAliasKeywords({
        canonicalName: item.name,
        aliases,
        categoryTags,
        departmentName: item.department,
      }),
      category_tags: categoryTags,
      department_name: item.department,
      assigned_building: buildingName,
      floor_location: officeFloor,
      number_of_floors: '',
      location: [officeName || clean(item.department), buildingName].filter(Boolean).join(', '),
      description: clean(item.description),
      requirements: Array.isArray(item.requirements) ? item.requirements : [],
      process: Array.isArray(item.steps) ? item.steps : [],
      is_active: !inactive,
      last_updated: item.updatedAt,
      last_indexed: item.last_indexed,
      deactivated: inactive,
      source: 'services',
      content: [
        `Service: ${name}`,
        `Role/Title: ${roleTitle}`,
        `Description: ${clean(item.description)}`,
        `Requirements: ${requirements}`,
        `Process Steps: ${steps}`,
        `Department: ${clean(item.department)}`,
        `Office: ${officeName}`,
        `Building: ${buildingName}`,
      ].join('. '),
    }));
  }

  return canonicalDocuments.filter((doc) => doc.canonical_name && doc.content);
};

const loadRecordsFromDatabase = async () => {
  const [buildings, departments, offices, rooms, personnel, services] = await Promise.all([
    Building.find().lean(),
    Department.find().populate('building', 'name').lean(),
    Office.find().populate('building', 'name').populate('room', 'name').lean(),
    Room.find().populate('building', 'name').lean(),
    FacultyStaff.find().populate({ path: 'office', select: 'name building floor room', populate: { path: 'building', select: 'name' } }).lean(),
    Service.find().populate({ path: 'office', select: 'name building floor room', populate: { path: 'building', select: 'name' } }).lean(),
  ]);

  return {
    buildings,
    departments,
    offices,
    rooms,
    personnel,
    services,
  };
};

const buildIndexPayloadFromRecords = (recordsByType) => {
  const canonicalDocuments = buildCanonicalDocumentsFromRecords(recordsByType);
  const chunkDocuments = canonicalDocuments.flatMap((doc) => createChunkedDocuments(doc));
  return { canonicalDocuments, chunkDocuments };
};

const buildIndexPayloadFromDatabase = async () => {
  const records = await loadRecordsFromDatabase();
  return buildIndexPayloadFromRecords(records);
};

const loadRecordByTypeAndId = async (type, recordId) => {
  const id = String(recordId || '').trim();
  if (!id) return null;

  if (type === 'Building') {
    return Building.findById(id).lean();
  }

  if (type === 'Department') {
    return Department.findById(id).populate('building', 'name').lean();
  }

  if (type === 'Office') {
    return Office.findById(id).populate('building', 'name').populate('room', 'name').lean();
  }

  if (type === 'Room') {
    return Room.findById(id).populate('building', 'name').lean();
  }

  if (type === 'Personnel') {
    return FacultyStaff.findById(id)
      .populate({ path: 'office', select: 'name building floor room', populate: { path: 'building', select: 'name' } })
      .lean();
  }

  if (type === 'Service') {
    return Service.findById(id).populate({ path: 'office', select: 'name building floor room', populate: { path: 'building', select: 'name' } }).lean();
  }

  return null;
};

const buildIndexPayloadForSingleRecord = async (type, recordId) => {
  const record = await loadRecordByTypeAndId(type, recordId);
  if (!record) {
    return {
      canonicalDocuments: [],
      chunkDocuments: [],
      recordId: String(recordId || ''),
      type,
      collection: TYPE_TO_COLLECTION[type] || '',
    };
  }

  const recordsByType = {
    buildings: type === 'Building' ? [record] : [],
    departments: type === 'Department' ? [record] : [],
    offices: type === 'Office' ? [record] : [],
    rooms: type === 'Room' ? [record] : [],
    personnel: type === 'Personnel' ? [record] : [],
    services: type === 'Service' ? [record] : [],
  };

  const payload = buildIndexPayloadFromRecords(recordsByType);
  return {
    ...payload,
    recordId: String(record._id),
    type,
    collection: TYPE_TO_COLLECTION[type] || '',
  };
};

const saveLastIndexedByTypeAndId = async (type, recordId, lastIndexed = new Date()) => {
  const id = String(recordId || '').trim();
  if (!id) return null;

  const update = { last_indexed: lastIndexed };
  if (type === 'Building') return Building.findByIdAndUpdate(id, update, { new: true }).lean();
  if (type === 'Department') return Department.findByIdAndUpdate(id, update, { new: true }).lean();
  if (type === 'Office') return Office.findByIdAndUpdate(id, update, { new: true }).lean();
  if (type === 'Room') return Room.findByIdAndUpdate(id, update, { new: true }).lean();
  if (type === 'Personnel') return FacultyStaff.findByIdAndUpdate(id, update, { new: true }).lean();
  if (type === 'Service') return Service.findByIdAndUpdate(id, update, { new: true }).lean();
  return null;
};

module.exports = {
  buildIndexPayloadFromDatabase,
  buildIndexPayloadFromRecords,
  buildIndexPayloadForSingleRecord,
  saveLastIndexedByTypeAndId,
};
