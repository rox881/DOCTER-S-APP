# 🩺 Medical Consultation — Live Ambient AI Scribe & Clinical EHR System

An end-to-end ambient medical transcription and clinical documentation platform. Audio is captured in the browser, streamed in real time via **Deepgram Cloud STT (`nova-2-medical`)**, rendered continuously in the **Live Medical Transcription** interface, and analyzed by **Groq (`openai/gpt-oss-20b` with dynamic model fallback)** to extract all 9 required clinical field groups. The clinical summary is presented in an **AI Medical Summary** panel and persisted to a local **SQLite database (`consultations.db`)**.

---

## 🏛️ System Architecture

```
                  BROWSER CLIENT
   ┌─────────────────────────────────────────────────────────────┐
   │                                                             │
   │  LEFT PANEL: Live Medical Transcription                     │
   │  • Pill Controls: [Start Mic] [Stop] [Clear] [Save Recording]│
   │  • Stats: [WORDS: 0] [CHUNKS: 0] [VAD: Speech/Silence]      │
   │  • Top Box: Active live recognized speech chunk             │
   │  • Bottom Box: Full cumulative transcript stream            │
   │  • Action: [⚡ Process Transcript with AI]                   │
   │                                                             │
   │  RIGHT PANEL: AI Medical Summary                            │
   │  • Header: [⏳ AI Medical Summary]  [✕ Clear]               │
   │  • Demographics: Patient Name: ... | Age: ... Gender: ...   │
   │  • Active Visual Feedback Spinner / Status Banner           │
   │  • 9 Divider Sections:                                      │
   │    1. CLINICAL SUMMARY (Textarea)                           │
   │    2. CHIEF COMPLAINTS                                      │
   │    3. SYMPTOMS (Positive [+] & Stated Negatives [-])        │
   │    4. CLINICAL IMPRESSION                                   │
   │    5. MEDICATIONS                                           │
   │    6. EXAMINATIONS & TESTS                                  │
   │    7. ALLERGIES                                             │
   │    8. PAST MEDICAL HISTORY                                  │
   │    9. HISTORY & FOLLOW-UP                                   │
   │  • Action: [Copy to Prescription]                           │
   └──────────────┬───────────────────────────────▲──────────────┘
                  │                               │
            WebSocket Stream              WebSocket Event
            (16kHz Float32 PCM)      (interim, final, summary)
                  │                               │
   ═══════════════╪═══════════════════════════════╪═══════════════
                  ▼                               │
   ┌──────────────────────────────────────────────┴──────────────┐
   │                       FASTAPI BACKEND                       │
   │                                                             │
   │ 1. Audio Processor: Float32 PCM → Int16 PCM                 │
   │ 2. Deepgram Streaming Client (wss://api.deepgram.com/v1/listen)│
   │    • Model: nova-2-medical                                  │
   │    • Real-time interim stream + Final committed chunks      │
   │ 3. TranscriptionSession: Overlap deduplication & hygiene    │
   │                                                             │
   │ [On Session Stop or On-Demand "Process Transcript with AI"] │
   │ 4. Groq Clinical Extractor (openai/gpt-oss-20b + auto-fallback)│
   │    • Fast JSON extraction of all 9 clinical fields          │
   │    • Automatic model discovery & fallback                   │
   │ 5. SQLite Persistence (consultations.db)                    │
   │    • Relational columns for each field + raw JSON payload   │
   │ 6. REST API: /api/consultations & /api/extract              │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
                         [consultations.db]
                    (Local, Private, Relational)
```

---

## ✨ Key Features & Enhancements

### 1. UI Matched to Assignment Specifications
- **Left Panel (`Live Medical Transcription`)**:
  - `Start Mic` (purple pill button with recording pulse)
  - `Stop` (white pill button with red border)
  - `Clear` (white pill button with gray border)
  - `Save Recording` (white pill button with green border)
  - Badges: `📄 WORDS: 0`, `🔄 CHUNKS: 0`, and `VAD: Speech/Silence`
  - **Top Box**: Displays current speaking audio chunk with live listening wave.
  - **Bottom Box**: Accumulates full continuous consultation transcript.
  - **Bottom Action**: Full-width purple pill button `⚡ Process Transcript with AI`.

