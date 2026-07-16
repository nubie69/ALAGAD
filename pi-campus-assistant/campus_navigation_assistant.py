#!/usr/bin/env python3
"""
Raspberry Pi-friendly campus navigation assistant.

Pipeline:
Input (text/voice) -> STT -> NLP -> query understanding -> matching engine ->
data retrieval -> response generation (optional OpenAI, local fallback).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sqlite3
import statistics
import sys
import time
import wave
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


LOGGER = logging.getLogger("campus_assistant")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)


DEFAULT_SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    floor_count INTEGER DEFAULT 1,
    landmark TEXT,
    directions_from_main_entrance TEXT,
    latitude REAL,
    longitude REAL,
    is_accessible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    building_id INTEGER NOT NULL,
    room TEXT,
    description TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    office_hours TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    building_id INTEGER NOT NULL,
    room TEXT,
    description TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    office_hours TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL,
    room_number TEXT NOT NULL,
    room_type TEXT,
    floor INTEGER,
    description TEXT,
    is_accessible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (building_id, room_number),
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    department_id INTEGER,
    office_id INTEGER,
    description TEXT,
    requirements TEXT,
    process_steps TEXT,
    turnaround_time TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    title TEXT,
    department_id INTEGER,
    office_id INTEGER,
    email TEXT,
    phone TEXT,
    office_hours TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    UNIQUE (entity_type, entity_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_departments_building_id ON departments(building_id);
CREATE INDEX IF NOT EXISTS idx_offices_building_id ON offices(building_id);
CREATE INDEX IF NOT EXISTS idx_rooms_building_id ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_services_department_id ON services(department_id);
CREATE INDEX IF NOT EXISTS idx_services_office_id ON services(office_id);
CREATE INDEX IF NOT EXISTS idx_personnel_department_id ON personnel(department_id);
CREATE INDEX IF NOT EXISTS idx_personnel_office_id ON personnel(office_id);
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases(entity_type, entity_id, alias);
"""


DEMO_SEED_SQL = """
INSERT OR IGNORE INTO buildings (id, code, name, floor_count, landmark, directions_from_main_entrance, latitude, longitude, is_accessible)
VALUES
  (42, 'B42', 'Building 42 - Engineering Complex', 4, 'Near the central fountain', 'Head north from the main entrance for 220 meters, then turn right at the fountain.', 0.0, 0.0, 1),
  (10, 'ADM', 'Administration Building', 3, 'Across the flagpole', 'From the main entrance, walk straight east for 120 meters.', 0.0, 0.0, 1);

INSERT OR IGNORE INTO departments (id, name, building_id, room, description, contact_email, contact_phone, office_hours)
VALUES
  (1, 'Computer Science Department', 42, '301', 'Handles CS curriculum, advising, and departmental services.', 'cs@campus.edu', '555-1001', 'Mon-Fri 08:00-17:00'),
  (2, 'Information Technology Department', 42, '210', 'IT programs and labs.', 'it@campus.edu', '555-1002', 'Mon-Fri 08:00-17:00');

INSERT OR IGNORE INTO offices (id, name, building_id, room, description, contact_email, contact_phone, office_hours)
VALUES
  (1, 'Registrar Office', 10, '101', 'Student records and official documents.', 'registrar@campus.edu', '555-2001', 'Mon-Fri 08:00-17:00'),
  (2, 'CS Department Office', 42, '301', 'Front desk for the CS department.', 'cs-office@campus.edu', '555-1001', 'Mon-Fri 08:00-17:00');

INSERT OR IGNORE INTO rooms (id, building_id, room_number, room_type, floor, description, is_accessible)
VALUES
  (1, 42, '301', 'Department Office', 3, 'Computer Science Department Office', 1),
  (2, 42, '315', 'Laboratory', 3, 'AI and Robotics Lab', 1),
  (3, 10, '101', 'Office', 1, 'Registrar Service Counter', 1);

INSERT OR IGNORE INTO services (id, name, department_id, office_id, description, requirements, process_steps, turnaround_time)
VALUES
  (1, 'Transcript of Records', NULL, 1, 'Issuance of official transcript.', 'Valid school ID; Clearance; Request form', '1) Submit request form at Registrar. 2) Pay at cashier. 3) Claim on release date.', '3-5 working days'),
  (2, 'Department Advising', 1, 2, 'Academic advising for CS students.', 'Student ID; Latest grade report', '1) Book schedule. 2) Meet assigned adviser. 3) Confirm approved plan.', 'Same day');

INSERT OR IGNORE INTO personnel (id, full_name, title, department_id, office_id, email, phone, office_hours)
VALUES
  (1, 'Dr. Ana Reyes', 'Department Chair', 1, 2, 'ana.reyes@campus.edu', '555-3001', 'Mon-Wed 09:00-12:00'),
  (2, 'Mr. Joel Santos', 'Registrar Officer', NULL, 1, 'joel.santos@campus.edu', '555-3002', 'Mon-Fri 09:00-16:00');

INSERT OR IGNORE INTO aliases (entity_type, entity_id, alias)
VALUES
  ('department', 1, 'cs'),
  ('department', 1, 'comp sci'),
  ('department', 1, 'computer science'),
  ('office', 1, 'registrar'),
  ('service', 1, 'tor'),
  ('service', 1, 'transcript'),
  ('service', 1, 'records'),
  ('personnel', 1, 'cs chair');
"""


