const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const behavior = require('../services/retrieval/campusBehavior');
const { classifyIntent, classifyRetrievalCategory } = require('../services/retrieval/queryNormalizer');
const router = require('../routes/chatbotDeterministicRoutes');
const Office = require('../models/Office');
const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { sharedVectorIndexManager } = require('../services/retrieval/vectorIndexManager');

const office = { id: 'office-1', type: 'Office', canonical_name: "Registrar's Office", location: 'Main Building', description: 'Maintains student records.', verification_status: 'verified', similarity: 1 };
const service = { id: 'service-1', type: 'Service', canonical_name: 'Transcript of Records', location: 'Main Building', structured: { office_id: 'office-1', office_name: "Registrar's Office", requirements: ['Student ID'], process_steps: ['Submit the stored form.'] } };

describe('ALAGAD campus behaviors', () => {
  it('separates navigation from service procedures before retrieval', () => {
    for (const text of ['How do I get to the library?', 'Take me to Room 201', 'How can I reach the clinic?', 'how go clinic', 'Unsaon pag-adto sa Registrar?']) {
      assert.equal(behavior.classify(text).intent, 'navigation', text);
      assert.equal(classifyIntent(text), 'where', text);
      assert.equal(classifyRetrievalCategory(text), 'Location', text);
    }
    assert.equal(behavior.classify('How do I request my TOR?').intent, 'service_process');
    assert.equal(behavior.classify('Where can I request my TOR?').intent, 'service_location');
    assert.equal(classifyIntent('Who handles student records?'), 'service');
  });
  it('answers small talk and asks about unresolved references', () => {
    assert.equal(behavior.earlyReply('Hi ALAGAD').intent, 'greeting');
    assert.equal(behavior.earlyReply('Salamat').intent, 'thanks');
    assert.equal(behavior.earlyReply('Take me there').intent, 'clarification');
    assert.equal(behavior.earlyReply('Take me there', { lastEntity: 'Library' }), null);
    assert.equal(behavior.earlyReply('Who is LeBron James?').intent, 'out_of_scope');
    assert.equal(behavior.earlyReply('Where is the IT department?'), null);
  });
  it('carries explicit references but does not append an old subject to a new destination', () => {
    const build = router.__testables.buildConversationAwareQuery;
    const conversationContext = { lastEntity: 'Library' };
    assert.match(build({ message: 'Take me there', conversationContext }), /Library/);
    assert.equal(build({ message: 'Where is the clinic?', conversationContext }), 'Where is the clinic?');
    assert.equal(build({ message: 'Registrar?', conversationContext }), 'Registrar?');
    assert.equal(build({ message: 'Where is IT?', conversationContext }), 'Where is IT?');
    assert.match(build({ message: 'What are the office hours?', conversationContext }), /Library/);
  });
  it('returns verified facts and separate map actions without invented directions', () => {
    const location = behavior.answerFromRecord('Where is the Registrar?', office);
    assert.equal(location.requires_navigation, false);
    assert.equal(location.navigationTarget.id, office.id);
    const navigation = behavior.answerFromRecord('Take me there', office);
    assert.equal(navigation.requires_navigation, true);
    assert.deepEqual(navigation.steps, []);
    assert.match(navigation.reply, /calculate a route/);
    const answer = behavior.answerFromRecord('Where can I request my TOR?', service);
    assert.equal(answer.navigationTarget.id, 'office-1');
    assert.match(answer.reply, /Registrar's Office/);
  });
  it('does not guess offices, requirements, schedules, or personnel titles', () => {
    const answer = behavior.answerFromRecord('Where can I get this service?', { ...service, structured: {} });
    assert.equal(answer.navigationTarget, null);
    assert.match(answer.reply, /couldn't find/);
    assert.equal(behavior.answerFromRecord('What time does it open?', office).reply, behavior.UNKNOWN);
    assert.match(behavior.answerFromRecord('What documents do I need?', office).reply, /couldn't find/);
    assert.doesNotMatch(behavior.answerFromRecord('Who is Jane?', { ...office, type: 'Personnel', canonical_name: 'Jane', structured: { role: 'Assistant' } }).reply, /head/);
  });
  it('answers multiple facets and lists only related stored offices', () => {
    const answer = behavior.answerFromRecord('Where is the Registrar and what time does it close?', office);
    assert.match(answer.reply, /Main Building/);
    assert.match(answer.reply, /couldn't find/);
    const building = { id: 'building-1', type: 'Building', canonical_name: 'Main Building' };
    const listing = behavior.answerFromRecord('What offices are inside this building?', building, [{ ...office, assigned_building: 'Main Building' }]);
    assert.match(listing.reply, /Registrar's Office/);
  });
  it('asks when a room identifier names more than one record', () => {
    const rooms = ['Science', 'Arts'].map((building, i) => ({ id: String(i), type: 'Room', canonical_name: 'Room 203', assigned_building: building }));
    assert.equal(behavior.ambiguousLocations('Where is Room 203?', rooms).length, 2);
  });
});

describe('Campus chat endpoint', () => {
  let originalRetrieve;
  let originalOffice;
  let originalDocuments;
  let queries;
  const app = express();
  app.use(express.json());
  app.use('/chat', router);
  beforeEach(() => {
    queries = [];
    originalOffice = Office.findById;
    Office.findById = () => ({ populate() { return this; }, lean: async () => ({ _id: office.id, name: office.canonical_name, description: office.description, building: { name: 'Main Building' } }) });
    originalRetrieve = RetrievalPipeline.prototype.retrieve;
    originalDocuments = sharedVectorIndexManager.getCanonicalDocuments;
    sharedVectorIndexManager.getCanonicalDocuments = () => [office];
    RetrievalPipeline.prototype.retrieve = async function(query) {
      queries.push(query);
      return { candidateContexts: [office], finalContext: [office] };
    };
  });
  afterEach(() => {
    Office.findById = originalOffice;
    RetrievalPipeline.prototype.retrieve = originalRetrieve;
    sharedVectorIndexManager.getCanonicalDocuments = originalDocuments;
  });
  it('does not retrieve records for a greeting', async () => {
    const response = await request(app).post('/chat').send({ message: 'Hello ALAGAD', language: 'en' });
    assert.equal(response.status, 200);
    assert.equal(response.body.intent, 'greeting');
    assert.equal(queries.length, 0);
  });
  it('returns structured location and schedule answers for a compound request', async () => {
    const response = await request(app).post('/chat').send({ message: 'Where is the Registrar and what time does it close?', language: 'en' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.intents, ['find_location', 'schedule']);
    assert.match(response.body.reply, /Main Building/);
    assert.match(response.body.reply, /couldn't find/);
    assert.equal(response.body.requires_navigation, false);
    assert.match(queries[1], /registrar/i);
  });
});
