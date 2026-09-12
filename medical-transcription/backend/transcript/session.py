"""
Transcription Session State Manager.
Maintains stateful transcript history, segment lists, word counts, and timing metrics.
"""

import time
from typing import List, Dict, Any, Optional
from .postprocessor import TranscriptPostProcessor
from .merger import TranscriptMerger


class TranscriptionSession:
    """
    Manages the lifecycle and state of an ongoing medical transcription session.
    """

    def __init__(self):
        self.session_id: str = str(int(time.time()))
        self.start_time: float = time.time()
        self.segments: List[Dict[str, Any]] = []
        self.full_transcript: str = ""
        self.total_speech_duration: float = 0.0
        self.total_inference_time: float = 0.0
        self.is_active: bool = False

    def start(self):
        """Initializes a new recording session."""
        self.session_id = str(int(time.time()))
        self.start_time = time.time()
        self.segments = []
        self.full_transcript = ""
        self.total_speech_duration = 0.0
        self.total_inference_time = 0.0
        self.is_active = True

    def add_segment(
        self,
        raw_text: str,
        duration_s: float,
        inference_time_s: float = 0.0
    ) -> Optional[Dict[str, Any]]:
        """
        Processes a new transcribed segment, merges it into the session transcript,
        and records metrics.
        Returns dict containing the updated session state, or None if segment was empty.
        """
        cleaned_text = TranscriptPostProcessor.clean_text(raw_text)
        if not cleaned_text:
            return None

        # Merge with overlap deduplication
        updated_transcript, dedup_text = TranscriptMerger.merge_segment(
            self.full_transcript, cleaned_text
        )

        if not dedup_text:
            # Entire segment was duplicate/redundant
            return None

        segment_id = len(self.segments) + 1
        segment_record = {
            "id": segment_id,
            "text": cleaned_text,
            "display_text": dedup_text,
            "duration": round(duration_s, 2),
            "inference_time": round(inference_time_s, 2),
            "timestamp": round(time.time() - self.start_time, 2),
        }

        self.segments.append(segment_record)
        self.full_transcript = updated_transcript
        self.total_speech_duration += duration_s
        self.total_inference_time += inference_time_s

        words = len(self.full_transcript.split()) if self.full_transcript else 0

        return {
            "segment": segment_record,
            "full_transcript": self.full_transcript,
            "segment_count": len(self.segments),
            "word_count": words,
            "total_speech_duration": round(self.total_speech_duration, 2),
            "total_inference_time": round(self.total_inference_time, 2),
        }

    def finalize(self) -> Dict[str, Any]:
        """
        Marks session completed and returns final structured record.
        """
        self.is_active = False
        elapsed_time = time.time() - self.start_time
        word_count = len(self.full_transcript.split()) if self.full_transcript else 0

        return {
            "session_id": self.session_id,
            "status": "completed",
            "full_transcript": self.full_transcript,
            "segments": self.segments,
            "word_count": word_count,
            "segment_count": len(self.segments),
            "total_speech_duration": round(self.total_speech_duration, 2),
            "total_inference_time": round(self.total_inference_time, 2),
            "session_duration": round(elapsed_time, 2),
        }

    def reset(self):
        """Resets the session state."""
        self.start()
        self.is_active = False
