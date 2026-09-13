# 🩺 Clinical EHR Schema & NLP Extraction Guide

This document outlines the clinical reasoning, extraction rules, prompt specifications, and schema definitions for the 9 EHR field groups in the **JD Doctors Clinic Ambient Medical Scribe**.

---

## 1. The 9 Standardized Clinical Field Groups

The Groq LLM (`openai/gpt-oss-20b` with dynamic fallback) performs single-pass clinical inference over the complete consultation dialogue, categorizing findings into 9 structured field groups:

| # | Field Group | Clinical Objective | Output Format & UI Behavior |
| :-: | :--- | :--- | :--- |
| **1** | **Clinical Summary** | Synthesize the entire consultation into a comprehensive 2–4 sentence narrative summarizing the patient's presentation, provisional diagnosis, and care plan. | Rendered inside an editable/scrollable textarea (`#ai-clinical-summary`). |
| **2** | **Chief Complaints** | Capture the primary complaint(s) and reason for encounter in the patient's own words. | Unordered bulleted list (`#ai-chief-complaints`). |
| **3** | **Symptoms (+ / -)** | Strictly isolate **reported positive symptoms (+)** from **stated pertinent negatives (-)**. | Color-coded chips: green/blue for positives, muted red for negatives (`#ai-symptoms`). |
| **4** | **Clinical Impression** | Document the doctor's provisional assessment, primary diagnosis, or differential diagnoses. | Highlighted diagnosis banner (`#ai-clinical-impression`). |
| **5** | **Medications** | Current medications, dosage, route, frequency, duration, and patient adherence/history. | Formatted medication cards (`#ai-medications`). |
| **6** | **Examinations & Tests** | Clinical vitals (BP, HR, SpO2, Temp), physical examination findings, and diagnostic labs ordered. | Structured vitals list and test directives (`#ai-examinations`). |
| **7** | **Allergies** | Known adverse drug reactions or environmental allergies. | Prominent warning banner with alert icon (`#ai-allergies`). |
| **8** | **Past Medical History** | Chronic conditions (e.g. hypertension, diabetes), prior surgeries, and past hospitalizations. | Medical history list (`#ai-past-medical-history`). |
| **9** | **History & Follow-Up** | History of Present Illness (onset, duration, progression, aggravating/relieving factors) plus lifestyle advice and scheduled follow-up. | Structured timeline and follow-up notice (`#ai-history-followup`). |

---

## 2. Positive vs. Negative Symptom Isolation

In clinical documentation, confusing a **denied symptom** (pertinent negative) with an **active symptom** (positive finding) is a critical error that can alter diagnostic paths and treatment decisions.

### Strict Prompt Guidelines:
- **Reported Positives (`+`)**: Only symptoms the patient explicitly reports experiencing or that the clinician confirms on examination.
  - *Example dialogue*: "I have had a throbbing frontal headache for 3 days and nausea."
  - *Extracted Positive*: `[+] Frontal headache (3 days)`, `[+] Nausea`.
- **Stated Pertinent Negatives (`-`)**: Symptoms the clinician explicitly asked about that the patient denied, or findings confirmed absent.
  - *Example dialogue*: "Doctor: Any fever, stiff neck, or visual changes? Patient: No, none of that."
  - *Extracted Negative*: `[-] No fever`, `[-] No neck stiffness`, `[-] No visual disturbances`.

---

## 3. Demographics Extraction

The system automatically extracts patient demographic identifiers from the conversation:
- **Patient Name**: e.g., "Dr. Tushar" or "John Doe"
- **Age**: Numerical age or age range (e.g., "30")
- **Gender**: Stated biological sex or gender ("Male", "Female", "Other")

If demographics are not explicitly mentioned in speech, the system retains existing clinician demographic inputs.

---

## 4. LLM JSON Schema

The Groq client enforces a deterministic JSON payload:

```json
{
  "demographics": {
    "name": "Dr Tushar",
    "age": "30",
    "gender": "Male"
  },
  "clinical_summary": "30-year-old male presenting with acute frontal headache and mild nausea for 3 days. Denies fever, visual changes, or neck stiffness. Provisional diagnosis of tension-type headache with migraine differential. Initiated on oral analgesia with 48-hour follow-up.",
  "chief_complaints": ["Frontal throbbing headache", "Mild nausea"],
  "symptoms": {
    "positives": ["Throbbing headache", "Nausea"],
    "stated_negatives": ["Fever", "Neck stiffness", "Visual aura"]
  },
  "clinical_impression": "Tension-type headache vs. early migraine without aura",
  "medications": [
    { "name": "Acetaminophen", "dosage": "500mg", "frequency": "TDS PRN", "duration": "3 days" }
  ],
  "examinations_and_tests": {
    "vitals": "BP: 120/80 mmHg, HR: 72 bpm, SpO2: 99%",
    "findings": "Pupils equal and reactive, neck supple",
    "tests_ordered": ["Routine CBC if symptoms persist"]
  },
  "allergies": ["No known drug allergies (NKDA)"],
  "past_medical_history": ["Mild asthma in childhood, no current inhalers"],
  "history_and_followup": {
    "hpi": "Onset 3 days ago following extended screen time. Constant dull ache with episodic throbbing.",
    "advice": "Adequate hydration, reduce blue light exposure, regular sleep schedule.",
    "follow_up": "Return in 48-72 hours if pain worsens or neurological symptoms develop."
  }
}
```
