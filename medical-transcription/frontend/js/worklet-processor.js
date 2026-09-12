/**
 * AudioWorkletProcessor for streaming PCM capture.
 * Extracts mono 16 kHz Float32 samples and sends chunks to main thread.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 480; // 30ms @ 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Use channel 0 (mono)
    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];

      if (this.bufferIndex >= this.bufferSize) {
        // Send a copy of the full 30ms frame (480 samples)
        this.port.postMessage(this.buffer.slice(0, this.bufferSize));
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
