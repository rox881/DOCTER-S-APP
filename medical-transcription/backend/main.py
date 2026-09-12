"""
FastAPI Server for Real-Time Medical Audio Transcription via Deepgram Cloud STT.
Audio from the browser is streamed as Float32 PCM → converted to Int16 → forwarded
to Deepgram's /v2/listen WebSocket. Transcript events are relayed back to the browser.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from . import config
from .audio.processor import AudioProcessor
from .asr.deepgram_client import DeepgramStreamingClient
from .transcript.session import TranscriptionSession

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("medical_transcription")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: validate Deepgram API key is configured."""
    if not config.DEEPGRAM_API_KEY:
        logger.warning(
            "[STARTUP] DEEPGRAM_API_KEY is not set! "
            "Set it in your .env file before starting a session."
        )
    else:
        logger.info("[STARTUP] Deepgram API key loaded. Ready to accept connections.")
    yield
    logger.info("[SHUTDOWN] Server stopped.")


app = FastAPI(
    title="Medical Consultation Transcription API",
    description="Real-time cloud STT via Deepgram streaming WebSocket",
    version="2.0.0",
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


@app.get("/health")
async def health_check():
    """Health check — confirms Deepgram key is configured."""
    return {
        "status": "online",
        "mode": "cloud-deepgram",
        "api_key_set": bool(config.DEEPGRAM_API_KEY),
        "deepgram_model": config.DEEPGRAM_MODEL,
        "endpointing_ms": config.DEEPGRAM_ENDPOINTING_MS,
        "language": config.LANGUAGE,
    }


@app.get("/api/config")
async def get_config():
    """Exposes audio and Deepgram configuration to the frontend."""
    return {
        "sample_rate": config.SAMPLE_RATE,
        "deepgram_model": config.DEEPGRAM_MODEL,
        "endpointing_ms": config.DEEPGRAM_ENDPOINTING_MS,
        "language": config.LANGUAGE,
    }


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    Real-time streaming transcription endpoint.

    Flow per session:
      1. Browser connects and sends {action: "start"}.
      2. A Deepgram WebSocket is opened.
      3. Two concurrent tasks run:
           - audio_relay_task: reads binary audio from browser → converts Float32→Int16
                               → sends to Deepgram.
           - transcript_task:  reads Deepgram events → relays transcript/VAD updates
                               to browser.
      4. Browser sends {action: "stop"} → CloseStream sent to Deepgram → session finalized.
    """
    await websocket.accept()
    logger.info("[WS] Client connected.")

    audio_processor = AudioProcessor()
    session = TranscriptionSession()
    deepgram: DeepgramStreamingClient | None = None

    # Shared state between the two async tasks
    stop_event = asyncio.Event()

    async def send_json(payload: dict):
        try:
            await websocket.send_text(json.dumps(payload))
        except Exception:
            pass

    # ── Task 1: relay audio chunks from browser → Deepgram ──────────────────
    async def audio_relay_task():
        """Reads binary audio from browser WebSocket and forwards to Deepgram."""
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
                            logger.info("[SESSION] Stop requested.")
                            stop_event.set()

                        elif action == "clear":
                            session.reset()
                            audio_processor.reset()
                            await send_json({"type": "session_cleared"})

                    except json.JSONDecodeError:
                        pass

        except WebSocketDisconnect:
            logger.info("[WS] Client disconnected during relay.")
            stop_event.set()
        except Exception as e:
            logger.error("[WS] Audio relay error: %s", e, exc_info=True)
            stop_event.set()

    # ── Task 2: listen to Deepgram events → send to browser ─────────────────
    async def transcript_listener_task():
        """Reads Deepgram streaming events and broadcasts to the browser."""
        if deepgram is None:
            return

        async for event in deepgram.listen():
            ev = event.get("event")

            # VAD feedback
            if ev == "SpeechStarted":
                await send_json({"type": "vad", "state": "speech"})

            elif ev == "UtteranceEnd":
                await send_json({"type": "vad", "state": "idle"})

            # Interim (partial) transcript — low-latency preview
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
                    inference_time_s=0.0,   # cloud STT — no local inference time
                )

                if session_update:
                    seg = session_update["segment"]
                    logger.info(
                        "[TRANSCRIPT] Segment %d: '%s'",
                        seg["id"], seg["display_text"]
                    )
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

            # Stop listener when relay has finished
            if stop_event.is_set():
                break

    # ── Main session loop ────────────────────────────────────────────────────
    try:
        await send_json({"type": "status", "status": "ready", "message": "Connected. Waiting for start."})

        # Wait for "start" control message
        while True:
            init_msg = await websocket.receive()
            if "text" in init_msg:
                try:
                    payload = json.loads(init_msg["text"])
                    if payload.get("action") == "start":
                        break
                except json.JSONDecodeError:
                    pass

        # Session start
        session.start()
        audio_processor.reset()
        stop_event.clear()

        deepgram = DeepgramStreamingClient()
        await deepgram.connect()

        await send_json({"type": "status", "status": "listening", "vad": "idle"})
        logger.info("[SESSION] Session started. Deepgram streaming active.")

        # Run both tasks concurrently
        await asyncio.gather(
            audio_relay_task(),
            transcript_listener_task(),
        )

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected before session start.")
    except ValueError as e:
        # API key not set
        logger.error("[SESSION] Config error: %s", e)
        await send_json({"type": "error", "message": str(e)})
    except Exception as e:
        logger.error("[WS] Unexpected error: %s", e, exc_info=True)
        await send_json({"type": "error", "message": f"Server error: {str(e)}"})
    finally:
        # Finalize session
        if deepgram:
            await deepgram.finish()
            await asyncio.sleep(0.5)  # brief wait for Deepgram to flush final results
            await deepgram.close()

        final_summary = session.finalize()
        try:
            await websocket.send_text(json.dumps({
                "type": "session_end",
                "data": final_summary
            }))
            await websocket.send_text(json.dumps({
                "type": "status", "status": "stopped", "vad": "idle"
            }))
        except Exception:
            pass

        logger.info(
            "[SESSION] Finalized. Total words: %d.",
            final_summary.get("word_count", 0)
        )


# ── Static Frontend ──────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")
