const assert = require('assert');
const { sanitizeResourceUrl, isSafeResourceUrl } = require('../utils/resourceUrl');

describe('Resource URL validation', () => {
  it('allows HTTP and HTTPS resource URLs', () => {
    assert.strictEqual(sanitizeResourceUrl(' https://example.edu.ph/forms/a.pdf '), 'https://example.edu.ph/forms/a.pdf');
    assert.strictEqual(isSafeResourceUrl('http://example.edu.ph/form'), true);
  });

  it('rejects executable or local URL schemes', () => {
    assert.strictEqual(isSafeResourceUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeResourceUrl('data:text/html;base64,abc'), false);
    assert.strictEqual(isSafeResourceUrl('file:///C:/secret.pdf'), false);
  });

  it('rejects invalid URL text', () => {
    assert.strictEqual(isSafeResourceUrl('not a url'), false);
  });
});
