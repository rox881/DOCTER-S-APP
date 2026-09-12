"""
Deepgram Streaming STT Client.
Opens a persistent WebSocket to Deepgram /v2/listen and streams raw Int16 PCM audio.
Yields transcript events (interim, final) and VAD events back to the caller.
"""

import asyncio
import json
import logging
import os
from typing import AsyncGenerator, Optional

import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError

from .. import config

logger = logging.getLogger(__name__)

# Deepgram streaming endpoint with parameters
_DEEPGRAM_WS_BASE = "wss://api.deepgram.com/v2/listen"


def _build_deepgram_url() -> str:
    params = (
        f"model={config.DEEPGRAM_MODEL}"
        f"&encoding=linear16"
        f"&sample_rate={config.SAMPLE_RATE}"
        f"&channels=1"
        f"&language={config.LANGUAGE}"
        f"&interim_results=true"
        f"&endpointing={config.DEEPGRAM_ENDPOINTING_MS}"
        f"&utterance_end_ms={config.DEEPGRAM_UTTERANCE_END_MS}"
        f"&smart_format=true"
        f"&vad_events=true"
    )
    return f"{_DEEPGRAM_WS_BASE}?{params}"


class DeepgramStreamingClient:
    """
    Manages a single persistent Deepgram WebSocket streaming session.

    Usage:
        client = DeepgramStreamingClient()
        await client.connect()
        await client.send_audio(int16_bytes)   # call repeatedly
        async for event in client.listen():
            ...                                # handle transcript events
        await client.finish()
        await client.close()
    """

    def __init__(self):
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._connected: bool = False
        self._url: str = _build_deepgram_url()
        self._api_key: str = config.DEEPGRAM_API_KEY

    async def connect(self):
        """Opens WebSocket connection to Deepgram."""
        if not self._api_key:
            raise ValueError(
                "DEEPGRAM_API_KEY is not set. "
                "Add it to your .env file or environment variables."
            )
        headers = {"Authorization": f"Token {self._api_key}"}
        logger.info("[DEEPGRAM] Connecting to %s", self._url)
        self._ws = await websockets.connect(
            self._url,
            additional_headers=headers,
            ping_interval=10,
            ping_timeout=20,
        )
        self._connected = True
        logger.info("[DEEPGRAM] Connected.")

    async def send_audio(self, pcm_int16_bytes: bytes):
        """Send a raw Int16 PCM audio chunk to Deepgram."""
        if self._ws and self._connected:
            try:
                await self._ws.send(pcm_int16_bytes)
            except (ConnectionClosedOK, ConnectionClosedError):
                self._connected = False
                logger.warning("[DEEPGRAM] Connection closed while sending audio.")

    async def finish(self):
        """
        Send CloseStream message to signal end-of-audio to Deepgram.
        Deepgram will flush final transcripts before closing.
        """
        if self._ws and self._connected:
            try:
                await self._ws.send(json.dumps({"type": "CloseStream"}))
                logger.info("[DEEPGRAM] CloseStream sent.")
            except Exception as e:
                logger.warning("[DEEPGRAM] Error sending CloseStream: %s", e)

    async def listen(self) -> AsyncGenerator[dict, None]:
        """
        Async generator that yields parsed Deepgram events.

        Event types yielded:
            {"event": "SpeechStarted"}
            {"event": "UtteranceEnd", "last_word_end": float}
            {"event": "interim", "text": str, "is_final": False}
            {"event": "final", "text": str, "is_final": True,
             "duration": float, "confidence": float}
            {"event": "metadata"}
            {"event": "error", "message": str}
        """
        if not self._ws:
            return

        try:
            async for raw_msg in self._ws:
                if isinstance(raw_msg, bytes):
                    continue  # Deepgram sends JSON text only

                try:
                    msg = json.loads(raw_msg)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")

                # --- VAD events ---
                if msg_type == "SpeechStarted":
                    yield {"event": "SpeechStarted"}

                elif msg_type == "UtteranceEnd":
                    yield {
                        "event": "UtteranceEnd",
                        "last_word_end": msg.get("last_word_end", 0.0),
                    }

                # --- Transcript results ---
                elif msg_type == "Results":
                    channel = msg.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if not alternatives:
                        continue

                    best = alternatives[0]
                    transcript = best.get("transcript", "").strip()
                    is_final = msg.get("is_final", False)
                    speech_final = msg.get("speech_final", False)
                    confidence = best.get("confidence", 0.0)
                    duration = msg.get("duration", 0.0)

                    if not transcript:
                        continue

                    if is_final or speech_final:
                        yield {
                            "event": "final",
                            "text": transcript,
                            "is_final": True,
                            "duration": duration,
                            "confidence": confidence,
                        }
                    else:
                        yield {
                            "event": "interim",
                            "text": transcript,
                            "is_final": False,
                        }

                elif msg_type == "Metadata":
                    yield {"event": "metadata", "data": msg}

                elif msg_type == "Error":
                    err_msg = msg.get("message", "Unknown Deepgram error")
                    logger.error("[DEEPGRAM] API error: %s", err_msg)
                    yield {"event": "error", "message": err_msg}

        except (ConnectionClosedOK, ConnectionClosedError):
            logger.info("[DEEPGRAM] WebSocket connection closed.")
            self._connected = False
        except Exception as e:
            logger.error("[DEEPGRAM] Unexpected listen error: %s", e, exc_info=True)
            self._connected = False

    async def close(self):
        """Close the WebSocket connection."""
        self._connected = False
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("[DEEPGRAM] Connection closed.")

    @property
    def is_connected(self) -> bool:
        return self._connected
