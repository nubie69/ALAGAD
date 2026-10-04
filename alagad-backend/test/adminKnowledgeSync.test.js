const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const { VectorIndexManager, sharedVectorIndexManager } = require('../services/retrieval/vectorIndexManager');
const Building = require('../models/Building');
const Office = require('../models/Office');
const User = require('../models/User');
const mapRouter = require('../routes/mapRoutes');

const record = (id, name) => ({ id, record_id: id, type: 'Service', canonical_name: name, deactivated: false });
const payload = (...records) => ({
  canonicalDocuments: records,
  chunkDocuments: records.map(doc => ({ id: `${doc.id}:chunk`, content: doc.canonical_name,
    metadata: { record_id: doc.id, type: doc.type, canonical_name: doc.canonical_name } })),
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

describe('Admin knowledge index synchronization', () => {
  const existing = record('existing', 'Transcript of Records');
  const added = record('added', 'New Student Assistance');
  const manager = overrides => new VectorIndexManager({
    loadDatabase: async () => payload(existing, added),
    loadRecord: async () => ({ ...payload(added), recordId: added.id }),
    embedText: async () => [1, 0], saveLastIndexed: async () => {}, ...overrides,
  });

  it('makes an admin addition searchable immediately in a loaded index', async () => {
    const index = manager({ loadDatabase: async () => payload(existing) });
    await index.ensureFreshIndex();
    await index.upsertRecordByType('Service', added.id);
    assert.deepEqual(index.getCanonicalDocuments().map(doc => doc.id), [existing.id, added.id]);
    assert.ok(index.search([1, 0]).some(doc => doc.metadata.record_id === added.id));
  });

  it('loads existing records when the first operation is an admin addition', async () => {
    const index = manager();
    await index.upsertRecordByType('Service', added.id);
    assert.equal(index.state.loadedAt, 0);
    await index.ensureFreshIndex();
    assert.deepEqual(index.getCanonicalDocuments().map(doc => doc.id), [existing.id, added.id]);
  });

  it('does not overwrite a new record when a database refresh is in progress', async () => {
    const started = deferred(); const release = deferred();
    const index = manager({ loadDatabase: async () => {
      started.resolve(); await release.promise; return payload(existing);
    } });
    const refresh = index.ensureFreshIndex();
    await started.promise;
    const update = index.upsertRecordByType('Service', added.id);
    release.resolve();
    await Promise.all([refresh, update]);
    assert.ok(index.getCanonicalDocuments().some(doc => doc.id === added.id));
    assert.ok(index.search([1, 0]).some(doc => doc.metadata.record_id === added.id));
  });

  it('waits for an admin update before serving the next query', async () => {
    const started = deferred(); const release = deferred();
    const index = manager({ loadDatabase: async () => payload(existing), loadRecord: async () => {
      started.resolve(); await release.promise; return { ...payload(added), recordId: added.id };
    } });
    await index.ensureFreshIndex();
    const update = index.upsertRecordByType('Service', added.id);
    await started.promise;
    const query = index.ensureFreshIndex();
    release.resolve();
    await update;
    assert.ok((await query).canonicalDocuments.some(doc => doc.id === added.id));
  });

  it('keeps the previous searchable record after an embedding failure and accepts later updates', async () => {
    let fail = false;
    const index = manager({ loadDatabase: async () => payload(added), embedText: async () => {
      if (fail) throw new Error('Embedding unavailable'); return [1, 0];
    } });
    await index.ensureFreshIndex();
    fail = true;
    await assert.rejects(index.upsertRecordByType('Service', added.id), /Embedding unavailable/);
    assert.ok(index.search([1, 0]).some(doc => doc.metadata.record_id === added.id));
    fail = false;
    assert.equal((await index.upsertRecordByType('Service', added.id)).success, true);
  });

  it('keeps deleted records out of search after a concurrent refresh', async () => {
    const started = deferred(); const release = deferred();
    const index = manager({ loadDatabase: async () => {
      started.resolve(); await release.promise; return payload(added);
    } });
    const refresh = index.ensureFreshIndex();
    await started.promise;
    const removal = index.markRecordDeactivated('Service', added.id);
    release.resolve(); await Promise.all([refresh, removal]);
    assert.equal(index.getCanonicalDocuments().length, 0);
    assert.equal(index.search([1, 0]).length, 0);
  });
});

describe('Admin map changes synchronize chatbot knowledge', () => {
  const app = express(); app.use(express.json()); app.use('/map', mapRouter);
  let originals; let syncCalls; let token;
  beforeEach(() => {
    originals = { secret: process.env.JWT_SECRET, userFind: User.findById,
      upsert: sharedVectorIndexManager.upsertRecordByType, deactivate: sharedVectorIndexManager.markRecordDeactivated,
      building: [Building.create, Building.findByIdAndUpdate, Building.findByIdAndDelete],
      office: [Office.create, Office.findByIdAndUpdate, Office.findByIdAndDelete] };
    process.env.JWT_SECRET = 'admin-map-sync-test';
    token = jwt.sign({ id: 'admin' }, process.env.JWT_SECRET);
    User.findById = () => ({ select: async () => ({ role: 'super_admin', department: 'Campus' }) });
    syncCalls = [];
    sharedVectorIndexManager.upsertRecordByType = async (type, id) => {
      syncCalls.push(['upsert', type, String(id)]); return { success: true };
    };
    sharedVectorIndexManager.markRecordDeactivated = async (type, id) => {
      syncCalls.push(['remove', type, String(id)]); return { success: true };
    };
    for (const model of [Building, Office]) {
      const saved = { _id: 'new-place', name: 'New Campus Place', populate: async () => {} };
      model.create = async () => saved;
      model.findByIdAndUpdate = async () => saved;
      model.findByIdAndDelete = async () => saved;
    }
  });
  afterEach(() => {
    if (originals.secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originals.secret;
    User.findById = originals.userFind;
    sharedVectorIndexManager.upsertRecordByType = originals.upsert;
    sharedVectorIndexManager.markRecordDeactivated = originals.deactivate;
    [Building.create, Building.findByIdAndUpdate, Building.findByIdAndDelete] = originals.building;
    [Office.create, Office.findByIdAndUpdate, Office.findByIdAndDelete] = originals.office;
  });
  for (const type of ['building', 'office']) {
    for (const [method, url, operation] of [
      ['post', '/features/new', 'upsert'], ['post', '/features', 'upsert'],
      ['put', '/features/new-place/pin', 'upsert'], ['delete', '/features/new-place/pin', 'upsert'],
      ['delete', '/features/new-place', 'remove'],
    ]) {
      it(`${method} ${url} updates ${type} knowledge before returning success`, async () => {
        const result = await supertest(app)[method](`/map${url}`).query({ type })
          .set('Authorization', `Bearer ${token}`).send({ type, properties: { id: 'new-place', name: 'New Campus Place' },
            geometry: { type: 'Point', coordinates: [125, 8] } });
        assert.ok(result.status < 300, `${result.status}: ${result.text}`);
        assert.deepEqual(syncCalls, [[operation, type === 'building' ? 'Building' : 'Office', 'new-place']]);
      });
    }
  }
});
