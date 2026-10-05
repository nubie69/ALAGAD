# ALAGAD voice input validation

Only capture, transcription and voice controls are involved. Transcribed text is put in the existing input for editing; the existing Send action handles it as typed text.

## Provider and configuration

The previous hook used browser `SpeechRecognition` / `webkitSpeechRecognition`. Its configured locales were English `en-US`, Filipino `fil-PH`, and English `en-PH` for Cebuano. This did not establish actual Cebuano recognition. Browser recognition engines and language availability differ; the Web Speech interface does not guarantee these languages across devices. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

The replacement is ElevenLabs batch `scribe_v2`. Its official language list explicitly includes Cebuano `ceb`, Filipino `fil`, and English `eng`. Auto detection is documented: omit `language_code` to predict language from audio. The chatbot always uses Auto, independent of its display language. The user subsequently requested removal of the language selector and idle voice banners; only active capture, processing and user-triggered errors appear. The backend still accepts explicit language hints for diagnostic comparisons. [Languages](https://elevenlabs.io/docs/overview/capabilities/speech-to-text), [API configuration](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)

Set `ELEVENLABS_API_KEY` in `alagad-backend/.env` and restart the backend. Do not put the key in frontend environment variables. Recordings are uploaded through the backend and sent to ElevenLabs; ALAGAD does not persist the audio. Provider retention is governed by the account's ElevenLabs settings. Mobile and remote kiosks require HTTPS; localhost can be a secure context. Browser capture chooses supported WebM, MP4 or Ogg instead of assuming a single codec.

Stored active campus names and aliases become keyterms, limited to the provider's constraints and a maximum of one hundred terms per request. No guessed aliases or transcript replacements are generated. Keyterm prompting incurs the provider's documented surcharge. [Keyterms](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/batch/keyterm-prompting)

Original `text` is used; no translation, `transcript_edit`, or cleanup with `no_verbatim` is enabled. Automatic detection is supported, but accurate preservation of every word in mixed-language audio remains a real-recording acceptance criterion.

## Automated checks

Backend tests cover Auto and explicit language configuration, preserving mocked source text, vocabulary limits, empty/event-only output, network and provider errors, missing configuration and invalid uploads.

Browser tests simulate capture, MP4 selection, permission denial, missing/busy/disconnected microphones, silence, cancellation, track cleanup, duplicate recording prevention, recording timeout, and original-text callbacks. Component tests cover Auto defaults on mobile/kiosk-sized layouts, manual review/editing, the existing chat submission flow, processing guards and retry controls.

These are mock-based behavior checks, not measurements of recognition accuracy. An energy threshold rejects near-digital silence; background noise can exceed it. Provider-recognized words can still contain recognition errors or hallucinations. Reviewing the transcript remains necessary, and nothing is auto-submitted.

Observed automated result: the backend provider/endpoint suite and all voice capture, hook and component tests passed. The production frontend build succeeded with dependency source-map warnings and unrelated existing lint warnings. A voice-hook encoding warning was corrected and checked separately with lint.

## Real-recording acceptance matrix

No real speaker audio was available in the workspace, and no ElevenLabs key was configured when inspected. No recognition errors have been measured. All cases below are **untested**, not passed. Synthetic speech must not substitute for the requested different-speaker recordings.

| Case | Expected spoken text / sample | Status | Observed errors |
| --- | --- | --- | --- |
| Cebuano, different speakers | Asa dapit ang registrar? | Untested | Not measured |
| Tagalog, different speakers | Saan matatagpuan ang registrar? | Untested | Not measured |
| English, different speakers | Where is the registrar's office? | Untested | Not measured |
| Mixed language, different speakers | Unsa ang requirements para sa enrollment? | Untested | Not measured |
| Background noise and silence | Repeat those recordings with actual ambient noise; include a silent clip | Untested | Not measured |
| Campus vocabulary | Speak current office/personnel names and stored abbreviations from admin data | Untested | Not measured |
| Real mobile and kiosk microphones | Permission, cancel, disconnect, recording, processing, review and Send | Untested | Not measured |

For each real sample, record speaker/device, selected language, noise conditions, the exact spoken reference and the unedited transcription. Compare Auto with the appropriate manual hint and log deletions, substitutions, inserted words, name/abbreviation mistakes and unintended translation. Keep failed cases visible and repeat after adjusting hints only from verified campus vocabulary.
