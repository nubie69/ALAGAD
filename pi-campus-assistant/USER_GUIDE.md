# Campus Navigation Assistant (Raspberry Pi)

## What this solution includes

- Full Python pipeline script: Input -> STT -> NLP -> query understanding -> matching -> retrieval -> generation
- Optional offline voice transcription (Vosk)
- Optional semantic matching (sentence-transformers)
- Optional OpenAI response formatting, with local fallback
- SQLite schema for campus data
- Built-in seeded demo data and trace mode

## Design choices by architecture component

1. Input Layer (Text or Voice)
- Text is first-class and always available.
- Voice is optional so the system still works on low-resource Pi deployments without a microphone stack.

2. Input Processing (Speech-to-Text)
- Engine: Vosk (offline, open source, Pi-friendly).
- Why: No internet required, low latency on edge devices, stable for command-like phrases.
- Error handling: rejects low-confidence or empty transcripts with a retry prompt.

3. NLP Processing (Intent + Keyword Extraction)
- Primary strategy: lightweight rule-based intent classification.
- Optional enhancement: spaCy for lemmatization and cleaner keywords.
- Why: rule-first keeps memory/CPU usage small and predictable on Raspberry Pi.

4. Query Understanding (Normalization + Language Detection)
- Normalization includes typo correction and abbreviation expansion (example: cs -> computer science).
- Language detection uses langdetect when installed; heuristic fallback if unavailable.
- Why: practical multilingual handling without heavy runtime dependencies.

5. Matching Engine (Keyword + Semantic)
- Base mode: token overlap + fuzzy string scoring (fast, low memory).
- Optional mode: sentence-transformers embeddings for semantic similarity.
- Why: supports offline baseline and switchable higher recall when resources allow.

6. Data Retrieval (SQLite campus database)
- SQLite chosen for Pi simplicity: file-based, low overhead, no server process.
- Schema models: Buildings, Departments, Offices, Rooms, Services, Personnel, Aliases.
- Why: normalized structure with aliases gives robust matching and easy admin updates.

7. Generation (Optional OpenAI, local fallback)
- Local template generator is always available and deterministic.
- OpenAI API is optional and only refines phrasing using strict factual payload.
- Why: reduces cost and dependency on internet while preserving quality when online.

8. Output Layer
- Produces direct navigation text with location + directional guidance.
- Example format: "The CS department is in Building 42, Room 301. Head north from the main entrance..."

## Setup (short)

1. Install Python 3.10+ and create a virtual environment.
2. Install dependencies:
   - Minimal mode: only Python standard library is enough to run text demo.
   - Full mode: install from requirements.txt.
3. Optional STT model:
   - Download a Vosk English model and pass --stt-model path.
4. Optional OpenAI:
   - Set OPENAI_API_KEY environment variable.

## Commands

Run demo trace:

```bash
python campus_navigation_assistant.py --db campus.db --demo --trace
```

Run text query:

```bash
python campus_navigation_assistant.py --db campus.db --text "Where is the computer science department?" --trace
```

Run voice query (WAV):

```bash
python campus_navigation_assistant.py --db campus.db --voice-wav sample.wav --stt-model /path/to/vosk-model-en --trace
```

Enable semantic matching:

```bash
python campus_navigation_assistant.py --db campus.db --semantic --text "Where is comp sci dept?" --trace
```

Enable optional OpenAI formatting:

```bash
python campus_navigation_assistant.py --db campus.db --use-openai --text "Where is the computer science department?"
```

## End-to-end trace for sample question

Input:
- "Where is the computer science department?"

Layer outputs:
1. Input Layer:
- Accepts text directly.

2. NLP Layer:
- Normalized query: "where is the computer science department?"
- Intent: location_query
- Entity preference: department
- Keywords: ["computer", "science", "department"]

3. Matching Layer:
- Highest ranked candidate: Computer Science Department
- Match status: matched

4. Retrieval Layer:
- Building: B42 (Building 42 - Engineering Complex)
- Room: 301
- Directions: "Head north from the main entrance for 220 meters, then turn right at the fountain."

5. Generation Layer:
- Local output (or OpenAI-refined output from same facts)

Final response:
- "Computer Science Department is in B42, Room 301. Head north from the main entrance for 220 meters, then turn right at the fountain."

## Error handling behavior

- Low-quality speech:
  - Raises low-confidence input error and asks user to repeat.
- Unknown query:
  - Returns clarification prompt with top suggestions.
- Ambiguous query:
  - Returns disambiguation choices (top close matches).
- OpenAI/API failure:
  - Automatically falls back to local rule-based response.

## Database expansion suggestions

1. Accessibility metadata
- Wheelchair routes, elevator availability, tactile paths, restroom accessibility.

2. Real-time occupancy
- Room crowd levels from IoT counters or scheduling feeds.

3. Dynamic incidents
- Construction detours, blocked corridors, temporary office transfers.

4. Transit context
- Shuttle stops, ETA feeds, parking availability.

5. Role-based personalization
- Student vs faculty routing preferences, nearest relevant office by profile.

6. Multilingual response templates
- Improved Tagalog and Cebuano response packs.
