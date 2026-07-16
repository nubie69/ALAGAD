const Building = require('../../models/Building');
const Room = require('../../models/Room');
const FacultyStaff = require('../../models/FacultyStaff');
const Service = require('../../models/Service');

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
    last_updated: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

const fetchStructuredByType = async (type, id) => {
  if (type === 'Building') return get_building(id);
  if (type === 'Room') return get_room(id);
  if (type === 'Personnel') return get_personnel(id);
  if (type === 'Service') return get_service_details(id);
  return null;
};

module.exports = {
  get_building,
  get_room,
  get_personnel,
  get_service_details,
  fetchStructuredByType,
};
