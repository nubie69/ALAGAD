const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const { detectLanguage, translateEnglishResponse, translateSuggestionList, translateQuerySuggestionText } = require('../services/retrieval/languageService');
const { detectRequest } = require('../services/retrieval/intentRequest');
const { answerFromRecord, unknownReply } = require('../services/retrieval/campusBehavior');
const router = require('../routes/chatbotDeterministicRoutes');
const FacultyStaff = require('../models/FacultyStaff');
const { buildConversationAwareQuery, resolveDetectedLanguage } = router.__testables;

describe('Current-query language rules', () => {
  const queries = [
    ['Where is the Registrar?', 'english', 'find_location'],
    ['Saan ang Registrar?', 'tagalog', 'find_location'],
    ['Asa ang Registrar?', 'cebuano', 'find_location'],
    ['How do I get my TOR?', 'english', 'service_process'],
    ['Paano kumuha ng TOR?', 'tagalog', 'service_process'],
    ['Unsaon pagkuha og TOR?', 'cebuano', 'service_process'],
    ['What are the requirements for TOR?', 'english', 'service_requirements'],
    ['Ano ang requirements para sa TOR?', 'tagalog', 'service_requirements'],
    ['Unsa ang requirements para sa TOR?', 'cebuano', 'service_requirements'],
    ['Where can I get my TOR?', 'english', 'service_location'],
    ['Saan ako kukuha ng TOR?', 'tagalog', 'service_location'],
    ['Asa ko makakuha og TOR?', 'cebuano', 'service_location'],
    ['Who is the University Registrar?', 'english', 'position_personnel'],
    ['Sino ang naka-assign bilang University Registrar?', 'tagalog', 'position_personnel'],
    ['Kinsa ang naka-assign nga University Registrar?', 'cebuano', 'position_personnel'],
    ['Saan ko mahahanap si Juan Dela Cruz?', 'tagalog', 'personnel_location'],
    ['Asa nako makita si Juan Dela Cruz?', 'cebuano', 'personnel_location'],
    ['How ko makaadto sa Registrar?', 'cebuano', 'navigation'],
    ['Saan ko makikita yung Registrar office?', 'tagalog', 'find_location'],
  ];
  for (const [query, language, intent] of queries) it(`${language}: ${query}`, () => {
    assert.equal(detectLanguage(query).language, language);
    assert.equal(detectRequest(query).intent, intent);
  });

  for (const [query, language] of [
    ['Ano yung requirements for TOR?', 'tagalog'],
    ['Unsa ang requirements for TOR?', 'cebuano'],
    ['Saan ang Registrar ug unsa akong requirements?', 'cebuano'],
  ]) it(`reports dominant language and mixed style: ${query}`, () => {
    assert.equal(detectLanguage(query).language, language);
    assert.equal(detectLanguage(query).language_style, 'mixed');
  });

  it('ignores stale language hints when the current query has language evidence', () => {
    assert.equal(resolveDetectedLanguage({ hintLanguage: 'cebuano', languageDetection: detectLanguage('What services do they offer?') }), 'english');
    assert.equal(resolveDetectedLanguage({ hintLanguage: 'cebuano', languageDetection: detectLanguage('TOR requirements') }), 'english');
    assert.equal(resolveDetectedLanguage({ hintLanguage: 'english', languageDetection: detectLanguage('Unsaon pag-adto didto?') }), 'cebuano');
  });

  for (const query of ['Unsaon pag-adto didto?', 'Paano pumunta doon?', 'What services do they offer?']) {
    it(`carries the entity into the current follow-up: ${query}`, () => {
      const result = buildConversationAwareQuery({ message: query, conversationContext: { lastEntity: 'University Library', lastIntent: 'find_location' } });
      assert.ok(result.includes('University Library'));
      assert.ok(result.startsWith(query));
    });
  }

  it('preserves official names in localized location replies and suggestions', () => {
    const record = { type: 'Office', canonical_name: "Registrar's Office", location: 'Administration Building', structured: {} };
    assert.equal(answerFromRecord('Saan ang Registrar?', record, [], 'tagalog').reply, "Ang Registrar's Office ay matatagpuan sa Administration Building.");
    assert.equal(answerFromRecord('Asa ang Registrar?', record, [], 'cebuano').reply, "Ang Registrar's Office nahimutang sa Administration Building.");
    assert.equal(translateSuggestionList([record], 'tagalog')[0].display_name, "Registrar's Office");
    assert.equal(translateQuerySuggestionText('where is Office of Student Affairs', 'tagalog'), 'nasaan ang Office of Student Affairs');
  });

  it('keeps all translated steps and shields official names from model translation', async () => {
    const officialName = 'Office of Student Affairs';
    const openaiClient = { chat: { completions: { create: async ({ messages }) => {
      const source = messages[1].content;
      assert.ok(!source.includes(officialName));
      assert.ok(source.includes('__ALAGAD_NAME_0__'));
      return { choices: [{ message: { content: 'Proseso sa __ALAGAD_NAME_0__:\n1. Ipasa ang form.\n2. Bayri ang fee.\n3. Kuhaa ang dokumento.' } }] };
    } } } };
    const result = await translateEnglishResponse({ englishText: `Process at ${officialName}:\n1. Submit the form.\n2. Pay the fee.\n3. Claim the document.`, targetLanguage: 'cebuano', openaiClient, model: 'test', officialNames: [officialName] });
    assert.ok(result.text.includes(officialName));
    assert.ok(result.text.includes('\n3. Kuhaa ang dokumento.'));
    assert.ok(!result.text.includes('__ALAGAD_NAME_'));
  });
});

