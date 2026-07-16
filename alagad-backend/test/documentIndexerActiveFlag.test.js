const chai = require('chai');
const { buildIndexPayloadFromRecords } = require('../services/retrieval/documentIndexer');

const { expect } = chai;

describe('Document Indexer Active Flag', () => {
  it('maps is_active=false records as deactivated in canonical docs', () => {
    const payload = buildIndexPayloadFromRecords({
      buildings: [
        {
          _id: 'building-inactive',
          name: 'Old Building',
          description: 'Inactive building',
          department: 'Legacy',
          geometry: { coordinates: [125.1, 8.1] },
          numberOfFloors: 1,
          is_active: false,
          updatedAt: new Date(),
        },
      ],
      departments: [
        {
          _id: 'dept-inactive',
          name: 'Legacy Department',
          code: 'LEG',
          description: 'Inactive department',
          active: false,
          updatedAt: new Date(),
        },
      ],
      offices: [],
      rooms: [],
      personnel: [],
      services: [],
    });

    const buildingDoc = payload.canonicalDocuments.find((doc) => doc.id === 'building-inactive');
    const deptDoc = payload.canonicalDocuments.find((doc) => doc.id === 'dept-inactive');

    expect(buildingDoc).to.exist;
    expect(deptDoc).to.exist;
    expect(buildingDoc.deactivated).to.equal(true);
    expect(deptDoc.deactivated).to.equal(true);
    expect(buildingDoc.is_active).to.equal(false);
    expect(deptDoc.is_active).to.equal(false);
  });

  it('includes role_title and aliases for office, personnel, and service records', () => {
    const payload = buildIndexPayloadFromRecords({
      buildings: [],
      departments: [],
      offices: [
        {
          _id: 'office-1',
          name: 'Registrar Office',
          department: 'Registrar',
          room: { name: '101' },
          updatedAt: new Date(),
        },
      ],
      rooms: [],
      personnel: [
        {
          _id: 'person-1',
          name: 'Dr. Jane Doe',
          title: 'Department Chair',
          department: 'IT',
          updatedAt: new Date(),
        },
      ],
      services: [
        {
          _id: 'service-1',
          name: 'Transcript Request',
          department: 'Registrar',
          requirements: ['ID'],
          steps: ['Submit form'],
          updatedAt: new Date(),
        },
      ],
    });

    const officeDoc = payload.canonicalDocuments.find((doc) => doc.id === 'office-1');
    const personDoc = payload.canonicalDocuments.find((doc) => doc.id === 'person-1');
    const serviceDoc = payload.canonicalDocuments.find((doc) => doc.id === 'service-1');

    expect(officeDoc).to.exist;
    expect(personDoc).to.exist;
    expect(serviceDoc).to.exist;

    expect(String(officeDoc.role_title || '')).to.not.equal('');
    expect(String(personDoc.role_title || '')).to.not.equal('');
    expect(String(serviceDoc.role_title || '')).to.not.equal('');

    expect(String(officeDoc.aliases || '')).to.include('office');
    expect(String(personDoc.aliases || '').toLowerCase()).to.include('department chair');
    expect(String(serviceDoc.aliases || '')).to.include('service');

    const personAliases = String(personDoc.aliases || '').toLowerCase();
    expect(personAliases).to.include('janie');
    expect(/\b(jnae|jne)\b/.test(personAliases)).to.equal(true);

    expect(serviceDoc.is_active).to.equal(true);
    expect(serviceDoc).to.have.property('description');
    expect(serviceDoc.description).to.be.a('string');
    expect(String(serviceDoc.requirements || '')).to.include('ID');
    expect(String(serviceDoc.process || '')).to.include('Submit form');

    expect(officeDoc.category).to.equal('department');
    expect(personDoc.category).to.equal('personnel');
    expect(serviceDoc.category).to.equal('service');
  });

  it('stores assigned building and floor metadata for department, room, and service records', () => {
    const payload = buildIndexPayloadFromRecords({
      buildings: [],
      departments: [
        {
          _id: 'dept-1',
          name: 'Information Technology Department',
          code: 'IT',
          description: 'Handles IT programs.',
          building: { name: 'Engineering Hall' },
          floor: 3,
          updatedAt: new Date(),
        },
      ],
      offices: [
        {
          _id: 'office-1',
          name: 'Registrar Office',
          department: 'Registrar',
          building: { name: 'Admin Building' },
          floor: 1,
          room: { name: 'Room 105' },
          updatedAt: new Date(),
        },
      ],
      rooms: [
        {
          _id: 'room-1',
          name: 'Room 301',
          description: 'Lecture room.',
          department: 'IT',
          building: { name: 'Engineering Hall' },
          floor: 3,
          updatedAt: new Date(),
        },
      ],
      personnel: [],
      services: [
        {
          _id: 'service-1',
          name: 'Transcript Request',
          description: 'Transcript processing.',
          department: 'Registrar',
          office: { name: 'Registrar Office', building: { name: 'Admin Building' }, floor: 1 },
          requirements: ['Valid ID'],
          steps: ['Submit request'],
          updatedAt: new Date(),
        },
      ],
    });

    const deptDoc = payload.canonicalDocuments.find((doc) => doc.id === 'dept-1');
    const roomDoc = payload.canonicalDocuments.find((doc) => doc.id === 'room-1');
    const serviceDoc = payload.canonicalDocuments.find((doc) => doc.id === 'service-1');

    expect(deptDoc.assigned_building).to.equal('Engineering Hall');
    expect(String(deptDoc.floor_location)).to.equal('3');

    expect(roomDoc.assigned_building).to.equal('Engineering Hall');
    expect(String(roomDoc.floor_location)).to.equal('3');

    expect(serviceDoc.assigned_building).to.equal('Admin Building');
    expect(String(serviceDoc.floor_location)).to.equal('1');
  });
});
