const chai = require('chai');
const {
	normalizeQuery,
	classifyIntent,
	classifyRetrievalCategory,
	inferIntentTypeFilters,
	inferTypeFilters,
	inferCategoryFilters,
} = require('../services/retrieval/queryNormalizer');

const { expect } = chai;

describe('Query Normalizer', () => {
	it('normalizes by trimming, lowercasing, and removing accents', () => {
		const result = normalizeQuery('   RéGístrár   Officé   ');

		expect(result.normalizedRaw).to.equal('registrar office');
		expect(result.normalized).to.equal('registrar office');
	});

	it('maps where intent to location type filters', () => {
		const intent = classifyIntent('Where is the registrar office?');
		const filters = inferIntentTypeFilters(intent);

		expect(intent).to.equal('where');
		expect(filters).to.deep.equal(['Office', 'Department', 'Building', 'Room', 'Personnel']);
	});

	it('maps who intent to personnel filter', () => {
		const intent = classifyIntent('Who is the dean of engineering?');
		const filters = inferIntentTypeFilters(intent);

		expect(intent).to.equal('who');
		expect(filters).to.deep.equal(['Personnel']);
	});

	it('maps how/what/requirements phrasing to service filter', () => {
		const examples = [
			'How do I get transcript of records?',
			'What are the requirements for ID renewal?',
			'Requirements for certificate of enrollment',
			'Where to process transcript of records?',
			'What unit handles Entrance Exam?',
		];

		for (const query of examples) {
			const intent = classifyIntent(query);
			const filters = inferIntentTypeFilters(intent);
			expect(intent, `Unexpected intent for query: ${query}`).to.equal('service');
			expect(filters, `Unexpected filters for query: ${query}`).to.deep.equal(['Service']);
		}
	});

	it('prioritizes process intent over location and personnel overlap', () => {
		const intent = classifyIntent('Where and who can help me with the process for transcript request?');
		expect(intent).to.equal('service');
	});

	it('maps step-by-step phrasing to service intent', () => {
		const intent = classifyIntent('Step by step process for certificate request');
		expect(intent).to.equal('service');
	});

	it('infers explicit type filters from query synonyms', () => {
		const filters = inferTypeFilters('find bldg and room for cs dept');

		expect(filters).to.include('Building');
		expect(filters).to.include('Room');
		expect(filters).to.include('Department');
	});

	it('treats unit as both department and office synonym based on context', () => {
		const filters = inferTypeFilters('where is the it unit');

		expect(filters).to.include('Department');
		expect(filters).to.include('Office');
	});

	it('reduces different word forms to base forms for matching', () => {
		const result = normalizeQuery('   ID validation requirements   ');

		expect(result.normalized).to.include('id');
		expect(result.normalized).to.include('validate');
		expect(result.normalized).to.include('requirement');
		expect(result.normalized).to.not.include('validation');
		expect(result.normalized).to.not.include('requirements');
	});

	it('expands synonyms such as exam/examination and register/registration', () => {
		const result = normalizeQuery('How do I register for entrance exam?');
		const tokens = result.normalized.split(' ').filter(Boolean);

		expect(tokens).to.include('register');
		expect(tokens).to.include('entrance');
		expect(tokens).to.include('examination');
		expect(tokens).to.not.include('exam');
	});

	it('classifies retrieval category as requirements for requirements questions', () => {
		const category = classifyRetrievalCategory('What are the requirements for ID renewal?');
		const filters = inferCategoryFilters(category);

		expect(category).to.equal('Requirements');
		expect(filters).to.deep.equal(['requirements']);
	});

	it('classifies retrieval category as process for process questions', () => {
		const category = classifyRetrievalCategory('What is the process for transcript request?');
		const filters = inferCategoryFilters(category);

		expect(category).to.equal('Process');
		expect(filters).to.deep.equal(['process']);
	});

	it('classifies retrieval category as personnel for who questions', () => {
		const category = classifyRetrievalCategory('Who is the dean of engineering?');
		const filters = inferCategoryFilters(category);

		expect(category).to.equal('Personnel');
		expect(filters).to.deep.equal(['personnel']);
	});

	it('classifies retrieval category as location for where questions', () => {
		const category = classifyRetrievalCategory('Where is the registrar office?');
		const filters = inferCategoryFilters(category);

		expect(category).to.equal('Location');
		expect(filters).to.deep.equal(['location']);
	});
});
