# 📄 Prescription Modal & PDF Engine Guide

This document describes the design, architecture, and rendering engine behind the **1-Click Formatted Prescription PDF** in the **JD Doctors Clinic Medical Scribe**.

---

## 1. Feature Overview

The platform replaces generic clipboard copy buttons with a clinical-grade **Prescription Preview Modal** and **Dual-Mode PDF Generation**:
1. **1-Click Direct Download**: Clicking **`📄 Download Prescription (PDF)`** opens an on-screen modal with clinic letterhead and triggers `html2pdf.js` to download an A4 document (`Prescription_<Patient>_<Date>.pdf`).
2. **Native Vector Print**: In the modal header, clinicians can click **`🖨️ Print / Save PDF`** to trigger `window.print()`, utilizing browser-native vector rendering for high-resolution hospital printing with zero rasterization artifacts.
3. **Plain Text Clipboard Copy**: A secondary button (`📋 Copy Plain Text`) remains available for clinicians who need raw unformatted text.

---

## 2. Prescription Document Structure

The generated prescription formats clinical data into an authentic hospital letterhead:
- **Clinic Letterhead**: *JD DOCTORS CLINIC & AMBIENT HEALTHCARE*, Dr. Tushar, MD (General Medicine), Reg No: MED-88492.
- **Patient Demographics Bar**: Patient Name, Age, Gender, Date, and Encounter ID.
- **Chief Complaint & Narrative Clinical Summary**: Clear, professional synthesis of the consultation.
- **Symptom Profile**: Discrete tags separating reported positives `(+)` from stated negatives `(-)`.
- **Provisional Assessment**: Clinician's diagnostic impression.
- **Structured Rx Medication Table**: Clean table listing Medication Name, Dosage, Frequency, and Duration.
- **Examinations, Vitals & Allergies Warning**: Clinical vitals and highlighted drug allergy alerts.
- **Advice & Follow-Up**: Specific lifestyle advice and return timeline.
- **Clinician Signature & Stamp Block**: Formal verification block.

---

## 3. Technical Implementation & The Blank PDF Fix

### The Root Cause of Blank White PDFs
In early implementations, temporary render containers were positioned off-screen using:
```css
/* Defective approach */
position: absolute;
left: -9999px;
z-index: -9999;
```
`html2canvas` strictly enforces the CSS 2.1 Stacking Context specification: elements with negative `z-index` are drawn *underneath* the root document background. Consequently, `html2canvas` rendered the white page background over the element, resulting in an empty white PDF.

### The Resolution
1. **On-Screen Prescription Preview Modal**:
   The prescription is rendered in a dedicated visible modal on screen (`z-index: 250`).
2. **True Viewport Coordinates**:
   `html2canvas` snapshots the visible, fully styled DOM element directly from the current viewport without clipping or occlusion.
3. **Dedicated Print Stylesheet (`@media print`)**:
   ```css
   @media print {
       body * {
           visibility: hidden !important;
       }
       #prescription-modal-overlay,
       #prescription-modal-container,
       #prescription-modal-body,
       #prescription-modal-body * {
           visibility: visible !important;
       }
       #prescription-modal-overlay {
           position: absolute !important;
           left: 0 !important;
           top: 0 !important;
           background: #ffffff !important;
       }
       .prescription-modal-header {
           display: none !important;
       }
   }
   ```
   When `window.print()` is executed, the entire web application UI is hidden, and only `#prescription-modal-body` is printed at native 300+ DPI vector resolution.
