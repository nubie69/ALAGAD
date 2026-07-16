# Raspberry Pi Deployment Pseudocode

## End-to-end request handling

```text
START
  LOAD config from env + CLI
  CONNECT SQLite campus.db
  IF tables missing:
      APPLY schema.sql
  IF db empty:
      INSERT baseline seed records

  IF voice_input provided:
      transcript, confidence = Vosk.transcribe(audio.wav)
      IF confidence < threshold OR transcript empty:
          RETURN "I could not hear clearly. Please repeat slowly."
      user_text = transcript
  ELSE:
      user_text = text_input

  normalized = normalize(user_text)
  language = detect_language(normalized)
  intent, entity_preference, info_need = classify_intent(normalized)
  keywords = extract_keywords(normalized)

  candidates = load_entity_corpus(SQLite)

  keyword_scores = score_keyword_overlap(candidates, keywords, normalized)
  semantic_scores = score_semantic_similarity(candidates, normalized)  # optional model
  combined_scores = weighted_sum(keyword_scores, semantic_scores)

  best, alternatives = rank(combined_scores)

  IF best.score < MATCH_THRESHOLD:
      RETURN clarification_with_suggestions(alternatives)

  IF score_gap(best, alternatives[1]) < AMBIGUITY_GAP:
      RETURN disambiguation_prompt(alternatives)

  facts = fetch_candidate_payload(best)

  local_response = template_generate(facts, intent, info_need)

  IF OPENAI_ENABLED:
      TRY
          response = OpenAI.rewrite_with_strict_facts(local_response, facts)
      CATCH api_failure
          response = local_response
  ELSE:
      response = local_response

  RETURN response + timing_metrics
END
```

## Background refresh strategy for Pi

```text
EVERY 5-10 minutes OR when admin updates DB:
  reload in-memory candidate corpus
  recompute semantic embeddings only if semantic mode is enabled
```

## Resilience strategy

```text
IF internet unavailable:
  skip OpenAI call
  always use local template generation

IF semantic model unavailable:
  fall back to keyword-only ranking

IF STT unavailable:
  request text input fallback
```
