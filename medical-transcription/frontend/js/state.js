/**
 * Central State Management for Medical Consultation Transcription.
 * Implements reactive state with deterministic subscriber notifications.
 */

class AppState {
  constructor() {
    this.state = {
      isRecording: false,
      connectionStatus: 'disconnected', // 'connected', 'disconnected', 'connecting'
      vadStatus: 'idle',               // 'idle', 'detecting', 'speech', 'trailing'
      vadProb: 0.0,
      processingStatus: 'ready',       // 'ready', 'listening', 'transcribing', 'stopped'
      transcript: '',
      segments: [],
      segmentCount: 0,
      wordCount: 0,
      speechDuration: 0.0,
      audioLevel: 0.0,
      error: null,
    };
    this.listeners = [];
  }

  getState() {
    return { ...this.state };
  }

  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Notify all subscribed UI listeners
    for (const listener of this.listeners) {
      try {
        listener(this.state, prevState);
      } catch (err) {
        console.error('[STATE] Listener error:', err);
      }
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    // Immediately invoke with current state
    listener(this.state, this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  resetTranscript() {
    this.setState({
      transcript: '',
      segments: [],
      segmentCount: 0,
      wordCount: 0,
      speechDuration: 0.0,
    });
  }
}

// Global singleton state instance
window.appState = new AppState();