- **Right Panel (`AI Medical Summary`)**:
  - `⏳ AI Medical Summary` header with `✕ Clear` button.
  - **Patient Demographics Row**: `Patient Name: ...` and `Age: ... Gender: ...`
  - **Active Visual Feedback**: Displays a pulsing spinner and status banner (*"⚡ Extracting clinical EHR fields with Groq (openai/gpt-oss-20b)..."*) while processing.
  - **The 9 Sections with Horizontal Dividers**:
    1. `📋 CLINICAL SUMMARY`: Narrative summary inside a dedicated textarea.
    2. `💬 CHIEF COMPLAINTS`: Primary reason for consultation.
    3. `🩺 SYMPTOMS`: Categorized into reported positives (`+`) and stated negatives (`-`).
    4. `🩺 CLINICAL IMPRESSION`: Provisional diagnosis or differential diagnosis.
    5. `💊 MEDICATIONS`: Current medicines, dosages, and adherence.
    6. `🔬 EXAMINATIONS & TESTS`: Vitals, examination findings, and labs ordered.
    7. `⚠️ ALLERGIES`: Known drug allergies with alert badge.
    8. `🕒 PAST MEDICAL HISTORY`: Prior medical conditions, surgeries, and hospitalizations.
    9. `📅 HISTORY & FOLLOW-UP`: HPI (onset, duration, progression) + lifestyle advice and follow-up.
  - **Bottom Action**: Full-width purple pill button `Copy to Prescription`.

### 2. Clinical Extraction (`openai/gpt-oss-20b` with Dynamic Auto-Fallback)
- Configured with `openai/gpt-oss-20b` as requested by user.
- **Dynamic Model Discovery**: Queries Groq `/v1/models` at runtime. If `openai/gpt-oss-20b` is unavailable or returns 404 on the active Groq account, it automatically switches to an available high-performing chat model (e.g. `llama-3.3-70b-versatile`, `llama-3.1-70b-versatile`, `llama3-70b-8192`) without crashing or requiring manual restarts.
- Strict extraction: Zero hallucination, strict schema enforcement, and null fallbacks.

### 3. Past Consultations History Feature
- **Slide-out Drawer**: Accessible via the `🕒 History` button in the header or the floating chat bubble.
- **Quick Dropdown**: Header select box for instant 1-click loading.
- Lists all previous sessions saved in SQLite `consultations.db` with date, patient name, chief complaint, audio duration, and word count.
- **1-Click Reload**: Clicking any past consultation instantly populates both the transcript stream and the complete 9-field structured EHR note in the UI!

### 4. Prescription Copy & Save Recording
- **`Copy to Prescription`**: Generates a standardized clinical prescription encounter summary formatted for pharmacy or EHR submission and copies it to the clipboard.
- **`Save Recording`**: Exports the entire consultation transcript and clinical summary to a downloadable `.txt` file.

---

## 📋 The 9 Extracted Clinical Field Groups

| Field Group | Description & Clinical Scope |
| :--- | :--- |
| **1. Patient Details** | Name, age, sex, and any identifiers stated during visit. |
| **2. Chief Complaint** | The primary reason for the consultation in the patient's own words. |
| **3. History of Present Illness (HPI)** | Onset, duration, progression, aggravating and relieving factors. |
| **4. Symptoms** | Discrete lists with **positives** and **stated negatives** strictly kept separate. |
| **5. Past Medical History** | Prior medical conditions, surgeries, and hospitalizations. |
| **6. Medication History** | Current medicines, dosages, adherence, and known drug allergies. |
| **7. Clinical Observations** | Vitals (BP, HR, Temp) and physical examination findings stated aloud. |
| **8. Assessment** | Provisional diagnosis or differential diagnoses stated by the doctor. |
| **9. Treatment Plan** | Prescriptions, investigations/labs ordered, lifestyle advice, follow-up timeframe. |

---

## 💾 Database Schema (`consultations.db`)

Consultations are persisted in a relational `consultations` table:

