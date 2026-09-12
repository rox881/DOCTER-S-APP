/**
 * UI Controller.
 * Subscribes to central AppState, updates DOM elements, manages user actions.
 */

class UIController {
  constructor() {
    this.startBtn = null;
    this.stopBtn = null;
    this.saveBtn = null;
    this.clearBtn = null;
    this.copyBtn = null;
    this.autoScrollToggle = null;

    this.connectionBadge = null;
    this.vadBadge = null;
    this.statusBadge = null;

    this.wordCountEl = null;
    this.chunkCountEl = null;
    this.audioMeterBar = null;
    this.errorBanner = null;
  }

  init() {
    this.startBtn = document.getElementById('btn-start');
    this.stopBtn = document.getElementById('btn-stop');
    this.saveBtn = document.getElementById('btn-save');
    this.clearBtn = document.getElementById('btn-clear');
    this.copyBtn = document.getElementById('btn-copy');
    this.autoScrollToggle = document.getElementById('toggle-autoscroll');

    this.connectionBadge = document.getElementById('connection-badge');
    this.vadBadge = document.getElementById('vad-badge');
    this.statusBadge = document.getElementById('status-badge');

    this.wordCountEl = document.getElementById('stat-words');
    this.chunkCountEl = document.getElementById('stat-chunks');
    this.audioMeterBar = document.getElementById('audio-meter-bar');
    this.errorBanner = document.getElementById('error-banner');

    this.bindEvents();

    // Subscribe to state changes
    window.appState.subscribe((state, prevState) => this.render(state, prevState));
  }

  bindEvents() {
    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => {
        window.audioEngine.start();
      });
    }

    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => {
        window.audioEngine.stop();
      });
    }

    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => {
        window.transcriptController.downloadTranscript();
      });
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        if (confirm('Clear entire transcript session?')) {
          window.wsClient.clearSession();
        }
      });
    }

    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => {
        window.transcriptController.copyToClipboard();
      });
    }

    if (this.autoScrollToggle) {
      this.autoScrollToggle.addEventListener('change', (e) => {
        window.transcriptController.autoScroll = e.target.checked;
      });
    }
  }

  render(state, prevState) {
    // 1. Controls State
    if (this.startBtn && this.stopBtn) {
      this.startBtn.disabled = state.isRecording;
      this.stopBtn.disabled = !state.isRecording;

      if (state.isRecording) {
        this.startBtn.classList.add('recording-pulse');
      } else {
        this.startBtn.classList.remove('recording-pulse');
      }
    }

    // 2. Connection Badge
    if (this.connectionBadge) {
      this.connectionBadge.className = `badge badge-${state.connectionStatus}`;
      const statusLabels = {
        connected: 'Local CPU Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected',
      };
      this.connectionBadge.textContent = statusLabels[state.connectionStatus] || state.connectionStatus;
    }

    // 3. VAD Badge
    if (this.vadBadge) {
      this.vadBadge.className = `vad-indicator state-${state.vadStatus}`;
      const vadLabels = {
        idle: 'VAD: Silence',
        detecting: 'VAD: Detecting...',
        speech: 'VAD: Speech Active',
        trailing: 'VAD: Trailing Pause',
      };
      this.vadBadge.textContent = vadLabels[state.vadStatus] || `VAD: ${state.vadStatus}`;
    }

    // 4. Processing Status
    if (this.statusBadge) {
      const statusLabels = {
        ready: 'Status: Ready',
        listening: 'Status: Listening (VAD Active)',
        transcribing: 'Status: Transcribing (Whisper CPU)...',
        stopped: 'Status: Stopped',
      };
      this.statusBadge.textContent = statusLabels[state.processingStatus] || `Status: ${state.processingStatus}`;
    }

    // 5. Counters
    if (this.wordCountEl) {
      this.wordCountEl.textContent = state.wordCount;
    }
    if (this.chunkCountEl) {
      this.chunkCountEl.textContent = state.segmentCount;
    }

    // 6. Audio Meter Bar
    if (this.audioMeterBar) {
      const percent = Math.min(100, Math.round(state.audioLevel * 100));
      this.audioMeterBar.style.width = `${percent}%`;
    }

    // 7. Render Segments if changed
    if (state.segments !== prevState.segments) {
      window.transcriptController.renderSegments(state.segments);
    }

    // 8. Error banner
    if (this.errorBanner) {
      if (state.error) {
        this.errorBanner.style.display = 'block';
        this.errorBanner.textContent = state.error;
      } else {
        this.errorBanner.style.display = 'none';
      }
    }
  }
}

window.uiController = new UIController();
