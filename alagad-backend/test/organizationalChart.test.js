const { expect } = require('chai');
const { validateOrganizationalChart } = require('../utils/organizationalChart');

describe('Organizational chart upload validation', () => {
  it('accepts PNG, JPEG, and PDF data files and stamps the update date', () => {
    [
      ['image/png', 'chart.png'],
      ['image/jpeg', 'chart.jpg'],
      ['application/pdf', 'chart.pdf'],
    ].forEach(([mimeType, fileName]) => {
      const result = validateOrganizationalChart({
        data: `data:${mimeType};base64,Y2hhcnQ=`,
        fileName,
        mimeType,
      });

      expect(result.mimeType).to.equal(mimeType);
      expect(result.fileName).to.equal(fileName);
      expect(result.updatedAt).to.be.instanceOf(Date);
    });
  });

  it('rejects unsupported file types', () => {
    expect(() => validateOrganizationalChart({
      data: 'data:image/gif;base64,Y2hhcnQ=',
      fileName: 'chart.gif',
      mimeType: 'image/gif',
    })).to.throw('Only PNG, JPG/JPEG, and PDF');
  });

  it('rejects files over 5 MB', () => {
    const oversized = Buffer.alloc((5 * 1024 * 1024) + 1).toString('base64');
    expect(() => validateOrganizationalChart({
      data: `data:image/png;base64,${oversized}`,
      fileName: 'large.png',
      mimeType: 'image/png',
    })).to.throw('5 MB or smaller');
  });
});
