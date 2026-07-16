const chai = require('chai');
const {
	detectLanguage,
	translateQueryToEnglish,
	translateEnglishResponse,
	STRICT_NO_INFO_RESPONSE,
} = require('../services/retrieval/languageService');

const { expect } = chai;

describe('Language Service', () => {
	it('detects english intent queries', () => {
		const result = detectLanguage('Where is the registrar office?');
		expect(result.language).to.equal('english');
	});

	it('detects tagalog queries', () => {
		const result = detectLanguage('Nasaan ang opisina ng registrar?');
		expect(result.language).to.equal('tagalog');
	});

	it('detects cebuano queries', () => {
		const result = detectLanguage('Asa ang opisina sa registrar?');
		expect(result.language).to.equal('cebuano');
	});

	it('detects cebuano how-to-get phrasing', () => {
		const result = detectLanguage('Unsaon pagkuha sa transcript of records?');
		expect(result.language).to.equal('cebuano');
	});

	it('translates tagalog query terms to english for retrieval matching', async () => {
		const translated = await translateQueryToEnglish({
			query: 'Nasaan ang opisina ng registrar?',
			detectedLanguage: 'tagalog',
			openaiClient: null,
			model: 'gpt-4o',
		});

		expect(translated.targetLanguage).to.equal('english');
		expect(translated.text.toLowerCase()).to.include('where');
		expect(translated.text.toLowerCase()).to.include('office');
	});

	it('translates cebuano unsaon pagkuha phrasing to english how-to-get intent', async () => {
		const translated = await translateQueryToEnglish({
			query: 'Unsaon pagkuha sa Transcript of Records?',
			detectedLanguage: 'cebuano',
			openaiClient: null,
			model: 'gpt-4o',
		});

		expect(translated.targetLanguage).to.equal('english');
		expect(translated.text.toLowerCase()).to.include('how to get');
		expect(translated.text.toLowerCase()).to.include('transcript');
	});

	it('translates tagalog paano makuha phrasing to english how-to-get intent', async () => {
		const translated = await translateQueryToEnglish({
			query: 'Paano makuha ang certificate of enrollment?',
			detectedLanguage: 'tagalog',
			openaiClient: null,
			model: 'gpt-4o',
		});

		expect(translated.targetLanguage).to.equal('english');
		expect(translated.text.toLowerCase()).to.include('how to get');
		expect(translated.text.toLowerCase()).to.include('certificate');
	});

	it('keeps strict no-info response unchanged across languages', async () => {
		const translated = await translateEnglishResponse({
			englishText: STRICT_NO_INFO_RESPONSE,
			targetLanguage: 'cebuano',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.text).to.equal(STRICT_NO_INFO_RESPONSE);
		expect(translated.method).to.equal('fixed_no_info_passthrough');
	});

	it('translates response labels when model translation is unavailable', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'Service: Transcript Request',
			targetLanguage: 'tagalog',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.text).to.equal('Serbisyo: Transcript Request');
		expect(translated.method).to.equal('label_fallback');
	});

	it('keeps english responses fully in english when target language is english', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'To get Transcript Request, you should have these requirements: Valid ID and request form.',
			targetLanguage: 'english',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.text).to.equal('To get Transcript Request, you should have these requirements: Valid ID and request form.');
		expect(translated.method).to.equal('none');
	});

	it('uses taglish template fallback with common word kailangan', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'To get Transcript Request, you should have these requirements: Valid ID and request form.',
			targetLanguage: 'tagalog',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.method).to.equal('template_fallback');
		expect(translated.text.toLowerCase()).to.include('kailangan');
		expect(translated.text).to.include('Transcript Request');
	});

	it('uses cebuano template fallback with common word kinahanglan', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'To get Transcript Request, you should have these requirements: Valid ID and request form.',
			targetLanguage: 'cebuano',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.method).to.equal('template_fallback');
		expect(translated.text.toLowerCase()).to.include('kinahanglan');
		expect(translated.text).to.include('Transcript Request');
	});

	it('uses template fallback process wording with proseso', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'The process for Transcript Request is first, submit requirements; finally, claim document.',
			targetLanguage: 'tagalog',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.method).to.equal('template_fallback');
		expect(translated.text.toLowerCase()).to.include('proseso');
	});

	it('uses taglish template fallback for unit handler intent', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'The unit that handles Transcript Request is Registrar Office.',
			targetLanguage: 'tagalog',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.method).to.equal('template_fallback');
		expect(translated.text.toLowerCase()).to.include('unit');
		expect(translated.text).to.include('Registrar Office');
	});

	it('uses cebuano+english template fallback for unit handler intent', async () => {
		const translated = await translateEnglishResponse({
			englishText: 'The unit that handles Transcript Request is Registrar Office.',
			targetLanguage: 'cebuano',
			openaiClient: null,
			model: 'gpt-4o',
			noInfoText: STRICT_NO_INFO_RESPONSE,
		});

		expect(translated.method).to.equal('template_fallback');
		expect(translated.text.toLowerCase()).to.include('unit');
		expect(translated.text).to.include('Registrar Office');
	});
});
