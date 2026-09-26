const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const { detectRequest } = require('../services/retrieval/intentRequest');
const { answerFromRecord, UNKNOWN, unknownReply } = require('../services/retrieval/campusBehavior');
const { resolvePersonnel } = require('../services/retrieval/personnelIntent');
const { classifyIntent } = require('../services/retrieval/queryNormalizer');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');
const FAQ = require('../models/FAQ');
const Resource = require('../models/Resource');
const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { sharedVectorIndexManager } = require('../services/retrieval/vectorIndexManager');
const router = require('../routes/chatbotDeterministicRoutes');

const service = { id: 's1', type: 'Service', canonical_name: 'Transcript of Records', location: 'BUILDING_ONLY',
  description: 'DESCRIPTION_ONLY', structured: { name: 'Transcript of Records', details: 'DESCRIPTION_ONLY',
    process_steps: ['PROCESS_ONLY'], requirements: ['REQUIREMENT_ONLY'], office_id: 'o1', office_name: 'OFFICE_ONLY', contact: 'CONTACT_ONLY' } };
const office = { _id: 'o1', name: "Registrar's Office", building: { name: 'Main Building' } };
const people = [
  { _id: 'p1', name: 'Juan Dela Cruz', title: 'University Registrar', office, contactInfo: 'PRIVATE_CONTACT' },
  { _id: 'p2', name: 'Maria Santos', title: 'Records Assistant', office },
  { _id: 'p3', name: 'Ana Reyes', title: 'Dean', department: 'College of Arts' },
  { _id: 'p4', name: 'Pedro Tan', title: 'Dean', department: 'College of Science' },
];

const examples = {
  service_process: ['How do I get my TOR?', 'What is the process for requesting a TOR?', 'How can I apply for this service?',
    'What are the steps for enrollment?', 'Paano kumuha ng TOR?', 'Ano ang proseso sa pagkuha ng TOR?',
    'Paano mag-request ng school records?', 'Ano ang steps para sa enrollment?', 'Unsaon pagkuha og TOR?',
    'Unsa ang proseso sa pagkuha og TOR?', 'Unsaon pag-request sa school records?', 'Unsa ang mga steps sa enrollment?',
    'How ko mag-process sa TOR?', 'TOR process', 'unsaon TOR', 'process sa TOR'],
  service_requirements: ['What are the requirements for TOR?', 'What do I need for enrollment?', 'What should I bring?',
    'What documents are required?', 'Ano ang requirements para sa TOR?', 'Ano ang kailangan ko para sa enrollment?',
    'Anong documents ang kailangan?', 'Unsa ang requirements para sa TOR?', 'Unsa akong kinahanglan para sa enrollment?',
    'Unsang documents ang kinahanglan?', 'Ano requirements sa enrollment?', 'Unsa requirements sa enrollment?', 'TOR requirements'],
  service_description: ['What is TOR processing?', 'What is this service?', 'What is this service for?', 'What does this service do?',
    'Ano ang service na ito?', 'Para saan ang service na ito?', 'Ano ang TOR processing?', 'Unsa ni nga service?',
    'Para asa ni nga service?', 'Unsa ang TOR processing?', 'What is TOR?'],
  service_location: ['Where can I get my TOR?', 'Where can I process my enrollment?', 'Where can I pay my fees?',
    'What office handles TOR requests?', 'Saan ako kukuha ng TOR?', 'Saan mag-process ng enrollment?', 'Saang office ako magbabayad?',
    'Anong office ang naghahandle ng TOR?', 'Asa ko makakuha og TOR?', 'Asa mag-process og enrollment?', 'Asa ko magbayad?',
    'Unsang office ang nag-handle sa TOR?', 'Where ko makakuha og TOR?', 'where TOR'],
  navigation: ['How do I get to the Registrar?', 'Take me to the Registrar.', 'Paano pumunta sa Registrar?',
    'Dalhin mo ako sa Registrar.', 'Unsaon pag-adto sa Registrar?', 'Dal-a ko sa Registrar.'],
  find_location: ['Where is the Registrar?', 'Saan ang Registrar?', 'Asa ang Registrar?', 'Where is the library?',
    'Nasaan ang clinic?', 'Asa dapit ang clinic?', 'Where is yung Registrar?', 'registrar wer', 'asa registar'],
  personnel_position: ['What is the position of Juan Dela Cruz?', 'What position does Juan Dela Cruz hold?',
    'Ano ang position ni Juan Dela Cruz?', 'Anong trabaho ni Juan Dela Cruz sa university?', 'Unsa ang position ni Juan Dela Cruz?',
    'Unsay role ni Juan Dela Cruz?', "What is Juan Dela Cruz's position?", 'position ni Juan Dela Cruz'],
  position_personnel: ['Who is the University Registrar?', 'Who is assigned as Department Chair?', 'Who is the Dean of College of Arts?',
    'Sino ang University Registrar?', 'Sino ang naka-assign na Department Chair?', 'Kinsa ang University Registrar?',
    'Kinsa ang naka-assign nga Department Chair?', 'who registrar', 'kinsa registrar'],
  office_personnel: ["Who is assigned to the Registrar's Office?", 'Who works in this department?', 'Sino ang naka-assign sa Registrar?',
    'Kinsa ang naka-assign sa Registrar?', 'Who ang assigned sa Registrar?'],
};

