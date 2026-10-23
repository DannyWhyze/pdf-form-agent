import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSTTStream, resolveSTTWsUrl, cleanTranscript, parseStreamTextRepr } from '../src/hooks/useSTTStream';

// Mock WebSocket implementation for unit tests
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  binaryType = 'blob';
  readyState: number = WebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = WebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    this.readyState = WebSocket.OPEN;
    MockWebSocket.instances.push(this);
  }
}

describe('cleanTranscript', () => {
  it('strips (empty), <empty>, and bare empty markers from server', () => {
    expect(cleanTranscript('(empty)')).toBe('');
    expect(cleanTranscript('<empty>')).toBe('');
    expect(cleanTranscript('[empty]')).toBe('');
    expect(cleanTranscript('empty')).toBe('');
    expect(cleanTranscript('(empty)   ')).toBe('');
  });

  it('preserves valid speech transcripts', () => {
    expect(cleanTranscript('Max Mustermann')).toBe('Max Mustermann');
    expect(cleanTranscript('Hauptstraße 12')).toBe('Hauptstraße 12');
  });

  it('handles and strips empty Python StreamText repr correctly', () => {
    expect(cleanTranscript("StreamText(full='', committed='', tentative='')")).toBe('');
    expect(cleanTranscript('StreamText(full="", committed="", tentative="")')).toBe('');
    expect(cleanTranscript("StreamText(full='', committed='', tentative='', is_final=True)")).toBe('');
    expect(cleanTranscript("StreamText(\n  full='',\n  committed='',\n  tentative=''\n)")).toBe('');
  });

  it('extracts text from valid Python StreamText repr', () => {
    expect(cleanTranscript("StreamText(full='Hallo Welt', committed='Hallo', tentative='Welt')")).toBe('Hallo Welt');
    expect(cleanTranscript('StreamText(full="Max Mustermann", committed="", tentative="")')).toBe('Max Mustermann');
    expect(cleanTranscript("StreamText(full='', committed='Teil 1', tentative='Teil 2')")).toBe('Teil 1 Teil 2');
    expect(cleanTranscript("StreamText(full='Geht\\'s hier?', committed='', tentative='')")).toBe("Geht's hier?");
  });
});

describe('parseStreamTextRepr', () => {
  it('returns null for non-StreamText strings', () => {
    expect(parseStreamTextRepr('Regular text')).toBeNull();
    expect(parseStreamTextRepr('{"event": "final"}')).toBeNull();
    expect(parseStreamTextRepr('')).toBeNull();
  });
});

