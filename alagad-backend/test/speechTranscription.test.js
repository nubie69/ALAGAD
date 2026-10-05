const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { transcribeAudio, buildKeyterms } = require('../services/speechTranscription');
const { createSpeechRouter } = require('../routes/speechRoutes');

describe('Speech provider contract (mocked responses, not recognition accuracy)', () => {
  for (const [language, text] of [
    ['ceb', 'Asa dapit ang registrar?'], ['tl', 'Saan matatagpuan ang registrar?'],
    ['en', 'Where is the registrar’s office?'], ['auto', 'Unsa ang requirements para sa enrollment?'],
  ]) {
    it(`preserves ${language} text and uses documented language configuration`, async () => {
      let sent;
      const result = await transcribeAudio({ buffer: Buffer.from('mock audio'), mimeType: 'audio/webm',
        language, keyterms: ['Registrar', 'BukSU'], apiKey: 'test-key', fetchImpl: async (url, options) => {
          sent = options;
          assert.equal(url, 'https://api.elevenlabs.io/v1/speech-to-text');
          return { ok: true, json: async () => ({ text, language_code: language,
            words: [{ type: 'word', text }] }) };
        } });
      assert.equal(result.text, text);
      assert.equal(sent.headers['xi-api-key'], 'test-key');
      assert.equal(sent.body.get('model_id'), 'scribe_v2');
      assert.equal(sent.body.get('language_code'), ({ ceb: 'ceb', tl: 'fil', en: 'eng' })[language] || null);
      assert.equal(sent.body.get('no_verbatim'), 'false');
      assert.equal(sent.body.get('tag_audio_events'), 'false');
      assert.equal(sent.body.get('transcript_edit'), null);
      assert.deepEqual(sent.body.getAll('keyterms'), ['Registrar', 'BukSU']);
    });
  }
  it('defaults to detection from audio when no language is supplied', async () => {
    await transcribeAudio({ buffer: Buffer.from('mock'), mimeType: 'audio/mp4', apiKey: 'test',
      fetchImpl: async (_, options) => {
        assert.equal(options.body.get('language_code'), null);
        return { ok: true, json: async () => ({ text: 'Asa ang registrar?', language_code: 'ceb', words: [{ type: 'word', text: 'Asa' }] }) };
      } });
  });
  it('uses only valid stored names and aliases as hints', () => {
    assert.deepEqual(buildKeyterms([{ name: 'Registrar', aliases: ['TOR', 'Registrar'] },
      { name: 'Office with too many words to include', aliases: ['<invalid>'] },
      { name: 'Dr. Juan Dela Cruz' }]), ['Registrar', 'TOR', 'Dr. Juan Dela Cruz']);
  });
  for (const result of [{ text: '', words: [] }, { text: ' ', words: [] },
    { text: '(noise)', words: [{ type: 'audio_event', text: '(noise)' }] }, { text: 'unexpected', words: [] }]) {
    it('rejects empty or event-only responses', async () => {
      await assert.rejects(transcribeAudio({ buffer: Buffer.from('mock'), mimeType: 'audio/webm', apiKey: 'test',
        fetchImpl: async () => ({ ok: true, json: async () => result }) }), error => error.code === 'NO_SPEECH');
    });
  }
  it('reports network failure without fallback transcription', async () => {
    await assert.rejects(transcribeAudio({ buffer: Buffer.from('mock'), apiKey: 'test',
      fetchImpl: async () => { throw new Error('Connection failed'); } }), error => error.code === 'NETWORK');
  });
  for (const [status, code] of [[401, 'SERVICE_UNAVAILABLE'], [429, 'BUSY'], [500, 'SERVICE_ERROR']]) {
    it(`handles provider status ${status}`, async () => {
      await assert.rejects(transcribeAudio({ buffer: Buffer.from('mock'), apiKey: 'test',
        fetchImpl: async () => ({ ok: false, status }) }), error => error.code === code);
    });
  }
  it('rejects unsupported language values before calling the provider', async () => {
    await assert.rejects(transcribeAudio({ buffer: Buffer.from('mock'), apiKey: 'test', language: 'unknown' }),
      error => error.code === 'INVALID_LANGUAGE');
  });
});

describe('Voice upload endpoint', () => {
  const appFor = options => {
    const app = express(); app.use('/speech', createSpeechRouter({ isConfigured: () => true,
      vocabulary: async () => ['Registrar'], ...options })); return app;
  };
  it('exposes auto capability without credentials', async () => {
    const response = await request(appFor()).get('/speech/config');
    assert.equal(response.body.autoDetection, true);
    assert.deepEqual(response.body.languages, ['en', 'tl', 'ceb']);
    assert.equal(response.body.apiKey, undefined);
  });
  it('defaults the uploaded recording to automatic language detection', async () => {
    const response = await request(appFor({ transcribe: async options => {
      assert.equal(options.language, 'auto'); assert.deepEqual(options.keyterms, ['Registrar']);
      return { text: 'Unsa ang requirements para sa enrollment?', detectedLanguage: 'ceb' };
    } })).post('/speech/transcribe')
      .attach('audio', Buffer.from('mock'), { filename: 'recording.webm', contentType: 'audio/webm' });
    assert.equal(response.status, 200);
    assert.equal(response.body.text, 'Unsa ang requirements para sa enrollment?');
  });
  it('rejects missing audio, unsupported files and oversized recordings', async () => {
    const app = appFor();
    assert.equal((await request(app).post('/speech/transcribe')).status, 400);
    assert.equal((await request(app).post('/speech/transcribe')
      .attach('audio', Buffer.from('bad'), { filename: 'file.txt', contentType: 'text/plain' })).status, 400);
    assert.equal((await request(app).post('/speech/transcribe')
      .attach('audio', Buffer.alloc(6 * 1024 * 1024 + 1), { filename: 'a.webm', contentType: 'audio/webm' })).status, 400);
  });
  it('reports missing backend configuration', async () => {
    const response = await request(appFor({ isConfigured: () => false })).post('/speech/transcribe');
    assert.equal(response.status, 503); assert.equal(response.body.code, 'NOT_CONFIGURED');
  });
  it('continues without hints when vocabulary is unavailable', async () => {
    const response = await request(appFor({ vocabulary: async () => { throw new Error('Unavailable'); },
      transcribe: async options => { assert.deepEqual(options.keyterms, []); return { text: 'Where is the registrar?' }; },
    })).post('/speech/transcribe').attach('audio', Buffer.from('mock'), { filename: 'a.mp4', contentType: 'audio/mp4' });
    assert.equal(response.status, 200);
  });
});