describe('Intent-specific multilingual requests', () => {
  for (const [intent, queries] of Object.entries(examples)) {
    for (const query of queries) it(`${intent}: ${query}`, () => {
      assert.equal(detectRequest(query).intent, intent);
    });
  }
  for (const query of ['Where can I find Juan Dela Cruz?', 'Where is Juan Dela Cruz?', 'What office is Juan Dela Cruz assigned to?',
    'Where does Juan Dela Cruz work?', 'Saan ko mahahanap si Juan Dela Cruz?', 'Nasaan si Juan Dela Cruz?',
    'Saang office naka-assign si Juan Dela Cruz?', 'Saan nagtatrabaho si Juan Dela Cruz?', 'Asa nako makita si Juan Dela Cruz?',
    'Asa nga office si Juan Dela Cruz?', 'Asa nagtrabaho si Juan Dela Cruz?']) {
    it(`personnel assignment: ${query}`, () => assert.equal(detectRequest(query, { type: 'Personnel' }).intent, 'personnel_location'));
  }
  const focused = { service_process: 'PROCESS_ONLY', service_requirements: 'REQUIREMENT_ONLY', service_description: 'DESCRIPTION_ONLY', service_location: 'OFFICE_ONLY' };
  for (const [intent, expected] of Object.entries(focused)) {
    it(`${intent} emits only its requested field`, () => {
      const answer = answerFromRecord(examples[intent][0], service);
      assert.match(answer.reply, new RegExp(expected));
      for (const other of Object.values(focused).filter(value => value !== expected)) assert.ok(!answer.reply.includes(other), answer.reply);
      assert.ok(!answer.reply.includes('CONTACT_ONLY'));
      if (intent !== 'service_location') {
        assert.equal(answer.navigation, false);
        assert.equal(answer.location, null);
        assert.ok(!answer.reply.includes('BUILDING_ONLY'));
      }
    });
  }
  it('combines explicitly requested fields without a description or contact', () => {
    const answer = answerFromRecord('Requirements and process for TOR', service);
    assert.deepEqual(answer.requested_information, ['requirements', 'process']);
    assert.match(answer.reply, /REQUIREMENT_ONLY/);
    assert.match(answer.reply, /PROCESS_ONLY/);
    assert.ok(!answer.reply.includes('DESCRIPTION_ONLY'));
  });
  it('uses localized unknown replies without substituting other populated fields', () => {
    for (const language of ['english', 'tagalog', 'cebuano']) {
      const answer = answerFromRecord('Requirements for TOR', { ...service, structured: { ...service.structured, requirements: [] } }, [], language);
      assert.equal(answer.reply, unknownReply(language));
      assert.equal(answer.navigation, false);
    }
  });
  it('keeps contact requests out of service-process retrieval', () => {
    const answer = answerFromRecord('What is the contact information?', service);
    assert.equal(answer.intent, 'contact_information');
    assert.equal(answer.reply, 'Transcript of Records: CONTACT_ONLY');
    assert.equal(answer.navigation, false);
  });
  it('retrieves services for where-to-process queries', () => {
    assert.equal(classifyIntent('Asa mag-process og enrollment?'), 'service');
    assert.equal(classifyIntent('What is the position of Juan?'), 'who');
  });
});

