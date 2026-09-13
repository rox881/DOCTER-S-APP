/**
 * Transcript & Clinical EHR Controller.
 * Manages:
 * 1. Live streaming speech chunks & full cumulative transcript (Left Panel)
 * 2. 9-field structured AI Medical Summary with active loading feedback (Right Panel)
 * 3. On-demand AI processing via "Process Transcript with AI"
 * 4. Prescription copy functionality
 * 5. Past Consultations SQLite history drawer & quick selector
 */

class TranscriptController {
  constructor() {
    this.container = null;
    this.finalStream = null;
    this.emptyTranscript = null;
    this.chunkDisplayBox = null;
    this.chunkPlaceholder = null;
    this.liveInterimContent = null;
    this.interimText = null;

    this.statWords = null;
    this.statChunks = null;

    this.btnProcessAI = null;
    this.aiProcessingFeedback = null;
    this.aiFeedbackText = null;

    this.currentClinicalData = null;
    this.currentSessionId = null;
    this.chunkCount = 0;
  }

  init() {
    // Left panel elements
    this.container = document.getElementById('transcript-container');
    this.finalStream = document.getElementById('final-transcript-stream');
    this.emptyTranscript = document.getElementById('empty-transcript');
    this.chunkDisplayBox = document.getElementById('chunk-display-box');
    this.chunkPlaceholder = document.getElementById('chunk-placeholder');
    this.liveInterimContent = document.getElementById('live-interim-content');
    this.interimText = document.getElementById('interim-text');

    this.statWords = document.getElementById('stat-words');
    this.statChunks = document.getElementById('stat-chunks');

    // Action buttons
    this.btnProcessAI = document.getElementById('btn-process-ai');
    this.aiProcessingFeedback = document.getElementById('ai-processing-feedback');
    this.aiFeedbackText = document.getElementById('ai-feedback-text');

    if (this.btnProcessAI) {
      this.btnProcessAI.addEventListener('click', () => this.processAI());
    }

    const btnClearSummary = document.getElementById('btn-clear-summary');
    if (btnClearSummary) {
      btnClearSummary.addEventListener('click', () => this.clearClinicalSummary());
    }

    const btnDownloadPDF = document.getElementById('btn-download-pdf');
    if (btnDownloadPDF) {
      btnDownloadPDF.addEventListener('click', () => this.downloadPrescriptionPDF());
    }

    const btnCopyText = document.getElementById('btn-copy-prescription-text');
    if (btnCopyText) {
      btnCopyText.addEventListener('click', () => this.copyPrescription());
    }

    // Prescription Preview Modal Listeners
    const btnCloseRxModal = document.getElementById('btn-close-rx-modal');
    if (btnCloseRxModal) {
      btnCloseRxModal.addEventListener('click', () => this.closePrescriptionModal());
    }

    const modalOverlay = document.getElementById('prescription-modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closePrescriptionModal();
      });
    }

    const btnModalPrint = document.getElementById('btn-modal-print');
    if (btnModalPrint) {
      btnModalPrint.addEventListener('click', () => window.print());
    }

    const btnModalDownload = document.getElementById('btn-modal-download');
    if (btnModalDownload) {
      btnModalDownload.addEventListener('click', () => this.executePDFDownload());
    }

    // Past Consultations Drawer
    const btnOpenHistory = document.getElementById('btn-open-history');
    if (btnOpenHistory) {
      btnOpenHistory.addEventListener('click', () => this.openHistoryDrawer());
    }

    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', () => this.closeHistoryDrawer());
    }

    const drawerOverlay = document.getElementById('past-drawer-overlay');
    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', () => this.closeHistoryDrawer());
    }

    const selectPast = document.getElementById('select-past-sessions');
    if (selectPast) {
      selectPast.addEventListener('change', (e) => {
        if (e.target.value) {
          this.loadConsultationById(e.target.value);
        }
      });
    }

    const floatingChatBtn = document.getElementById('floating-chat-btn');
    if (floatingChatBtn) {
      floatingChatBtn.addEventListener('click', () => {
        this.openHistoryDrawer();
      });
    }

    // Fetch past consultations from DB on initial load
    this.fetchPastConsultations();
  }

  // ── Live Speech Streaming (Left Panel) ───────────────────────────────────

  updateInterim(text) {
    if (!text || !text.trim()) {
      if (this.liveInterimContent) this.liveInterimContent.style.display = 'none';
      if (this.chunkPlaceholder && (!this.finalStream || !this.finalStream.innerText.trim())) {
        this.chunkPlaceholder.style.display = 'block';
      }
      return;
    }

    if (this.chunkPlaceholder) this.chunkPlaceholder.style.display = 'none';
    if (this.liveInterimContent) this.liveInterimContent.style.display = 'flex';
    if (this.interimText) this.interimText.textContent = text;

    if (this.chunkDisplayBox) {
      this.chunkDisplayBox.scrollTop = this.chunkDisplayBox.scrollHeight;
    }
  }

  commitFinal(msg) {
    const text = (msg.text || '').trim();
    if (!text) return;

    // 1. Hide empty placeholder
    if (this.emptyTranscript) this.emptyTranscript.style.display = 'none';

    // 2. Append to full cumulative transcript
    if (this.finalStream) {
      const span = document.createElement('span');
      span.className = 'final-sentence';
      span.textContent = text + ' ';
      this.finalStream.appendChild(span);
    }

    // 3. Update top chunk box to reflect latest recognized chunk
    if (this.chunkPlaceholder) this.chunkPlaceholder.style.display = 'none';
    if (this.liveInterimContent) this.liveInterimContent.style.display = 'flex';
    if (this.interimText) this.interimText.textContent = text;

    // 4. Update stats
    this.chunkCount++;
    if (this.statChunks) this.statChunks.textContent = this.chunkCount;
    if (this.statWords && msg.words !== undefined) {
      this.statWords.textContent = msg.words;
    } else if (this.statWords && this.finalStream) {
      const words = this.finalStream.innerText.trim().split(/\s+/).filter(Boolean).length;
      this.statWords.textContent = words;
    }

    // 5. Auto scroll bottom box
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  clear() {
    if (this.finalStream) this.finalStream.innerHTML = '';
    if (this.emptyTranscript) this.emptyTranscript.style.display = 'flex';

    if (this.liveInterimContent) this.liveInterimContent.style.display = 'none';
    if (this.chunkPlaceholder) {
      this.chunkPlaceholder.style.display = 'block';
      this.chunkPlaceholder.textContent = 'Live speech chunk will appear here as you speak...';
    }
    if (this.interimText) this.interimText.textContent = '';

    this.chunkCount = 0;
    if (this.statChunks) this.statChunks.textContent = '0';
    if (this.statWords) this.statWords.textContent = '0';

    this.clearClinicalSummary();
    this.currentClinicalData = null;
    this.currentSessionId = null;
  }

  // ── AI Medical Summary & Processing (Right Panel) ────────────────────────

  showLoading(message) {
    if (this.aiProcessingFeedback) {
      this.aiProcessingFeedback.style.display = 'flex';
    }
    if (this.aiFeedbackText) {
      this.aiFeedbackText.textContent = message || '⚡ Extracting clinical EHR fields with Groq (openai/gpt-oss-20b)...';
    }
    if (this.btnProcessAI) {
      this.btnProcessAI.disabled = true;
      this.btnProcessAI.innerHTML = '<span class="action-icon">⏳</span> Processing with AI...';
    }
  }

  hideLoading() {
    if (this.aiProcessingFeedback) {
      this.aiProcessingFeedback.style.display = 'none';
    }
    if (this.btnProcessAI) {
      this.btnProcessAI.disabled = false;
      this.btnProcessAI.innerHTML = '<span class="action-icon">⚡</span> Process Transcript with AI';
    }
  }

  async processAI() {
    const text = this.finalStream ? this.finalStream.innerText.trim() : '';
    if (!text) {
      this.showToast('Please record or enter a consultation transcript first.');
      return;
    }

    this.showLoading('⚡ Extracting clinical EHR fields with Groq (openai/gpt-oss-20b)...');

    // First, try sending via WebSocket if open
    if (window.wsClient && window.wsClient.ws && window.wsClient.ws.readyState === WebSocket.OPEN) {
      window.wsClient.ws.send(JSON.stringify({
        action: 'process_ai',
        transcript: text
      }));
    } else {
      // Fallback: direct HTTP POST /api/extract
      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: text,
            session_id: this.currentSessionId || `sess_${Date.now()}`
          })
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        this.renderClinicalSummary(data.clinical_summary, data.session_id);
      } catch (err) {
        console.error('[AI] Extraction error:', err);
        this.hideLoading();
        this.showToast('Clinical extraction failed. Check backend connection.');
      }
    }
  }

  renderClinicalSummary(data, sessionId) {
    this.hideLoading();
    if (!data) return;

    this.currentClinicalData = data;
    this.currentSessionId = sessionId;

    // 1. Demographics
    const patient = data.patient_details || {};
    this.setText('field-patient-name', patient.name || 'Dr Tushar');
    this.setText('field-patient-age', patient.age || '30');
    this.setText('field-patient-gender', patient.sex || 'Male');

    // 2. Section 1: CLINICAL SUMMARY
    const summaryEl = document.getElementById('field-clinical-summary');
    if (summaryEl) {
      let summaryText = data.clinical_summary || '';
      if (!summaryText && (data.assessment || data.chief_complaint)) {
        summaryText = `Patient presented with ${data.chief_complaint || 'unspecified symptoms'}. Clinical assessment indicates ${data.assessment || 'routine evaluation'}.`;
      }
      summaryEl.value = summaryText;
    }

    // 3. Section 2: CHIEF COMPLAINTS
    this.setBlockContent(
      'field-chief-complaint',
      data.chief_complaint,
      'No complaints extracted yet'
    );

    // 4. Section 3: SYMPTOMS (Positives + Stated Negatives)
    const sympEl = document.getElementById('field-symptoms');
    if (sympEl) {
      const sym = data.symptoms || {};
      const pos = sym.positive_symptoms || [];
      const neg = sym.stated_negatives || [];

      if (pos.length === 0 && neg.length === 0) {
        sympEl.className = 'section-output-content text-placeholder';
        sympEl.textContent = 'No symptoms extracted yet';
      } else {
        sympEl.className = 'section-output-content';
        let html = '<div class="chip-container">';
        pos.forEach((s) => {
          html += `<span class="symptom-chip-pos">+ ${s}</span>`;
        });
        neg.forEach((s) => {
          html += `<span class="symptom-chip-neg">- ${s}</span>`;
        });
        html += '</div>';
        sympEl.innerHTML = html;
      }
    }

    // 5. Section 4: CLINICAL IMPRESSION
    this.setBlockContent(
      'field-clinical-impression',
      data.assessment,
      'No diagnosis inferred'
    );

    // 6. Section 5: MEDICATIONS
    const medEl = document.getElementById('field-medications');
    if (medEl) {
      const medHistory = data.medication_history || {};
      const meds = medHistory.current_medications || [];
      const adherence = medHistory.adherence;

      if (meds.length === 0 && !adherence) {
        medEl.className = 'section-output-content text-placeholder';
        medEl.textContent = 'No medications extracted yet';
      } else {
        medEl.className = 'section-output-content';
        let html = '<ul class="clinical-bullet-list">';
        meds.forEach((m) => {
          html += `<li>${m}</li>`;
        });
        if (adherence) {
          html += `<li><em>Adherence:</em> ${adherence}</li>`;
        }
        html += '</ul>';
        medEl.innerHTML = html;
      }
    }

    // 7. Section 6: EXAMINATIONS & TESTS
    const examEl = document.getElementById('field-examinations');
    if (examEl) {
      const obs = data.clinical_observations || {};
      const plan = data.plan || {};
      const vitals = obs.vitals;
      const findings = obs.examination_findings;
      const tests = plan.investigations || [];

      const parts = [];
      if (vitals) parts.push(`<strong>Vitals:</strong> ${vitals}`);
      if (findings) parts.push(`<strong>Findings:</strong> ${findings}`);
      if (tests.length > 0) parts.push(`<strong>Orders:</strong> ${tests.join(', ')}`);

      if (parts.length === 0) {
        examEl.className = 'section-output-content text-placeholder';
        examEl.textContent = 'No examinations extracted yet';
      } else {
        examEl.className = 'section-output-content';
        examEl.innerHTML = parts.join('<br>');
      }
    }

    // 8. Section 7: ALLERGIES
    const allergyEl = document.getElementById('field-allergies');
    if (allergyEl) {
      const allergies = (data.medication_history || {}).known_allergies || [];
      if (allergies.length === 0) {
        allergyEl.className = 'section-output-content text-placeholder';
        allergyEl.textContent = 'No allergies extracted yet';
      } else {
        allergyEl.className = 'section-output-content';
        allergyEl.innerHTML = `<span class="symptom-chip-neg">⚠️ ${allergies.join(', ')}</span>`;
      }
    }

    // 9. Section 8: PAST MEDICAL HISTORY
    const pmhEl = document.getElementById('field-past-medical');
    if (pmhEl) {
      const history = data.past_medical_history || [];
      if (history.length === 0) {
        pmhEl.className = 'section-output-content text-placeholder';
        pmhEl.textContent = 'No past medical history extracted';
      } else {
        pmhEl.className = 'section-output-content';
        let html = '<ul class="clinical-bullet-list">';
        history.forEach((h) => {
          html += `<li>${h}</li>`;
        });
        html += '</ul>';
        pmhEl.innerHTML = html;
      }
    }

    // 10. Section 9: HISTORY & FOLLOW-UP
    const hfuEl = document.getElementById('field-history-followup');
    if (hfuEl) {
      const hpi = data.history_of_present_illness || {};
      const plan = data.plan || {};
      const items = [];

      if (hpi.onset) items.push(`Onset: ${hpi.onset}`);
      if (hpi.duration) items.push(`Duration: ${hpi.duration}`);
      if (hpi.progression) items.push(`Progression: ${hpi.progression}`);
      if (plan.advice) items.push(`Advice: ${plan.advice}`);
      if (plan.follow_up) items.push(`Follow-up: ${plan.follow_up}`);

      if (items.length === 0) {
        hfuEl.className = 'section-output-content text-placeholder';
        hfuEl.textContent = 'No follow-up extracted yet';
      } else {
        hfuEl.className = 'section-output-content';
        hfuEl.innerHTML = items.join(' &bull; ');
      }
    }

    // Refresh history
    this.fetchPastConsultations();
  }

  clearClinicalSummary() {
    this.setText('field-patient-name', 'Dr Tushar');
    this.setText('field-patient-age', '30');
    this.setText('field-patient-gender', 'Male');

    const summaryEl = document.getElementById('field-clinical-summary');
    if (summaryEl) summaryEl.value = '';

    const placeholders = [
      ['field-chief-complaint', 'No complaints extracted yet'],
      ['field-symptoms', 'No symptoms extracted yet'],
      ['field-clinical-impression', 'No diagnosis inferred'],
      ['field-medications', 'No medications extracted yet'],
      ['field-examinations', 'No examinations extracted yet'],
      ['field-allergies', 'No allergies extracted yet'],
      ['field-past-medical', 'No past medical history extracted'],
      ['field-history-followup', 'No follow-up extracted yet'],
    ];

    placeholders.forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) {
        el.className = 'section-output-content text-placeholder';
        el.textContent = text;
      }
    });

    this.currentClinicalData = null;
    this.showToast('Clinical summary cleared.');
  }

  setBlockContent(elementId, text, placeholder) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (text && text.trim()) {
      el.className = 'section-output-content';
      el.textContent = text.trim();
    } else {
      el.className = 'section-output-content text-placeholder';
      el.textContent = placeholder;
    }
  }

  setText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text || '--';
  }

  // ── Prescription PDF Generation, Print & Copy ─────────────────────────

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  buildPrescriptionHTML() {
    const d = this.currentClinicalData || {};
    const patient = d.patient_details || {};
    const plan = d.plan || {};
    const medsHistory = d.medication_history || {};
    const obs = d.clinical_observations || {};
    const symptoms = d.symptoms || {};

    const pName = patient.name || document.getElementById('field-patient-name')?.innerText || 'Dr Tushar';
    const pAge = patient.age || document.getElementById('field-patient-age')?.innerText || '30';
    const pGender = patient.sex || document.getElementById('field-patient-gender')?.innerText || 'Male';
    const pId = patient.identifiers || this.currentSessionId || ('JD-' + Date.now().toString().slice(-6));
    
    const rawImpression = d.assessment || document.getElementById('field-clinical-impression')?.innerText;
    const impression = (rawImpression && rawImpression !== 'No diagnosis inferred')
      ? rawImpression
      : 'General Outpatient Medical Evaluation & Health Checkup';

    const rawSummary = d.clinical_summary || document.getElementById('field-clinical-summary')?.value;
    const summary = (rawSummary && rawSummary.trim() !== '')
      ? rawSummary
      : 'Patient presented for outpatient consultation and clinical evaluation at JD Doctors Clinic.';

    const rawComplaint = d.chief_complaint || document.getElementById('field-chief-complaints')?.innerText;
    const chiefComplaint = (rawComplaint && rawComplaint !== 'No complaints extracted yet')
      ? rawComplaint
      : 'Routine medical consultation & health assessment';

    const positiveSymptoms = (symptoms.positive_symptoms || []);
    const negativeSymptoms = (symptoms.stated_negatives || []);

    const rxList = plan.prescriptions || [];
    const currentMeds = medsHistory.current_medications || [];
    const allMeds = rxList.length > 0 ? rxList : currentMeds;

    const investigations = plan.investigations || [];
    const allergies = medsHistory.known_allergies || [];
    const pastHistory = d.past_medical_history || [];
    const advice = plan.advice || 'Maintain proper hydration, adequate rest, and balanced nutrition.';
    const followUp = plan.follow_up || 'Return for review in 5 days or if symptoms worsen.';
    const vitals = obs.vitals || '';
    const examFindings = obs.examination_findings || '';

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let medsTableHTML = '';
    if (allMeds.length > 0) {
      medsTableHTML = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11.5px;">
          <thead>
            <tr style="background: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 1.5px solid #94a3b8; text-align: left;">
              <th style="padding: 6px 8px; width: 32px; color: #475569;">#</th>
              <th style="padding: 6px 8px; color: #1e293b; font-weight: 700;">Medicine & Strength</th>
              <th style="padding: 6px 8px; color: #1e293b; font-weight: 700;">Instructions / Schedule</th>
            </tr>
          </thead>
          <tbody>
            ${allMeds.map((m, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; color: #64748b; font-weight: 600;">${idx + 1}</td>
                <td style="padding: 6px 8px; font-weight: 600; color: #0f172a;">${this.escapeHtml(m)}</td>
                <td style="padding: 6px 8px; color: #475569;">As directed by physician</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      medsTableHTML = `<div style="font-size: 11.5px; color: #64748b; font-style: italic; padding: 4px 0;">No specific prescription medications recorded.</div>`;
    }

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.45; font-size: 12px; max-width: 100%; background: #ffffff;">
        
        <!-- Header Banner -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #4f46e5; padding-bottom: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 20px; font-weight: 800; color: #312e81; letter-spacing: 0.5px;">JD DOCTORS CLINIC</div>
            <div style="font-size: 10.5px; font-weight: 700; color: #4f46e5; letter-spacing: 1px; text-transform: uppercase; margin-top: 1px;">
              Ambient AI Scribe & Clinical Healthcare Centre
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 3px;">
              <strong>Consultant:</strong> Dr. Tushar, MBBS, MD (General Medicine) &bull; Reg: MED-88492
            </div>
            <div style="font-size: 10.5px; color: #64748b;">
              Email: info@trrev.com &bull; Emergency / OPD Desk
            </div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #475569;">
            <div style="font-size: 14px; font-weight: 800; color: #4f46e5;">PRESCRIPTION</div>
            <div style="margin-top: 3px;"><strong>Date:</strong> ${dateStr}</div>
            <div style="margin-top: 1px;"><strong>Consultation ID:</strong> ${this.escapeHtml(pId)}</div>
            <div style="margin-top: 3px; display: inline-block; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 1px 8px; font-size: 9.5px; font-weight: 600;">
              ✔ Verified Clinical Record
            </div>
          </div>
        </div>

        <!-- Patient Demographics Strip -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; margin-bottom: 14px; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; font-size: 11.5px;">
          <div><span style="color: #64748b; font-weight: 600;">Patient Name:</span> <strong style="color: #0f172a; font-size: 12.5px;">${this.escapeHtml(pName)}</strong></div>
          <div><span style="color: #64748b; font-weight: 600;">Age:</span> <strong>${this.escapeHtml(pAge)} yrs</strong></div>
          <div><span style="color: #64748b; font-weight: 600;">Gender:</span> <strong>${this.escapeHtml(pGender)}</strong></div>
          <div><span style="color: #64748b; font-weight: 600;">Encounter:</span> <strong>OPD Visit</strong></div>
        </div>

        <!-- Chief Complaint & Narrative Summary -->
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">
            Chief Complaint
          </div>
          <div style="background: #faf5ff; border-left: 3px solid #7c3aed; padding: 6px 10px; font-size: 12px; color: #1e1b4b; font-weight: 600;">
            ${this.escapeHtml(chiefComplaint)}
          </div>
        </div>

        ${summary ? `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">
            Clinical Narrative Summary
          </div>
          <div style="font-size: 11.5px; color: #334155; line-height: 1.5; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px;">
            ${this.escapeHtml(summary)}
          </div>
        </div>
        ` : ''}

        <!-- Clinical Impression (Diagnosis) -->
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">
            Clinical Impression / Diagnosis
          </div>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; color: #1e40af;">
            🩺 ${this.escapeHtml(impression)}
          </div>
        </div>

        <!-- Symptoms Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 10px;">
            <div style="font-size: 10.5px; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 4px;">
              Reported Symptoms (+)
            </div>
            <div style="font-size: 11px; color: #14532d;">
              ${positiveSymptoms.length > 0 ? positiveSymptoms.map(s => `&bull; ${this.escapeHtml(s)}`).join('<br/>') : 'None specifically reported'}
            </div>
          </div>
          <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 8px 10px;">
            <div style="font-size: 10.5px; font-weight: 700; color: #9f1239; text-transform: uppercase; margin-bottom: 4px;">
              Pertinent Negatives (-)
            </div>
            <div style="font-size: 11px; color: #881337;">
              ${negativeSymptoms.length > 0 ? negativeSymptoms.map(s => `&bull; Denies ${this.escapeHtml(s)}`).join('<br/>') : 'None recorded'}
            </div>
          </div>
        </div>

        <!-- Rx Prescribed Medications -->
        <div style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <span style="font-size: 18px; font-family: 'Times New Roman', serif; font-weight: 800; color: #4f46e5;">℞</span>
            <span style="font-size: 12px; font-weight: 800; color: #1e1b4b; text-transform: uppercase; letter-spacing: 0.5px;">
              Prescribed Medications (Rx)
            </span>
          </div>
          ${medsTableHTML}
        </div>

        <!-- Clinical Observations & Vitals -->
        ${(vitals || examFindings) ? `
        <div style="margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 11.5px;">
          <div style="font-size: 10.5px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">
            Examinations & Vitals
          </div>
          ${vitals ? `<div><strong>Vitals:</strong> ${this.escapeHtml(vitals)}</div>` : ''}
          ${examFindings ? `<div><strong>Physical Exam:</strong> ${this.escapeHtml(examFindings)}</div>` : ''}
        </div>
        ` : ''}

        <!-- Allergies Alert (if any) -->
        ${allergies.length > 0 ? `
        <div style="margin-bottom: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 12px; font-size: 11px; color: #92400e;">
          <strong>⚠️ Known Drug Allergies & Contraindications:</strong> ${allergies.map(a => this.escapeHtml(a)).join(', ')}
        </div>
        ` : ''}

        <!-- Past Medical History (if any) -->
        ${pastHistory.length > 0 ? `
        <div style="margin-bottom: 12px; font-size: 11px; color: #475569;">
          <strong>Past Medical History:</strong> ${pastHistory.map(p => this.escapeHtml(p)).join('; ')}
        </div>
        ` : ''}

        <!-- Advice & Follow-Up -->
        <div style="background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 11.5px;">
          <div style="display: flex; justify-content: space-between; gap: 12px;">
            <div style="flex: 1;">
              <strong style="color: #86198f;">Advice & Instructions:</strong><br/>
              <span style="color: #701a75;">${this.escapeHtml(advice)}</span>
            </div>
            <div style="flex: 1; border-left: 1px solid #f0abfc; padding-left: 12px;">
              <strong style="color: #86198f;">Follow-Up Plan:</strong><br/>
              <span style="color: #701a75;">${this.escapeHtml(followUp)}</span>
            </div>
          </div>
          ${investigations.length > 0 ? `
            <div style="margin-top: 6px; border-top: 1px dashed #f0abfc; padding-top: 4px;">
              <strong style="color: #86198f;">Investigations Ordered:</strong> ${investigations.map(i => this.escapeHtml(i)).join(', ')}
            </div>
          ` : ''}
        </div>

        <!-- Doctor Signature & Stamp Footer -->
        <div style="margin-top: 18px; padding-top: 12px; border-top: 1.5px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="font-size: 9.5px; color: #94a3b8; max-width: 58%;">
            <em>Electronically generated via JD Doctors Clinic Ambient AI Scribe System. This clinical document represents the synthesized consultation encounter confirmed by the attending medical professional.</em>
          </div>
          <div style="text-align: center; min-width: 170px;">
            <div style="font-family: cursive, 'Brush Script MT', sans-serif; font-size: 19px; color: #312e81; margin-bottom: 2px;">Dr. Tushar</div>
            <div style="border-top: 1px solid #475569; padding-top: 3px; font-size: 11px; font-weight: 700; color: #0f172a;">
              Dr. Tushar, MD
            </div>
            <div style="font-size: 9px; color: #64748b;">Attending Physician & Authorized Signatory</div>
          </div>
        </div>

      </div>
    `;
  }

  async downloadPrescriptionPDF() {
    this.openPrescriptionModal();
    this.showToast('📄 Preparing formatted Prescription PDF...');
    await this.executePDFDownload();
  }

  openPrescriptionModal() {
    const overlay = document.getElementById('prescription-modal-overlay');
    const modalBody = document.getElementById('prescription-modal-body');
    if (modalBody) {
      modalBody.innerHTML = this.buildPrescriptionHTML();
    }
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }

  closePrescriptionModal() {
    const overlay = document.getElementById('prescription-modal-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  async executePDFDownload() {
    const modalBody = document.getElementById('prescription-modal-body');
    if (!modalBody) return;

    const pName = (this.currentClinicalData?.patient_details?.name) ||
                  document.getElementById('field-patient-name')?.innerText || 'Dr_Tushar';
    const cleanName = pName.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Prescription_${cleanName}_${dateStamp}.pdf`;

    // Wait 250ms for modal DOM painting to complete with real fonts and geometry
    await new Promise((resolve) => setTimeout(resolve, 250));

    if (window.html2pdf) {
      const opt = {
        margin: [6, 8, 6, 8],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      try {
        await window.html2pdf().set(opt).from(modalBody).save();
        this.showToast(`✅ Downloaded: ${filename}`);
      } catch (err) {
        console.warn('[PDF] html2pdf error:', err);
        this.showToast('⚠️ Click "Print / Save PDF" to export directly.');
      }
    } else {
      this.showToast('🖨️ Opening print dialog — select "Save as PDF"');
      window.print();
    }
  }

  copyPrescription() {
    const d = this.currentClinicalData || {};
    const patient = d.patient_details || {};
    const plan = d.plan || {};
    const meds = (d.medication_history || {}).current_medications || [];
    const rx = plan.prescriptions || [];

    const pName = patient.name || document.getElementById('field-patient-name')?.innerText || 'Dr Tushar';
    const pAge = patient.age || document.getElementById('field-patient-age')?.innerText || '30';
    const pGender = patient.sex || document.getElementById('field-patient-gender')?.innerText || 'Male';
    const impression = d.assessment || document.getElementById('field-clinical-impression')?.innerText || 'Under Evaluation';

    const prescriptionText = `================================================
CLINICAL PRESCRIPTION & ENCOUNTER SUMMARY
================================================
Date: ${new Date().toLocaleString()}
Patient Name : ${pName}
Age / Gender : ${pAge} / ${pGender}
Session Ref  : ${this.currentSessionId || 'N/A'}
------------------------------------------------
CHIEF COMPLAINT:
${d.chief_complaint || 'Routine medical checkup'}

CLINICAL IMPRESSION:
${impression}

PRESCRIBED MEDICATIONS (Rx):
${rx.length > 0 ? rx.map(r => '• ' + r).join('\n') : (meds.length > 0 ? meds.map(m => '• ' + m).join('\n') : '• None prescribed')}

INVESTIGATIONS & TESTS:
${(plan.investigations || []).length > 0 ? plan.investigations.map(i => '• ' + i).join('\n') : '• None ordered'}

ADVICE & INSTRUCTIONS:
${plan.advice || 'Follow general healthy habits.'}

FOLLOW-UP:
${plan.follow_up || 'Return if symptoms worsen or after 1 week.'}
================================================`;

    navigator.clipboard.writeText(prescriptionText).then(() => {
      this.showToast('📋 Prescription copied to clipboard!');
    }).catch(() => {
      this.showToast('Failed to copy to clipboard.');
    });
  }

  saveRecording() {
    const transcriptText = this.finalStream ? this.finalStream.innerText.trim() : '';
    if (!transcriptText) {
      this.showToast('No consultation transcript to save.');
      return;
    }

    const sessionId = this.currentSessionId || `session_${Date.now()}`;
    const patientName = document.getElementById('field-patient-name')?.innerText || 'Dr Tushar';

    const content = `MEDICAL CONSULTATION TRANSCRIPT & EHR
Session ID: ${sessionId}
Date: ${new Date().toLocaleString()}
Patient: ${patientName}

FULL TRANSCRIPT:
${transcriptText}

CLINICAL SUMMARY:
${document.getElementById('field-clinical-summary')?.value || 'N/A'}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consultation_${sessionId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('💾 Consultation record downloaded!');
  }

  // ── Past Consultations Drawer & SQLite History ───────────────────────────

  openHistoryDrawer() {
    const drawer = document.getElementById('past-drawer');
    const overlay = document.getElementById('past-drawer-overlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.style.display = 'block';
    this.fetchPastConsultations();
  }

  closeHistoryDrawer() {
    const drawer = document.getElementById('past-drawer');
    const overlay = document.getElementById('past-drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
  }

  async fetchPastConsultations() {
    try {
      const res = await fetch('/api/consultations?limit=25');
      if (!res.ok) return;
      const data = await res.json();
      const list = data.consultations || [];

      // 1. Update quick select dropdown
      const select = document.getElementById('select-past-sessions');
      if (select) {
        select.innerHTML = `<option value="">📁 Past Consultations (${list.length})</option>`;
        list.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.id;
          const time = new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const name = item.patient_name || 'Patient';
          opt.textContent = `${name} (${time})`;
          select.appendChild(opt);
        });
      }

      // 2. Update Drawer List
      const listContainer = document.getElementById('past-drawer-list');
      if (!listContainer) return;

      if (list.length === 0) {
        listContainer.innerHTML = '<div class="drawer-empty">No past consultations recorded yet.<br>Click Start Mic to begin a consultation.</div>';
        return;
      }

      listContainer.innerHTML = '';
      list.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'consultation-card';
        const dateStr = new Date(item.created_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        card.innerHTML = `
          <div class="consultation-card-header">
            <span class="card-patient-name">🩺 ${item.patient_name || 'Dr Tushar'}</span>
            <span class="card-time">${dateStr}</span>
          </div>
          <div class="card-complaint">${item.chief_complaint ? item.chief_complaint.slice(0, 70) + (item.chief_complaint.length > 70 ? '...' : '') : 'Routine consultation'}</div>
          <div class="card-metrics">
            <span class="card-metric-tag">${item.word_count || 0} words</span>
            <span class="card-metric-tag">${(item.duration_seconds || 0).toFixed(1)}s audio</span>
          </div>
        `;

        card.addEventListener('click', () => {
          this.loadConsultationById(item.id);
          this.closeHistoryDrawer();
        });

        listContainer.appendChild(card);
      });

    } catch (e) {
      console.warn('[DB] Could not load past consultations:', e);
    }
  }

  async loadConsultationById(sessionId) {
    try {
      const res = await fetch(`/api/consultations/${sessionId}`);
      if (!res.ok) return;
      const record = await res.json();

      // Populate Transcript Stream
      if (record.full_transcript) {
        if (this.emptyTranscript) this.emptyTranscript.style.display = 'none';
        if (this.finalStream) {
          this.finalStream.innerHTML = `<div class="final-paragraph">${record.full_transcript}</div>`;
        }
        if (this.chunkPlaceholder) this.chunkPlaceholder.style.display = 'none';
        if (this.liveInterimContent) this.liveInterimContent.style.display = 'flex';
        if (this.interimText) this.interimText.textContent = `[Loaded session ${sessionId}]`;

        if (this.statWords) this.statWords.textContent = record.word_count || record.full_transcript.split(/\s+/).length;
        if (this.statChunks) this.statChunks.textContent = '1';
      }

      // Populate Clinical Summary
      if (record.clinical_summary) {
        this.renderClinicalSummary(record.clinical_summary, record.id);
      }

      this.showToast(`Loaded consultation session for ${record.patient_name || 'Dr Tushar'}`);
    } catch (e) {
      console.error('[DB] Failed to load consultation session:', e);
      this.showToast('Failed to load consultation session.');
    }
  }

  showToast(msg) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

window.transcriptController = new TranscriptController();
