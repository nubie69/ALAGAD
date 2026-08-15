const chai = require('chai');
const FAQ = require('../models/FAQ');
const {
  attachFaqEmbedding,
  searchVerifiedFaqs,
} = require('../services/faqSemanticRetrieval');

const { expect } = chai;

const makeQuery = (items) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  lean() {
    return Promise.resolve(items);
  },
});

describe('FAQ Semantic Retrieval', () => {
  const originalFind = FAQ.find;

  afterEach(() => {
    FAQ.find = originalFind;
  });

  it('generates an embedding for the administrator-provided FAQ question', async () => {
    const payload = await attachFaqEmbedding({
      question: 'How can I request a Good Moral Certificate?',
      answer: 'Students may request it through the Office of Student Services.',
    });

    expect(payload.embedding).to.be.an('array').that.is.not.empty;
    expect(payload.embeddingModel).to.be.a('string').that.is.not.empty;
    expect(payload.embeddingUpdatedAt).to.be.instanceOf(Date);
    expect(payload.answer).to.equal('Students may request it through the Office of Student Services.');
  });

  it('includes alternative questions and keywords when generating FAQ embeddings', async () => {
    const primaryOnly = await attachFaqEmbedding({
      question: 'How can I apply for a scholarship?',
      answer: 'Submit the scholarship application to Student Affairs.',
    });
    const enriched = await attachFaqEmbedding({
      question: 'How can I apply for a scholarship?',
      alternativeQuestions: ['Where can I download the scholarship form?'],
      keywords: ['financial aid', 'student assistance'],
      category: 'Scholarships',
      answer: 'Submit the scholarship application to Student Affairs.',
    });

    expect(enriched.embedding).to.be.an('array').that.is.not.empty;
    expect(enriched.embedding).to.not.deep.equal(primaryOnly.embedding);
  });

  it('retrieves a verified active FAQ when the semantic score meets the threshold', async () => {
    const faqPayload = await attachFaqEmbedding({
      _id: 'faq-good-moral',
      question: 'How can I request a Good Moral Certificate?',
      answer: 'Students may request a Good Moral Certificate through the Office of Student Services.',
      verified: true,
      status: 'verified',
      isActive: true,
    });

    FAQ.find = () => makeQuery([faqPayload]);

    const result = await searchVerifiedFaqs('How can I request a Good Moral Certificate?', {
      threshold: 0.9,
      allowAtlasVectorSearch: false,
    });

    expect(result.matched).to.equal(true);
    expect(result.faq.id).to.equal('faq-good-moral');
    expect(result.faq.verifiedAnswer).to.equal('Students may request a Good Moral Certificate through the Office of Student Services.');
  });

  it('does not answer from inactive, unverified, or low-confidence FAQ matches', async () => {
    const activeFaq = await attachFaqEmbedding({
      _id: 'faq-good-moral',
      question: 'How can I request a Good Moral Certificate?',
      answer: 'Students may request it through the Office of Student Services.',
      verified: true,
      status: 'verified',
      isActive: true,
    });
    const inactiveFaq = await attachFaqEmbedding({
      _id: 'faq-inactive',
      question: 'Where is the cashier?',
      answer: 'The cashier is in the Finance Office.',
      verified: true,
      status: 'verified',
      isActive: false,
    });
    const unverifiedFaq = await attachFaqEmbedding({
      _id: 'faq-unverified',
      question: 'What are the tuition fees?',
      answer: 'Unverified answer.',
      verified: false,
      status: 'verified',
      isActive: true,
    });

    FAQ.find = () => makeQuery([activeFaq, inactiveFaq, unverifiedFaq]);

    const result = await searchVerifiedFaqs('What is the weather tomorrow?', {
      threshold: 0.999,
      allowAtlasVectorSearch: false,
    });

    expect(result.matched).to.equal(false);
    expect(result.faq).to.equal(null);
    expect(result.topResults.every((item) => item.verified === true && item.isActive !== false)).to.equal(true);
  });
});