describe('Personnel relationships', () => {
  const resolve = (query, source = people, language = 'english') => resolvePersonnel(query, detectRequest(query), source, language);
  it('selects the title holder and excludes their office colleague and contact', () => {
    const answer = resolve('Who is the University Registrar?');
    assert.equal(answer.reply, 'Personnel assigned as University Registrar: Juan Dela Cruz.');
    assert.equal(answer.entityName, 'Juan Dela Cruz');
    assert.equal(answer.entity_type, 'position');
    assert.equal(answer.navigation, false);
  });
  it('never substitutes a colleague when the requested title is absent', () => {
    assert.equal(resolve('Who is the University Registrar?', people.slice(1)).reply, UNKNOWN);
    assert.equal(resolve('Who is the University Registrar?', [{ ...people[0], title: 'University Records Assistant' }]).reply, UNKNOWN);
  });
  it('returns only an explicit office association', () => {
    const answer = resolve("Who works in the Registrar's Office?");
    assert.match(answer.reply, /Juan Dela Cruz; Maria Santos/);
    assert.ok(!answer.reply.includes('Ana Reyes'));
    assert.ok(!answer.reply.includes('PRIVATE_CONTACT'));
  });
  it('asks about ambiguous positions and respects department scope', () => {
    assert.equal(resolve('Who is the Dean?').intent, 'clarification');
    assert.match(resolve('Who is the Dean of College of Arts?').reply, /Ana Reyes/);
  });
  it('returns only the named person’s title', () => {
    assert.equal(resolve('What is the position of Juan Dela Cruz?').reply, 'Juan Dela Cruz is listed as University Registrar.');
    assert.match(resolve('Anong trabaho ni Juan Dela Cruz sa university?').reply, /University Registrar/);
    const assignment = resolvePersonnel('What office is Juan Dela Cruz assigned to?', detectRequest('What office is Juan Dela Cruz assigned to?'), people, 'english');
    assert.match(assignment.reply, /officially assigned to/);
  });
});

