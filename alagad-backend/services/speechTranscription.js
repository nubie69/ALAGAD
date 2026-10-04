const LANGUAGE_CODES = Object.freeze({ en: 'eng', tl: 'fil', ceb: 'ceb' });
const MODEL = 'scribe_v2';

function speechError(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status });
}

function buildKeyterms(records) {
  const terms = records.flatMap(record => [record.name, record.canonical_name,
    ...(Array.isArray(record.aliases) ? record.aliases : String(record.aliases || '').split(';')),
    ...(Array.isArray(record.aliasKeywords) ? record.aliasKeywords : [])]);
  const unique = new Map();
  for (const value of terms) {
    const term = typeof value === 'string' ? value.trim() : '';
    if (!term || term.length >= 50 || term.split(/\s+/).length > 5 || /[<>{}\[\]\\]/.test(term)) continue;
    unique.set(term.toLowerCase(), term);
  }
  return [...unique.values()].slice(0, 100);
}

async function transcribeAudio({ buffer, mimeType, language = 'auto', keyterms = [], signal,
  apiKey = process.env.ELEVENLABS_API_KEY, fetchImpl = fetch }) {
  if (!apiKey) throw speechError('NOT_CONFIGURED', 'Voice input is not configured. You can type your question instead.', 503);
  if (language !== 'auto' && !LANGUAGE_CODES[language]) {
    throw speechError('INVALID_LANGUAGE', 'Choose Auto, English, Tagalog, or Cebuano.', 400);
  }
  if (!buffer?.length) throw speechError('NO_AUDIO', 'No recording was received. Please record again.', 400);
  const form = new FormData();
  const extension = ({ 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
    'audio/wav': 'wav', 'audio/mpeg': 'mp3' })[mimeType] || 'webm';
  form.append('file', new Blob([buffer], { type: mimeType }), `recording.${extension}`);
  form.append('model_id', MODEL);
  if (language !== 'auto') form.append('language_code', LANGUAGE_CODES[language]);
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  form.append('no_verbatim', 'false');
  form.append('timestamps_granularity', 'word');
  for (const term of keyterms) form.append('keyterms', term);
  let response;
  try {
    response = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': apiKey }, body: form, signal,
    });
  } catch (error) {
    if (signal?.aborted) throw speechError('TIMEOUT', 'Transcription stopped or timed out. Please try again.', 504);
    throw speechError('NETWORK', 'Could not reach the transcription service. Please try again.');
  }
  if (!response.ok) {
    if (response.status === 429) throw speechError('BUSY', 'Voice input is busy. Please try again shortly.', 429);
    if ([401, 403].includes(response.status)) throw speechError('SERVICE_UNAVAILABLE', 'Voice input is unavailable. Please ask the administrator to check its configuration.', 503);
    throw speechError('SERVICE_ERROR', 'The recording could not be transcribed. Please try again.');
  }
  const result = await response.json().catch(() => { throw speechError('INVALID_RESPONSE', 'The transcription service returned an invalid response. Please try again.'); });
  // Audio events, whitespace and empty responses are never turned into a question.
  if (typeof result.text !== 'string' || !result.text.trim()
    || !Array.isArray(result.words) || !result.words.some(word => word.type === 'word' && word.text?.trim())) {
    throw speechError('NO_SPEECH', 'No speech was recognized. Move closer to the microphone and try again.', 422);
  }
  // Use original text only: no translation, transcript editing, or guessed replacements.
  return { text: result.text, detectedLanguage: result.language_code || null, model: MODEL };
}

module.exports = { transcribeAudio, buildKeyterms, LANGUAGE_CODES, MODEL, speechError };
