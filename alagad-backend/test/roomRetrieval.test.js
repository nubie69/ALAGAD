const assert = require('node:assert/strict');
const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { resolveRequestedRoom } = require('../services/retrieval/roomMatcher');
const { buildIndexPayloadFromRecords } = require('../services/retrieval/documentIndexer');
const behavior = require('../services/retrieval/campusBehavior');
const router = require('../routes/chatbotDeterministicRoutes');

const rooms = [
  { _id: 'room-1', name: 'Computer Laboratory 1 (COMLAB 1)', building: { name: 'Finance Building' } },
  { _id: 'room-10', name: 'Computer Laboratory 10 (COMLAB 10)', building: { name: 'SSL Building' } },
  { _id: 'room-it', name: 'IT-101', building: { name: 'Old COT Building' } },
  { _id: 'room-c2', name: 'C2-202', building: { name: 'Old COT Building' } },
  { _id: 'room-smart', name: 'SMART CLASSROOM', building: { name: 'CPAG Building' } },
].map(room => ({ ...room, department: 'IT', isActive: true, floor: 1 }));

function makePipeline(extraRooms = []) {
  const payload = buildIndexPayloadFromRecords({ rooms: [...rooms, ...extraRooms] });
  const store = {
    clear() {}, upsertMany() {},
    // Deliberately rank COMLAB 10 first for every query and omit other rooms.
    // Exact identity must win even when the desired room is outside vector top K.
    search() {
      const doc = payload.chunkDocuments.find(item => item.metadata.canonical_id === 'room-10');
      return [{ ...doc, metadata: { ...doc.metadata, source_id: 'room-10' }, similarity: 0.99 }];
    },
  };
  const pipeline = new RetrievalPipeline({ indexLoader: async () => payload, vectorStore: store });
  pipeline.embed = async () => [1];
  return pipeline;
}

describe('Requested room retrieval', () => {
  for (const [query, expected] of [
    ['Where is COMLAB 1?', 'room-1'], ['Where is COMLAB 10?', 'room-10'],
    ['Where is comlab1?', 'room-1'], ['Where is Computer Laboratory 1?', 'room-1'],
    ['Asa dapit ang COMLAB 1?', 'room-1'], ['Nasaan ang COMLAB 10?', 'room-10'],
    ['Where is IT-101?', 'room-it'], ['Where is it101?', 'room-it'],
    ['Where is C2-202?', 'room-c2'], ['Where is SMART CLASSROOM?', 'room-smart'],
  ]) {
    it(`matches the stored room for "${query}" despite a wrong high-scoring vector`, async () => {
      const result = await makePipeline().retrieve(query);
      assert.equal(result.retrievalMode, 'exact_room');
      assert.equal(result.finalContext[0].id, expected);
      assert.deepEqual(result.candidateContexts.map(item => item.id), [expected]);
    });
  }
  for (const query of ['Where is COMLAB 4?', 'Where is COMLAB 100?', 'Where is IT-102?', 'Where is Room 999?', 'Where is the banana room?']) {
    it(`does not substitute an existing room for "${query}"`, async () => {
      const result = await makePipeline().retrieve(query);
      assert.equal(result.hasReliableInfo, false);
      assert.deepEqual(result.candidateContexts, []);
    });
  }
  it('uses original room identity when a translated query changes it', async () => {
    const result = await makePipeline().retrieve('where is comlab 10', { originalQuery: 'Asa ang COMLAB 1?' });
    assert.equal(result.finalContext[0].id, 'room-1');
  });
  it('does not treat a department alias as a room name', () => {
    const docs = buildIndexPayloadFromRecords({ rooms }).canonicalDocuments;
    assert.equal(resolveRequestedRoom('Where is IT?', docs).requested, false);
  });
  it('keeps duplicate room identifiers for clarification, narrowed by the requested building', async () => {
    const pipeline = makePipeline([{ ...rooms[0], _id: 'duplicate', building: { name: 'Science Building' } }]);
    const ambiguous = await pipeline.retrieve('Where is COMLAB 1?');
    assert.equal(ambiguous.candidateContexts.length, 2);
    const scoped = await pipeline.retrieve('Where is COMLAB 1 in Science Building?');
    assert.deepEqual(scoped.candidateContexts.map(item => item.id), ['duplicate']);
    const shortBuilding = await pipeline.retrieve('Where is COMLAB 1 in Science?');
    assert.deepEqual(shortBuilding.candidateContexts.map(item => item.id), ['duplicate']);
    const wrongBuilding = await pipeline.retrieve('Where is COMLAB 1 in SSL Building?');
    assert.deepEqual(wrongBuilding.candidateContexts, []);
  });
  it('does not return inactive rooms', async () => {
    const result = await makePipeline([{ ...rooms[0], _id: 'inactive', name: 'COMLAB 4', isActive: false }])
      .retrieve('Where is COMLAB 4?');
    assert.deepEqual(result.candidateContexts, []);
  });
  it('asks for the room number when only a numbered room family is named', async () => {
    const result = await makePipeline().retrieve('Where is COMLAB?');
    assert.equal(result.candidateContexts.length, 2);
  });
  it('does not carry the previous room into a new room-code question', () => {
    for (const message of ['Where is it-101?', 'Where is it101?', 'Where is COMLAB 1?']) {
      assert.equal(behavior.earlyReply(message), null);
      assert.equal(router.__testables.buildConversationAwareQuery({ message,
        conversationContext: { lastEntity: 'COMLAB 10' } }), message);
    }
  });
});
