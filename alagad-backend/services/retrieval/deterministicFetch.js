const Building = require('../../models/Building');
const Room = require('../../models/Room');
const FacultyStaff = require('../../models/FacultyStaff');
const Service = require('../../models/Service');
const FAQ = require('../../models/FAQ');
const Resource = require('../../models/Resource');
const { isSafeResourceUrl } = require('../../utils/resourceUrl');

const clean = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const isInactive = (item) => item?.isActive === false || item?.is_active === false;

const coordinatesToMapLink = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
};

const get_building = async (id) => {
  const item = await Building.findById(id).lean();
  if (!item || isInactive(item)) return null;

  return {
    id: String(item._id),
    canonical_name: clean(item.name),
    address: clean(item.department) || clean(item.description),
    map_link: coordinatesToMapLink(item?.geometry?.coordinates),
    hours: null,
    last_updated: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

const get_room = async (id) => {
  const item = await Room.findById(id).populate('building', 'name').lean();
  if (!item || isInactive(item)) return null;

  return {
    id: String(item._id),
    room_number: clean(item.name),
    building_id: item?.building?._id ? String(item.building._id) : null,
    floor: Number.isFinite(item.floor) ? item.floor : null,
    capacity: null,
    equipment: [],
    last_updated: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

const get_personnel = async (id) => {
  const item = await FacultyStaff.findById(id)
    .populate({ path: 'office', select: 'name building', populate: { path: 'building', select: 'name' } })
    .lean();
  if (!item || isInactive(item)) return null;

  return {
    id: String(item._id),
    name: clean(item.name),
    role: clean(item.title),
    department: clean(item.department),
    office_id: item?.office?._id ? String(item.office._id) : null,
    office_name: clean(item?.office?.name),
    building_name: clean(item?.office?.building?.name),
    contact: clean(item.contactInfo),
    office_hours: null,
    last_updated: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

const get_service_details = async (id) => {
  const item = await Service.findById(id)
    .populate({ path: 'office', select: 'name contactInfo building', populate: { path: 'building', select: 'name' } })
    .lean();
  if (!item || isInactive(item)) return null;

  return {
    id: String(item._id),
    name: clean(item.name),
    department: clean(item.department),
    office_name: clean(item?.office?.name),
    building_name: clean(item?.office?.building?.name),
    requirements: Array.isArray(item.requirements)
      ? item.requirements.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    details: clean(item.description),
    process_steps: Array.isArray(item.steps)
      ? item.steps.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    contact: clean(item?.office?.contactInfo),
    stakeholder: clean(item.stakeholder),
    stakeholders: Array.isArray(item.stakeholders) ? item.stakeholders.map(clean).filter(Boolean) : [],
    category: clean(item.category),
    deadline: clean(item.deadline),
    processingTime: clean(item.processingTime),
    source: clean(item.source),
    verificationStatus: clean(item.verificationStatus) || 'verified',
    verifiedBy: clean(item.verifiedBy),
    verifiedAt: item.verifiedAt ? new Date(item.verifiedAt).toISOString() : null,
    sourceOffice: clean(item.sourceOffice) || clean(item?.office?.name) || clean(item.department),
    status: clean(item.status) || clean(item.verificationStatus) || 'verified',
    effectiveDate: item.effectiveDate ? new Date(item.effectiveDate).toISOString() : null,
    expirationDate: item.expirationDate ? new Date(item.expirationDate).toISOString() : null,
    last_updated: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

const serializeResource = (item) => {
  if (!item || isInactive(item) || item.verified !== true || !isSafeResourceUrl(item.url)) return null;
  const title = clean(item.title || item.name);
  return {
    id: String(item._id),
    title,
    name: title,
    description: clean(item.description),
    type: clean(item.type),
    url: clean(item.url),
    officeId: item?.office?._id ? String(item.office._id) : null,
    officeName: clean(item?.office?.name),
    departmentId: item?.department?._id ? String(item.department._id) : null,
    departmentName: clean(item?.department?.name),
    stakeholder: clean(item.stakeholder),
    stakeholders: Array.isArray(item.stakeholders) ? item.stakeholders.map(clean).filter(Boolean) : [],
    category: clean(item.category),
    verified: true,
    verifiedBy: clean(item.verifiedBy),
    lastVerified: item.lastVerified ? new Date(item.lastVerified).toISOString() : null,
  };
};

const serializeRelatedFaq = (item) => {
  if (!item || isInactive(item) || item.verified !== true || ['draft', 'pending_review', 'archived'].includes(String(item.status || '').toLowerCase())) return null;
  return {
    id: String(item._id),
    question: clean(item.name || item.question),
    name: clean(item.name || item.question),
    officeName: clean(item?.office?.name),
    departmentName: clean(item?.department?.name),
  };
};

const get_faq_details = async (id) => {
    const item = await FAQ.findById(id)
    .populate('office', 'name department contactInfo')
    .populate('department', 'name code')
    .populate({
      path: 'relatedFaqs',
      select: 'question category office department verified isActive status',
      populate: [
        { path: 'office', select: 'name' },
        { path: 'department', select: 'name code' },
      ],
    })
    .populate({
      path: 'resources',
      select: 'title description type url office department verified isActive lastVerified',
      populate: [
        { path: 'office', select: 'name department contactInfo' },
        { path: 'department', select: 'name code' },
      ],
    })
    .lean();

  if (!item || isInactive(item) || item.verified !== true || ['draft', 'pending_review', 'archived'].includes(String(item.status || '').toLowerCase())) return null;

  const linkedResourceIds = new Set((item.resources || []).map((resource) => String(resource?._id || resource)));
  const reverseResources = await Resource.find({
    faqs: item._id,
    _id: { $nin: Array.from(linkedResourceIds) },
    verified: true,
    isActive: { $ne: false },
  })
    .populate('office', 'name department contactInfo')
    .populate('department', 'name code')
    .lean();

  const inlineResources = (item.downloadableResources || [])
    .map((resource) => serializeResource({
      ...resource,
      _id: resource._id || `${item._id}:${resource.name}`,
      verified: true,
      isActive: true,
    }))
    .filter(Boolean);

  const linkedResources = [...(item.resources || []), ...reverseResources]
    .map(serializeResource)
    .filter(Boolean);
  const resources = [...inlineResources, ...linkedResources];

  return {
    id: String(item._id),
    question: clean(item.name || item.question),
    name: clean(item.name || item.question),
    answer: clean(item.verifiedAnswer || item.answer),
    verifiedAnswer: clean(item.verifiedAnswer || item.answer),
    category: clean(item.category),
    keywords: Array.isArray(item.keywords) ? item.keywords.map(clean).filter(Boolean) : [],
    alternativeQuestions: Array.isArray(item.alternativeQuestions) ? item.alternativeQuestions.map(clean).filter(Boolean) : [],
    stakeholder: clean(item.stakeholder),
    stakeholders: Array.isArray(item.stakeholders) ? item.stakeholders.map(clean).filter(Boolean) : [],
    source: clean(item.source),
    status: clean(item.status),
    effectiveDate: item.effectiveDate ? new Date(item.effectiveDate).toISOString() : null,
    expirationDate: item.expirationDate ? new Date(item.expirationDate).toISOString() : null,
    officeId: item?.office?._id ? String(item.office._id) : null,
    officeName: clean(item?.office?.name),
    departmentId: item?.department?._id ? String(item.department._id) : null,
    departmentName: clean(item?.department?.name) || clean(item?.office?.department),
    contact: clean(item?.office?.contactInfo),
    relatedFaqs: (item.relatedFaqs || []).map(serializeRelatedFaq).filter(Boolean).slice(0, 5),
    resources,
    downloadableResources: resources,
    verificationStatus: 'verified',
    verified: true,
    verifiedBy: clean(item.verifiedBy),
    lastVerified: item.lastVerified ? new Date(item.lastVerified).toISOString() : null,
    sourceOffice: clean(item?.office?.name) || clean(item?.department?.name),
    last_updated: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

const get_resource_details = async (id) => {
  const item = await Resource.findById(id)
    .populate('office', 'name department contactInfo')
    .populate('department', 'name code')
    .lean();

  return serializeResource(item);
};

const fetchStructuredByType = async (type, id) => {
  if (type === 'Building') return get_building(id);
  if (type === 'Room') return get_room(id);
  if (type === 'Personnel') return get_personnel(id);
  if (type === 'Service') return get_service_details(id);
  if (type === 'FAQ') return get_faq_details(id);
  if (type === 'Resource') return get_resource_details(id);
  return null;
};

module.exports = {
  get_building,
  get_room,
  get_personnel,
  get_service_details,
  get_faq_details,
  get_resource_details,
  fetchStructuredByType,
};