COMMON_TYPOS = {
    "departmnt": "department",
    "depertment": "department",
    "registar": "registrar",
    "compuer": "computer",
    "scince": "science",
    "whre": "where",
}

ABBREVIATIONS = {
    "cs": "computer science",
    "it dept": "information technology department",
    "dept": "department",
    "tor": "transcript of records",
    "bldg": "building",
}

GENERIC_STOPWORDS = {
    "a",
    "an",
    "the",
    "is",
    "are",
    "to",
    "of",
    "for",
    "in",
    "at",
    "on",
    "me",
    "please",
    "where",
    "what",
    "how",
    "can",
    "i",
    "find",
    "locate",
    "sa",
    "ang",
    "ng",
    "asa",
    "unsa",
    "naa",
}


class LowQualitySpeechError(RuntimeError):
    """Raised when STT returns low-confidence or empty transcription."""


class UnknownQueryError(RuntimeError):
    """Raised when no useful entity match is found."""


@dataclass
class AssistantConfig:
    db_path: str = "campus.db"
    schema_path: Optional[str] = None
    use_openai: bool = False
    openai_model: str = "gpt-4o"
    openai_timeout_s: int = 8
    stt_model_path: Optional[str] = None
    stt_confidence_threshold: float = 0.55
    semantic_enabled: bool = False
    semantic_model_name: str = "sentence-transformers/paraphrase-MiniLM-L3-v2"
    match_threshold: float = 0.33
    ambiguity_gap: float = 0.06


@dataclass
class QueryAnalysis:
    raw_text: str
    normalized_text: str
    language: str
    intent: str
    entity_preference: Optional[str]
    info_need: str
    keywords: List[str] = field(default_factory=list)


@dataclass
class Candidate:
    entity_type: str
    entity_id: int
    name: str
    searchable_text: str
    payload: Dict[str, Any]
    token_set: set = field(default_factory=set)


@dataclass
class RankedCandidate:
    candidate: Candidate
    keyword_score: float
    semantic_score: float
    combined_score: float


@dataclass
class MatchResult:
    status: str
    best: Optional[RankedCandidate]
    alternatives: List[RankedCandidate]


class STTProcessor:
    """Offline speech-to-text wrapper using Vosk."""

    def __init__(self, model_path: str, confidence_threshold: float = 0.55) -> None:
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold

        try:
            from vosk import Model  # type: ignore

            self._vosk_model = Model(model_path)
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                "Vosk is not available or model path is invalid. "
                "Install vosk and download a model for offline STT."
            ) from exc

    def transcribe_wav(self, wav_path: str) -> Tuple[str, float]:
        try:
            from vosk import KaldiRecognizer  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("Vosk runtime is not available.") from exc

        with wave.open(wav_path, "rb") as wf:
            if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
                raise LowQualitySpeechError(
                    "Audio must be mono 16-bit PCM WAV for reliable Vosk transcription."
                )

            recognizer = KaldiRecognizer(self._vosk_model, wf.getframerate())
            recognizer.SetWords(True)

            words_conf: List[float] = []
            text_chunks: List[str] = []

            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break

                if recognizer.AcceptWaveform(data):
                    result = json.loads(recognizer.Result())
                    text_chunks.append(result.get("text", ""))
                    for item in result.get("result", []):
                        conf = item.get("conf")
                        if isinstance(conf, (float, int)):
                            words_conf.append(float(conf))

            final_result = json.loads(recognizer.FinalResult())
            text_chunks.append(final_result.get("text", ""))
            for item in final_result.get("result", []):
                conf = item.get("conf")
                if isinstance(conf, (float, int)):
                    words_conf.append(float(conf))

        transcript = " ".join(part.strip() for part in text_chunks if part).strip()
        avg_conf = statistics.mean(words_conf) if words_conf else 0.0

        if not transcript or avg_conf < self.confidence_threshold:
            raise LowQualitySpeechError(
                f"Speech confidence too low (avg_conf={avg_conf:.2f}). Please repeat clearly."
            )

        return transcript, avg_conf


