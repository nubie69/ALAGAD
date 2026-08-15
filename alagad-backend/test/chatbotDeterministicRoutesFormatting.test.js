const chai = require('chai');
const chatbotDeterministicRoutes = require('../routes/chatbotDeterministicRoutes');

const { expect } = chai;
const {
	inferIntentFromQuery,
	applyResponseEmphasis,
	buildServiceIntentAnswer,
	buildPersonnelWhoWhereAnswer,
	buildEntityWhereAnswer,
	resolveConversationContext,
	buildConversationAwareQuery,
	buildClarificationQuestion,
	isTooVagueServiceQuery,
	hasExactServiceMatchInQuery,
	hasRecentClarificationPrompt,
	decideServiceClarification,
	isLikelyFollowUpQuery,
	deriveQueryIntentSignal,
	resolveDetectedLanguage,
	appendLocalizedDetail,
	rankContextCandidatesByIntentAndLanguage,
	evaluateInformationCompleteness,
	detectRequestedInfoFields,
	buildPartialVerifiedServiceAnswer,
	prioritizeVerifiedFaqCandidates,
	detectConflictingInformation,
	buildVerificationNotice,
	buildSourceAwareAnswer,
	buildLocalizedReferralText,
	buildReferralOfficeLabel,
	computeTokenSimilarity,
	computeFuzzyTokenOverlapRatio,
	RESPONSE_TYPES,
	NO_RELIABLE_INFO_RESPONSE,
} = chatbotDeterministicRoutes.__testables;

