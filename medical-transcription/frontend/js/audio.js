/**
 * Audio Capture & Streaming Engine.
 * Captures 16 kHz Mono Float32 PCM from user microphone via AudioWorklet
 * and streams frames to local WebSocket.
 */

class AudioCaptureEngine {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.scriptProcessor = null; // Fallback
    this.analyser = null;
    this.animationId = null;
    this.isCapturing = false;
  }

  async start() {
    if (this.isCapturing) return;

    try {
      // 1. Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize AudioContext at target 16 kHz
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });

      // Resume context if suspended by browser autoplay policy
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 3. Analyser Node for Audio Activity Visualizer
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.sourceNode.connect(this.analyser);
      this.startVisualizerLoop();

      // 4. Load AudioWorklet with fallback to ScriptProcessor
      let workletLoaded = false;
      if (this.audioContext.audioWorklet) {
        try {
          await this.audioContext.audioWorklet.addModule('/js/worklet-processor.js');
          this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

          this.workletNode.port.onmessage = (event) => {
            const float32Data = event.data;
            window.wsClient.sendAudioFrame(float32Data);
          };

          this.sourceNode.connect(this.workletNode);
          workletLoaded = true;
          console.log('[AUDIO] AudioWorklet PCM processor initialized successfully.');
        } catch (workletErr) {
          console.warn('[AUDIO] AudioWorklet load failed, using ScriptProcessor fallback:', workletErr);
        }
      }

      if (!workletLoaded) {
        // Fallback for browsers or contexts where AudioWorklet is blocked
        this.setupScriptProcessorFallback();
      }

      this.isCapturing = true;
      window.appState.setState({
        isRecording: true,
        processingStatus: 'listening',
        error: null,
      });

      // Notify server session start
      window.wsClient.startSession();
      console.log('[AUDIO] Microphone capture active.');

    } catch (err) {
      console.error('[AUDIO] Microphone access error:', err);
      let errorMsg = 'Failed to access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Microphone permission denied. Please allow microphone access in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No microphone found on this device.';
      }
      window.appState.setState({ error: errorMsg, isRecording: false });
      this.stop();
    }
  }

  setupScriptProcessorFallback() {
    console.log('[AUDIO] Initializing ScriptProcessor fallback (buffer: 2048)...');
    const bufferSize = 2048;
    this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isCapturing) return;
      const inputBuffer = event.inputBuffer.getChannelData(0);
      // Slice into 480 sample frames (30ms @ 16kHz)
      const frameSize = 480;
      for (let i = 0; i < inputBuffer.length; i += frameSize) {
        const slice = inputBuffer.slice(i, i + frameSize);
        if (slice.length === frameSize) {
          window.wsClient.sendAudioFrame(slice);
        }
      }
    };

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  startVisualizerLoop() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const updateMeter = () => {
      if (!this.isCapturing) return;
      this.analyser.getByteFrequencyData(dataArray);

      // Compute average energy
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalizedLevel = Math.min(1.0, avg / 128.0);

      window.appState.setState({ audioLevel: normalizedLevel });
      this.animationId = requestAnimationFrame(updateMeter);
    };

    this.animationId = requestAnimationFrame(updateMeter);
  }

  stop() {
    this.isCapturing = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    window.appState.setState({
      isRecording: false,
      audioLevel: 0.0,
    });

    // Notify server session stop
    window.wsClient.stopSession();
    console.log('[AUDIO] Microphone capture stopped.');
  }
}

window.audioEngine = new AudioCaptureEngine();