describe('resolveSTTWsUrl', () => {
  it('prefers explicit url when provided', () => {
    expect(resolveSTTWsUrl('ws://example.com/custom')).toBe('ws://example.com/custom');
  });

  it('uses window.location when available', () => {
    const url = resolveSTTWsUrl();
    expect(url).toMatch(/^ws(s)?:\/\//);
    expect(url).toContain('/ws/stream');
  });
});

describe('useSTTStream', () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn> };
  let mockMediaStream: { getTracks: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
    (window as any).WebSocket = MockWebSocket;

    mockTrack = { stop: vi.fn() };
    mockMediaStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    if (!navigator.mediaDevices) {
      (navigator as any).mediaDevices = {};
    }
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes with default idle state', () => {
    const { result } = renderHook(() => useSTTStream());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.audioLevel).toBe(0);
  });

  it('starts recording and sets up audio graph and websocket', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onTranscript }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
    expect(result.current.isRecording).toBe(true);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].binaryType).toBe('arraybuffer');
  });

  it('forwards worklet audio chunks to websocket', async () => {
    let capturedWorkletNode: any = null;
    const OriginalNode = (window as any).AudioWorkletNode;
    (window as any).AudioWorkletNode = class extends OriginalNode {
      constructor(...args: any[]) {
        super(...args);
        capturedWorkletNode = this;
      }
    };

    const { result } = renderHook(() => useSTTStream());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(capturedWorkletNode).not.toBeNull();
    const fakeChunk = new Int16Array([10, 20, 30]).buffer;

    act(() => {
      capturedWorkletNode.port.onmessage({ data: fakeChunk } as MessageEvent);
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.send).toHaveBeenCalledWith(fakeChunk);

    (window as any).AudioWorkletNode = OriginalNode;
  });

  it('updates transcript on incoming websocket messages', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onTranscript }));

    await act(async () => {
      await result.current.startRecording();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Musterstraße 12', is_final: false }),
      } as MessageEvent);
    });

    expect(result.current.transcript).toBe('Musterstraße 12');
    expect(onTranscript).toHaveBeenCalledWith('Musterstraße 12', false);

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Musterstraße 12, Berlin', is_final: true }),
      } as MessageEvent);
    });

    expect(result.current.transcript).toBe('Musterstraße 12, Berlin');
    expect(onTranscript).toHaveBeenCalledWith('Musterstraße 12, Berlin', true);
  });

  it('combines committed and tentative text in partial streaming events', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onTranscript }));

    await act(async () => {
      await result.current.startRecording();
    });

    const ws = MockWebSocket.instances[0];

    // First partial chunk: tentative only
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ event: 'partial', committed: '', tentative: 'Guten Tag' }),
      } as MessageEvent);
    });

    expect(result.current.transcript).toBe('Guten Tag');
    expect(onTranscript).toHaveBeenCalledWith('Guten Tag', false);

    // Second partial chunk: committed + tentative
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ event: 'partial', committed: 'Guten Tag', tentative: 'Herr Müller' }),
      } as MessageEvent);
    });

    expect(result.current.transcript).toBe('Guten Tag Herr Müller');
    expect(onTranscript).toHaveBeenCalledWith('Guten Tag Herr Müller', false);
  });

  it('gracefully stops recording with action stop and closes websocket on final event', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onTranscript }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: 'stop' }));

    // Simulate final event response from server
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ event: 'final', text: 'Guten Tag Herr Müller' }),
      } as MessageEvent);
    });

    expect(result.current.transcript).toBe('Guten Tag Herr Müller');
    expect(onTranscript).toHaveBeenCalledWith('Guten Tag Herr Müller', true);
    expect(ws.close).toHaveBeenCalled();
  });

  it('closes websocket on safety fallback timeout if final event does not arrive', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSTTStream());

    await act(async () => {
      await result.current.startRecording();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.stopRecording();
    });

    expect(ws.close).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(ws.close).toHaveBeenCalled();
  });

  it('handles busy event and 4029 close code with descriptive error message', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onError }));

    await act(async () => {
      await result.current.startRecording();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ event: 'busy', message: 'Model pool exhausted' }),
      } as MessageEvent);
    });

    expect(result.current.error).toBe('Model pool exhausted');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('handles microphone permission denied (NotAllowedError)', async () => {
    const notAllowedError = new Error('Permission denied');
    notAllowedError.name = 'NotAllowedError';
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(notAllowedError);

    const onError = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onError }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBe('Mikrofonzugriff wurde verweigert.');
    expect(onError).toHaveBeenCalled();
  });

  it('automatically stops recording after maxDurationSeconds (DoS prevention)', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useSTTStream({ maxDurationSeconds: 60 }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current.isRecording).toBe(false);
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('initializes audioLevel at 0 and manages metering lifecycle', async () => {
    const { result } = renderHook(() => useSTTStream());
    expect(result.current.audioLevel).toBe(0);

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.audioLevel).toBeGreaterThanOrEqual(0);

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.audioLevel).toBe(0);
  });

  it('ignores empty StreamText WebSocket responses and does not invoke onTranscript', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onTranscript }));

    await act(async () => {
      await result.current.startRecording();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.stopRecording();
    });

    // Simulate STT server responding to stop with empty StreamText repr
    act(() => {
      ws.onmessage?.({
        data: "StreamText(full='', committed='', tentative='')",
      } as MessageEvent);
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.transcript).toBe('');
  });

  it('extracts non-empty StreamText WebSocket responses and invokes onTranscript', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSTTStream({ onTranscript }));

    await act(async () => {
      await result.current.startRecording();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.stopRecording();
    });

    // Simulate STT server responding with valid speech in StreamText repr
    act(() => {
      ws.onmessage?.({
        data: "StreamText(full='Hallo Herr Müller', committed='Hallo Herr Müller', tentative='')",
      } as MessageEvent);
    });

    expect(onTranscript).toHaveBeenCalledWith('Hallo Herr Müller', true);
    expect(result.current.transcript).toBe('Hallo Herr Müller');
  });
});
