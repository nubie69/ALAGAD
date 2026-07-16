const chai = require('chai');
const { RetrievalPipeline } = require('../services/retrieval/pipeline');
const { translateQueryToEnglish } = require('../services/retrieval/languageService');
const { buildIndexPayloadFromRecords } = require('../services/retrieval/documentIndexer');
const {
  recordsByType,
  queryCases,
  multilingualQueryCases,
  edgeCaseQueries,
} = require('./fixtures/retrievalFixture');

const { expect } = chai;

describe('Retrieval Pipeline', () => {
  let pipeline;

  before(() => {
    const indexPayload = buildIndexPayloadFromRecords(recordsByType);
    pipeline = new RetrievalPipeline({
      indexLoader: async () => indexPayload,
    });
  });

  it('returns the expected document id for 20 representative queries', async () => {
    for (const testCase of queryCases) {
      // eslint-disable-next-line no-await-in-loop
      const result = await pipeline.retrieve(testCase.query);
      expect(result.hasReliableInfo, `Expected reliable info for query: ${testCase.query}`).to.equal(true);
      expect(result.finalContext[0].id, `Unexpected top id for query: ${testCase.query}`).to.equal(testCase.expectedId);
    }
  });

  it('returns no reliable info when query is out-of-domain', async () => {
    const result = await pipeline.retrieve('what is the weather in tokyo today');
    expect(result.hasReliableInfo).to.equal(false);
    expect(result.finalContext).to.have.length(0);
  });

  it('selects the final answer from the highest-similarity candidate', async () => {
    const customVectorStore = {
      docs: [],
      clear() {
        this.docs = [];
      },
      upsertMany(items) {
        this.docs = Array.isArray(items) ? items : [];
      },
      search() {
        return this.docs
          .map((doc) => {
            const sourceId = String(doc?.metadata?.source_id || doc?.metadata?.canonical_id || '');
            const similarity = sourceId === 'doc-a' ? 0.92 : 0.86;
            return {
              ...doc,
              similarity,
            };
          })
          .sort((a, b) => b.similarity - a.similarity);
      },
    };

    const customPipeline = new RetrievalPipeline({
      vectorStore: customVectorStore,
      indexLoader: async () => ({
        canonicalDocuments: [
          {
            id: 'doc-a',
            record_id: 'doc-a',
            type: 'Office',
            canonical_name: 'Admissions Office',
            aliases: 'Admissions',
            location: 'Administration Building',
            last_updated: new Date().toISOString(),
            source: 'offices',
            content: 'Office: Admissions Office. Location: Administration Building.',
          },
          {
            id: 'doc-b',
            record_id: 'doc-b',
            type: 'Office',
            canonical_name: 'Office of the Registrar',
            aliases: 'Registrar Office; Registrar',
            location: 'Administration Building',
            last_updated: new Date().toISOString(),
            source: 'offices',
            content: 'Office: Office of the Registrar. Location: Administration Building.',
          },
        ],
        chunkDocuments: [
          {
            id: 'doc-a:0',
            canonical_id: 'doc-a',
            chunk_index: 0,
            content: 'Office: Admissions Office. Location: Administration Building.',
            metadata: {
              id: 'doc-a:0',
              canonical_id: 'doc-a',
              record_id: 'doc-a',
              type: 'Office',
              canonical_name: 'Admissions Office',
              aliases: 'Admissions',
              location: 'Administration Building',
              last_updated: new Date().toISOString(),
              source: 'offices',
            },
          },
          {
            id: 'doc-b:0',
            canonical_id: 'doc-b',
            chunk_index: 0,
            content: 'Office: Office of the Registrar. Location: Administration Building.',
            metadata: {
              id: 'doc-b:0',
              canonical_id: 'doc-b',
              record_id: 'doc-b',
              type: 'Office',
              canonical_name: 'Office of the Registrar',
              aliases: 'Registrar Office; Registrar',
              location: 'Administration Building',
              last_updated: new Date().toISOString(),
              source: 'offices',
            },
          },
        ],
      }),
      useSharedIndex: false,
    });

    const result = await customPipeline.retrieve('where is registrar office');

    expect(result.hasReliableInfo).to.equal(true);
    expect(result.finalContext).to.have.length(1);
    expect(result.finalContext[0].id).to.equal('doc-a');
    expect(result.finalContext[0].similarity).to.equal(0.92);
  });

  it('retrieves the same service for synonym variants like exam and registration', async () => {
    const customVectorStore = {
      docs: [],
      clear() {
        this.docs = [];
      },
      upsertMany(items) {
        this.docs = Array.isArray(items) ? items : [];
      },
      search() {
        return [];
      },
    };

    const customPipeline = new RetrievalPipeline({
      vectorStore: customVectorStore,
      indexLoader: async () => ({
        canonicalDocuments: [
          {
            id: 'svc-entrance-exam',
            record_id: 'svc-entrance-exam',
            type: 'Service',
            canonical_name: 'Entrance Examination Registration',
            aliases: 'Entrance Exam Registration; Exam Registration',
            location: 'Registrar Office',
            last_updated: new Date().toISOString(),
            source: 'services',
            content: 'Service: Entrance Examination Registration. Office: Registrar Office.',
          },
        ],
        chunkDocuments: [
          {
            id: 'svc-entrance-exam:0',
            canonical_id: 'svc-entrance-exam',
            chunk_index: 0,
            content: 'Service: Entrance Examination Registration. Office: Registrar Office.',
            metadata: {
              id: 'svc-entrance-exam:0',
              canonical_id: 'svc-entrance-exam',
              record_id: 'svc-entrance-exam',
              type: 'Service',
              canonical_name: 'Entrance Examination Registration',
              aliases: 'Entrance Exam Registration; Exam Registration',
              location: 'Registrar Office',
              last_updated: new Date().toISOString(),
              source: 'services',
            },
          },
        ],
      }),
      useSharedIndex: false,
    });

    const result = await customPipeline.retrieve('How do I register for entrance exam?');

    expect(result.hasReliableInfo).to.equal(true);
    expect(result.retrievalMode).to.equal('exact_fallback');
    expect(result.finalContext).to.have.length(1);
    expect(result.finalContext[0].id).to.equal('svc-entrance-exam');
  });

  it('keeps service-only filtering for unit-handles phrasing', async () => {
    const customVectorStore = {
      docs: [],
      clear() {
        this.docs = [];
      },
      upsertMany(items) {
        this.docs = Array.isArray(items) ? items : [];
      },
      search(_embedding, options = {}) {
        const filterSet = new Set(options.typeFilters || []);
        return this.docs
          .filter((doc) => {
            if (filterSet.size === 0) return true;
            return filterSet.has(doc?.metadata?.type);
          })
          .map((doc) => ({
            ...doc,
            similarity: String(doc?.metadata?.source_id || '').includes('service') ? 0.9 : 0.91,
          }))
          .sort((a, b) => b.similarity - a.similarity);
      },
    };

    const customPipeline = new RetrievalPipeline({
      vectorStore: customVectorStore,
      indexLoader: async () => ({
        canonicalDocuments: [
          {
            id: 'service-entrance-exam',
            record_id: 'service-entrance-exam',
            type: 'Service',
            canonical_name: 'Entrance Examination',
            aliases: 'Entrance Exam; Admission Exam',
            location: 'Admission and Testing Unit (ATU)',
            last_updated: new Date().toISOString(),
            source: 'services',
            content: 'Service: Entrance Examination. Office: Admission and Testing Unit (ATU).',
          },
          {
            id: 'office-atu',
            record_id: 'office-atu',
            type: 'Office',
            canonical_name: 'Admission and Testing Unit (ATU)',
            aliases: 'ATU; Testing Unit',
            location: 'Administration Building',
            last_updated: new Date().toISOString(),
            source: 'offices',
            content: 'Office: Admission and Testing Unit (ATU).',
          },
        ],
        chunkDocuments: [
          {
            id: 'service-entrance-exam:0',
            canonical_id: 'service-entrance-exam',
            chunk_index: 0,
            content: 'Service: Entrance Examination. Office: Admission and Testing Unit (ATU).',
            metadata: {
              id: 'service-entrance-exam:0',
              canonical_id: 'service-entrance-exam',
              record_id: 'service-entrance-exam',
              type: 'Service',
              canonical_name: 'Entrance Examination',
              aliases: 'Entrance Exam; Admission Exam',
              location: 'Admission and Testing Unit (ATU)',
              last_updated: new Date().toISOString(),
              source: 'services',
            },
          },
          {
            id: 'office-atu:0',
            canonical_id: 'office-atu',
            chunk_index: 0,
            content: 'Office: Admission and Testing Unit (ATU).',
            metadata: {
              id: 'office-atu:0',
              canonical_id: 'office-atu',
              record_id: 'office-atu',
              type: 'Office',
              canonical_name: 'Admission and Testing Unit (ATU)',
              aliases: 'ATU; Testing Unit',
              location: 'Administration Building',
              last_updated: new Date().toISOString(),
              source: 'offices',
            },
          },
        ],
      }),
      useSharedIndex: false,
    });

    const result = await customPipeline.retrieve('what unit handles entrance exam');

    expect(result.intent).to.equal('service');
    expect(result.typeFilters).to.deep.equal(['Service']);
    expect(result.finalContext).to.have.length(1);
    expect(result.finalContext[0].type).to.equal('Service');
  });

  it('returns no reliable info when only inactive records match the query', async () => {
    const inactiveRecords = {
      buildings: [],
      departments: [],
      offices: [
        {
          _id: 'office-old-registrar',
          name: 'Old Registrar Office',
          department: 'Registrar',
          description: 'Legacy registrar office, no longer active.',
          contactInfo: 'legacy-registrar@campus.edu',
          building: { name: 'Old Administration Building' },
          room: { name: 'Room 001' },
          floor: 1,
          isActive: false,
          updatedAt: new Date().toISOString(),
        },
      ],
      rooms: [],
      personnel: [],
      services: [],
    };

    const indexPayload = buildIndexPayloadFromRecords(inactiveRecords);
    const inactiveOnlyPipeline = new RetrievalPipeline({
      indexLoader: async () => indexPayload,
      useSharedIndex: false,
    });

    const result = await inactiveOnlyPipeline.retrieve('where is old registrar office');

    expect(result.hasReliableInfo).to.equal(false);
    expect(result.finalContext).to.have.length(0);
    expect(result.retrievalMode).to.equal('no_reliable_info');
  });

  it('prefers the most up-to-date record when similarity scores tie', async () => {
    const now = Date.now();
    const olderIso = new Date(now - (1000 * 60 * 60 * 24 * 30)).toISOString();
    const newerIso = new Date(now).toISOString();

    const customVectorStore = {
      docs: [],
      clear() {
        this.docs = [];
      },
      upsertMany(items) {
        this.docs = Array.isArray(items) ? items : [];
      },
      search() {
        return this.docs
          .map((doc) => ({
            ...doc,
            similarity: 0.9,
          }))
          .sort((a, b) => b.similarity - a.similarity);
      },
    };

    const customPipeline = new RetrievalPipeline({
      vectorStore: customVectorStore,
      indexLoader: async () => ({
        canonicalDocuments: [
          {
            id: 'person-old',
            record_id: 'person-old',
            type: 'Personnel',
            canonical_name: 'Dr. Old Head',
            role_title: 'Department Head',
            aliases: 'it head; old it head',
            location: 'IT Office, Main Building',
            last_updated: olderIso,
            source: 'faculty_staff',
            content: 'Personnel: Dr. Old Head. Role/Title: Department Head. Department: IT.',
          },
          {
            id: 'person-new',
            record_id: 'person-new',
            type: 'Personnel',
            canonical_name: 'Dr. Sales Aribe',
            role_title: 'Department Head',
            aliases: 'it head; sales aribe',
            location: 'IT Office, Main Building',
            last_updated: newerIso,
            source: 'faculty_staff',
            content: 'Personnel: Dr. Sales Aribe. Role/Title: Department Head. Department: IT.',
          },
        ],
        chunkDocuments: [
          {
            id: 'person-old:0',
            canonical_id: 'person-old',
            chunk_index: 0,
            content: 'Personnel: Dr. Old Head. Role/Title: Department Head. Department: IT.',
            metadata: {
              id: 'person-old:0',
              canonical_id: 'person-old',
              record_id: 'person-old',
              type: 'Personnel',
              canonical_name: 'Dr. Old Head',
              aliases: 'it head; old it head',
              location: 'IT Office, Main Building',
              last_updated: olderIso,
              source: 'faculty_staff',
            },
          },
          {
            id: 'person-new:0',
            canonical_id: 'person-new',
            chunk_index: 0,
            content: 'Personnel: Dr. Sales Aribe. Role/Title: Department Head. Department: IT.',
            metadata: {
              id: 'person-new:0',
              canonical_id: 'person-new',
              record_id: 'person-new',
              type: 'Personnel',
              canonical_name: 'Dr. Sales Aribe',
              aliases: 'it head; sales aribe',
              location: 'IT Office, Main Building',
              last_updated: newerIso,
              source: 'faculty_staff',
            },
          },
        ],
      }),
      useSharedIndex: false,
    });

    const result = await customPipeline.retrieve('who is the head of it');

    expect(result.hasReliableInfo).to.equal(true);
    expect(result.finalContext).to.have.length(1);
    expect(result.finalContext[0].id).to.equal('person-new');
    expect(result.finalContext[0].canonical_name).to.equal('Dr. Sales Aribe');
  });

  it('supports multilingual retrieval dataset after query translation to english', async () => {
    for (const testCase of multilingualQueryCases) {
      // eslint-disable-next-line no-await-in-loop
      const translated = await translateQueryToEnglish({
        query: testCase.query,
        detectedLanguage: testCase.language,
        openaiClient: null,
        model: 'gpt-4o',
      });

      // eslint-disable-next-line no-await-in-loop
      const result = await pipeline.retrieve(translated.text);
      expect(result.hasReliableInfo, `Expected reliable info for query: ${testCase.query}`).to.equal(true);
      expect(result.finalContext[0].id, `Unexpected top id for query: ${testCase.query}`).to.equal(testCase.expectedId);
    }
  });

  it('handles typo-heavy queries through vector plus exact fallback', async () => {
    for (const testCase of edgeCaseQueries.typos) {
      // eslint-disable-next-line no-await-in-loop
      const result = await pipeline.retrieve(testCase.query);
      expect(result.hasReliableInfo, `Expected reliable info for typo query: ${testCase.query}`).to.equal(true);
      expect(result.finalContext[0].id, `Unexpected top id for typo query: ${testCase.query}`).to.equal(testCase.expectedId);
    }
  });

  it('keeps vague queries in a service-related retrieval category for downstream clarification', async () => {
    for (const testCase of edgeCaseQueries.vague) {
      // eslint-disable-next-line no-await-in-loop
      const result = await pipeline.retrieve(testCase.query);
      expect(['Service', 'Process', 'Requirements']).to.include(
        result.retrievalCategory,
        `Unexpected retrieval category for vague query: ${testCase.query}`
      );
      expect(result.categoryFilters.length).to.be.greaterThan(0);
    }
  });

  it('applies fallback category filters even when type filters are empty', async () => {
    const customVectorStore = {
      docs: [],
      clear() {
        this.docs = [];
      },
      upsertMany(items) {
        this.docs = Array.isArray(items) ? items : [];
      },
      search(_embedding, options = {}) {
        const categoryFilterSet = new Set((options.categoryFilters || []).map((item) => String(item || '').toLowerCase()));
        const hasCategoryFilter = categoryFilterSet.size > 0;

        return this.docs
          .filter((doc) => {
            if (!hasCategoryFilter) return true;
            const tags = String(doc?.metadata?.category_tags || '')
              .split(';')
              .map((tag) => String(tag || '').trim().toLowerCase())
              .filter(Boolean);
            return tags.some((tag) => categoryFilterSet.has(tag));
          })
          .map((doc) => ({
            ...doc,
            similarity: String(doc?.metadata?.source_id || '').includes('service') ? 0.89 : 0.97,
          }))
          .sort((a, b) => b.similarity - a.similarity);
      },
    };

    const customPipeline = new RetrievalPipeline({
      vectorStore: customVectorStore,
      indexLoader: async () => ({
        canonicalDocuments: [
          {
            id: 'service-issuance',
            record_id: 'service-issuance',
            type: 'Service',
            canonical_name: 'Document Issuance',
            aliases: 'Issuance',
            category_tags: 'service;requirements;process;location;description',
            location: 'Registrar Office',
            last_updated: new Date().toISOString(),
            source: 'services',
            content: 'Service: Document Issuance. Requirements and process are handled by Registrar Office.',
          },
          {
            id: 'office-issuance',
            record_id: 'office-issuance',
            type: 'Office',
            canonical_name: 'Issuance Office',
            aliases: 'Issuance',
            category_tags: 'location',
            location: 'Admin Building',
            last_updated: new Date().toISOString(),
            source: 'offices',
            content: 'Office: Issuance Office. Location: Admin Building.',
          },
        ],
        chunkDocuments: [
          {
            id: 'service-issuance:0',
            canonical_id: 'service-issuance',
            chunk_index: 0,
            content: 'Service: Document Issuance. Requirements and process are handled by Registrar Office.',
            metadata: {
              id: 'service-issuance:0',
              canonical_id: 'service-issuance',
              record_id: 'service-issuance',
              type: 'Service',
              canonical_name: 'Document Issuance',
              aliases: 'Issuance',
              category_tags: 'service;requirements;process;location;description',
              location: 'Registrar Office',
              last_updated: new Date().toISOString(),
              source: 'services',
            },
          },
          {
            id: 'office-issuance:0',
            canonical_id: 'office-issuance',
            chunk_index: 0,
            content: 'Office: Issuance Office. Location: Admin Building.',
            metadata: {
              id: 'office-issuance:0',
              canonical_id: 'office-issuance',
              record_id: 'office-issuance',
              type: 'Office',
              canonical_name: 'Issuance Office',
              aliases: 'Issuance',
              category_tags: 'location',
              location: 'Admin Building',
              last_updated: new Date().toISOString(),
              source: 'offices',
            },
          },
        ],
      }),
      useSharedIndex: false,
    });

    const result = await customPipeline.retrieve('issuance');

    expect(result.typeFilters).to.deep.equal([]);
    expect(result.categoryFilters).to.deep.equal(['description']);
    expect(result.finalContext).to.have.length(1);
    expect(result.finalContext[0].id).to.equal('service-issuance');
  });
});
