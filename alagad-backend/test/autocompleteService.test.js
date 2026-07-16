const chai = require('chai');
const {
  buildAutocompleteSuggestions,
  registerSuggestionSelection,
  resetSuggestionSelectionFrequency,
} = require('../services/retrieval/autocompleteService');

const { expect } = chai;

const canonicalDocuments = [
  {
    id: 'office-registrar',
    record_id: 'office-registrar',
    type: 'Office',
    canonical_name: 'Office of the Registrar',
    aliases: 'Registrar Office; Registrar',
    deactivated: false,
  },
  {
    id: 'dept-cs',
    record_id: 'dept-cs',
    type: 'Department',
    canonical_name: 'Computer Science Department',
    aliases: 'CS Department; Comp Sci',
    deactivated: false,
  },
  {
    id: 'svc-tor',
    record_id: 'svc-tor',
    type: 'Service',
    canonical_name: 'Transcript of Records Request',
    aliases: 'TOR; Transcript Request',
    deactivated: false,
  },
  {
    id: 'room-conf',
    record_id: 'room-conf',
    type: 'Room',
    canonical_name: 'Conference Room',
    aliases: 'Meeting Room',
    deactivated: false,
  },
  {
    id: 'svc-exemption',
    record_id: 'svc-exemption',
    type: 'Service',
    canonical_name: 'Exemption Slip',
    aliases: 'Fee Exemption Slip; Exemption Form',
    deactivated: false,
  },
  {
    id: 'svc-id-validation',
    record_id: 'svc-id-validation',
    type: 'Service',
    canonical_name: 'ID Validation Service',
    aliases: 'Validate ID; ID Validation',
    deactivated: false,
  },
  {
    id: 'svc-entrance-exam',
    record_id: 'svc-entrance-exam',
    type: 'Service',
    canonical_name: 'Entrance Examination Service',
    aliases: 'Entrance Exam; Admission Exam',
    deactivated: false,
  },
  {
    id: 'admin-1',
    record_id: 'admin-1',
    type: 'Admin',
    canonical_name: 'System Administrator',
    aliases: 'Admin',
    deactivated: false,
  },
  {
    id: 'user-1',
    record_id: 'user-1',
    type: 'User',
    canonical_name: 'Campus User Profile',
    aliases: 'User',
    deactivated: false,
  },
  {
    id: 'office-deactivated',
    record_id: 'office-deactivated',
    type: 'Office',
    canonical_name: 'Old Registrar Office',
    aliases: 'Legacy Registrar',
    deactivated: true,
  },
];

describe('Autocomplete Service', () => {
  beforeEach(() => {
    resetSuggestionSelectionFrequency();
  });

  it('returns top prefix match for partial query', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'regis',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions).to.have.lengthOf(1);
    expect(suggestions[0].id).to.equal('office-registrar');
  });

  it('returns fuzzy match for typo query', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'regstrar',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].id).to.equal('office-registrar');
  });

  it('handles harder typo queries such as "exemton" for "Exemption Slip"', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'exemton',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].id).to.equal('svc-exemption');
    expect(Number(suggestions[0].similarity_score || 0)).to.be.at.least(85);
  });

  it('normalizes accents so queries like "régistrar" still match', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'régistrar',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].id).to.equal('office-registrar');
  });

  it('returns substring matches when keyword appears in the middle', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'ference',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    const ids = suggestions.map((item) => item.id);
    expect(ids).to.include('room-conf');
  });

  it('excludes admin, user, and deactivated records', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'admin',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    const ids = suggestions.map((item) => item.id);
    expect(ids).to.not.include('admin-1');
    expect(ids).to.not.include('user-1');
    expect(ids).to.not.include('office-deactivated');
  });

  it('boosts frequent selections in ranking', () => {
    registerSuggestionSelection('svc-tor');
    registerSuggestionSelection('svc-tor');
    registerSuggestionSelection('svc-tor');

    const suggestions = buildAutocompleteSuggestions({
      query: 'request',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions[0].id).to.equal('svc-tor');
  });

  it('returns translated category and display name for Tagalog suggestions', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'registrar',
      canonicalDocuments,
      limit: 5,
      language: 'tagalog',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].category_display).to.equal('Opisina');
    expect(suggestions[0].display_name.toLowerCase()).to.include('registrar');
  });

  it('returns append-only completion fields for a partially typed sentence', () => {
    const originalQuery = 'where is regis';
    const suggestions = buildAutocompleteSuggestions({
      originalQuery,
      query: originalQuery,
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    const top = suggestions[0];
    expect(top.id).to.equal('office-registrar');
    expect(top.suggested_query).to.be.a('string').and.not.empty;
    expect(top.append_text).to.be.a('string');
    expect(`${originalQuery}${top.append_text}`).to.equal(top.suggested_query);
    expect(top.template_source).to.equal('where');
  });

  it('filters weak matches using an 85+ similarity threshold and returns only top 1', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'reg',
      canonicalDocuments,
      limit: 10,
      language: 'english',
    });

    expect(suggestions.length).to.be.at.most(1);
    for (const suggestion of suggestions) {
      expect(Number(suggestion.similarity_score || 0)).to.be.at.least(85);
    }
  });

  it('returns no suggestions when no close match reaches threshold', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'zzzzzzzz',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.be.an('array').that.has.lengthOf(0);
  });

  it('returns query completions translated to the user language', () => {
    const suggestions = buildAutocompleteSuggestions({
      originalQuery: 'nasaan ang regis',
      query: 'where is regis',
      canonicalDocuments,
      limit: 5,
      language: 'tagalog',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].language).to.equal('tagalog');
    expect(suggestions[0].suggested_query.toLowerCase()).to.satisfy((value) => (
      value.startsWith('nasaan ang') || value.startsWith('paano kumuha ng') || value.startsWith('sino si')
    ));
  });

  it('matches different word forms by reducing to base terms', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'validating ids',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].id).to.equal('svc-id-validation');
    expect(Number(suggestions[0].similarity_score || 0)).to.be.at.least(85);
  });

  it('matches synonym expansions such as exam to examination', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'entrance exam registration',
      canonicalDocuments,
      limit: 5,
      language: 'english',
    });

    expect(suggestions).to.have.length.greaterThan(0);
    expect(suggestions[0].id).to.equal('svc-entrance-exam');
    expect(Number(suggestions[0].similarity_score || 0)).to.be.at.least(85);
  });
});