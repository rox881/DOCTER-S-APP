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

    const btnCopyPrescription = document.getElementById('btn-copy-prescription');
    if (btnCopyPrescription) {
      btnCopyPrescription.addEventListener('click', () => this.copyPrescription());
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

  // ── Prescription Copy & Save Recording ───────────────────────────────────

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
