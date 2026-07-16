const chai = require('chai');

const Building = require('../models/Building');
const Room = require('../models/Room');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');
const {
  get_building,
  get_room,
  get_personnel,
  get_service_details,
} = require('../services/retrieval/deterministicFetch');

const { expect } = chai;

const chainableQuery = (payload) => {
  const query = {
    populate() {
      return query;
    },
    async lean() {
      return payload;
    },
  };
  return query;
};

describe('Deterministic Fetch Active Flag', () => {
  const originals = {};

  before(() => {
    originals.buildingFindById = Building.findById;
    originals.roomFindById = Room.findById;
    originals.personnelFindById = FacultyStaff.findById;
    originals.serviceFindById = Service.findById;
  });

  after(() => {
    Building.findById = originals.buildingFindById;
    Room.findById = originals.roomFindById;
    FacultyStaff.findById = originals.personnelFindById;
    Service.findById = originals.serviceFindById;
  });

  it('returns null for building when is_active=false', async () => {
    Building.findById = () => chainableQuery({
      _id: 'building-1',
      name: 'Old Building',
      is_active: false,
    });

    const result = await get_building('building-1');
    expect(result).to.equal(null);
  });

  it('returns null for room when is_active=false', async () => {
    Room.findById = () => chainableQuery({
      _id: 'room-1',
      name: 'Old Room',
      is_active: false,
    });

    const result = await get_room('room-1');
    expect(result).to.equal(null);
  });

  it('returns null for personnel when is_active=false', async () => {
    FacultyStaff.findById = () => chainableQuery({
      _id: 'person-1',
      name: 'Jane Doe',
      title: 'Dean',
      is_active: false,
    });

    const result = await get_personnel('person-1');
    expect(result).to.equal(null);
  });

  it('returns null for service when is_active=false', async () => {
    Service.findById = () => chainableQuery({
      _id: 'service-1',
      name: 'ID Validation',
      is_active: false,
    });

    const result = await get_service_details('service-1');
    expect(result).to.equal(null);
  });
});
