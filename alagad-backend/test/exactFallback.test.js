const chai = require('chai');
const { exactMatchFallback } = require('../services/retrieval/exactFallback');

const { expect } = chai;

describe('Exact Fallback', () => {
  const canonicalDocuments = [
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
      id: 'office-registrar',
      record_id: 'office-registrar',
      type: 'Office',
      canonical_name: 'Office of the Registrar',
      aliases: 'Registrar Office; Registrar',
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
  ];

  it('returns typo-tolerant close match for retrieval fallback', () => {
    const result = exactMatchFallback({
      normalizedQuery: 'exemton',
      canonicalDocuments,
      typeFilters: ['Service'],
    });

    expect(result.matches).to.have.length.greaterThan(0);
    expect(result.matches[0].id || result.matches[0].record_id).to.equal('svc-exemption');
  });

  it('returns no matches when no close candidate exists', () => {
    const result = exactMatchFallback({
      normalizedQuery: 'zzzzzz',
      canonicalDocuments,
      typeFilters: ['Service'],
    });

    expect(result.matches).to.be.an('array').that.has.lengthOf(0);
  });

  it('normalizes accents in fallback matching', () => {
    const result = exactMatchFallback({
      normalizedQuery: 'régistrar',
      canonicalDocuments,
      typeFilters: ['Office'],
    });

    expect(result.matches).to.have.length.greaterThan(0);
    expect(result.matches[0].id || result.matches[0].record_id).to.equal('office-registrar');
  });

  it('matches different word forms through stem/lemma normalization', () => {
    const result = exactMatchFallback({
      normalizedQuery: 'validating ids',
      canonicalDocuments,
      typeFilters: ['Service'],
    });

    expect(result.matches).to.have.length.greaterThan(0);
    expect(result.matches[0].id || result.matches[0].record_id).to.equal('svc-id-validation');
  });

  it('matches synonym expansions such as exam to examination', () => {
    const result = exactMatchFallback({
      normalizedQuery: 'entrance exam registration',
      canonicalDocuments,
      typeFilters: ['Service'],
    });

    expect(result.matches).to.have.length.greaterThan(0);
    expect(result.matches[0].id || result.matches[0].record_id).to.equal('svc-entrance-exam');
  });
});