```sql
CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    duration_seconds REAL,
    word_count INTEGER,
    full_transcript TEXT,
    
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
    
    -- 4. Symptoms
    positive_symptoms TEXT,   -- JSON Array: ["cough", "fever"]
    stated_negatives TEXT,    -- JSON Array: ["no chest pain"]
    
    -- 5. Past Medical History
    past_medical_history TEXT, -- JSON Array
    
    -- 6. Medication History
    current_medications TEXT, -- JSON Array
    medication_adherence TEXT,
    known_allergies TEXT,     -- JSON Array
    
    -- 7. Clinical Observations
    vitals TEXT,
    examination_findings TEXT,
    
    -- 8. Assessment
    assessment TEXT,
    
    -- 9. Treatment Plan
    plan_investigations TEXT, -- JSON Array
    plan_prescriptions TEXT,  -- JSON Array
    plan_advice TEXT,
    plan_follow_up TEXT,
    
    -- Full Raw Payload
    clinical_summary_json TEXT
);
```

---

## 📁 Project Structure

```
medical-transcription/
├── backend/
│   ├── config.py                 # Configuration for Deepgram, Groq, and SQLite
│   ├── main.py                   # FastAPI server, dual-task WebSocket & REST routes (/api/extract)
│   ├── audio/
│   │   ├── preprocessor.py       # Float32 → Int16 PCM conversion
│   │   └── processor.py          # WebSocket audio chunk processor
│   ├── asr/
│   │   └── deepgram_client.py    # Deepgram streaming client with fast stop
│   ├── llm/
│   │   └── groq_client.py        # Groq extractor (openai/gpt-oss-20b + auto-fallback)
│   ├── db/
│   │   └── database.py           # SQLite database engine with async operations
│   └── transcript/
│       ├── postprocessor.py      # Text cleanup
│       ├── merger.py             # Suffix/prefix deduplication
│       └── session.py            # Consultation lifecycle manager
│
├── frontend/
│   ├── index.html                # UI layout with pill buttons, 9 dividers & drawer
│   ├── css/
│   │   └── styles.css            # Stylesheet matching assignment screenshots
│   └── js/
│       ├── worklet-processor.js  # AudioWorklet PCM 16kHz capture
│       ├── state.js              # Central reactive app state
│       ├── websocket.js          # Binary streaming & JSON event dispatcher
│       ├── audio.js              # MediaDevices audio capture engine
│       ├── transcript.js         # Streaming renderer, AI extractor & drawer manager
│       ├── ui.js                 # Controls, buttons, and state indicators
│       └── app.js                # App bootstrap entry point
│
├── consultations.db              # Local SQLite database
├── .env                          # Local environment variables (API keys)
├── .env.example                  # Template file for environment variables
├── requirements.txt              # Project dependencies
├── start.py                      # One-command server launcher
└── README.md                     # Comprehensive documentation
```

---

## 🚀 Setup & Execution

### 1. Environment Configuration
Create or verify `.env`:
```env
# Required: Deepgram API Key (STT)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Required: Groq API Key (Clinical Information Extraction)
GROQ_API_KEY=your_groq_api_key_here

# Model Configurations
DEEPGRAM_MODEL=nova-2-medical
GROQ_MODEL=openai/gpt-oss-20b
HOST=127.0.0.1
PORT=8000
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Start the Server
```bash
python start.py
```
Open `http://127.0.0.1:8000` in your browser.

---

## 🩺 Using the Application

1. **Start Mic**: Click **"Start Mic"** and grant microphone permissions. Speak consultation dialogues naturally.
2. **Real-time Live Audio Transcription**: The top chunk box displays active speaking chunks with a live wave, and the bottom box accumulates the full continuous transcript.
3. **Process with AI**:
   - Click **"Stop"** to end recording, or click **"⚡ Process Transcript with AI"** at any time.
   - The AI panel immediately shows the active spinner feedback (*"⚡ Extracting clinical EHR fields with Groq (openai/gpt-oss-20b)..."*).
   - All 9 clinical sections and demographics populate with structured findings.
4. **Copy to Prescription**: Click **"Copy to Prescription"** to copy a clinical encounter note to clipboard.
5. **View Past Consultations**: Click **"🕒 History"** to open the slide-out drawer, or use the header dropdown to view and reload any past consultation session.