class NLPProcessor:
    """Lightweight NLP for Raspberry Pi: rule-first, optional spaCy assist."""

    def __init__(self) -> None:
        self._spacy_nlp = None
        try:
            import spacy  # type: ignore

            self._spacy_nlp = spacy.load("en_core_web_sm", disable=["parser", "ner", "textcat"])
            LOGGER.info("spaCy loaded for tokenization and lemmas.")
        except Exception:
            LOGGER.info("spaCy not available. Falling back to regex tokenization.")

    @staticmethod
    def normalize_text(text: str) -> str:
        clean = text.strip().lower()
        clean = re.sub(r"\s+", " ", clean)

        for typo, fixed in COMMON_TYPOS.items():
            clean = re.sub(rf"\b{re.escape(typo)}\b", fixed, clean)

        for abbr, expanded in ABBREVIATIONS.items():
            clean = re.sub(rf"\b{re.escape(abbr)}\b", expanded, clean)

        return clean

    @staticmethod
    def detect_language(text: str) -> str:
        try:
            from langdetect import detect  # type: ignore

            code = detect(text)
            if code in {"tl", "ceb", "en"}:
                return code
            return "en"
        except Exception:
            tl_markers = {"nasaan", "saan", "po", "yung", "ang"}
            ceb_markers = {"asa", "unsa", "kanus", "naa"}
            tokens = set(re.findall(r"[a-zA-Z0-9]+", text.lower()))
            if tokens & ceb_markers:
                return "ceb"
            if tokens & tl_markers:
                return "tl"
            return "en"

    def extract_keywords(self, text: str) -> List[str]:
        if self._spacy_nlp:
            doc = self._spacy_nlp(text)
            lemmas = [
                token.lemma_.lower()
                for token in doc
                if token.is_alpha and not token.is_stop and len(token.lemma_) > 1
            ]
            return [k for k in lemmas if k not in GENERIC_STOPWORDS]

        tokens = re.findall(r"[a-zA-Z0-9]+", text.lower())
        return [tok for tok in tokens if tok not in GENERIC_STOPWORDS and len(tok) > 1]

    @staticmethod
    def classify_intent(normalized_text: str) -> Tuple[str, Optional[str], str]:
        text = normalized_text

        service_need = any(k in text for k in ["requirement", "requirements", "document", "process", "steps", "procedure", "how to"])
        person_need = any(k in text for k in ["who is", "professor", "dean", "instructor", "staff", "person"])

        if person_need:
            return "personnel_lookup", "personnel", "details"

        if "requirement" in text or "requirements" in text or "document" in text:
            return "service_query", "service", "requirements"

        if "process" in text or "steps" in text or "procedure" in text or "how to" in text:
            return "service_query", "service", "process"

        if "department" in text:
            return "location_query", "department", "location"

        if "office" in text or "registrar" in text:
            return "location_query", "office", "location"

        if "room" in text:
            return "location_query", "room", "location"

        if "building" in text:
            return "location_query", "building", "location"

        if service_need or any(k in text for k in ["transcript", "enrollment", "clearance", "id card"]):
            return "service_query", "service", "details"

        return "navigation_query", None, "location"

    def analyze(self, input_text: str) -> QueryAnalysis:
        normalized = self.normalize_text(input_text)
        language = self.detect_language(normalized)
        intent, entity_preference, info_need = self.classify_intent(normalized)
        keywords = self.extract_keywords(normalized)
        return QueryAnalysis(
            raw_text=input_text,
            normalized_text=normalized,
            language=language,
            intent=intent,
            entity_preference=entity_preference,
            info_need=info_need,
            keywords=keywords,
        )


