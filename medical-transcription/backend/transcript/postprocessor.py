"""
Transcript Post-Processor.
Performs deterministic text hygiene:
- Strips hallucination tags and filler artifacts ([BLANK_AUDIO], etc.)
- Normalizes whitespace
- Enforces proper sentence capitalization
- Normalizes punctuation

STRICT RULE: Performs NO medical reasoning, diagnostic extraction, or clinical summarization.
"""

import re
from typing import Set


class TranscriptPostProcessor:
    """
    Cleans raw Whisper output locally.
    """

    # Artifacts and hallucination tokens produced during near-silence
    HALLUCINATIONS: Set[str] = {
        "[blank_audio]",
        "[silence]",
        "[music]",
        "(music)",
        "[applause]",
        "[laughter]",
        "(laughter)",
        "(whispering)",
        "thank you for watching",
        "subtitles by",
        "transcription by",
        "you",
        "bye",
        "thank you",
    }

    @classmethod
    def clean_text(cls, raw_text: str) -> str:
        """
        Cleans and formats transcription segment text.
        """
        if not raw_text:
            return ""

        text = raw_text.strip()

        # Check for single-word hallucination or bracketed artifacts
        lower_text = text.lower().strip()
        if lower_text in cls.HALLUCINATIONS:
            return ""

        # Remove bracketed artifacts: [Music], (applause), etc.
        text = re.sub(r"\[.*?\]|\(.*?\)", "", text)

        # Normalize whitespace (replace multiple spaces/tabs with single space)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return ""

        # Obvious repeated word loops (e.g. "pain pain pain pain")
        text = cls._remove_repetitive_loops(text)

        # Capitalize sentences
        text = cls._capitalize_sentences(text)

        # Ensure trailing punctuation if it looks like a complete clause
        if text and text[-1] not in ".?!,":
            text = text + "."

        return text

    @staticmethod
    def _remove_repetitive_loops(text: str) -> str:
        """Removes excessive word repetitions (e.g., 'and and and and' -> 'and')."""
        # Collapse 3 or more repeated words into a single occurrence
        pattern = r"\b(\w+)(?:\s+\1){2,}\b"
        return re.sub(pattern, r"\1", text, flags=re.IGNORECASE)

    @staticmethod
    def _capitalize_sentences(text: str) -> str:
        """Capitalize the first letter of each sentence."""
        if not text:
            return ""

        # Capitalize after periods, question marks, exclamation marks
        def cap(match):
            return match.group(1) + match.group(2).upper()

        text = text[0].upper() + text[1:]
        text = re.sub(r"([\.\?\!]\s+)([a-z])", cap, text)
        return text
