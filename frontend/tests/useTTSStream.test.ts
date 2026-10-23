import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTTSStream,
  resolveTTSWsUrl,
  validateTTSVoice,
  sanitizeTextForTTS,
} from '../src/hooks/useTTSStream';
import { DEFAULT_TTS_VOICE } from '../src/types';

// Mock WebSocket implementation for TTS unit tests
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
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

describe('resolveTTSWsUrl', () => {
  it('returns configuredUrl when provided', () => {
    expect(resolveTTSWsUrl('ws://custom-tts:8005/ws/tts')).toBe('ws://custom-tts:8005/ws/tts');
  });

  it('maps port 8001 to 8005 on local development host', () => {
    const originalLocation = window.location;
    // @ts-expect-error Mocking window.location
    delete window.location;
    // @ts-expect-error Mocking window.location
    window.location = {
      protocol: 'http:',
      host: 'localhost:8001',
      hostname: 'localhost',
      port: '8001',
    };

    expect(resolveTTSWsUrl()).toBe('ws://localhost:8005/ws/tts');

    window.location = originalLocation;
  });

  it('falls back to default port 8005 URL', () => {
    const url = resolveTTSWsUrl();
    expect(url).toMatch(/^ws(s)?:\/\//);
    expect(url).toContain('/ws/tts');
  });
});

describe('validateTTSVoice', () => {
  it('accepts allowed voices from whitelist', () => {
    expect(validateTTSVoice('ger_klara_calm_female')).toBe('ger_klara_calm_female');
    expect(validateTTSVoice('ger_uwe_newsreader_male')).toBe('ger_uwe_newsreader_male');
    expect(validateTTSVoice('ger_jonas_casual_male')).toBe('ger_jonas_casual_male');
  });

  it('normalizes invalid voice, path traversal attempt, or undefined to default voice', () => {
    // Path traversal attempt (Rules 9, 21, STOP 4)
    expect(validateTTSVoice('../../../etc/passwd')).toBe(DEFAULT_TTS_VOICE);
    expect(validateTTSVoice('unknown_voice')).toBe(DEFAULT_TTS_VOICE);
    expect(validateTTSVoice('')).toBe(DEFAULT_TTS_VOICE);
    expect(validateTTSVoice(undefined)).toBe(DEFAULT_TTS_VOICE);
  });
});

describe('sanitizeTextForTTS', () => {
  it('removes code blocks and inline code', () => {
    const input = 'Hier ist Code:\n```python\nprint("hello")\n```\nUnd inline `const x = 1;` Ende.';
    const sanitized = sanitizeTextForTTS(input);
    expect(sanitized).toBe('Hier ist Code: Und inline Ende.');
  });

  it('converts markdown links and removes images', () => {
    const input = 'Bitte [hier klicken](https://example.com) und Bild ![Logo](logo.png) ignorieren.';
    const sanitized = sanitizeTextForTTS(input);
    expect(sanitized).toBe('Bitte hier klicken und Bild ignorieren.');
  });

  it('strips markdown formatting and HTML tags', () => {
    const input = '# Überschrift\n**Fett**, *kursiv*, ~~durchgestrichen~~ und <b>HTML</b>.';
    const sanitized = sanitizeTextForTTS(input);
    expect(sanitized).toBe('Überschrift Fett, kursiv, durchgestrichen und HTML.');
  });

  it('collapses excessive whitespace into single spaces', () => {
    const input = '  Zeile 1   \n\n\n   Zeile 2  \t  ';
    const sanitized = sanitizeTextForTTS(input);
    expect(sanitized).toBe('Zeile 1 Zeile 2');
  });

  it('strictly caps text at 4,000 characters (STOP 2, Rule 23)', () => {
    const longText = 'A'.repeat(5000);
    const sanitized = sanitizeTextForTTS(longText);
    expect(sanitized.length).toBe(4000);
  });
});

describe('useTTSStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
    (window as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default idle state', () => {
    const { result } = renderHook(() => useTTSStream());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('starts synthesis and connects to WebSocket with sanitized text and validated voice', async () => {
    const { result } = renderHook(() => useTTSStream({ defaultVoice: 'ger_klara_calm_female' }));

    await act(async () => {
      await result.current.speak('msg_1', 'Hallo **Welt**!', 'ger_uwe_newsreader_male');
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.activeMessageId).toBe('msg_1');
    expect(MockWebSocket.instances.length).toBe(1);

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onopen?.(new Event('open'));
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ text: 'Hallo Welt!', voice: 'ger_uwe_newsreader_male' })
    );
  });

  it('schedules audio chunks received from WebSocket and handles completion', async () => {
    const onPlaybackEnd = vi.fn();
    const { result } = renderHook(() => useTTSStream({ onPlaybackEnd }));

    await act(async () => {
      await result.current.speak('msg_2', 'Vorlesen');
    });

    const ws = MockWebSocket.instances[0];

    // Create 16-bit PCM chunk: [1000, -1000] encoded in base64
    const pcmData = new Int16Array([1000, -1000]);
    const uint8 = new Uint8Array(pcmData.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Chunk = btoa(binary);

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          data: base64Chunk,
          sample_rate: 24000,
          chunk: 0,
          done: false,
        }),
      } as MessageEvent);
    });

    expect(result.current.isPlaying).toBe(true);

    // Receive done chunk
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          data: '',
          sample_rate: 24000,
          chunk: 1,
          done: true,
        }),
      } as MessageEvent);
    });

    // Audio source is still playing through speaker queue
    expect(result.current.isPlaying).toBe(true);

    // Simulate audio source finishing playback
    const MockSource = (globalThis as any).MockAudioBufferSourceNode;
    expect(MockSource.instances.length).toBeGreaterThan(0);
    const sourceInstance = MockSource.instances[MockSource.instances.length - 1];

    act(() => {
      sourceInstance.onended?.();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
    expect(onPlaybackEnd).toHaveBeenCalledWith('msg_2');
  });

  it('enforces Single-GPU lock by stopping previous playback before starting a new one (STOP 3, Rule 25)', async () => {
    const { result } = renderHook(() => useTTSStream());

    await act(async () => {
      await result.current.speak('msg_1', 'Erste Nachricht');
    });

    expect(result.current.activeMessageId).toBe('msg_1');
    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      await result.current.speak('msg_2', 'Zweite Nachricht');
    });

    // ws1 must be closed, and msg_2 must now be active
    expect(ws1.close).toHaveBeenCalled();
    expect(result.current.activeMessageId).toBe('msg_2');
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('handles service errors gracefully without crashing UI (STOP 1)', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTTSStream({ onError }));

    await act(async () => {
      await result.current.speak('msg_err', 'Fehlertest');
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.onerror?.(new Event('error'));
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.error).toBe('Verbindung zum Sprachausgabedienst fehlgeschlagen.');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('stops playback and closes socket on explicit stop() call', async () => {
    const { result } = renderHook(() => useTTSStream());

    await act(async () => {
      await result.current.speak('msg_stop', 'Wird gestoppt');
    });

    expect(result.current.isPlaying).toBe(true);
    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.stop();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
    expect(ws.close).toHaveBeenCalled();
  });

  it('handles multiple consecutive speak calls cleanly without alternating connection errors', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTTSStream({ onError }));

    // --- Turn 1 ---
    await act(async () => {
      await result.current.speak('msg_1', 'Erster Text');
    });
    expect(result.current.activeMessageId).toBe('msg_1');
    const ws1 = MockWebSocket.instances[0];

    // Finish Turn 1 stream with done
    act(() => {
      ws1.onmessage?.({
        data: JSON.stringify({ data: '', done: true }),
      } as MessageEvent);
    });
    // ws1 must be closed on done
    expect(ws1.close).toHaveBeenCalled();

    // --- Turn 2 (the one that previously failed) ---
    await act(async () => {
      await result.current.speak('msg_2', 'Zweiter Text');
    });
    expect(result.current.activeMessageId).toBe('msg_2');
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    const ws2 = MockWebSocket.instances[1];

    // Finish Turn 2 stream with done
    act(() => {
      ws2.onmessage?.({
        data: JSON.stringify({ data: '', done: true }),
      } as MessageEvent);
    });
    expect(ws2.close).toHaveBeenCalled();

    // --- Turn 3 ---
    await act(async () => {
      await result.current.speak('msg_3', 'Dritter Text');
    });
    expect(result.current.activeMessageId).toBe('msg_3');
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('detaches handlers and ignores stale socket error events after closing', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTTSStream({ onError }));

    await act(async () => {
      await result.current.speak('msg_stale_1', 'Erster Aufruf');
    });

    const ws1 = MockWebSocket.instances[0];
    const staleErrorHandler = ws1.onerror;

    await act(async () => {
      await result.current.speak('msg_stale_2', 'Zweiter Aufruf');
    });

    // ws1 handlers must have been detached
    expect(ws1.onerror).toBeNull();
    expect(ws1.onclose).toBeNull();

    // Even if stale error handler was somehow invoked directly, it must not kill msg_stale_2
    act(() => {
      staleErrorHandler?.(new Event('error'));
    });

    expect(result.current.activeMessageId).toBe('msg_stale_2');
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('auto-dismisses error after 4 seconds', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTTSStream());

      await act(async () => {
        await result.current.speak('msg_err', 'Text');
      });

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.onerror?.(new Event('error'));
      });

      expect(result.current.error).toBe('Verbindung zum Sprachausgabedienst fehlgeschlagen.');

      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(result.current.error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects enabled=false option and does not start playback', async () => {
    const { result } = renderHook(() => useTTSStream({ enabled: false }));

    await act(async () => {
      await result.current.speak('msg_disabled', 'Sollte nicht abgespielt werden');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('stops active playback when enabled changes to false', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTTSStream({ enabled }),
      { initialProps: { enabled: true } }
    );

    await act(async () => {
      await result.current.speak('msg_play', 'Audio läuft');
    });

    expect(result.current.isPlaying).toBe(true);

    rerender({ enabled: false });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });
});
