"""
Audio Processor.
Converts raw Float32 PCM WebSocket bytes to Int16 bytes for Deepgram streaming.
No frame-slicing or VAD buffering needed — audio is streamed directly.
"""

from .preprocessor import AudioPreprocessor


class AudioProcessor:
    """
    Converts variable-length Float32 PCM chunks from the browser WebSocket
    into Int16 PCM bytes suitable for Deepgram linear16 streaming.
    """

    def process_chunk(self, raw_bytes: bytes) -> bytes:
        """
        Convert a raw Float32 PCM chunk to Int16 bytes.
        Returns empty bytes if input is empty.
        """
        if not raw_bytes:
            return b""
        return AudioPreprocessor.float32_bytes_to_int16_bytes(raw_bytes)

    def reset(self):
        """No-op — kept for API compatibility with session start/stop flow."""
        pass
