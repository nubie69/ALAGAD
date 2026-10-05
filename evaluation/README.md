# ALAGAD F1 evaluation

This testing feature measures the existing chatbot's intent/routing output. **The supplied `pilot_questions.json` is now the default F1 dataset.** It does not train a model, alter retrieval rules, seed a database, or modify production behavior. Node.js 18+ is required. The publication exporter uses root development dependencies; install them with `npm install`.

## Supplied 15-question pilot

Run `npm run evaluate:pilot` (or `npm run evaluate`) while the normal backend is running. Edit `evaluation/pilot_questions.json` to update the reference dataset. All original queries, misspellings, mixed wording, expected targets, answers, and review notes are retained. References start unverified. Only the exact query is submitted as `{ "message": query }`; language metadata, expected labels, targets, answers, and reviewer information are never sent to the chatbot. The normal backend detects the language and runs the normal chat pipeline.

`pilot-policy.js` defines the fixed mapping, independently of each question's expected label:

| Actual routing label | Scored pilot label |
| --- | --- |
| service_requirements | requirements |
| service_process | process |
| service_location | service_location |
| personnel_location | personnel_location |
| position_personnel | personnel_by_position |

Any unmapped actual label is retained and contributes classification errors. Raw labels are saved as `native_predicted_intent`. Predictions are not relabeled using expected answers. Native-label legacy datasets remain available through `npm run evaluate:native` and `npm run evaluate:nlp`.

Targets come from actual structured response fields (`service`, `entity`, `entityName`, or returned record metadata). Before prediction, read-only public service/personnel endpoints supply a database-record snapshot for ID matching. Named service/personnel targets use unique IDs where available, otherwise full normalized names and the fixed aliases in `pilot-policy.js`. There is no fuzzy matching, answer-text parsing, or target guessing. For `personnel_by_position`, the scored target is the actual returned role plus the office/department of the uniquely resolved returned record; its person name is retained only as routing evidence and for separate answer review. A Director in another office is incorrect. Missing record/capture evidence is reported as unavailable. A structured no-target response is unsuccessful.

Runs retain `response_time_ms`, raw and mapped intent, predicted target, matching evidence/IDs, expected references, notes, language, attempted/completed/failed counts, completion rate, language metrics, and dataset SHA-256. Target accuracy uses completed requests; joint accuracy uses all attempted questions, including failures. If any completed target lacks evidence, aggregate target/joint metrics are unavailable and the evidence count is recorded. Model configuration is marked unavailable when the chat API does not expose it; credentials are never captured. Verify pilot handling with `npm run evaluate:pilot:verify`.

## Publication reports

Open **Evaluation reports** in the existing Super Admin dashboard and import one saved run JSON. The page starts with **Not evaluated**. Runs and answers stay local to the viewer; no saved results are bundled into the public frontend. The standalone generated HTML provides the same viewer without requiring a server.

Create a complete report and individual SVG, vector PDF, and 300-DPI PNG files from a selected historical run:

```powershell
npm run evaluate:export -- --run evaluation/results/2026-09-23T12-50-51-557Z-07904068.json --dataset evaluation/test_questions.nlp_document.json --out evaluation/results/publication-07904068
```

For other runs, replace the path. `--dataset` is optional and attaches missing reference text and language fields to older runs only when its exact SHA-256, row IDs, queries, and expected labels match the run. It never modifies predictions or attaches another dataset's references. All exports are generated from the same selected snapshot. `selected-run.json` preserves that snapshot, and `results.csv` includes per-question results and review fields with run metadata. `complete-report.pdf` contains every figure, routing-results table, and answer-review page; individual files have matching `.svg`, `.pdf`, and `.png` names. The viewer also has SVG and PNG downloads and PDF through the browser's Save as PDF print dialog. Disable browser print headers and footers.

