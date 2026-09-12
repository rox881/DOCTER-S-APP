/**
 * WebSocket Communication Client.
 * Connects to local FastAPI backend (/ws/transcribe) for binary audio streaming
 * and structured transcript/status event reception.
 */

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnecting = false;
  }

  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8000';
    return `${protocol}//${host}/ws/transcribe`;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = this.getWebSocketUrl();
    console.log(`[WS] Connecting to ${url}...`);
    window.appState.setState({ connectionStatus: 'connecting' });

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[WS] Connected to local CPU backend.');
        window.appState.setState({ connectionStatus: 'connected', error: null });
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          this.handleTextMessage(event.data);
        }
      };

      this.ws.onclose = (event) => {
        console.warn(`[WS] Disconnected (code: ${event.code}). Retrying in 2s...`);
        window.appState.setState({ connectionStatus: 'disconnected' });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Connection error:', err);
        window.appState.setState({
          connectionStatus: 'disconnected',
          error: 'Cannot connect to local backend. Ensure FastAPI server is running.',
        });
      };
    } catch (err) {
      console.error('[WS] Initialization failed:', err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 2000);
  }

  handleTextMessage(dataStr) {
    try {
      const msg = JSON.parse(dataStr);

      if (msg.type === 'partial') {
        // Google Live Transcribe style live interim speech
        if (window.transcriptController) {
          window.transcriptController.updateInterim(msg.text);
        }
      } else if (msg.type === 'transcript') {
        const state = window.appState.getState();
        const updatedSegments = [...state.segments, {
          id: msg.segment_id,
          text: msg.text,
          duration: msg.duration,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }];

        window.appState.setState({
          transcript: msg.full_transcript,
          segments: updatedSegments,
          segmentCount: msg.segments || updatedSegments.length,
          wordCount: msg.words,
          processingStatus: 'listening',
        });

        if (window.transcriptController) {
          window.transcriptController.commitFinal(msg);
        }
      } else if (msg.type === 'status') {
        window.appState.setState({
          processingStatus: msg.status,
          vadStatus: msg.vad || window.appState.getState().vadStatus,
        });
      } else if (msg.type === 'vad') {
        window.appState.setState({
          vadStatus: msg.state,
          vadProb: msg.prob,
        });
      } else if (msg.type === 'extraction_loading') {
        if (window.transcriptController) {
          window.transcriptController.showLoading(msg.message);
        }
      } else if (msg.type === 'clinical_summary') {
        if (window.transcriptController) {
          window.transcriptController.renderClinicalSummary(msg.data, msg.session_id);
        }
      } else if (msg.type === 'session_end') {
        console.log('[WS] Session completed:', msg.data);
        window.appState.setState({
          processingStatus: 'stopped',
          isRecording: false,
          vadStatus: 'idle',
        });
      } else if (msg.type === 'session_cleared') {
        window.appState.resetTranscript();
        if (window.transcriptController) {
          window.transcriptController.clear();
        }
      } else if (msg.type === 'error') {
        console.error('[WS] Server error:', msg.message);
        window.appState.setState({ error: msg.message });
      }
    } catch (err) {
      console.error('[WS] Error parsing message:', err, dataStr);
    }
  }

  sendAudioFrame(float32Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send raw buffer (little-endian Float32 PCM)
      this.ws.send(float32Array.buffer);
    }
  }

  startSession() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'start' }));
    }
  }

  stopSession() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'stop' }));
    }
  }

  clearSession() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'clear' }));
    }
  }
}

window.wsClient = new WebSocketClient();
