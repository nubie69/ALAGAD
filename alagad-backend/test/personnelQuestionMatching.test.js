const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const FacultyStaff = require('../models/FacultyStaff');
const router = require('../routes/chatbotDeterministicRoutes');
const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { sharedVectorIndexManager } = require('../services/retrieval/vectorIndexManager');
const { resolvePersonnel } = require('../services/retrieval/personnelIntent');
const { detectRequest } = require('../services/retrieval/intentRequest');
const { UNKNOWN } = require('../services/retrieval/campusBehavior');

const person = { _id: 'p1', name: 'Juan Dela Cruz', title: 'University Registrar', contactInfo: 'CONTACT_ONLY',
  office: { _id: 'o1', name: "Registrar's Office", building: { name: 'Main Building' } }, isActive: true };

describe('Personnel question matching', () => {
  const app = express(); app.use(express.json()); app.use('/chat', router);
  let originals;
  let people;
  let retrievalCalls;
  beforeEach(() => {
    people = [person]; retrievalCalls = 0;
    originals = { find: FacultyStaff.find, retrieve: RetrievalPipeline.prototype.retrieve,
      documents: sharedVectorIndexManager.getCanonicalDocuments };
    FacultyStaff.find = () => ({ populate() { return this; }, lean: async () => people });
    sharedVectorIndexManager.getCanonicalDocuments = () => people.map(p => ({ id: p._id, type: 'Personnel', canonical_name: p.name }));
    RetrievalPipeline.prototype.retrieve = async () => {
      retrievalCalls += 1;
      // Simulate semantic retrieval returning a different employee with very high confidence.
      const wrong = { id: 'other', type: 'Personnel', canonical_name: 'Maria Santos', similarity: 1 };
      return { candidateContexts: [wrong], finalContext: [wrong] };
    };
  });
  afterEach(() => {
    FacultyStaff.find = originals.find;
    RetrievalPipeline.prototype.retrieve = originals.retrieve;
    sharedVectorIndexManager.getCanonicalDocuments = originals.documents;
  });
  for (const query of ['Who is Juan Dela Cruz?', 'Sino si Juan Dela Cruz?', 'Kinsa si Juan Dela Cruz?']) {
    it(`answers for the named person: ${query}`, async () => {
      const response = await supertest(app).post('/chat').send({ message: query });
      assert.equal(response.status, 200);
      assert.equal(response.body.entityName, person.name);
      assert.match(response.body.reply, /University Registrar/);
      assert.ok(!response.body.reply.includes('CONTACT_ONLY'));
      assert.ok(!response.body.reply.includes('Main Building'));
    });
  }
  it('answers only the requested assignment for a named location question', async () => {
    const response = await supertest(app).post('/chat').send({ message: 'Where is Juan Dela Cruz?', language: 'en' });
    assert.equal(response.body.intent, 'personnel_location');
    assert.match(response.body.reply, /Main Building/);
    assert.ok(!response.body.reply.includes('University Registrar'));
    assert.ok(!response.body.reply.includes('CONTACT_ONLY'));
    assert.equal(retrievalCalls, 0);
  });
  it('answers only the requested contact information', async () => {
    const response = await supertest(app).post('/chat').send({ message: 'What is the contact information of Juan Dela Cruz?', language: 'en' });
    assert.equal(response.body.reply, 'Juan Dela Cruz: CONTACT_ONLY');
    assert.ok(!response.body.reply.includes('Main Building'));
    assert.ok(!response.body.reply.includes('University Registrar'));
  });
  for (const [message, language] of [
    ['Who is Roberto Unknown?', 'en'], ['Sino si Roberto Unknown?', 'tl'], ['Kinsa si Roberto Unknown?', 'ceb'],
    ['What is the position of Roberto Unknown?', 'en'], ['Where is Dr Roberto Unknown?', 'en'],
    ['Where is Roberto Unknown?', 'en'], ['What is the contact information of Dr Roberto Unknown?', 'en'],
  ]) {
    it(`uses the exact fallback for missing personnel: ${message}`, async () => {
      const response = await supertest(app).post('/chat').send({ message, language });
      assert.equal(response.status, 200);
      assert.equal(response.body.reply, UNKNOWN);
      assert.equal(response.body.entityName, null);
      assert.equal(response.body.navigation, false);
      assert.equal(response.body.responseType, 'NO_MATCH');
    });
  }
  it('never substitutes an assistant for the requested title holder', () => {
    const response = resolvePersonnel('Who is the University Registrar?', detectRequest('Who is the University Registrar?'),
      [{ ...person, title: 'Assistant University Registrar' }], 'english');
    assert.equal(response.reply, UNKNOWN);
  });
  it('does not guess a different spelling of a personnel name', () => {
    const query = 'Who is Maria Santo?';
    const response = resolvePersonnel(query, detectRequest(query), [{ ...person, name: 'Maria Santos' }], 'english');
    assert.equal(response.reply, UNKNOWN);
  });
  it('does not interpret a missing person with an honorific as a title holder', () => {
    const query = 'Who is Dr Registrar?';
    const response = resolvePersonnel(query, detectRequest(query), [person], 'english');
    assert.equal(response.reply, UNKNOWN);
  });
  it('does not answer using inactive personnel', async () => {
    people = [{ ...person, isActive: false }];
    const response = await supertest(app).post('/chat').send({ message: 'Who is Juan Dela Cruz?', language: 'en' });
    assert.equal(response.body.reply, UNKNOWN);
  });
  it('reads newly added personnel and updated titles from the current admin list', async () => {
    people.push({ ...person, _id: 'new', name: 'Newly Added Person', title: 'Admissions Officer' });
    const response = await supertest(app).post('/chat').send({ message: 'Who is Newly Added Person?', language: 'en' });
    assert.equal(response.body.entityName, 'Newly Added Person');
    assert.match(response.body.reply, /Admissions Officer/);
    people[1] = { ...people[1], title: 'Admissions Director' };
    const updated = await supertest(app).post('/chat').send({ message: 'What is the position of Newly Added Person?', language: 'en' });
    assert.match(updated.body.reply, /Admissions Director/);
    assert.ok(!updated.body.reply.includes('Admissions Officer'));
  });
});