describe('Personnel conversation endpoint', () => {
  const app = express(); app.use(express.json()); app.use('/chat', router);
  let original;
  beforeEach(() => {
    original = FacultyStaff.find;
    FacultyStaff.find = () => ({ populate() { return this; }, lean: async () => people });
  });
  afterEach(() => { FacultyStaff.find = original; });
  it('resolves a title and a subsequent assigned-location question', async () => {
    const response = await supertest(app).post('/chat').send({ message: 'Who is the University Registrar and where can I find them?', language: 'en' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.intents, ['position_personnel', 'personnel_location']);
    assert.match(response.body.reply, /officially assigned to/);
    assert.match(response.body.reply, /Main Building/);
    assert.ok(!response.body.reply.includes('PRIVATE_CONTACT'));
  });
  it('handles a mixed-language office roster without a model call', async () => {
    const response = await supertest(app).post('/chat').send({ message: 'Who ang assigned sa Registrar?', language: 'tl' });
    assert.equal(response.status, 200);
    assert.equal(response.body.intent, 'office_personnel');
    assert.match(response.body.reply, /Juan Dela Cruz; Maria Santos/);
  });
});

describe('Scoped service conversation endpoint', () => {
  const app = express(); app.use(express.json()); app.use('/chat', router);
  const chain = value => ({ populate() { return this; }, lean: async () => value });
  let originals;
  let indexed;
  let stored;
  beforeEach(() => {
    originals = { retrieve: RetrievalPipeline.prototype.retrieve, documents: sharedVectorIndexManager.getCanonicalDocuments,
      service: Service.findById, faq: FAQ.findById, resources: Resource.find };
    indexed = { ...service, similarity: 1, verification_status: 'verified' };
    stored = { _id: 's1', name: service.canonical_name, description: 'DESCRIPTION_ONLY',
      requirements: ['REQUIREMENT_ONLY'], steps: ['PROCESS_ONLY'], verificationStatus: 'verified', status: 'verified',
      office: { _id: 'o1', name: 'OFFICE_ONLY', building: { name: 'BUILDING_ONLY' }, contactInfo: 'CONTACT_ONLY' } };
    Service.findById = () => chain(stored);
    FAQ.findById = () => chain({ _id: 'f1', question: 'How do I request my TOR?', answer: 'UNREQUESTED_PROCESS', verified: true, status: 'verified', resources: [], relatedFaqs: [] });
    Resource.find = () => chain([]);
    sharedVectorIndexManager.getCanonicalDocuments = () => [indexed];
    RetrievalPipeline.prototype.retrieve = async () => ({ candidateContexts: [indexed], finalContext: [indexed] });
  });
  afterEach(() => {
    RetrievalPipeline.prototype.retrieve = originals.retrieve;
    sharedVectorIndexManager.getCanonicalDocuments = originals.documents;
    Service.findById = originals.service;
    FAQ.findById = originals.faq;
    Resource.find = originals.resources;
  });
  it('answers requirements then process using conversation context without extra fields', async () => {
    const first = await supertest(app).post('/chat').send({ message: 'Requirements for TOR?', language: 'en' });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.requested_information, ['requirements']);
    assert.ok(!first.body.reply.includes('PROCESS_ONLY'));
    const second = await supertest(app).post('/chat').send({ message: 'How about the process?', language: 'en',
      conversationHistory: [{ sender: 'bot', text: first.body.reply, entityName: first.body.entityName, intent: first.body.intent }] });
    assert.equal(second.status, 200);
    assert.deepEqual(second.body.requested_information, ['process']);
    assert.match(second.body.reply, /PROCESS_ONLY/);
    assert.ok(!second.body.reply.includes('REQUIREMENT_ONLY'));
    assert.equal(second.body.navigation, false);
  });
  it('answers both requested facets and no unrequested service details', async () => {
    const response = await supertest(app).post('/chat').send({ message: 'What are the requirements for TOR and where can I process it?', language: 'en' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.intents, ['service_requirements', 'service_location']);
    assert.match(response.body.reply, /REQUIREMENT_ONLY/);
    assert.match(response.body.reply, /OFFICE_ONLY/);
    assert.ok(!response.body.reply.includes('PROCESS_ONLY'));
    assert.ok(!response.body.reply.includes('DESCRIPTION_ONLY'));
  });
  it('uses the exact Cebuano unknown response for a missing field', async () => {
    stored.requirements = [];
    const response = await supertest(app).post('/chat').send({ message: 'Unsa requirements sa TOR?', language: 'ceb' });
    assert.equal(response.status, 200);
    assert.equal(response.body.reply, unknownReply('cebuano'));
  });
  it('rejects a service made unverified after it was indexed', async () => {
    stored.verificationStatus = 'unverified';
    const response = await supertest(app).post('/chat').send({ message: 'Requirements for TOR?', language: 'en' });
    assert.equal(response.status, 200);
    assert.equal(response.body.reply, UNKNOWN);
    assert.ok(!response.body.reply.includes('REQUIREMENT_ONLY'));
  });
  it('does not substitute a process FAQ for a requirements question', async () => {
    indexed = { id: 'f1', type: 'FAQ', canonical_name: 'How do I request my TOR?', similarity: 1, verification_status: 'verified' };
    const response = await supertest(app).post('/chat').send({ message: 'Requirements for TOR?', language: 'en' });
    assert.equal(response.status, 200);
    assert.equal(response.body.reply, UNKNOWN);
    assert.ok(!response.body.reply.includes('UNREQUESTED_PROCESS'));
  });
});
