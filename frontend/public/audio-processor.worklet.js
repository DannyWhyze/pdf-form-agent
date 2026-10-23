/**
 * AudioProcessor - AudioWorklet processor for 16 kHz 32-bit linear PCM (float32).
 * Runs in the dedicated audio rendering thread to prevent main-thread latency and phase distortion.
 * Directly compatible with transcribe.cpp / Nemotron STT engine expecting 16 kHz float32.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
    // 5120 samples at 16 kHz = 320 ms chunks (exceeds 300 ms server segment threshold)
    this.chunkSize = (options && options.processorOptions && options.processorOptions.chunkSize) || 5120;
    this.outputBuffer = new Float32Array(this.chunkSize);
    this.outputIndex = 0;

    // Buffer for input float samples
    this.inputBuffer = [];
    this.sourceCursor = 0;

    // Handle messages from the main thread (e.g. flush remaining audio)
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.flush();
      }
    };
  }

  flush() {
    if (this.outputIndex > 0) {
      const remaining = this.outputBuffer.slice(0, this.outputIndex);
      this.port.postMessage(remaining.buffer, [remaining.buffer]);
      this.outputBuffer = new Float32Array(this.chunkSize);
      this.outputIndex = 0;
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    // Downmix to mono (channel 0)
    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    const currentSampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;
    const ratio = currentSampleRate / this.targetSampleRate;

    for (let i = 0; i < channelData.length; i++) {
      this.inputBuffer.push(channelData[i]);
    }

    // Linear interpolation downsampling
    while (this.sourceCursor + 1 < this.inputBuffer.length) {
      const idx = Math.floor(this.sourceCursor);
      const frac = this.sourceCursor - idx;
      const s0 = this.inputBuffer[idx];
      const s1 = this.inputBuffer[idx + 1];
      const sample = s0 + frac * (s1 - s0);

      // Clamped Float32 PCM [-1.0, 1.0]
      const clamped = Math.max(-1.0, Math.min(1.0, sample));
      this.outputBuffer[this.outputIndex++] = clamped;

      if (this.outputIndex >= this.chunkSize) {
        this.port.postMessage(this.outputBuffer.buffer, [this.outputBuffer.buffer]);
        this.outputBuffer = new Float32Array(this.chunkSize);
        this.outputIndex = 0;
      }

      this.sourceCursor += ratio;
    }

    // Shift consumed samples out of inputBuffer
    const dropCount = Math.floor(this.sourceCursor);
    if (dropCount > 0) {
      this.inputBuffer.splice(0, dropCount);
      this.sourceCursor -= dropCount;
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