describe('Chatbot Deterministic Response Formatting', () => {
	it('prioritizes where intent for location phrasing even with personnel words', () => {
		const intent = inferIntentFromQuery('Where can I find the dean of engineering?', { type: 'Personnel' });
		expect(intent).to.equal('where');
	});

	it('formats who personnel response with exact head-of template', () => {
		const answer = buildPersonnelWhoWhereAnswer({
			type: 'Personnel',
			canonical_name: 'Dr. Jane Doe',
			structured: {
				name: 'Dr. Jane Doe',
				department: 'Engineering Department',
			},
		}, 'who');

		expect(answer).to.equal('Dr. Jane Doe is the head of Engineering Department.');
	});

	it('formats where personnel response with office or department and building', () => {
		const answer = buildPersonnelWhoWhereAnswer({
			type: 'Personnel',
			canonical_name: 'Dr. Jane Doe',
			structured: {
				name: 'Dr. Jane Doe',
				office_name: 'Registrar Office',
				building_name: 'Administration Building',
			},
		}, 'where');

		expect(answer).to.equal('Dr. Jane Doe can be found at Registrar Office, Administration Building.');
	});

	it('normalizes personnel name casing and IT head unit phrasing', () => {
		const answer = buildPersonnelWhoWhereAnswer({
			type: 'Personnel',
			canonical_name: 'dr. sales aribe',
			structured: {
				name: 'dr. sales aribe',
				department: 'the IT',
			},
		}, 'who');

		expect(answer).to.equal('Dr. Sales Aribe is the head of IT.');
	});

	it('returns strict no-info when where personnel response has incomplete location data', () => {
		const answer = buildPersonnelWhoWhereAnswer({
			type: 'Personnel',
			canonical_name: 'Dr. Jane Doe',
			structured: {
				name: 'Dr. Jane Doe',
				office_name: 'Registrar Office',
			},
		}, 'where');

		expect(answer).to.equal(NO_RELIABLE_INFO_RESPONSE);
	});

	it('formats service requirements responses in exact sentence form', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				requirements: ['Valid ID', 'Request form'],
			},
		}, 'requirements');

		expect(answer).to.equal('To get Transcript of Records, you should have these requirements: Valid ID and Request form.');
	});

	it('formats service process responses with exact process sentence', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				details: 'Request and release of transcript',
				process_steps: ['Submit requirements', 'Pay the fee', 'Claim document'],
			},
		}, 'process');

		expect(answer).to.equal('The process for Transcript of Records is first, submit requirements; next, pay the fee; finally, claim document.');
		expect(answer).to.not.match(/step\s*\d+/i);
		expect(answer).to.not.include('Request and release of transcript');
	});

	it('formats service description responses with exact sentence form', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				details: 'Request and release of transcript',
			},
		}, 'description');

		expect(answer).to.equal('Transcript of Records is Request and release of transcript.');
	});

	it('formats where-to-process responses with office or department and building', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				office_name: 'Registrar Office',
				building_name: 'Administration Building',
			},
		}, 'where_process');

		expect(answer).to.equal('Transcript of Records can be processed at Registrar Office, Administration Building.');
	});

	it('uses assigned building metadata for where-to-process when structured building is unavailable', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			assigned_building: 'Administration Building',
			floor_location: '2',
			structured: {
				name: 'Transcript of Records',
				office_name: 'Registrar Office',
			},
		}, 'where_process');

		expect(answer).to.equal('Transcript of Records can be processed at Registrar Office, Administration Building, Floor 2.');
	});

	it('formats non-personnel where responses using entity and building', () => {
		const answer = buildEntityWhereAnswer({
			type: 'Room',
			canonical_name: 'Room 301',
			location: 'Science Building',
		});

		expect(answer).to.equal('Room 301 can be found at Science Building.');
	});

	it('uses assigned building metadata for non-service where queries', () => {
		const answer = buildEntityWhereAnswer({
			type: 'Office',
			canonical_name: 'Admissions Office',
			assigned_building: 'Main Building',
			floor_location: 'Ground Floor',
			location: 'Admissions Office',
		});

		expect(answer).to.equal('Admissions Office can be found at Main Building, Ground Floor.');
	});

	it('uses client-facing process steps and skips metadata lines', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Entrance Examination Application',
			structured: {
				name: 'Entrance Examination Application',
				process_steps: [
					'STEP 1:',
					'CLIENT STEPS: Fill out the online form',
					'AGENCY ACTION: Verify records',
					'STEP 2:',
					'CLIENT STEPS: Submit requirements',
				],
			},
		}, 'process');

		expect(answer).to.equal('The process for Entrance Examination Application is first, fill out the online form; finally, submit requirements.');
		expect(answer).to.not.match(/step\s*\d+/i);
		expect(answer).to.not.include('AGENCY ACTION');
		expect(answer).to.not.include('STEP 1');
	});

	it('cleans service description by removing metadata tail text', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				details: 'This service issues official transcripts. Office or Division: Registrar Office. Classification: Complex',
			},
		}, 'description');

		expect(answer).to.equal('Transcript of Records is This service issues official transcripts.');
		expect(answer).to.not.include('Office or Division');
	});

	it('cleans requirement bullets and markers for readability', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				requirements: ['- Valid ID', 'a. Request form'],
			},
		}, 'requirements');

		expect(answer).to.equal('To get Transcript of Records, you should have these requirements: Valid ID and Request form.');
	});

	it('returns strict no-info for missing service data in requirements/process/description/where-to-process', () => {
		const requirements = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: { name: 'Transcript of Records', requirements: [] },
		}, 'requirements');

		const process = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: { name: 'Transcript of Records', process_steps: [] },
		}, 'process');

		const description = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: { name: 'Transcript of Records', details: '' },
		}, 'description');

		const whereProcess = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: { name: 'Transcript of Records', office_name: 'Registrar Office' },
		}, 'where_process');

		expect(requirements).to.equal(NO_RELIABLE_INFO_RESPONSE);
		expect(process).to.equal(NO_RELIABLE_INFO_RESPONSE);
		expect(description).to.equal(NO_RELIABLE_INFO_RESPONSE);
		expect(whereProcess).to.equal(NO_RELIABLE_INFO_RESPONSE);
	});

	it('detects deadline and processing-time fields without allowing estimates', () => {
		const deadlineFields = detectRequestedInfoFields(
			'How do I renew my scholarship and when is the deadline?',
			'deadline'
		);
		const processingFields = detectRequestedInfoFields(
			'How long does scholarship renewal take?',
			'processing_time'
		);

		expect(deadlineFields).to.include('deadline');
		expect(deadlineFields).to.include('process_steps');
		expect(processingFields).to.include('processing_time');
	});

	it('marks a process answer partially verified when a requested deadline is missing', () => {
		const completeness = evaluateInformationCompleteness({
			contextItem: {
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				is_active: true,
				verification_status: 'verified',
				structured: {
					name: 'Scholarship Renewal',
					process_steps: ['Submit the renewal form'],
				},
			},
			intent: 'deadline',
			confidenceScore: 1,
			requestedFields: ['name', 'process_steps', 'deadline'],
		});

		expect(completeness.sufficient).to.equal(false);
		expect(completeness.verificationStatus).to.equal('partial');
		expect(completeness.missingFields).to.deep.equal(['deadline']);
	});

	it('builds a partial verified answer with Help Desk referral instead of guessing', () => {
		const answer = buildPartialVerifiedServiceAnswer({
			contextItem: {
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				structured: {
					name: 'Scholarship Renewal',
					process_steps: ['Submit the renewal form'],
				},
			},
			requestedFields: ['name', 'process_steps', 'deadline'],
			missingFields: ['deadline'],
		});

		expect(answer).to.include('ALAGAD can verify');
		expect(answer).to.include('Scholarship Renewal');
		expect(answer).to.include('deadline');
		expect(answer).to.include('Help Desk');
		expect(answer).to.not.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/);
	});

	it('classifies service-specific intents from query text', () => {
		const requirementsIntent = inferIntentFromQuery('What are the requirements for transcript of records?', { type: 'Service' });
		const processIntent = inferIntentFromQuery('What is the process for transcript request?', { type: 'Service' });
		const descriptionIntent = inferIntentFromQuery('What is transcript of records?', { type: 'Service' });
		const whereProcessIntent = inferIntentFromQuery('Where can I process transcript of records?', { type: 'Service' });
		const unitHandlerIntent = inferIntentFromQuery('What unit handles entrance exam?', { type: 'Service' });

		expect(requirementsIntent).to.equal('requirements');
		expect(processIntent).to.equal('process');
		expect(descriptionIntent).to.equal('description');
		expect(whereProcessIntent).to.equal('where_process');
		expect(unitHandlerIntent).to.equal('unit_handler');
	});

	it('formats service unit handler responses with exact unit name', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Entrance Examination',
			structured: {
				name: 'Entrance Examination',
				office_name: 'Admission and Testing Unit (ATU)',
				building_name: 'Administration Building',
			},
		}, 'unit_handler');

		expect(answer).to.equal('The unit that handles Entrance Examination is Admission and Testing Unit (ATU).');
	});

	it('applies strict overlap priority with process over requirements and location', () => {
		const intent = inferIntentFromQuery(
			'Where can I process and what are the requirements for transcript request?',
			{ type: 'Service' }
		);

		expect(intent).to.equal('process');
	});

	it('treats step by step wording as process intent', () => {
		const intent = inferIntentFromQuery('Step by step for transcript request', { type: 'Service' });
		expect(intent).to.equal('process');
	});

	it('uses visible conversation context for follow-up clarifications', () => {
		const context = resolveConversationContext([
			{ sender: 'user', text: 'Who is the IT head?' },
			{ sender: 'bot', text: 'Dr. Sales Aribe is the head of IT.', intent: 'who' },
		]);

		const query = buildConversationAwareQuery({
			message: 'Where can I find him?',
			conversationContext: context,
		});

		expect(isLikelyFollowUpQuery('Where can I find him?')).to.equal(true);
		expect(query).to.include('Dr. Sales Aribe');
		expect(query.toLowerCase()).to.include('where');
	});

	it('returns clarification prompts in the detected user language', () => {
		const tagalog = buildClarificationQuestion('tagalog', ['Registrar Office', 'Admissions Office']);
		const cebuano = buildClarificationQuestion('cebuano', ['Registrar Office', 'Admissions Office']);
		const english = buildClarificationQuestion('english', ['Registrar Office', 'Admissions Office']);

		expect(tagalog.toLowerCase()).to.include('ibig mong sabihin');
		expect(cebuano.toLowerCase()).to.include('pasabot ba nimo');
		expect(english.toLowerCase()).to.include('do you mean');
	});

	it('resolves language to tagalog for code-mixed current queries when tagalog markers are present', () => {
		const language = resolveDetectedLanguage({
			hintLanguage: 'tagalog',
			languageDetection: {
				language: 'english',
				reason: 'majority_score',
				scores: { english: 2, tagalog: 1, cebuano: 0 },
			},
		});

		expect(language).to.equal('tagalog');
	});

	it('resolves language to cebuano for code-mixed current queries when cebuano markers are present', () => {
		const language = resolveDetectedLanguage({
			hintLanguage: 'cebuano',
			languageDetection: {
				language: 'english',
				reason: 'majority_score',
				scores: { english: 3, tagalog: 0, cebuano: 1 },
			},
		});

		expect(language).to.equal('cebuano');
	});

	it('keeps english when local-language hint has no marker support', () => {
		const language = resolveDetectedLanguage({
			hintLanguage: 'tagalog',
			languageDetection: {
				language: 'english',
				reason: 'majority_score',
				scores: { english: 4, tagalog: 0, cebuano: 0 },
			},
		});

		expect(language).to.equal('english');
	});

	it('detects vague service queries that should require clarification', () => {
		expect(isTooVagueServiceQuery('How to apply?')).to.equal(true);
		expect(isTooVagueServiceQuery('What are the requirements for entrance exam application?')).to.equal(false);
	});

	it('never asks clarification when query already matches service name or alias', () => {
		const exact = hasExactServiceMatchInQuery('What are the requirements for Entrance Exam?', [
			{
				canonical_name: 'Entrance Examination Application',
				aliases: 'Entrance Exam; Admission Exam',
			},
		]);

		expect(exact).to.equal(true);
	});

	it('asks only once for service clarification and not again on immediate follow-up', () => {
		const firstDecision = decideServiceClarification({
			queryIntentSignal: 'service',
			message: 'How to apply?',
			retrievalQuery: 'how to apply',
			rankedContextCandidates: [
				{ id: 'svc-a', type: 'Service', canonical_name: 'Entrance Examination Application', aliases: 'Entrance Exam Application', similarity: 0.9, adjusted_score: 1.01, is_active: true },
				{ id: 'svc-b', type: 'Service', canonical_name: 'Entrance Examination Conduct', aliases: 'Entrance Exam Conduct', similarity: 0.899, adjusted_score: 1.0, is_active: true },
			],
			conversationHistory: [],
		});

		const secondDecision = decideServiceClarification({
			queryIntentSignal: 'service',
			message: 'Application',
			retrievalQuery: 'application',
			rankedContextCandidates: [
				{ id: 'svc-a', type: 'Service', canonical_name: 'Entrance Examination Application', aliases: 'Entrance Exam Application', similarity: 0.9, adjusted_score: 1.01, is_active: true },
				{ id: 'svc-b', type: 'Service', canonical_name: 'Entrance Examination Conduct', aliases: 'Entrance Exam Conduct', similarity: 0.899, adjusted_score: 1.0, is_active: true },
			],
			conversationHistory: [
				{ sender: 'bot', intent: 'clarification', text: 'Do you mean A or B?' },
			],
		});

		expect(firstDecision.shouldAsk).to.equal(true);
		expect(secondDecision.shouldAsk).to.equal(false);
		expect(secondDecision.reason).to.equal('already_asked_once');
	});

	it('tracks whether the most recent bot turn is a clarification prompt', () => {
		const asked = hasRecentClarificationPrompt([
			{ sender: 'user', intent: '', text: 'How to apply?' },
			{ sender: 'bot', intent: 'clarification', text: 'Do you mean A or B?' },
		]);

		const notAsked = hasRecentClarificationPrompt([
			{ sender: 'bot', intent: 'where_process', text: 'Service can be processed at Registrar Office.' },
		]);

		expect(asked).to.equal(true);
		expect(notAsked).to.equal(false);
	});

	it('derives strict query intent signals using overlap priority', () => {
		expect(deriveQueryIntentSignal('What unit handles entrance exam?')).to.equal('unit_handler');
		expect(deriveQueryIntentSignal('Where can I process transcript request?')).to.equal('process');
		expect(deriveQueryIntentSignal('What are the requirements for transcript request?')).to.equal('requirements');
		expect(deriveQueryIntentSignal('Who is the IT head?')).to.equal('who');
	});

	it('selects the closest candidate by intent and language when matches are close', () => {
		const ranked = rankContextCandidatesByIntentAndLanguage({
			candidates: [
				{
					id: 'person-1',
					type: 'Personnel',
					canonical_name: 'Dr. Sales Aribe',
					aliases: 'IT head; Information Technology head',
					description: '',
					location: 'IT Office, COT Building',
					content: 'Dr. Sales Aribe is the head of IT',
					similarity: 0.86,
					is_active: true,
				},
				{
					id: 'service-1',
					type: 'Service',
					canonical_name: 'IT Support Service',
					aliases: 'IT assistance; support unit',
					description: 'Handles IT requests',
					location: 'IT Office, COT Building',
					content: 'Service for IT support',
					similarity: 0.87,
					is_active: true,
				},
			],
			message: 'Kinsa ang IT head?',
			retrievalQuery: 'who is the IT head',
			targetLanguage: 'cebuano',
		});

		expect(ranked).to.have.length.greaterThan(1);
		expect(ranked[0].id).to.equal('person-1');
	});

	it('adds subtle emphasis for service and office names in final response text', () => {
		const emphasized = applyResponseEmphasis(
			'Transcript of Records can be processed at Registrar Office, Administration Building.',
			{
				type: 'Service',
				canonical_name: 'Transcript of Records',
				department_name: 'Registrar',
				structured: {
					name: 'Transcript of Records',
					office_name: 'Registrar Office',
				},
			}
		);

		expect(emphasized).to.include('**Transcript of Records**');
		expect(emphasized).to.include('**Registrar Office**');
	});

	it('adds subtle emphasis for office entity names in location answers', () => {
		const emphasized = applyResponseEmphasis(
			'Admissions Office can be found at Administration Building.',
			{
				type: 'Office',
				canonical_name: 'Admissions Office',
			}
		);

		expect(emphasized).to.include('**Admissions Office**');
	});

	it('adds detailed localized hints for service responses to improve clarity', () => {
		const detailed = appendLocalizedDetail({
			text: 'Transcript of Records is Issuance of official transcript.',
			intent: 'description',
			targetLanguage: 'english',
			contextItem: {
				type: 'Service',
				canonical_name: 'Transcript of Records',
				assigned_building: 'Administration Building',
				floor_location: '2',
				structured: {
					name: 'Transcript of Records',
					office_name: 'Registrar Office',
					requirements: ['Valid ID', 'Request form'],
					contact: 'registrar@campus.edu',
				},
			},
		});

		expect(detailed).to.include('You can process this at Registrar Office, Administration Building, Floor 2.');
		expect(detailed).to.include('Common requirements include Valid ID and Request form.');
	});

	it('adds cebuano detail hints in cebuano responses', () => {
		const detailed = appendLocalizedDetail({
			text: 'Transcript of Records is issuance sa official transcript.',
			intent: 'description',
			targetLanguage: 'cebuano',
			contextItem: {
				type: 'Service',
				canonical_name: 'Transcript of Records',
				assigned_building: 'Administration Building',
				structured: {
					name: 'Transcript of Records',
					office_name: 'Registrar Office',
				},
			},
		});

		expect(detailed.toLowerCase()).to.include('mahimo kini i-process sa registrar office');
	});

	it('requires verified service requirements before answering requirement questions', () => {
		const complete = evaluateInformationCompleteness({
			contextItem: {
				type: 'Service',
				canonical_name: 'Transcript of Records',
				verification_status: 'verified',
				structured: {
					name: 'Transcript of Records',
					requirements: ['Valid ID'],
				},
			},
			intent: 'requirements',
			confidenceScore: 0.91,
		});

		const missing = evaluateInformationCompleteness({
			contextItem: {
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				verification_status: 'verified',
				structured: {
					name: 'Scholarship Renewal',
					requirements: [],
				},
			},
			intent: 'requirements',
			confidenceScore: 0.91,
		});

		expect(complete.sufficient).to.equal(true);
		expect(missing.sufficient).to.equal(false);
		expect(missing.missingFields).to.include('requirements');
	});

	it('rejects records that are explicitly not verified', () => {
		const result = evaluateInformationCompleteness({
			contextItem: {
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				verification_status: 'outdated',
				structured: {
					name: 'Scholarship Renewal',
					requirements: ['Application form'],
				},
			},
			intent: 'requirements',
			confidenceScore: 0.98,
		});

		expect(result.sufficient).to.equal(false);
		expect(result.reason).to.equal('record_not_verified');
	});

	it('rejects expired verified records instead of answering stale knowledge', () => {
		const result = evaluateInformationCompleteness({
			contextItem: {
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				verification_status: 'verified',
				status: 'verified',
				expiration_date: new Date(Date.now() - 86400000).toISOString(),
				structured: {
					name: 'Scholarship Renewal',
					requirements: ['Application form'],
				},
			},
			intent: 'requirements',
			confidenceScore: 0.98,
		});

		expect(result.sufficient).to.equal(false);
		expect(result.reason).to.equal('record_not_verified');
	});

	it('rejects service answers from the wrong responsible office', () => {
		const result = evaluateInformationCompleteness({
			contextItem: {
				type: 'Service',
				canonical_name: 'Transcript of Records',
				source_office: 'Registrar Office',
				verification_status: 'verified',
				structured: {
					name: 'Transcript of Records',
					requirements: ['Valid ID'],
				},
			},
			intent: 'requirements',
			confidenceScore: 0.98,
			responsibleOffice: 'Scholarship Office',
		});

		expect(result.sufficient).to.equal(false);
		expect(result.reason).to.equal('responsible_office_not_supported');
	});

	it('adds responsible office attribution to verified FAQ and service answers', () => {
		const answer = buildSourceAwareAnswer('Submit the renewal form.', {
			type: 'FAQ',
			source_office: 'Scholarship Office',
		});

		expect(answer).to.equal('According to verified information from Scholarship Office, submit the renewal form.');
	});

	it('detects conflicting locations for otherwise matching records', () => {
		const conflict = detectConflictingInformation([
			{
				id: 'office-a',
				type: 'Office',
				canonical_name: 'Registrar Office',
				location: 'Administration Building, 1st Floor',
				is_active: true,
			},
			{
				id: 'office-b',
				type: 'Office',
				canonical_name: 'Registrar Office',
				location: 'Administration Building, 2nd Floor',
				is_active: true,
			},
		]);

		expect(conflict.hasConflict).to.equal(true);
		expect(conflict.field).to.equal('location');
	});

	it('detects conflicting deadlines for otherwise matching services', () => {
		const conflict = detectConflictingInformation([
			{
				id: 'service-a',
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				deadline: 'September 15',
				is_active: true,
			},
			{
				id: 'service-b',
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				deadline: 'September 30',
				is_active: true,
			},
		]);

		expect(conflict.hasConflict).to.equal(true);
		expect(conflict.field).to.equal('deadline');
	});

	it('shows verification notices for administrative service answers only', () => {
		const notice = buildVerificationNotice({ type: 'Service' }, 'requirements');
		const noNotice = buildVerificationNotice({ type: 'Building' }, 'where');

		expect(RESPONSE_TYPES.VERIFIED_ANSWER).to.equal('VERIFIED_ANSWER');
		expect(notice.title).to.equal('Information Notice');
		expect(noNotice).to.equal(null);
	});

	it('answers service contact questions only from verified contact data', () => {
		const answer = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
				contact: 'registrar@campus.edu',
			},
		}, 'contact');

		const missing = buildServiceIntentAnswer({
			type: 'Service',
			canonical_name: 'Transcript of Records',
			structured: {
				name: 'Transcript of Records',
			},
		}, 'contact');

		expect(answer).to.equal('For Transcript of Records, you may contact registrar@campus.edu.');
		expect(missing).to.equal(NO_RELIABLE_INFO_RESPONSE);
	});

	it('prioritizes a verified FAQ when its score is close to the top candidate', () => {
		const ranked = prioritizeVerifiedFaqCandidates([
			{
				id: 'service-scholarship',
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				verification_status: 'verified',
				adjusted_score: 0.92,
				is_active: true,
			},
			{
				id: 'faq-scholarship',
				type: 'FAQ',
				canonical_name: 'What are the scholarship renewal requirements?',
				verification_status: 'verified',
				adjusted_score: 0.90,
				is_active: true,
			},
		]);

		expect(ranked[0].id).to.equal('faq-scholarship');
	});

	it('does not prioritize unverified FAQ candidates', () => {
		const ranked = prioritizeVerifiedFaqCandidates([
			{
				id: 'service-scholarship',
				type: 'Service',
				canonical_name: 'Scholarship Renewal',
				verification_status: 'verified',
				adjusted_score: 0.92,
				is_active: true,
			},
			{
				id: 'faq-scholarship',
				type: 'FAQ',
				canonical_name: 'What are the scholarship renewal requirements?',
				verification_status: 'unverified',
				adjusted_score: 0.91,
				is_active: true,
			},
		]);

		expect(ranked[0].id).to.equal('service-scholarship');
	});

	it('matches misspelled keywords with fuzzy token similarity', () => {
		expect(computeTokenSimilarity('registrar', 'regstrar')).to.be.greaterThan(0.72);
		expect(computeFuzzyTokenOverlapRatio('where is regstrar office', 'Registrar Office Administration Building')).to.be.greaterThan(0.75);
	});

	it('boosts the closest candidate even when the query contains typos', () => {
		const ranked = rankContextCandidatesByIntentAndLanguage({
			candidates: [
				{
					id: 'office-registrar',
					type: 'Office',
					canonical_name: 'Registrar Office',
					aliases: 'register office',
					location: 'Administration Building',
					description: 'Handles registrar concerns',
					content: 'Registrar Office Administration Building',
					similarity: 0.64,
					is_active: true,
				},
				{
					id: 'office-cashier',
					type: 'Office',
					canonical_name: 'Cashier Office',
					aliases: 'finance office',
					location: 'Finance Building',
					description: 'Handles payments',
					content: 'Cashier Office Finance Building',
					similarity: 0.66,
					is_active: true,
				},
			],
			message: 'Where is regstrar office?',
			retrievalQuery: 'where is regstrar office',
			targetLanguage: 'english',
		});

		expect(ranked[0].id).to.equal('office-registrar');
		expect(ranked[0].adjusted_score).to.be.greaterThan(ranked[1].adjusted_score);
	});

	it('builds department-specific help desk referral wording when an office is known', () => {
		expect(buildReferralOfficeLabel('Registrar Office')).to.equal('Registrar Office help desk');
		expect(buildLocalizedReferralText('english', 'Registrar Office')).to.include('Registrar Office help desk');
		expect(buildLocalizedReferralText('english', 'Registrar Office')).to.include('contact or go to');
	});

	it('falls back to a generic department help desk referral when no office is known', () => {
		const referral = buildLocalizedReferralText('english');
		expect(referral).to.include('specific department help desk');
		expect(referral).to.include('contact or go to');
	});
});
