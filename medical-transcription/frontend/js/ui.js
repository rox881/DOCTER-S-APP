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

    this.connectionBadge = null;
    this.vadBadge = null;

    this.wordCountEl = null;
    this.chunkCountEl = null;
    this.errorBanner = null;
  }

  init() {
    this.startBtn = document.getElementById('btn-start');
    this.stopBtn = document.getElementById('btn-stop');
    this.saveBtn = document.getElementById('btn-save');
    this.clearBtn = document.getElementById('btn-clear');

    this.connectionBadge = document.getElementById('connection-badge');
    this.vadBadge = document.getElementById('vad-badge');

    this.wordCountEl = document.getElementById('stat-words');
    this.chunkCountEl = document.getElementById('stat-chunks');
    this.errorBanner = document.getElementById('error-banner');

    this.bindEvents();

    // Subscribe to central AppState
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
        window.transcriptController.saveRecording();
      });
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        if (confirm('Clear entire consultation session?')) {
          window.transcriptController.clear();
          window.wsClient.clearSession();
        }
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
        connected: 'Deepgram Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected',
      };
      this.connectionBadge.textContent = statusLabels[state.connectionStatus] || state.connectionStatus;
    }

    // 3. VAD Badge
    if (this.vadBadge) {
      this.vadBadge.className = `vad-badge state-${state.vadStatus}`;
      const vadLabels = {
        idle: 'VAD: Silence',
        detecting: 'VAD: Detecting...',
        speech: 'VAD: Speech Active',
        trailing: 'VAD: Trailing Pause',
      };
      this.vadBadge.textContent = vadLabels[state.vadStatus] || `VAD: ${state.vadStatus}`;
    }

    // 4. Counters
    if (this.wordCountEl && state.wordCount !== undefined) {
      this.wordCountEl.textContent = state.wordCount;
    }
    if (this.chunkCountEl && state.segmentCount !== undefined) {
      this.chunkCountEl.textContent = state.segmentCount;
    }

    // 5. Error Banner
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

