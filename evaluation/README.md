# ALAGAD F1 evaluation

This standalone testing feature measures the existing chatbot's **native intent/routing labels**. It does not generate answers, train a model, alter retrieval rules, seed a database, or modify production behavior. Node.js 18+ is required; no new packages are needed.

## Run from the ALAGAD project root

Keep your existing backend running, then run:

```powershell
npm run evaluate
npm run evaluate:verify
```

`evaluate` sends real questions to `http://127.0.0.1:3001/api/chat`. `evaluate:verify` runs controlled metric and adapter tests without contacting ALAGAD or writing real result files. Its intentionally artificial predictions are only calculation tests.

For another local/test backend or dataset:

```powershell
npm run evaluate -- --url http://127.0.0.1:3001/api/chat --dataset evaluation/test_questions.json --timeout 45000
```

The URL can also be set with `ALAGAD_EVALUATION_URL`. The timeout is per question, in milliseconds. Questions run sequentially, with an empty conversation history unless the dataset explicitly provides one. Questions never inherit previous evaluation conversations. There are no automatic retries.

The evaluator does not start the server: normal server startup already has its own indexing/database initialization. Prefer a test instance with the intended campus-data snapshot. Calling chat produces its normal audit logs and may invoke the model/embedding provider configured on that backend. No selection, CRUD, training, or index-rebuild endpoints are called. The evaluator never receives MongoDB credentials.

## Existing integration, not a new classifier

1. Frontend `alagad-frontend/src/components/ChatBot.js`: `handleSendMessage()` calls `chatAPI.sendMessage()` in `src/utils/api.js`.
2. Backend `alagad-backend/server.js` mounts `routes/chatbotDeterministicRoutes.js` at `/api/chat`. The other `chatbotRoutes.js` file is not the mounted chat route.
3. The active POST handler resolves conversation references and language, then invokes `RetrievalPipeline.retrieve()` from `services/retrieval/pipeline.js`.
4. `queryNormalizer.classifyIntent()` is an early routing signal. Retrieval uses indexed MongoDB campus records, reranking, exact-match fallback, verification and confidence checks. `documentIndexer.js` and `deterministicFetch.js` retrieve the stored records.
5. The final `inferIntentFromQuery(query, contextItem)` function considers the question and retrieved record type. FAQ, clarification, no-match, conflict and referral branches can determine the final response label.
6. Responses use stored FAQ answers, `buildServiceIntentAnswer()`, `buildEntityWhereAnswer()`, `buildPersonnelWhoWhereAnswer()` and constrained `generateStrictAnswer()` as appropriate. Unknown/incomplete information already uses `buildHelpDeskReferralPayload()` and existing fallback text.
7. The frontend handles map actions via `onNavigate`, `GuestView.startNavigation()` and `findCampusRoute()`. Evaluation does not invoke map actions.

`adapters/existingChatApi.js` reads the actual API response's `intent`. It never receives `expected_intent`, so ground truth cannot be echoed as a prediction. Evaluating this endpoint includes retrieval and fallback decisions; calling only the early classifier would not. No production function extraction or additional API field was necessary.

## Starter dataset and its limits

`test_questions.json` contains **44 manually authored questions and expected labels**, defined before running predictions. It includes formal/conversational wording, short queries, minor mistakes, campus offices/buildings, service FAQs, general FAQs, and unsupported questions.

The starter set was informed by read-only listings from the local `/api/offices`, `/api/buildings`, `/api/services`, and `/api/public/faqs` endpoints. At authoring time the services listing was empty. Public FAQs covered TES, scholarships, student assistant applications, ID validation/reissuance and certificate fees. Some records contain historical information: their presence does **not** certify that their answers are current, complete, or factually accurate.

The starter ground-truth classes are `where`, `service`, `faq`, and `unknown`:

- `where`: expected location handling for existing campus locations.
- `service`: ALAGAD's broad native information label used here for office/building information requests. It is not a newly invented `office_info` classifier.
- `faq`: expected routing to stored FAQs, including service-process questions answered by the FAQ branch.
- `unknown`: unsupported, out-of-domain, or explicitly fictional facilities/services.

