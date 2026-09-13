# 💾 Database Schema & Session Persistence Guide

This document describes the relational database structure, schema definitions, and consultation lifecycle persistence implemented in **SQLite 3 (`consultations.db`)**.

---

## 1. Relational Schema (`consultations` Table)

The system automatically initializes the `consultations.db` database on first startup via [`backend/db/database.py`]:

```sql
CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    duration_seconds REAL DEFAULT 0.0,
    word_count INTEGER DEFAULT 0,
    full_transcript TEXT NOT NULL,
    
    -- Patient Demographics
    patient_name TEXT,
    patient_age TEXT,
    patient_sex TEXT,
    patient_identifiers TEXT,
    
    -- Chief Complaint & HPI
    chief_complaint TEXT,
    hpi_onset TEXT,
    hpi_duration TEXT,
    hpi_progression TEXT,
    hpi_aggravating TEXT,
    hpi_relieving TEXT,
    
    -- Symptoms (Separated Positives & Negatives)
    positive_symptoms TEXT,
    stated_negatives TEXT,
    
    -- Clinical History
    past_medical_history TEXT,
    current_medications TEXT,
    medication_adherence TEXT,
    known_allergies TEXT,
    
    -- Physical Exam & Assessment
    vitals TEXT,
    examination_findings TEXT,
    assessment TEXT,
    
    -- Plan & Orders
    plan_investigations TEXT,
    plan_prescriptions TEXT,
    plan_advice TEXT,
    plan_follow_up TEXT,
    
    -- Complete Raw JSON Payload
    clinical_summary_json TEXT
);
```

---

## 2. Persistence Lifecycle

1. **Active Session Tracking**:
   - As speech streams from the client, the `TranscriptionSession` maintains the transcript buffer, word counts, and timestamp markers.
2. **AI Extraction & Auto-Save**:
   - When **`⚡ Process Transcript with AI`** is clicked (or when the clinician stops recording), the extracted 9-field EHR payload and raw transcript are committed to `consultations.db`.
3. **Session Querying & 1-Click Reload**:
   - When the user opens the **`🕒 History`** drawer or clicks the header history dropdown, the frontend queries `GET /api/consultations` to render recent encounter cards.
   - Selecting a consultation calls `GET /api/consultations/{id}` and instantly repopulates:
     - The complete cumulative dialogue into the **Bottom Transcript Box**.
     - All 9 structured clinical sections into the **AI Medical Summary Panel**.
     - Patient demographics into the header controls.

---

## 3. Database REST Endpoints

### `GET /api/consultations`
Returns a list of past consultation summaries ordered by timestamp descending.
- **Response Format**:
  ```json
  [
    {
      "id": "c1a9f3-...",
      "created_at": "2026-09-13T06:15:00",
      "patient_name": "Dr Tushar",
      "word_count": 342,
      "chief_complaint": "Frontal throbbing headache"
    }
  ]
  ```

### `GET /api/consultations/{id}`
Returns the complete consultation record including the raw transcript, parsed clinical columns, and serialized JSON EHR payload.