The white-background report contains a precision/recall/F1/support table with macro averages, a fixed 0-to-1 F1 bar chart with score labels, a grayscale confusion matrix with a count in every cell (expected rows, predicted columns), a summary, language counts, and separate factual answer-review tables. Review rows are exported as individual pages to keep long answers readable. Each artifact includes the run ID, dataset version (SHA-256 where no named version exists), sample size, and completed-request intent denominator. PNGs are at least 2400 pixels wide, with embedded 300-DPI resolution metadata (8 inches wide for the base 960-unit figures). PDFs preserve vector shapes and embedded fonts when Arial or DejaVu Sans is installed.

Classification metrics use completed requests. Zero metric denominators produce zero after evaluation; no completed predictions produces **Not evaluated**. Macro averaging includes all declared and observed labels, including labels with zero completed support. Failed requests are reported separately. Target accuracy requires actual `target_correct` booleans on completed rows and a documented `target_matching_policy`; joint accuracy then uses **all attempted questions**, counting failures as unsuccessful. Older native-intent runs lack target matching, so those two metrics remain unavailable for those runs. New supplied-pilot runs capture targets as documented above. They are never inferred from answer text or expected labels.

Use the manual factual review controls to assess correctness, completeness, response language, and reviewer notes; confirm reference verification only against approved campus records. Save edits with **Export selected run JSON**, then import/export that reviewed snapshot. Factual correctness uses only reviewed rows whose references are verified, with its denominator and coverage shown separately from intent F1. Equivalent wording and translations are allowed. New evaluator runs retain reference fields and language in their own snapshots; old runs cannot recover historical verification claims.

The 15-question NLP dataset is a **pilot evaluation**, with English = 11, Cebuano = 3, Tagalog = 1. Counts are shown alongside the small/unequal-sample limitation, with no claims of reliable language differences. If used for tuning, it is not an untouched final test set. Selected-run language counts use only captured fields or hash-verified attachments.

`pilot_questions.json` preserves all 15 records from the pasted specification, with original queries, reference answers, review notes (4, 5, 12), and `reference_verified: false`. It is the runnable default pilot dataset and differs from the historical NLP dataset. Do not relabel old predictions or attach these references to that different historical dataset.

Regenerate the blank admin viewer after changing renderer/viewer source with `npm run evaluate:viewer`. Verify calculations and publication behavior with `npm run evaluate:verify` and `npm run evaluate:publication:verify`.

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

Native legacy datasets require `question` and `expected_intent`; supplied pilot rows use `query` and the five semantic labels documented above. Keep expected target/reference fields and `reference_verified` in pilot rows. Native optional fields are `id`, `category`, `rationale`, `language`, and `conversationHistory`. History follows the existing API contract, e.g. `[{"sender":"user","text":"Where is the Library?"}]`. Define labels independently of model outputs and review them against the chosen data snapshot. Invalid labels, empty questions and duplicate question/language/history combinations are rejected before API calls.

## Outputs

Open `evaluation/results/latest_results.txt` for the readable summary, confusion matrix and incorrect questions. `latest_results.json` contains:

- Start/end date, endpoint, dataset SHA-256, timeout, completion and coverage information.
- Every question, expected and actual predicted intent, correctness, duration, returned reply, response type and retrieved-record metadata.
- Correct/incorrect totals, per-class support/TP/FP/FN/precision/recall/F1, accuracy, macro F1 and weighted F1.
- Confusion-matrix axes/labels/counts, `misclassified_questions`, request `errors`, and uncovered labels.

Timestamped JSON and text copies preserve each run before the `latest` files are replaced. The evaluator writes inside `evaluation/results/`. Reports are ignored by Git because returned answers/metadata may contain internal campus information. These local files can be imported into the admin publication viewer.

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

Evaluation source and documentation live under `evaluation/`. Publication support adds `publication.js`, `export-publication.js`, `render-publication.js`, and `verify-publication.js`, along with the preserved pasted reference dataset. The evaluator now snapshots answer-reference and language fields and an explicit run ID. `SuperAdminDashboard.js` adds an Evaluation reports tab, and `alagad-frontend/public/evaluation-report.html` is the generated empty viewer. Root package scripts and export dependencies are updated. Chatbot classification/routing, voice input, navigation, and database behavior remain unchanged.
