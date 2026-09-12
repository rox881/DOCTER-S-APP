"""
Central configuration for Medical Transcription System.
STT is now handled by Deepgram Cloud Streaming API.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Audio Capture Specifications ────────────────────────────────────────────
SAMPLE_RATE = 16000          # 16 kHz mono PCM
CHANNELS = 1                 # Mono
# Chunk size sent to Deepgram: ~100 ms = 1600 samples = 3200 bytes (Int16)
CHUNK_SAMPLES = int(SAMPLE_RATE * 0.1)   # 1600 samples per send
BYTES_PER_SAMPLE_F32 = 4                 # Float32 from browser = 4 bytes/sample
LANGUAGE = os.getenv("LANGUAGE", "en")

# ─── Deepgram Cloud STT Configuration ────────────────────────────────────────
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_MODEL = os.getenv("DEEPGRAM_MODEL", "nova-2-medical")
# Trailing silence (ms) before Deepgram finalizes an utterance
DEEPGRAM_ENDPOINTING_MS = int(os.getenv("DEEPGRAM_ENDPOINTING_MS", "600"))
# Time (ms) after last word before UtteranceEnd event fires
DEEPGRAM_UTTERANCE_END_MS = int(os.getenv("DEEPGRAM_UTTERANCE_END_MS", "1000"))

# ─── Server Configuration ─────────────────────────────────────────────────────
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "false").lower() in ("true", "1")
