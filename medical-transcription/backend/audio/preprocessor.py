"""
Audio Preprocessor.
Handles Float32 PCM → Int16 PCM conversion for Deepgram linear16 streaming.
"""

import numpy as np


class AudioPreprocessor:
    """
    Lightweight audio conversion utilities for the Deepgram streaming pipeline.
    """

    @staticmethod
    def bytes_to_float32(raw_bytes: bytes) -> np.ndarray:
        """Convert raw little-endian Float32 bytes (from browser) to NumPy float32 array."""
        if not raw_bytes:
            return np.empty(0, dtype=np.float32)
        return np.frombuffer(raw_bytes, dtype=np.float32).copy()

    @staticmethod
    def float32_to_int16(audio: np.ndarray) -> bytes:
        """
        Convert float32 PCM [-1.0, 1.0] to Int16 PCM bytes.
        Deepgram expects linear16 encoding.
        """
        clipped = np.clip(audio, -1.0, 1.0)
        int16_audio = (clipped * 32767).astype(np.int16)
        return int16_audio.tobytes()

    @staticmethod
    def float32_bytes_to_int16_bytes(raw_bytes: bytes) -> bytes:
        """One-shot: raw Float32 bytes → Int16 bytes for Deepgram."""
        if not raw_bytes:
            return b""
        audio = AudioPreprocessor.bytes_to_float32(raw_bytes)
        return AudioPreprocessor.float32_to_int16(audio)