class CampusRepository:
    """SQLite data layer optimized for small-footprint devices."""

    def __init__(self, db_path: str, schema_path: Optional[str] = None) -> None:
        self.db_path = db_path
        self.schema_path = schema_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row

    def initialize(self) -> None:
        sql = DEFAULT_SCHEMA_SQL
        if self.schema_path and Path(self.schema_path).exists():
            sql = Path(self.schema_path).read_text(encoding="utf-8")
        self.conn.executescript(sql)
        self.conn.commit()

    def seed_demo_data(self) -> None:
        self.conn.executescript(DEMO_SEED_SQL)
        self.conn.commit()

    def _fetch_aliases(self) -> Dict[Tuple[str, int], List[str]]:
        rows = self.conn.execute("SELECT entity_type, entity_id, alias FROM aliases").fetchall()
        out: Dict[Tuple[str, int], List[str]] = {}
        for row in rows:
            key = (row["entity_type"], row["entity_id"])
            out.setdefault(key, []).append(row["alias"].lower())
        return out

    def load_candidates(self) -> List[Candidate]:
        aliases = self._fetch_aliases()
        candidates: List[Candidate] = []

        dept_rows = self.conn.execute(
            """
            SELECT d.id, d.name, d.room, d.description, d.contact_email, d.contact_phone,
                   b.code AS building_code, b.name AS building_name, b.directions_from_main_entrance
            FROM departments d
            JOIN buildings b ON b.id = d.building_id
            """
        ).fetchall()
        for row in dept_rows:
            payload = {
                "room": row["room"],
                "building_code": row["building_code"],
                "building_name": row["building_name"],
                "description": row["description"],
                "contact_email": row["contact_email"],
                "contact_phone": row["contact_phone"],
                "directions": row["directions_from_main_entrance"],
            }
            text = " ".join(
                filter(
                    None,
                    [
                        row["name"],
                        row["room"],
                        row["building_code"],
                        row["building_name"],
                        row["description"],
                        " ".join(aliases.get(("department", row["id"]), [])),
                    ],
                )
            ).lower()
            token_set = set(re.findall(r"[a-zA-Z0-9]+", text))
            candidates.append(Candidate("department", row["id"], row["name"], text, payload, token_set))

        office_rows = self.conn.execute(
            """
            SELECT o.id, o.name, o.room, o.description, o.contact_email, o.contact_phone,
                   b.code AS building_code, b.name AS building_name, b.directions_from_main_entrance
            FROM offices o
            JOIN buildings b ON b.id = o.building_id
            """
        ).fetchall()
        for row in office_rows:
            payload = {
                "room": row["room"],
                "building_code": row["building_code"],
                "building_name": row["building_name"],
                "description": row["description"],
                "contact_email": row["contact_email"],
                "contact_phone": row["contact_phone"],
                "directions": row["directions_from_main_entrance"],
            }
            text = " ".join(
                filter(
                    None,
                    [
                        row["name"],
                        row["room"],
                        row["building_code"],
                        row["building_name"],
                        row["description"],
                        " ".join(aliases.get(("office", row["id"]), [])),
                    ],
                )
            ).lower()
            token_set = set(re.findall(r"[a-zA-Z0-9]+", text))
            candidates.append(Candidate("office", row["id"], row["name"], text, payload, token_set))

        building_rows = self.conn.execute(
            """
            SELECT id, code, name, landmark, directions_from_main_entrance
            FROM buildings
            """
        ).fetchall()
        for row in building_rows:
            payload = {
                "building_code": row["code"],
                "building_name": row["name"],
                "landmark": row["landmark"],
                "directions": row["directions_from_main_entrance"],
            }
            text = " ".join(
                filter(None, [row["code"], row["name"], row["landmark"], row["directions_from_main_entrance"]])
            ).lower()
            token_set = set(re.findall(r"[a-zA-Z0-9]+", text))
            candidates.append(Candidate("building", row["id"], row["name"], text, payload, token_set))

        room_rows = self.conn.execute(
            """
            SELECT r.id, r.room_number, r.room_type, r.description,
                   b.code AS building_code, b.name AS building_name, b.directions_from_main_entrance
            FROM rooms r
            JOIN buildings b ON b.id = r.building_id
            """
        ).fetchall()
        for row in room_rows:
            payload = {
                "room": row["room_number"],
                "room_type": row["room_type"],
                "description": row["description"],
                "building_code": row["building_code"],
                "building_name": row["building_name"],
                "directions": row["directions_from_main_entrance"],
            }
            room_name = f"Room {row['room_number']}"
            text = " ".join(
                filter(None, [room_name, row["room_type"], row["description"], row["building_code"], row["building_name"]])
            ).lower()
            token_set = set(re.findall(r"[a-zA-Z0-9]+", text))
            candidates.append(Candidate("room", row["id"], room_name, text, payload, token_set))

        service_rows = self.conn.execute(
            """
            SELECT s.id, s.name, s.description, s.requirements, s.process_steps, s.turnaround_time,
                   d.name AS department_name,
                   o.name AS office_name, o.room AS office_room,
                   b.code AS building_code, b.name AS building_name, b.directions_from_main_entrance
            FROM services s
            LEFT JOIN departments d ON d.id = s.department_id
            LEFT JOIN offices o ON o.id = s.office_id
            LEFT JOIN buildings b ON b.id = o.building_id
            """
        ).fetchall()
        for row in service_rows:
            payload = {
                "description": row["description"],
                "requirements": row["requirements"],
                "process_steps": row["process_steps"],
                "turnaround_time": row["turnaround_time"],
                "department_name": row["department_name"],
                "office_name": row["office_name"],
                "office_room": row["office_room"],
                "building_code": row["building_code"],
                "building_name": row["building_name"],
                "directions": row["directions_from_main_entrance"],
            }
            text = " ".join(
                filter(
                    None,
                    [
                        row["name"],
                        row["description"],
                        row["requirements"],
                        row["process_steps"],
                        row["department_name"],
                        row["office_name"],
                        row["building_name"],
                        " ".join(aliases.get(("service", row["id"]), [])),
                    ],
                )
            ).lower()
            token_set = set(re.findall(r"[a-zA-Z0-9]+", text))
            candidates.append(Candidate("service", row["id"], row["name"], text, payload, token_set))

        personnel_rows = self.conn.execute(
            """
            SELECT p.id, p.full_name, p.title, p.email, p.phone, p.office_hours,
                   d.name AS department_name,
                   o.name AS office_name, o.room AS office_room,
                   b.code AS building_code, b.name AS building_name, b.directions_from_main_entrance
            FROM personnel p
            LEFT JOIN departments d ON d.id = p.department_id
            LEFT JOIN offices o ON o.id = p.office_id
            LEFT JOIN buildings b ON b.id = o.building_id
            """
        ).fetchall()
        for row in personnel_rows:
            payload = {
                "title": row["title"],
                "email": row["email"],
                "phone": row["phone"],
                "office_hours": row["office_hours"],
                "department_name": row["department_name"],
                "office_name": row["office_name"],
                "office_room": row["office_room"],
                "building_code": row["building_code"],
                "building_name": row["building_name"],
                "directions": row["directions_from_main_entrance"],
            }
            text = " ".join(
                filter(
                    None,
                    [
                        row["full_name"],
                        row["title"],
                        row["department_name"],
                        row["office_name"],
                        row["building_name"],
                        " ".join(aliases.get(("personnel", row["id"]), [])),
                    ],
                )
            ).lower()
            token_set = set(re.findall(r"[a-zA-Z0-9]+", text))
            candidates.append(Candidate("personnel", row["id"], row["full_name"], text, payload, token_set))

        return candidates