describe('Language rules at the chat endpoint', () => {
  const app = express(); app.use(express.json()); app.use('/chat', router);
  let original;
  beforeEach(() => {
    original = FacultyStaff.find;
    FacultyStaff.find = () => ({ populate() { return this; }, lean: async () => [{
      _id: 'person1', name: 'Juan Dela Cruz', title: 'University Registrar',
      office: { _id: 'office1', name: "Registrar's Office", building: { name: 'Administration Building' } },
    }] });
  });
  afterEach(() => { FacultyStaff.find = original; });

  it('switches from English to Cebuano and back without changing the assignment intent', async () => {
    let history = [];
    for (const [message, language] of [['Who is the University Registrar?', 'en'], ['Asa nako makita si Juan Dela Cruz?', 'ceb'], ['What is the position of Juan Dela Cruz?', 'en']]) {
      const response = await supertest(app).post('/chat').send({ message, language: 'tl', conversationHistory: history });
      assert.equal(response.status, 200);
      assert.equal(response.body.language, language);
      assert.ok(response.body.reply.includes('Juan Dela Cruz'));
      history.push({ sender: 'user', text: message }, { sender: 'bot', text: response.body.reply, entityName: response.body.entityName, intent: response.body.intent });
    }
  });

  it('uses one current-query language for a compound mixed-language question', async () => {
    const response = await supertest(app).post('/chat').send({ message: 'Kinsa ang University Registrar ug where can I find them?', language: 'en' });
    assert.equal(response.status, 200);
    assert.equal(response.body.language_style, 'mixed');
    assert.ok(response.body.answers.every(answer => answer.language === response.body.language));
    assert.deepEqual(response.body.intents, ['position_personnel', 'personnel_location']);
  });

  it('localizes missing-personnel information without inventing a title holder', async () => {
    for (const [message, language] of [['Sino ang University President?', 'tagalog'], ['Kinsa ang University President?', 'cebuano']]) {
      const response = await supertest(app).post('/chat').send({ message, language: 'en' });
      assert.equal(response.status, 200);
      assert.equal(response.body.reply, unknownReply(language));
      assert.equal(response.body.navigation, false);
    }
  });
});
