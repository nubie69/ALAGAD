'use strict';

function validateEndpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP(S) chat endpoint without credentials, query parameters, or fragments.');
  }
  return url.href;
}

// Never receives expected_intent: the prediction comes exclusively from ALAGAD.
async function predictIntent({ question, language = 'en', conversationHistory = [] }, { endpoint, timeoutMs, queryOnly = false }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryOnly ? { message: question } : { message: question, language, conversationHistory, selectedSuggestion: null }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ALAGAD returned HTTP ${response.status}`);
  const payload = await response.json();
  if (typeof payload.intent !== 'string' || !payload.intent.trim()) {
    throw new Error('ALAGAD response has no valid intent; this is a request error, not an unknown prediction.');
  }
  return {
    predicted_intent: payload.intent.trim(),
    predicted_target: payload.service || payload.entity || payload.entityName || payload.metadata?.retrievedRecords?.[0]?.name || null,
    predicted_target_id: payload.metadata?.retrievedRecords?.[0]?.id || null,
    entity_type: payload.entity_type || payload.metadata?.retrievedRecords?.[0]?.type || null,
    entity_name: payload.entityName || null,
    target_capture_available: Object.hasOwn(payload, 'entity') || Object.hasOwn(payload, 'service') || Boolean(payload.metadata?.retrievedRecords?.length),
    reply: typeof payload.reply === 'string' ? payload.reply : null,
    response_type: payload.responseType || payload.metadata?.responseType || null,
    verification_status: payload.verificationStatus || null,
    retrieved_records: payload.metadata?.retrievedRecords || [],
  };
}

module.exports = { predictIntent, validateEndpoint };
