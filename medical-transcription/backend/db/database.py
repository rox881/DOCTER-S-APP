"""
SQLite Database Manager for Medical Consultations.
Persists consultation transcripts, metadata, and all 9 extracted clinical fields
into structured relational columns as well as raw JSON.
Uses standard library sqlite3 wrapped in asyncio.to_thread for async FastAPI compatibility.
"""

import asyncio
import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .. import config

logger = logging.getLogger(__name__)


class ConsultationDatabase:
    """
    Manages SQLite database operations for consultation sessions and structured clinical findings.
    """

    def __init__(self, db_path: Path = config.DB_PATH):
        self.db_path = db_path

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def init_db_sync(self):
        """Creates the consultations table with full field-group columns."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS consultations (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    duration_seconds REAL DEFAULT 0.0,
                    word_count INTEGER DEFAULT 0,
                    full_transcript TEXT DEFAULT '',
                    
                    -- 1. Patient Details
                    patient_name TEXT,
                    patient_age TEXT,
                    patient_sex TEXT,
                    patient_identifiers TEXT,
                    
                    -- 2. Chief Complaint
                    chief_complaint TEXT,
                    
                    -- 3. History of Present Illness (HPI)
                    hpi_onset TEXT,
                    hpi_duration TEXT,
                    hpi_progression TEXT,
                    hpi_aggravating TEXT,
                    hpi_relieving TEXT,
                    
                    -- 4. Symptoms (Stored as JSON Arrays)
                    positive_symptoms TEXT DEFAULT '[]',
                    stated_negatives TEXT DEFAULT '[]',
                    
                    -- 5. Past Medical History (JSON Array)
                    past_medical_history TEXT DEFAULT '[]',
                    
                    -- 6. Medication History
                    current_medications TEXT DEFAULT '[]',
                    medication_adherence TEXT,
                    known_allergies TEXT DEFAULT '[]',
                    
                    -- 7. Clinical Observations
                    vitals TEXT,
                    examination_findings TEXT,
                    
                    -- 8. Assessment
                    assessment TEXT,
                    
                    -- 9. Treatment Plan
                    plan_investigations TEXT DEFAULT '[]',
                    plan_prescriptions TEXT DEFAULT '[]',
                    plan_advice TEXT,
                    plan_follow_up TEXT,
                    
                    -- Complete Structured JSON payload
                    clinical_summary_json TEXT
                );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);")
            conn.commit()
            logger.info("[DB] SQLite database initialized at %s", self.db_path)

    async def init_db(self):
        """Asynchronously initialize database."""
        await asyncio.to_thread(self.init_db_sync)

    def save_consultation_sync(self, record: Dict[str, Any]) -> str:
        """Synchronously write consultation record into database."""
        session_id = record.get("session_id", datetime.now().strftime("%Y%m%d_%H%M%S"))
        created_at = record.get("created_at", datetime.now().isoformat())
        duration = float(record.get("duration_seconds", 0.0))
        word_count = int(record.get("word_count", 0))
        transcript = record.get("full_transcript", "")

        clinical = record.get("clinical_summary", {}) or {}
        patient = clinical.get("patient_details", {}) or {}
        hpi = clinical.get("history_of_present_illness", {}) or {}
        symptoms = clinical.get("symptoms", {}) or {}
        meds = clinical.get("medication_history", {}) or {}
        obs = clinical.get("clinical_observations", {}) or {}
        plan = clinical.get("plan", {}) or {}

        def to_json_str(val):
            if isinstance(val, (list, dict)):
                return json.dumps(val)
            return json.dumps([]) if val is None else str(val)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO consultations (
                    id, created_at, duration_seconds, word_count, full_transcript,
                    patient_name, patient_age, patient_sex, patient_identifiers,
                    chief_complaint,
                    hpi_onset, hpi_duration, hpi_progression, hpi_aggravating, hpi_relieving,
                    positive_symptoms, stated_negatives,
                    past_medical_history,
                    current_medications, medication_adherence, known_allergies,
                    vitals, examination_findings,
                    assessment,
                    plan_investigations, plan_prescriptions, plan_advice, plan_follow_up,
                    clinical_summary_json
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?,
                    ?, ?, ?, ?, ?,
                    ?, ?,
                    ?,
                    ?, ?, ?,
                    ?, ?,
                    ?,
                    ?, ?, ?, ?,
                    ?
                )
            """, (
                session_id,
                created_at,
                duration,
                word_count,
                transcript,
                patient.get("name"),
                patient.get("age"),
                patient.get("sex"),
                patient.get("identifiers"),
                clinical.get("chief_complaint", ""),
                hpi.get("onset"),
                hpi.get("duration"),
                hpi.get("progression"),
                hpi.get("aggravating_factors"),
                hpi.get("relieving_factors"),
                to_json_str(symptoms.get("positive_symptoms", [])),
                to_json_str(symptoms.get("stated_negatives", [])),
                to_json_str(clinical.get("past_medical_history", [])),
                to_json_str(meds.get("current_medications", [])),
                meds.get("adherence"),
                to_json_str(meds.get("known_allergies", [])),
                obs.get("vitals"),
                obs.get("examination_findings"),
                clinical.get("assessment", ""),
                to_json_str(plan.get("investigations", [])),
                to_json_str(plan.get("prescriptions", [])),
                plan.get("advice"),
                plan.get("follow_up"),
                json.dumps(clinical)
            ))
            conn.commit()
            logger.info("[DB] Saved consultation record: %s", session_id)
            return session_id

    async def save_consultation(self, record: Dict[str, Any]) -> str:
        """Asynchronously save consultation record."""
        return await asyncio.to_thread(self.save_consultation_sync, record)

    def list_consultations_sync(self, limit: int = 20) -> List[Dict[str, Any]]:
        """List recent consultations with summary metadata."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, created_at, duration_seconds, word_count,
                       patient_name, patient_age, patient_sex, chief_complaint, assessment
                FROM consultations
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    async def list_consultations(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Asynchronously list consultations."""
        return await asyncio.to_thread(self.list_consultations_sync, limit)

    def get_consultation_sync(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full consultation record including full JSON."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM consultations WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if not row:
                return None
            res = dict(row)
            if res.get("clinical_summary_json"):
                try:
                    res["clinical_summary"] = json.loads(res["clinical_summary_json"])
                except Exception:
                    res["clinical_summary"] = {}
            return res

    async def get_consultation(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Asynchronously fetch full consultation record."""
        return await asyncio.to_thread(self.get_consultation_sync, session_id)


# Global singleton instance
db = ConsultationDatabase()