class MatchingEngine:
    """Hybrid keyword + optional semantic matcher."""

    def __init__(self, candidates: List[Candidate], config: AssistantConfig) -> None:
        self.candidates = candidates
        self.config = config
        self._semantic_model = None
        self._candidate_embeddings = None

        if config.semantic_enabled:
            self._init_semantic_model()

    def _init_semantic_model(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore

            self._semantic_model = SentenceTransformer(self.config.semantic_model_name)
            corpus = [candidate.searchable_text for candidate in self.candidates]
            self._candidate_embeddings = self._semantic_model.encode(
                corpus,
                convert_to_numpy=True,
                normalize_embeddings=True,
                batch_size=16,
                show_progress_bar=False,
            )
            LOGGER.info("Semantic model loaded: %s", self.config.semantic_model_name)
        except Exception as exc:
            self._semantic_model = None
            self._candidate_embeddings = None
            LOGGER.warning("Semantic model unavailable, keyword-only mode enabled: %s", exc)

    @staticmethod
    def _keyword_score(
        query_text: str,
        query_tokens: List[str],
        candidate: Candidate,
        preferred_entity: Optional[str],
    ) -> float:
        if not candidate.token_set:
            return 0.0

        query_token_set = set(query_tokens)
        overlap = len(query_token_set & candidate.token_set)
        overlap_score = overlap / max(1, len(query_token_set))

        fuzzy = SequenceMatcher(None, query_text, candidate.name.lower()).ratio()

        phrase_bonus = 0.0
        if query_text in candidate.searchable_text:
            phrase_bonus = 0.20

        entity_bonus = 0.08 if preferred_entity and candidate.entity_type == preferred_entity else 0.0

        return min(1.0, (0.55 * overlap_score) + (0.35 * fuzzy) + phrase_bonus + entity_bonus)

    def _semantic_scores(self, query_text: str) -> List[float]:
        if self._semantic_model is None or self._candidate_embeddings is None:
            return [0.0] * len(self.candidates)

        query_embedding = self._semantic_model.encode(
            [query_text],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]

        import numpy as np

        sims = np.dot(self._candidate_embeddings, query_embedding)
        return sims.tolist()

    def match(self, analysis: QueryAnalysis, top_k: int = 5) -> MatchResult:
        semantic_scores = self._semantic_scores(analysis.normalized_text)

        ranked: List[RankedCandidate] = []
        for idx, candidate in enumerate(self.candidates):
            keyword = self._keyword_score(
                analysis.normalized_text,
                analysis.keywords,
                candidate,
                analysis.entity_preference,
            )
            semantic = semantic_scores[idx] if idx < len(semantic_scores) else 0.0
            combined = (0.75 * keyword) + (0.25 * semantic)
            ranked.append(
                RankedCandidate(
                    candidate=candidate,
                    keyword_score=keyword,
                    semantic_score=semantic,
                    combined_score=combined,
                )
            )

        ranked.sort(key=lambda item: item.combined_score, reverse=True)
        top = ranked[:top_k]
        if not top or top[0].combined_score < self.config.match_threshold:
            return MatchResult(status="unknown", best=None, alternatives=top)

        if len(top) > 1:
            gap = top[0].combined_score - top[1].combined_score
            if gap < self.config.ambiguity_gap and top[1].combined_score >= self.config.match_threshold:
                return MatchResult(status="ambiguous", best=top[0], alternatives=top)

        return MatchResult(status="matched", best=top[0], alternatives=top)


class ResponseGenerator:
    """Generates final navigation text. Uses OpenAI optionally; local fallback always available."""

    def __init__(self, config: AssistantConfig) -> None:
        self.config = config
        self._openai_client = None

        if config.use_openai:
            api_key = os.getenv("OPENAI_API_KEY", "").strip()
            if not api_key:
                LOGGER.warning("OPENAI_API_KEY missing. OpenAI generation disabled.")
                return

            try:
                from openai import OpenAI  # type: ignore

                self._openai_client = OpenAI(api_key=api_key, timeout=config.openai_timeout_s)
            except Exception as exc:
                LOGGER.warning("OpenAI client could not be initialized: %s", exc)

    @staticmethod
    def _local_unknown_response(alternatives: List[RankedCandidate]) -> str:
        if not alternatives:
            return (
                "I could not find a campus match. Please include a department, office, service, room, or personnel name."
            )

        suggestions = ", ".join(item.candidate.name for item in alternatives[:3])
        return (
            "I am not fully sure about the target. Did you mean: "
            f"{suggestions}? Please provide one more keyword."
        )

    @staticmethod
    def _format_location(name: str, building_code: Optional[str], room: Optional[str]) -> str:
        if building_code and room:
            return f"{name} is in {building_code}, Room {room}."
        if building_code:
            return f"{name} is in {building_code}."
        if room:
            return f"{name} is in Room {room}."
        return f"{name} is located on campus."

    def _local_response(self, analysis: QueryAnalysis, match: MatchResult) -> str:
        if match.status == "unknown":
            return self._local_unknown_response(match.alternatives)

        if match.status == "ambiguous":
            choices = ", ".join(item.candidate.name for item in match.alternatives[:3])
            return f"I found multiple close matches: {choices}. Which one do you mean?"

        if not match.best:
            return "I could not determine the correct campus location."

        item = match.best.candidate
        payload = item.payload

        if item.entity_type in {"department", "office", "room", "building"}:
            room_value = payload.get("room") or payload.get("office_room")
            sentence = self._format_location(
                item.name,
                payload.get("building_code"),
                room_value,
            )
            directions = payload.get("directions") or "Follow campus map signs from the main entrance."
            return f"{sentence} {directions}"

        if item.entity_type == "service":
            office_name = payload.get("office_name") or payload.get("department_name") or "the assigned office"
            office_room = payload.get("office_room")
            building_code = payload.get("building_code")

            if analysis.info_need == "requirements":
                req = payload.get("requirements") or "No documented requirements yet."
                return (
                    f"For {item.name}, requirements are: {req}. "
                    f"Submit at {office_name}"
                    + (f", Room {office_room}" if office_room else "")
                    + (f" in {building_code}." if building_code else ".")
                )

            if analysis.info_need == "process":
                steps = payload.get("process_steps") or "No documented process steps yet."
                return (
                    f"For {item.name}, follow these steps: {steps}. "
                    f"Proceed to {office_name}"
                    + (f", Room {office_room}" if office_room else "")
                    + (f" in {building_code}." if building_code else ".")
                )

            return (
                f"{item.name} is handled by {office_name}"
                + (f", Room {office_room}" if office_room else "")
                + (f" in {building_code}." if building_code else ".")
                + " "
                + (payload.get("directions") or "Follow campus map signs from the main entrance.")
            )

        if item.entity_type == "personnel":
            title = payload.get("title") or "Staff"
            office_name = payload.get("office_name") or "assigned office"
            office_room = payload.get("office_room")
            building_code = payload.get("building_code")
            directions = payload.get("directions") or "Check the nearest campus directory for guidance."
            return (
                f"{item.name} ({title}) can be found at {office_name}"
                + (f", Room {office_room}" if office_room else "")
                + (f" in {building_code}." if building_code else ".")
                + " "
                + directions
            )

        return "I found a match but could not build a detailed navigation response."

    def _openai_response(
        self,
        query_text: str,
        analysis: QueryAnalysis,
        match: MatchResult,
        local_fallback: str,
    ) -> str:
        if self._openai_client is None:
            return local_fallback
        if not match.best:
            return local_fallback

        facts = {
            "query": query_text,
            "intent": analysis.intent,
            "info_need": analysis.info_need,
            "entity_type": match.best.candidate.entity_type,
            "entity_name": match.best.candidate.name,
            "payload": match.best.candidate.payload,
            "language": analysis.language,
        }

        system_prompt = (
            "You are a campus navigation response formatter. "
            "Use only provided facts. Never invent buildings, rooms, or directions. "
            "Return one concise helpful answer."
        )

        user_prompt = (
            "Format this into clear campus navigation text. "
            "If any fact is missing, explicitly say what is missing.\n"
            f"Facts:\n{json.dumps(facts, indent=2)}"
        )

        try:
            completion = self._openai_client.chat.completions.create(
                model=self.config.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=180,
            )
            text = completion.choices[0].message.content or ""
            text = text.strip()
            return text if text else local_fallback
        except Exception as exc:
            LOGGER.warning("OpenAI call failed, using local fallback: %s", exc)
            return local_fallback

    def generate(self, query_text: str, analysis: QueryAnalysis, match: MatchResult) -> str:
        local = self._local_response(analysis, match)
        return self._openai_response(query_text, analysis, match, local)


class CampusNavigationAssistant:
    def __init__(self, config: AssistantConfig) -> None:
        self.config = config
        self.repo = CampusRepository(config.db_path, config.schema_path)
        self.repo.initialize()
        self._ensure_seed_data()

        self.nlp = NLPProcessor()
        self.generator = ResponseGenerator(config)

        self._refresh_matcher()

        self.stt: Optional[STTProcessor] = None
        if config.stt_model_path:
            self.stt = STTProcessor(config.stt_model_path, config.stt_confidence_threshold)

    def _ensure_seed_data(self) -> None:
        row = self.repo.conn.execute("SELECT COUNT(*) AS count FROM buildings").fetchone()
        if row and row["count"] == 0:
            LOGGER.info("Database is empty. Seeding demo records.")
            self.repo.seed_demo_data()

    def _refresh_matcher(self) -> None:
        candidates = self.repo.load_candidates()
        self.matcher = MatchingEngine(candidates, self.config)

    def handle_request(
        self,
        text_input: Optional[str] = None,
        wav_path: Optional[str] = None,
        trace: bool = False,
    ) -> Dict[str, Any]:
        timeline: Dict[str, float] = {}

        t0 = time.perf_counter()
        if wav_path:
            if not self.stt:
                raise RuntimeError("Voice input requested but STT is not configured.")
            transcript, confidence = self.stt.transcribe_wav(wav_path)
            query_text = transcript
            timeline["speech_confidence"] = confidence
        elif text_input:
            query_text = text_input.strip()
        else:
            raise ValueError("Either text_input or wav_path must be provided.")

        if not query_text:
            raise LowQualitySpeechError("No usable text was captured from input.")
        timeline["input_ms"] = (time.perf_counter() - t0) * 1000

        t1 = time.perf_counter()
        analysis = self.nlp.analyze(query_text)
        timeline["nlp_ms"] = (time.perf_counter() - t1) * 1000

        t2 = time.perf_counter()
        match = self.matcher.match(analysis)
        timeline["matching_ms"] = (time.perf_counter() - t2) * 1000

        t3 = time.perf_counter()
        response_text = self.generator.generate(query_text, analysis, match)
        timeline["generation_ms"] = (time.perf_counter() - t3) * 1000
        timeline["total_ms"] = (time.perf_counter() - t0) * 1000

        top_alts = [
            {
                "entity_type": item.candidate.entity_type,
                "name": item.candidate.name,
                "score": round(item.combined_score, 3),
            }
            for item in match.alternatives[:3]
        ]

        result = {
            "query": query_text,
            "normalized_query": analysis.normalized_text,
            "language": analysis.language,
            "intent": analysis.intent,
            "entity_preference": analysis.entity_preference,
            "info_need": analysis.info_need,
            "keywords": analysis.keywords,
            "match_status": match.status,
            "top_candidates": top_alts,
            "response": response_text,
            "timings_ms": {k: round(v, 2) for k, v in timeline.items()},
        }

        if trace:
            self.print_trace(result)

        return result

    @staticmethod
    def print_trace(result: Dict[str, Any]) -> None:
        print("\n=== Campus Navigation Trace ===")
        print(f"Input Layer: {result['query']}")
        print(f"NLP Layer: intent={result['intent']} | language={result['language']} | keywords={result['keywords']}")
        print(
            "Matching Layer: "
            f"status={result['match_status']} | top={result['top_candidates']}"
        )
        print(f"Output Layer: {result['response']}")
        print(f"Timings (ms): {result['timings_ms']}")


def build_config_from_args(args: argparse.Namespace) -> AssistantConfig:
    return AssistantConfig(
        db_path=args.db,
        schema_path=args.schema,
        use_openai=args.use_openai,
        openai_model=args.openai_model,
        stt_model_path=args.stt_model,
        semantic_enabled=args.semantic,
        match_threshold=args.match_threshold,
        ambiguity_gap=args.ambiguity_gap,
    )


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Campus navigation assistant for Raspberry Pi")
    parser.add_argument("--db", default="campus.db", help="Path to SQLite database")
    parser.add_argument("--schema", default=None, help="Optional custom schema SQL file")
    parser.add_argument("--stt-model", default=None, help="Path to Vosk model directory")
    parser.add_argument("--semantic", action="store_true", help="Enable sentence-transformer semantic matching")
    parser.add_argument("--use-openai", action="store_true", help="Use OpenAI for final response formatting")
    parser.add_argument("--openai-model", default="gpt-4o", help="OpenAI model name")
    parser.add_argument("--match-threshold", type=float, default=0.33, help="Minimum confidence threshold")
    parser.add_argument("--ambiguity-gap", type=float, default=0.06, help="Gap threshold to detect ambiguity")

    parser.add_argument("--text", default=None, help="Text query input")
    parser.add_argument("--voice-wav", default=None, help="Path to mono 16-bit PCM WAV file")
    parser.add_argument("--trace", action="store_true", help="Print layer-by-layer trace")
    parser.add_argument("--demo", action="store_true", help="Run built-in demonstration query")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    config = build_config_from_args(args)

    assistant = CampusNavigationAssistant(config)

    try:
        if args.demo:
            demo_query = "Where is the computer science department?"
            result = assistant.handle_request(text_input=demo_query, trace=True)
            print("\nFinal Response:")
            print(result["response"])
            return 0

        if args.text or args.voice_wav:
            result = assistant.handle_request(text_input=args.text, wav_path=args.voice_wav, trace=args.trace)
            print(json.dumps(result, indent=2))
            return 0

        print("No input provided. Use --text, --voice-wav, or --demo.\n")
        return 1

    except LowQualitySpeechError as exc:
        print(f"Input error: {exc}")
        return 2
    except UnknownQueryError as exc:
        print(f"Unknown query: {exc}")
        return 3
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Unhandled failure")
        print(f"System error: {exc}")
        return 10


if __name__ == "__main__":
    sys.exit(main())
