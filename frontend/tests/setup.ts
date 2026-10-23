import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// JSDOM mock for smooth scrolling and animation frame
window.HTMLElement.prototype.scrollIntoView = vi.fn();
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || ((id) => clearTimeout(id));

// Web Audio API & MediaDevices Mocks for testing
class MockAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioWorklet {
  addModule = vi.fn().mockResolvedValue(undefined);
}

class MockMessagePort {
  onmessage: ((ev: any) => any) | null = null;
  postMessage = vi.fn();
}

class MockAudioWorkletNode extends MockAudioNode {
  port = new MockMessagePort();
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 256;
  frequencyBinCount = 128;
  smoothingTimeConstant = 0.5;
  getByteTimeDomainData = vi.fn().mockImplementation((arr: Uint8Array) => {
    arr.fill(128);
  });
}

class MockAudioBuffer {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  private channelData: Float32Array;

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channelData = new Float32Array(length);
  }

  getChannelData() {
    return this.channelData;
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  static instances: MockAudioBufferSourceNode[] = [];
  buffer: any = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn().mockImplementation(() => {
    if (this.onended) this.onended();
  });

  constructor() {
    super();
    MockAudioBufferSourceNode.instances.push(this);
  }
}

(globalThis as any).MockAudioBufferSourceNode = MockAudioBufferSourceNode;

class MockAudioContext {
  state = 'running';
  sampleRate = 48000;
  currentTime = 0;
  destination = new MockAudioNode();
  audioWorklet = new MockAudioWorklet();
  createMediaStreamSource = vi.fn().mockReturnValue(new MockAudioNode());
  createAnalyser = vi.fn().mockImplementation(() => new MockAnalyserNode());
  createBuffer = vi.fn((channels, len, rate) => new MockAudioBuffer(channels, len, rate));
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  resume = vi.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  close = vi.fn().mockImplementation(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
}

(globalThis as any).AudioContext = MockAudioContext;
(window as any).AudioContext = MockAudioContext;
(globalThis as any).AudioWorkletNode = MockAudioWorkletNode;
(window as any).AudioWorkletNode = MockAudioWorkletNode;

if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
}
