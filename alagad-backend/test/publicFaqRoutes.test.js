const chai = require('chai');
const request = require('supertest');
const express = require('express');
const FAQ = require('../models/FAQ');
const publicFaqRoutes = require('../routes/publicFaqRoutes');

const { expect } = chai;

const makeQuery = (items) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  lean() {
    return Promise.resolve(items);
  },
});

describe('Public FAQ Routes', () => {
  const originalFind = FAQ.find;
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/public/faqs', publicFaqRoutes);
  });

  afterEach(() => {
    FAQ.find = originalFind;
  });

  it('returns only safe public FAQ fields', async () => {
    FAQ.find = () => makeQuery([
      {
        _id: 'faq-1',
        question: 'How can I request a Good Moral Certificate?',
        answer: 'Request it through the Office of Student Services.',
        category: 'Student Affairs',
        keywords: ['good moral'],
        alternativeQuestions: ['Where do I request good moral?'],
        embedding: [0.1, 0.2],
        verifiedBy: 'Admin',
        source: 'Internal note',
        relatedFaqs: [
          {
            _id: 'faq-related',
            question: 'What are the Good Moral Certificate requirements?',
            category: 'Student Affairs',
            verified: true,
            status: 'published',
            isActive: true,
          },
          {
            _id: 'faq-draft',
            question: 'Draft related question',
            verified: true,
            status: 'draft',
            isActive: true,
          },
        ],
        resources: [
          {
            _id: 'resource-1',
            title: 'Good Moral Request Form',
            description: 'Official request form.',
            type: 'FORM',
            url: 'https://example.edu.ph/forms/good-moral.pdf',
            verified: true,
            isActive: true,
          },
          {
            _id: 'resource-2',
            title: 'Unsafe Link',
            type: 'FORM',
            url: 'javascript:alert(1)',
            verified: true,
            isActive: true,
          },
        ],
        office: {
          _id: 'office-1',
          name: 'Office of Student Services',
          floor: 2,
          building: {
            _id: 'building-1',
            name: 'Student Center',
            geometry: { type: 'Point', coordinates: [125.12, 8.15] },
          },
        },
        department: {
          _id: 'department-1',
          name: 'Student Affairs',
          code: 'SA',
        },
      },
    ]);

    const response = await request(app).get('/api/public/faqs').expect(200);

    expect(response.body).to.have.length(1);
    expect(response.body[0]).to.deep.include({
      id: 'faq-1',
      name: 'How can I request a Good Moral Certificate?',
      verifiedAnswer: 'Request it through the Office of Student Services.',
    });
    expect(response.body[0]).to.not.have.property('embedding');
    expect(response.body[0]).to.not.have.property('verifiedBy');
    expect(response.body[0]).to.not.have.property('source');
    expect(response.body[0].office.name).to.equal('Office of Student Services');
    expect(response.body[0].department.name).to.equal('Student Affairs');
    expect(response.body[0].category).to.equal('Student Affairs');
    expect(response.body[0].keywords).to.deep.equal(['good moral']);
    expect(response.body[0].alternativeQuestions).to.deep.equal(['Where do I request good moral?']);
    expect(response.body[0].relatedFaqs).to.have.length(1);
    expect(response.body[0].relatedFaqs[0].question).to.equal('What are the Good Moral Certificate requirements?');
    expect(response.body[0].downloadableResources).to.have.length(1);
    expect(response.body[0].downloadableResources[0].url).to.equal('https://example.edu.ph/forms/good-moral.pdf');
  });

  it('returns an empty downloadable resource list when no safe verified resources exist', async () => {
    FAQ.find = () => makeQuery([
      {
        _id: 'faq-2',
        question: 'How do I enroll?',
        answer: 'Proceed through the official enrollment process.',
        relatedFaqs: [],
        resources: [],
        downloadableResources: [],
      },
    ]);

    const response = await request(app).get('/api/public/faqs').expect(200);

    expect(response.body[0].downloadableResources).to.deep.equal([]);
    expect(response.body[0].resources).to.deep.equal([]);
  });
});
