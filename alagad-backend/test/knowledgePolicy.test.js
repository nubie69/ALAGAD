const chai = require('chai');
const {
  isCurrentVerifiedKnowledge,
  detectResponsibleOfficeFromQuery,
  sourceOfficeMatches,
  resolveResponsibleOffice,
} = require('../services/retrieval/knowledgePolicy');

const { expect } = chai;

describe('Stakeholder Knowledge Policy', () => {
  it('accepts only active, verified, non-expired knowledge as authoritative', () => {
    expect(isCurrentVerifiedKnowledge({
      is_active: true,
      verification_status: 'verified',
      status: 'verified',
      expiration_date: new Date(Date.now() + 86400000).toISOString(),
    })).to.equal(true);

    expect(isCurrentVerifiedKnowledge({
      is_active: true,
      verification_status: 'pending_verification',
      status: 'pending_verification',
    })).to.equal(false);

    expect(isCurrentVerifiedKnowledge({
      is_active: true,
      verification_status: 'verified',
      status: 'verified',
      expiration_date: new Date(Date.now() - 86400000).toISOString(),
    })).to.equal(false);

    expect(isCurrentVerifiedKnowledge({
      is_active: true,
      verification_status: 'verified',
      status: 'archived',
    })).to.equal(false);
  });

  it('detects the responsible office from existing indexed office/source metadata', () => {
    const detected = detectResponsibleOfficeFromQuery('What are the scholarship renewal requirements from scholarship office?', [
      { type: 'Office', canonical_name: 'Scholarship Office', source_office: 'Scholarship Office' },
      { type: 'Office', canonical_name: 'Registrar Office', source_office: 'Registrar Office' },
    ]);

    expect(detected).to.equal('Scholarship Office');
  });

  it('matches records to the responsible office without exposing database ids', () => {
    const item = {
      source_office: 'Office of the Registrar',
      canonical_name: 'Transcript of Records',
    };

    expect(resolveResponsibleOffice(item)).to.equal('Office of the Registrar');
    expect(sourceOfficeMatches(item, 'Registrar')).to.equal(true);
    expect(sourceOfficeMatches(item, 'Scholarship Office')).to.equal(false);
  });
});
