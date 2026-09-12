# 🩺 Medical Consultation — Real-Time Live Audio & Transcription (Deepgram Cloud STT)

A production-grade real-time medical transcription application. Audio is captured in the browser, streamed to a FastAPI backend, and transcribed via **Deepgram's cloud streaming WebSocket API** — delivering partial (interim) results as you speak, with final committed segments within milliseconds of silence.

```
               BROWSER                          DEEPGRAM CLOUD
    ┌────────────────────────┐          ┌──────────────────────────┐
    │  Medical Consultation  │          │  /v2/listen WebSocket     │
    │          UI            │          │                           │
    │                        │          │  • nova-3-medical model   │
    │ 🎤 Start / Stop        │          │  • Cloud VAD              │
    │                        │          │  • Endpointing (600ms)    │
    │ Live Transcript Panel  │          │  • Interim + Final results│
    └────────────┬───────────┘          └───────────┬──────────────┘
                 │                                  │
           WebSocket                          WebSocket
           (Float32 PCM)              (streaming audio → events)
                 │                                  │
                 ▼                                  │
    ┌────────────────────────┐                      │
    │    FastAPI Backend     │──────────────────────┘
    │                        │
    │  AudioProcessor        │  Float32 → Int16 conversion
    │       ↓                │
    │  audio_relay_task ─────┼──→  send Int16 bytes to Deepgram
    │  transcript_task  ←────┼──   receive events from Deepgram
    │       ↓                │
    │  TranscriptionSession  │  text cleanup + session accumulation
    └────────────┬───────────┘
                 │
          transcript events
         (partial + final)
                 │
                 ▼
             BROWSER
       (Live Transcript View)
```

---

## 📁 Project Structure

```
medical-transcription/
├── backend/
│   ├── __init__.py
│   ├── config.py                 # Deepgram API key, model, endpointing config
│   ├── main.py                   # FastAPI server & dual-task WebSocket pipeline
│   ├── audio/
│   │   ├── __init__.py
│   │   ├── preprocessor.py       # Float32 → Int16 PCM conversion for Deepgram
│   │   └── processor.py          # Converts WebSocket bytes to Int16 stream
│   ├── vad/
│   │   └── __init__.py           # Stub — VAD handled by Deepgram cloud
│   ├── asr/
│   │   ├── __init__.py
│   │   └── deepgram_client.py    # Persistent Deepgram streaming WebSocket client
│   └── transcript/
│       ├── __init__.py
│       ├── postprocessor.py      # Text hygiene & punctuation formatting
│       ├── merger.py             # Boundary overlap deduplication
│       └── session.py            # Stateful consultation record management
│
├── frontend/
│   ├── index.html                # Medical dashboard UI
│   ├── css/
│   │   └── styles.css            # Violet/Purple theme, cards, responsive layout
│   └── js/
│       ├── worklet-processor.js  # AudioWorklet PCM 16kHz processor
│       ├── state.js              # Central reactive state management
│       ├── websocket.js          # Streaming binary WS connection & event dispatcher
│       ├── audio.js              # getUserMedia + AudioWorklet + fallback
│       ├── transcript.js         # Segment rendering, copy, and file export
│       ├── ui.js                 # Event listeners, meters, and status badges
│       └── app.js                # Application entry point
│
├── .env.example                  # API key template — copy to .env
├── requirements.txt              # Dependencies (no PyTorch)
├── start.py                      # One-command launcher
└── README.md
```

---

## 🚀 Quick Start

### Step 1: Set Your Deepgram API Key
```bash
# Copy the template
cp .env.example .env
```
Edit `.env` and set:
```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```
Get a free key at [console.deepgram.com](https://console.deepgram.com).

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```
> No PyTorch required — installs in seconds.

### Step 3: Start the Application
```bash
python start.py
```
The server starts at `http://localhost:8000`. Open the browser UI, click **Start**, and speak.

---

## ⚙️ Configuration Reference (`backend/config.py`)

All settings can be overridden via environment variables in `.env`:

| Parameter | Default | Purpose |
|---|---|---|
| `DEEPGRAM_API_KEY` | *(required)* | Your Deepgram API key |
| `DEEPGRAM_MODEL` | `nova-3-medical` | STT model (`nova-3-medical`, `nova-3`, `nova-2`) |
| `DEEPGRAM_ENDPOINTING_MS` | `600` | Trailing silence (ms) before utterance is finalized |
| `DEEPGRAM_UTTERANCE_END_MS` | `1000` | Delay (ms) before `UtteranceEnd` event fires |
| `LANGUAGE` | `en` | Transcription language |
| `SAMPLE_RATE` | `16000` | 16 kHz mono PCM |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `8000` | Server port |

---

## 🔄 Real-Time Pipeline Flow

```
Browser mic (Float32 PCM, 16kHz)
    │
    ▼ /ws/transcribe
AudioProcessor: Float32 → Int16 bytes
    │
    ▼ Deepgram WebSocket (streaming)
Deepgram Cloud:
    ├─ SpeechStarted     → { type: "vad", state: "speech" }
    ├─ interim result    → { type: "partial", text: "patient has che..." }
    ├─ final result      → { type: "transcript", text: "Patient has chest pain.", ... }
    └─ UtteranceEnd      → { type: "vad", state: "idle" }
    │
    ▼ TranscriptionSession
Text cleanup → deduplication → session accumulation → broadcast to browser
```

**Latency:** Interim results appear within ~200–400ms of speech. Final segments fire ~600ms after silence.

---

## 📡 Deepgram Streaming Parameters

| Parameter | Value | Effect |
|---|---|---|
| `encoding` | `linear16` | Raw Int16 PCM — no compression overhead |
| `sample_rate` | `16000` | Matches browser mic capture |
| `interim_results` | `true` | Partial text streams as user speaks |
| `endpointing` | `600ms` | Silence threshold to finalize utterance |
| `smart_format` | `true` | Auto punctuation & formatting |
| `vad_events` | `true` | `SpeechStarted` / `UtteranceEnd` events |
| `model` | `nova-3-medical` | Medical domain vocabulary & accuracy |

---

## 📋 Out of Scope Notice

This phase covers:
- ✅ Audio Capture (Browser AudioWorklet)
- ✅ Deepgram Cloud Streaming STT (`nova-3-medical`)
- ✅ Real-time interim + final transcripts
- ✅ Post-processing & Overlap Deduplication
- ✅ Live Transcript UI

**Intentionally Out of Scope (Future LLM Phase):**
- ❌ LLM clinical summary extraction
- ❌ Chief Complaint / HPI medical JSON parsing
- ❌ Diagnosis / Clinical reasoning
