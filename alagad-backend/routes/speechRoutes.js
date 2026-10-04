const express = require('express');
const multer = require('multer');
const { transcribeAudio, buildKeyterms, MODEL } = require('../services/speechTranscription');
const Building = require('../models/Building');
const Department = require('../models/Department');
const Office = require('../models/Office');
const Room = require('../models/Room');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');

const MAX_BYTES = 6 * 1024 * 1024;
const MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']);

async function loadVocabulary() {
  // Read names and stored aliases only, never accounts or private personnel fields.
  const models = [Office, FacultyStaff, Service, Department, Building, Room];
  const results = await Promise.all(models.map(model => model.find({
    isActive: { $ne: false }, active: { $ne: false },
    ...(model === Service ? { verificationStatus: 'verified' } : {}),
  }).select('name aliases aliasKeywords').limit(500).maxTimeMS(5000).lean()));
  return buildKeyterms(results.flat());
}

function createSpeechRouter({ transcribe = transcribeAudio, vocabulary = loadVocabulary,
  isConfigured = () => Boolean(process.env.ELEVENLABS_API_KEY) } = {}) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 1 } });
  const inFlight = new Set();
  router.get('/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ enabled: isConfigured(), model: MODEL,
      autoDetection: true, languages: ['en', 'tl', 'ceb'] });
  });
  router.post('/transcribe', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!isConfigured()) return res.status(503).json({ code: 'NOT_CONFIGURED', message: 'Voice input is not configured. You can type your question instead.' });
    if (inFlight.has(req.ip) || inFlight.size >= 4) return res.status(429).json({ code: 'BUSY', message: 'Voice input is busy. Please try again shortly.' });
    inFlight.add(req.ip);
    res.once('close', () => inFlight.delete(req.ip));
    upload.single('audio')(req, res, error => {
      if (!error) return next();
      return res.status(400).json({ code: 'INVALID_AUDIO', message: error.code === 'LIMIT_FILE_SIZE'
        ? 'The recording is too large. Please record a shorter question.' : 'Please upload a single audio recording.' });
    });
  }, async (req, res) => {
    const mimeType = String(req.file?.mimetype || '').split(';')[0];
    if (!req.file?.size || !MIME_TYPES.has(mimeType)) return res.status(400).json({ code: 'INVALID_AUDIO', message: 'A supported audio recording is required. Please record again.' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', cancel);
    try {
      // Hints are optional; a vocabulary failure must not invent words or block voice input.
      const keyterms = await vocabulary().catch(() => []);
      if (controller.signal.aborted) {
        if (!res.destroyed) res.status(504).json({ code: 'TIMEOUT', message: 'Transcription timed out. Please try again.' });
        return;
      }
      const result = await transcribe({ buffer: req.file.buffer, mimeType,
        language: req.body.language || 'auto', keyterms, signal: controller.signal });
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (!res.destroyed) res.status(error.status || 502).json({ code: error.code || 'SERVICE_ERROR', message: error.code
        ? error.message : 'Voice input is unavailable. Please try again.' });
    } finally {
      clearTimeout(timeout); res.removeListener('close', cancel);
    }
  });
  return router;
}

module.exports = createSpeechRouter();
module.exports.createSpeechRouter = createSpeechRouter;
