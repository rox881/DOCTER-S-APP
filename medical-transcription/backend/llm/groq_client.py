"""
Groq LLM Clinical Information Extractor.
Performs single-pass extraction of the 9 required clinical field groups from the transcript.
Includes dynamic model discovery and automatic fallback if the requested model is not found.
Built with standard library HTTP requests for zero external dependency runtime.
"""

import asyncio
import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from .. import config

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert Clinical Documentation Specialist and Medical Scribe.
Analyze the provided medical consultation transcript and extract a structured clinical record.

STRICT CLINICAL RULES:
1. ONLY extract information stated aloud or directly implied in the transcript.
2. NEVER hallucinate or invent diagnoses, medications, or vitals.
3. If an item was not mentioned, set its value to null (or [] for arrays).
4. Strictly separate symptoms into:
   - "positive_symptoms": Symptoms the patient reported experiencing.
   - "stated_negatives": Pertinent negative symptoms explicitly denied by the patient.
5. Return ONLY a valid JSON object matching the exact schema below. Do not wrap in markdown or include conversational text.

REQUIRED JSON SCHEMA:
{
  "clinical_summary": "Comprehensive 2-4 sentence clinical narrative summary synthesizing patient presentation, key findings, diagnosis, and plan",
  "patient_details": {
    "name": "string or null",
    "age": "string or null",
    "sex": "string or null",
    "identifiers": "string or null"
  },
  "chief_complaint": "Primary reason for visit in patient's terms",
  "history_of_present_illness": {
    "onset": "string or null",
    "duration": "string or null",
    "progression": "string or null",
    "aggravating_factors": "string or null",
    "relieving_factors": "string or null"
  },
  "symptoms": {
    "positive_symptoms": ["list of reported symptoms"],
    "stated_negatives": ["list of denied symptoms"]
  },
  "past_medical_history": ["list of prior conditions, surgeries, hospitalizations"],
  "medication_history": {
    "current_medications": ["list of current drugs and doses"],
    "adherence": "string or null",
    "known_allergies": ["list of allergies"]
  },
  "clinical_observations": {
    "vitals": "string or null (e.g. BP, HR, Temp)",
    "examination_findings": "string or null (physical exam stated aloud)"
  },
  "assessment": "Provisional diagnosis or differentials stated by doctor",
  "plan": {
    "investigations": ["tests or labs ordered"],
    "prescriptions": ["medications prescribed"],
    "advice": "lifestyle or general advice",
    "follow_up": "follow-up timeframe or red flags"
  }
}
"""


class GroqClinicalExtractor:
    """
    Client for Groq LLM API to extract structured clinical summaries.
    Supports dynamic model discovery and automatic fallback.
    """

    def __init__(self, api_key: str = config.GROQ_API_KEY, model: str = config.GROQ_MODEL):
        self.api_key = api_key
        self.model = model
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"
        self.models_endpoint = "https://api.groq.com/openai/v1/models"

    def get_available_models_sync(self) -> List[str]:
        """Fetch the exact list of models available on this Groq account."""
        if not self.api_key:
            return []
        try:
            req = urllib.request.Request(
                self.models_endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "User-Agent": "MedicalTranscriptionApp/2.0",
                },
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m["id"] for m in data.get("data", []) if m.get("active", True)]
                return models
        except Exception as e:
            logger.warning("[GROQ] Could not retrieve model list: %s", e)
            return []

    def _execute_chat_request(self, transcript: str, model_name: str) -> str:
        """Internal synchronous call to Groq /chat/completions."""
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Here is the consultation transcript:\n\n{transcript}\n\nExtract the structured clinical record JSON:",
                },
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "max_tokens": 1500,
        }

        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=req_data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "MedicalTranscriptionApp/2.0",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=15) as response:
            resp_body = response.read().decode("utf-8")
            data = json.loads(resp_body)
            return data["choices"][0]["message"]["content"]

    def _call_groq_http_sync(self, transcript: str) -> str:
        """
        Call Groq API with automatic model verification and fallback.
        """
        if not self.api_key:
            raise ValueError(
                "GROQ_API_KEY is not set. Please add your key to the .env file."
            )

        # 1. Try with configured model first
        try:
            logger.info("[GROQ] Attempting extraction with model: %s", self.model)
            return self._execute_chat_request(transcript, self.model)

        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else ""

            # Check if 404 model_not_found
            if e.code == 404 or "model_not_found" in err_body:
                logger.warning(
                    "[GROQ] Model '%s' not found on your account. Discovering available models...",
                    self.model
                )
                available = self.get_available_models_sync()
                logger.info("[GROQ] Available models on your account: %s", available)

                # Filter out whisper / audio models
                chat_models = [
                    m for m in available
                    if not any(x in m.lower() for x in ["whisper", "distil", "guard", "vision"])
                ]

                # Priority preferences for clinical extraction
                fallback_candidates = [
                    "llama-3.3-70b-versatile",
                    "llama-3.1-70b-versatile",
                    "llama3-70b-8192",
                    "llama3-8b-8192",
                    "mixtral-8x7b-32768",
                    "gemma2-9b-it",
                ]

                selected_fallback = None
                for cand in fallback_candidates:
                    if cand in available:
                        selected_fallback = cand
                        break

                if not selected_fallback and chat_models:
                    selected_fallback = chat_models[0]

                if selected_fallback:
                    logger.info(
                        "[GROQ] Auto-switching to working fallback model: %s",
                        selected_fallback
                    )
                    self.model = selected_fallback
                    return self._execute_chat_request(transcript, selected_fallback)

            # Re-raise if other HTTP error or fallback failed
            raise

    async def extract_clinical_record(self, transcript: str) -> Dict[str, Any]:
        """
        Extracts structured medical information from the completed transcript.
        Returns a normalized dict adhering to the 9 required fields.
        """
        if not transcript or not transcript.strip():
            logger.warning("[GROQ] Transcript is empty, returning blank structure.")
            return self._get_empty_record("No speech recorded in consultation.")

        logger.info("[GROQ] Sending transcript (%d chars) for clinical extraction...", len(transcript))
        try:
            raw_json = await asyncio.to_thread(self._call_groq_http_sync, transcript)
            parsed = json.loads(raw_json)
            normalized = self._normalize_record(parsed)
            logger.info("[GROQ] Extraction complete. Chief complaint: '%s'", normalized.get("chief_complaint"))
            return normalized

        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else ""
            logger.error("[GROQ] API HTTP Error %d: %s", e.code, err_body)
            return self._get_empty_record(f"Groq API Error ({e.code}): {err_body}")

        except Exception as e:
            logger.error("[GROQ] Extraction failed: %s", e, exc_info=True)
            return self._get_empty_record(f"Extraction error: {str(e)}")

    def _normalize_record(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Ensures all 9 field groups exist with safe default fallbacks."""
        return {
            "clinical_summary": data.get("clinical_summary") or "",
            "patient_details": {
                "name": data.get("patient_details", {}).get("name"),
                "age": data.get("patient_details", {}).get("age"),
                "sex": data.get("patient_details", {}).get("sex"),
                "identifiers": data.get("patient_details", {}).get("identifiers"),
            },
            "chief_complaint": data.get("chief_complaint") or "Not specified",
            "history_of_present_illness": {
                "onset": data.get("history_of_present_illness", {}).get("onset"),
                "duration": data.get("history_of_present_illness", {}).get("duration"),
                "progression": data.get("history_of_present_illness", {}).get("progression"),
                "aggravating_factors": data.get("history_of_present_illness", {}).get("aggravating_factors"),
                "relieving_factors": data.get("history_of_present_illness", {}).get("relieving_factors"),
            },
            "symptoms": {
                "positive_symptoms": data.get("symptoms", {}).get("positive_symptoms") or [],
                "stated_negatives": data.get("symptoms", {}).get("stated_negatives") or [],
            },
            "past_medical_history": data.get("past_medical_history") or [],
            "medication_history": {
                "current_medications": data.get("medication_history", {}).get("current_medications") or [],
                "adherence": data.get("medication_history", {}).get("adherence"),
                "known_allergies": data.get("medication_history", {}).get("known_allergies") or [],
            },
            "clinical_observations": {
                "vitals": data.get("clinical_observations", {}).get("vitals"),
                "examination_findings": data.get("clinical_observations", {}).get("examination_findings"),
            },
            "assessment": data.get("assessment") or "Under clinical evaluation",
            "plan": {
                "investigations": data.get("plan", {}).get("investigations") or [],
                "prescriptions": data.get("plan", {}).get("prescriptions") or [],
                "advice": data.get("plan", {}).get("advice"),
                "follow_up": data.get("plan", {}).get("follow_up"),
            },
        }

    def _get_empty_record(self, note: str) -> Dict[str, Any]:
        """Provides an empty baseline structure."""
        return {
            "clinical_summary": "",
            "patient_details": {"name": None, "age": None, "sex": None, "identifiers": None},
            "chief_complaint": note,
            "history_of_present_illness": {"onset": None, "duration": None, "progression": None, "aggravating_factors": None, "relieving_factors": None},
            "symptoms": {"positive_symptoms": [], "stated_negatives": []},
            "past_medical_history": [],
            "medication_history": {"current_medications": [], "adherence": None, "known_allergies": []},
            "clinical_observations": {"vitals": None, "examination_findings": None},
            "assessment": "None",
            "plan": {"investigations": [], "prescriptions": [], "advice": None, "follow_up": None},
        }


# Global singleton instance
clinical_extractor = GroqClinicalExtractor()