`category` tags preserve the five requested subject areas (`navigation`, `office_info`, `service_info`, `campus_faq`, `unknown`) for review; they do not replace or determine predicted labels. Expected labels are reviewable ground truth, not claims about observed predictions. Some phrasing deliberately challenges the current rules, such as "Take me to the Library."

All currently identified native labels are supported:

```text
where, who, service, requirements, process, description, where_process,
unit_handler, deadline, processing_time, contact, faq, clarification, unknown
```

The report explicitly lists native labels with no ground-truth examples. It does not claim the starter set covers them. Add manually reviewed examples when corresponding records exist. Do not insert invented campus records to improve coverage, or change labels just to make results look better. A low score is a finding, not an instruction to change the chatbot.

## Add questions

Add an object to the JSON array:

```json
{
  "question": "Where is the Registrar?",
  "expected_intent": "where",
  "category": "navigation",
  "rationale": "Location request for an existing office."
}
```

Only `question` and `expected_intent` are required. Optional fields are `id`, `category`, `rationale`, `language`, and `conversationHistory`. History follows the existing API contract, e.g. `[{"sender":"user","text":"Where is the Library?"}]`. Define labels independently of model outputs and review them against the chosen data snapshot. Invalid labels, empty questions and duplicate question/language/history combinations are rejected before API calls.

## Outputs

Open `evaluation/results/latest_results.txt` for the readable summary, confusion matrix and incorrect questions. `latest_results.json` contains:

- Start/end date, endpoint, dataset SHA-256, timeout, completion and coverage information.
- Every question, expected and actual predicted intent, correctness, duration, returned reply, response type and retrieved-record metadata.
- Correct/incorrect totals, per-class support/TP/FP/FN/precision/recall/F1, accuracy, macro F1 and weighted F1.
- Confusion-matrix axes/labels/counts, `misclassified_questions`, request `errors`, and uncovered labels.

Timestamped JSON and text copies preserve each run before the `latest` files are replaced. Only files inside `evaluation/results/` are written. Reports are ignored by Git because returned answers/metadata may contain internal campus information. They are local files, not an admin dashboard.

HTTP failures, timeouts, malformed JSON and missing intent fields are **errors**, never `unknown` predictions. They are excluded from metric counts and listed separately. Incomplete reports prominently state that accuracy applies only to completed requests. With no predictions, aggregate scores are `null`/`N/A`, not a fabricated zero or perfect score. An incorrect prediction is a valid observation and does not make the command fail.

Exit codes: `0` complete run; `1` invalid input/configuration or fatal failure; `2` run with request errors.

## Verify the arithmetic manually

Confusion-matrix **rows are actual**, **columns are predicted**. For an intent:

```text
TP = its diagonal cell
FN = its row total - TP
FP = its column total - TP
precision = TP / (TP + FP)
recall = TP / (TP + FN)
F1 = 2 * precision * recall / (precision + recall)
accuracy = diagonal sum / completed predictions
macro F1 = mean per-label F1
weighted F1 = sum(F1 * actual support) / completed predictions
```

Zero denominators produce 0. Macro labels are the union of declared dataset classes and actually predicted classes; unused native labels outside that union do not lower macro F1. Unexpected predicted labels remain in the matrix and contribute errors. Weighted F1 uses actual support, not prediction frequency. Full precision is retained in JSON; displayed values are rounded.

`npm run evaluate:verify` independently checks perfect, partly wrong and wholly wrong predictions, exact confusion-matrix counts, unequal class support, zero denominators, unexpected labels, empty results, bad datasets, and the API adapter's separation from ground truth. These tests do not overwrite or stand in for a real ALAGAD run.

F1 here measures label decisions, not factual answer correctness, navigation-route quality or hallucination rate. Review returned answers and verification/referral fields separately when assessing those properties. A refusal may preserve a non-unknown native intent; the evaluator faithfully records it rather than rewriting it.

## Changed files

All evaluation implementation and documentation are new files under `evaluation/`. The only modified application configuration is the root `package.json`, adding `evaluate` and `evaluate:verify`; existing scripts and dependencies remain intact. Chatbot, frontend, admin, models, Mapbox, GeoJSON, A* and Turf.js source files are unchanged.
