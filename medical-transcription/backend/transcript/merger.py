"""
Transcript Merger.
Incrementally merges transcribed segments and handles word-level boundary overlaps.
Ensures deterministic deduplication across streaming segments.
"""

import re
from typing import Tuple


class TranscriptMerger:
    """
    Merges incoming segment text into accumulated session text with
    longest common suffix/prefix deduplication.
    """

    @staticmethod
    def _normalize_for_matching(word: str) -> str:
        """Strip punctuation and lowercase word for matching."""
        return re.sub(r"[^\w]", "", word).lower()

    @classmethod
    def merge_segment(cls, existing_transcript: str, new_segment: str) -> Tuple[str, str]:
        """
        Merges new_segment into existing_transcript.
        Returns:
            (updated_full_transcript, deduplicated_segment_text)
        """
        existing = existing_transcript.strip()
        new_text = new_segment.strip()

        if not existing:
            return new_text, new_text

        if not new_text:
            return existing, ""

        # Tokenize words for boundary overlap detection
        existing_words = existing.split()
        new_words = new_text.split()

        max_check = min(len(existing_words), len(new_words), 8)
        overlap_len = 0

        # Find longest matching suffix of existing matching prefix of new
        for k in range(max_check, 0, -1):
            existing_suffix = [cls._normalize_for_matching(w) for w in existing_words[-k:]]
            new_prefix = [cls._normalize_for_matching(w) for w in new_words[:k]]

            if existing_suffix == new_prefix:
                overlap_len = k
                break

        if overlap_len > 0:
            # Overlap found: strip the overlapping prefix from new_words
            dedup_words = new_words[overlap_len:]
            if not dedup_words:
                # New segment was entirely redundant
                return existing, ""
            dedup_text = " ".join(dedup_words)
            merged = f"{existing} {dedup_text}".strip()
            return merged, dedup_text
        else:
            # Check if existing ends with punctuation
            separator = " "
            merged = f"{existing}{separator}{new_text}".strip()
            return merged, new_text
