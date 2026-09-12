"""
FastAPI Server for Real-Time Medical Audio Transcription via Deepgram Cloud STT,
Groq-powered Clinical Information Extraction, and SQLite Database Persistence.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from . import config
from .audio.processor import AudioProcessor
from .asr.deepgram_client import DeepgramStreamingClient
from .transcript.session import TranscriptionSession
from .db.database import db
from .llm.groq_client import clinical_extractor

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("medical_transcription")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize database and validate API keys."""
    await db.init_db()

    if not config.DEEPGRAM_API_KEY:
        logger.warning("[STARTUP] DEEPGRAM_API_KEY is not set in .env! (STT will fail until set)")
    else:
        logger.info("[STARTUP] Deepgram API key configured.")

    if not config.GROQ_API_KEY:
        logger.warning("[STARTUP] GROQ_API_KEY is not set in .env! (Clinical extraction will use fallback)")
    else:
        logger.info("[STARTUP] Groq API configured with model: %s", config.GROQ_MODEL)

    yield
    logger.info("[SHUTDOWN] Server stopped.")


app = FastAPI(
    title="Medical Consultation Transcription & Clinical Extraction API",
    description="Real-time Deepgram streaming STT + Groq Clinical Documentation + SQLite EHR storage",
    version="2.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = config.BASE_DIR / "frontend"


# ── REST API Endpoints ────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint confirming API status, models, and DB connectivity."""
    return {
        "status": "online",
        "stt_engine": f"Deepgram ({config.DEEPGRAM_MODEL})",
        "llm_engine": f"Groq ({config.GROQ_MODEL})",
        "deepgram_key_set": bool(config.DEEPGRAM_API_KEY),
        "groq_key_set": bool(config.GROQ_API_KEY),
        "db_path": str(config.DB_PATH),
    }


@app.get("/api/config")
async def get_config():
    """Exposes audio and system configuration to frontend."""
    return {
        "sample_rate": config.SAMPLE_RATE,
        "deepgram_model": config.DEEPGRAM_MODEL,
        "groq_model": config.GROQ_MODEL,
        "language": config.LANGUAGE,
    }


@app.get("/api/consultations")
async def list_consultations(limit: int = 20):
    """Returns recent consultation sessions from the SQLite database."""
    records = await db.list_consultations(limit=limit)
    return {"consultations": records}


@app.get("/api/consultations/{session_id}")
async def get_consultation(session_id: str):
    """Returns full consultation record with transcript and 9 extracted clinical fields."""
    record = await db.get_consultation(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Consultation session not found")
    return record


@app.post("/api/extract")
async def extract_transcript_api(payload: dict):
    """
    On-demand clinical extraction endpoint.
    Extracts the 9 structured clinical fields from a provided transcript using Groq,
    and updates/saves the session in SQLite database.
    """
    transcript = payload.get("transcript", "").strip()
    session_id = payload.get("session_id") or f"sess_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript cannot be empty.")

    clinical_record = await clinical_extractor.extract_clinical_record(transcript)

    db_record = {
        "session_id": session_id,
        "created_at": datetime.now().isoformat(),
        "duration_seconds": float(payload.get("duration_seconds", 0.0)),
        "word_count": len(transcript.split()),
        "full_transcript": transcript,
        "clinical_summary": clinical_record,
    }
    try:
        await db.save_consultation(db_record)
    except Exception as dbe:
        logger.error("[DB] Failed to save extraction: %s", dbe)

    return {
        "session_id": session_id,
        "clinical_summary": clinical_record,
        "message": "Extraction complete."
    }


# ── WebSocket Streaming & Extraction Pipeline ─────────────────────────────────

@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    Real-time streaming transcription endpoint.
    Streams live words in Google Live Transcribe style.
    On session completion, extracts 9 clinical fields using Groq and saves to SQLite.
    """
    await websocket.accept()
    logger.info("[WS] Client connected.")

    audio_processor = AudioProcessor()
    session = TranscriptionSession()
    deepgram: DeepgramStreamingClient | None = None
    stop_event = asyncio.Event()

    async def send_json(payload: dict):
        try:
            await websocket.send_text(json.dumps(payload))
        except Exception:
            pass

    # ── Task 1: Relay audio chunks from browser → Deepgram ──────────────────
    async def audio_relay_task():
        try:
            while not stop_event.is_set():
                try:
                    message = await asyncio.wait_for(websocket.receive(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue

                if "bytes" in message:
                    int16_bytes = audio_processor.process_chunk(message["bytes"])
                    if int16_bytes and deepgram and deepgram.is_connected:
                        await deepgram.send_audio(int16_bytes)

                elif "text" in message:
                    try:
                        payload = json.loads(message["text"])
                        action = payload.get("action")

                        if action == "stop":
                            logger.info("[SESSION] Stop requested by client.")
                            stop_event.set()

                        elif action == "clear":
                            session.reset()
                            audio_processor.reset()
                            await send_json({"type": "session_cleared"})

                        elif action == "process_ai":
                            logger.info("[SESSION] On-demand AI processing requested by client.")
                            text_to_process = payload.get("transcript") or session.full_transcript or ""
                            text_to_process = text_to_process.strip()
                            if text_to_process:
                                await send_json({
                                    "type": "extraction_loading",
                                    "message": f"Analyzing consultation with Groq ({config.GROQ_MODEL})...",
                                })
                                clinical_record = await clinical_extractor.extract_clinical_record(text_to_process)
                                db_record = {
                                    "session_id": session.session_id,
                                    "created_at": datetime.now().isoformat(),
                                    "duration_seconds": session.total_speech_duration,
                                    "word_count": len(text_to_process.split()),
                                    "full_transcript": text_to_process,
                                    "clinical_summary": clinical_record,
                                }
                                try:
                                    await db.save_consultation(db_record)
                                except Exception as dbe:
                                    logger.error("[DB] Failed to save consultation: %s", dbe)
                                await send_json({
                                    "type": "clinical_summary",
                                    "session_id": session.session_id,
                                    "data": clinical_record,
                                })

                    except json.JSONDecodeError:
                        pass

        except WebSocketDisconnect:
            logger.info("[WS] Client disconnected during audio relay.")
            stop_event.set()
        except Exception as e:
            logger.error("[WS] Audio relay error: %s", e, exc_info=True)
            stop_event.set()

    # ── Task 2: Listen to Deepgram events → broadcast to browser ────────────
    async def transcript_listener_task():
        if deepgram is None:
            return

        async for event in deepgram.listen():
            ev = event.get("event")

            # VAD feedback
            if ev == "SpeechStarted":
                await send_json({"type": "vad", "state": "speech"})

            elif ev == "UtteranceEnd":
                await send_json({"type": "vad", "state": "idle"})

            # Interim partial stream (Google Live Transcribe style live feedback)
            elif ev == "interim":
                await send_json({
                    "type": "partial",
                    "text": event["text"],
                })

            # Final committed transcript segment
            elif ev == "final":
                raw_text = event["text"]
                duration_s = event.get("duration", 0.0)

                session_update = session.add_segment(
                    raw_text=raw_text,
                    duration_s=duration_s,
                    inference_time_s=0.0,
                )

                if session_update:
                    seg = session_update["segment"]
                    logger.info("[TRANSCRIPT] Segment %d: '%s'", seg["id"], seg["display_text"])
                    await send_json({
                        "type": "transcript",
                        "text": seg["display_text"],
                        "full_transcript": session_update["full_transcript"],
                        "segment_id": seg["id"],
                        "words": session_update["word_count"],
                        "segments": session_update["segment_count"],
                        "duration": seg["duration"],
                        "confidence": event.get("confidence", 0.0),
                    })

            elif ev == "error":
                await send_json({"type": "error", "message": event.get("message", "")})

            if stop_event.is_set():
                break

    # ── Main session controller ──────────────────────────────────────────────
    try:
        await send_json({"type": "status", "status": "ready", "message": "Connected. Ready to start."})

        # Wait for "start" action from user
        while True:
            init_msg = await websocket.receive()
            if "text" in init_msg:
                try:
                    payload = json.loads(init_msg["text"])
                    if payload.get("action") == "start":
                        break
                except json.JSONDecodeError:
                    pass

        # Start live session
        session.start()
        audio_processor.reset()
        stop_event.clear()

        deepgram = DeepgramStreamingClient()
        await deepgram.connect()

        await send_json({"type": "status", "status": "listening", "vad": "idle"})
        logger.info("[SESSION] Session active. Streaming audio to Deepgram.")

        await asyncio.gather(
            audio_relay_task(),
            transcript_listener_task(),
        )

    except (WebSocketDisconnect, RuntimeError):
        logger.info("[WS] Client disconnected.")
    except ValueError as e:
        logger.error("[SESSION] Configuration error: %s", e)
        await send_json({"type": "error", "message": str(e)})
    except Exception as e:
        logger.error("[WS] Unexpected error: %s", e, exc_info=True)
        await send_json({"type": "error", "message": f"Server error: {str(e)}"})
    finally:
        # 1. Close Deepgram WebSocket stream
        if deepgram:
            await deepgram.finish()
            await asyncio.sleep(0.4)
            await deepgram.close()

        # 2. Finalize local speech session
        final_summary = session.finalize()
        full_transcript = final_summary.get("full_transcript", "").strip()

        await send_json({
            "type": "session_end",
            "data": final_summary,
        })
        await send_json({"type": "status", "status": "stopped", "vad": "idle"})

        logger.info("[SESSION] Finalized. Words: %d. Audio duration: %.1fs",
                    final_summary.get("word_count", 0), final_summary.get("total_speech_duration", 0.0))

        # 3. Trigger Groq Clinical Information Extraction if speech was recorded
        if full_transcript:
            await send_json({
                "type": "extraction_loading",
                "message": f"Analyzing consultation with Groq ({config.GROQ_MODEL})...",
            })

            clinical_record = await clinical_extractor.extract_clinical_record(full_transcript)

            # 4. Persist to SQLite Database
            db_record = {
                "session_id": final_summary["session_id"],
                "created_at": datetime.now().isoformat(),
                "duration_seconds": final_summary.get("total_speech_duration", 0.0),
                "word_count": final_summary.get("word_count", 0),
                "full_transcript": full_transcript,
                "clinical_summary": clinical_record,
            }
            try:
                await db.save_consultation(db_record)
            except Exception as dbe:
                logger.error("[DB] Failed to save consultation: %s", dbe)

            # 5. Broadcast extracted clinical summary to browser UI
            await send_json({
                "type": "clinical_summary",
                "session_id": final_summary["session_id"],
                "data": clinical_record,
            })


# ── Static Frontend ──────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")
