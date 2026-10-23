import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseSTTStreamOptions {
  wsUrl?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  maxDurationSeconds?: number;
}

export interface UseSTTStreamReturn {
  isRecording: boolean;
  transcript: string;
  error: string | null;
  audioLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function parseStreamTextRepr(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('StreamText(') || !trimmed.endsWith(')')) {
    return null;
  }
  const inner = trimmed.slice('StreamText('.length, -1);

  const extractParam = (name: string): string => {
    const regex = new RegExp(`\\b${name}\\s*=\\s*(['"])((?:\\\\\\1|[\\s\\S])*?)\\1`);
    const match = inner.match(regex);
    if (!match) return '';
    return match[2].replace(/\\(['"\\])/g, '$1').trim();
  };

  const full = extractParam('full');
  const committed = extractParam('committed');
  const tentative = extractParam('tentative');

  return full || [committed, tentative].filter(Boolean).join(' ') || '';
}

export function cleanTranscript(text: string): string {
  if (!text) return '';

  const parsedStreamText = parseStreamTextRepr(text);
  const targetText = parsedStreamText !== null ? parsedStreamText : text;

  return targetText
    .replace(/\(empty\)/gi, '')
    .replace(/<empty>/gi, '')
    .replace(/\[empty\]/gi, '')
    .replace(/^empty$/gi, '')
    .trim();
}

export function resolveSTTWsUrl(configuredUrl?: string): string {
  if (configuredUrl) {
    return configuredUrl;
  }
  const envUrl = import.meta.env?.VITE_STT_WS_URL;
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location && window.location.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '8001') {
      const hostname = window.location.hostname || '127.0.0.1';
      return `${protocol}//${hostname}:8002/ws/stream`;
    }
    return `${protocol}//${window.location.host}/ws/stream`;
  }
  return 'ws://127.0.0.1:8002/ws/stream';
}

/**
 * Custom Hook for real-time STT audio streaming via Web Audio API, AudioWorklet, and WebSockets.
 * Enforces Rule 30 (uncompressed 16 kHz mono linear PCM pipeline) and client-side resource bounds.
 */
export function useSTTStream(options?: UseSTTStreamOptions): UseSTTStreamReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Immediately stops microphone media tracks and audio graph nodes
  const teardownAudio = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage('flush');
      } catch {
        // ignore flush errors during teardown
      }
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      }
      workletNodeRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore track stop errors
      }
      streamRef.current = null;
    }

    if (meterRafRef.current) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(meterRafRef.current);
      }
      meterRafRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      }
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch {
        // ignore context close errors
      }
      audioContextRef.current = null;
    }

    setAudioLevel(0);
    setIsRecording(false);
  }, []);

  // Closes WebSocket connection and cleans up finalize timeout
  const closeWs = useCallback(() => {
    if (finalizeTimeoutRef.current) {
      clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch {
        // ignore websocket close errors
      }
      wsRef.current = null;
    }
  }, []);

  // Complete teardown (audio + websocket)
  const fullTeardown = useCallback(() => {
    teardownAudio();
    closeWs();
  }, [teardownAudio, closeWs]);

  // Graceful stop: stops audio immediately, sends stop action to server, waits for final event or timeout
  const stopRecording = useCallback(() => {
    teardownAudio();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ action: 'stop' }));
      } catch {
        // ignore send error
      }

      // Safety fallback: close socket if final event does not arrive within 1500 ms
      finalizeTimeoutRef.current = setTimeout(() => {
        closeWs();
      }, 1500);
    } else {
      closeWs();
    }
  }, [teardownAudio, closeWs]);

  const startRecording = useCallback(async () => {
    if (isRecording) {
      return;
    }

    // Cancel any pending close timers and ensure previous socket is disconnected
    if (finalizeTimeoutRef.current) {
      clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = null;
    }
    closeWs();

    setError(null);
    setTranscript('');

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Audio-Aufnahme wird von diesem Browser nicht unterstützt.');
      }

      // Step 1: Capture audio with hardware echo cancellation and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      // Step 2: Initialize Web Audio API and AudioWorklet
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API wird von diesem Browser nicht unterstützt.');
      }
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (!audioContext.audioWorklet || typeof audioContext.audioWorklet.addModule !== 'function') {
        throw new Error('AudioWorklet wird von diesem Browser nicht unterstützt.');
      }

      await audioContext.audioWorklet.addModule('/audio-processor.worklet.js');

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;
      sourceNode.connect(workletNode);

      // Audio Metering Setup (AnalyserNode & RMS calculation)
      try {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        sourceNode.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128; // -1 to 1
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);
          const level = Math.min(1.0, Math.max(0.0, rms * 4));
          setAudioLevel(level);
          if (typeof requestAnimationFrame === 'function') {
            meterRafRef.current = requestAnimationFrame(updateMeter);
          }
        };
        if (typeof requestAnimationFrame === 'function') {
          meterRafRef.current = requestAnimationFrame(updateMeter);
        }
      } catch (meterErr) {
        // AnalyserNode failure should never break STT streaming
        console.warn('Could not initialize audio metering:', meterErr);
      }

      // Step 3: Establish WebSocket connection to STT microservice
      const targetWsUrl = resolveSTTWsUrl(optionsRef.current?.wsUrl);
      const ws = new WebSocket(targetWsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        try {
          if (targetWsUrl.includes('/ws/stream')) {
            ws.send(JSON.stringify({ action: 'start', language: 'de-DE', chunk_ms: 320, lookahead: 3 }));
          }
        } catch {
          // ignore send error on closed socket
        }
      };

      workletNode.port.onmessage = (event: MessageEvent) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && event.data) {
          wsRef.current.send(event.data);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!event.data) return;
        try {
          const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : null;
          if (parsed && typeof parsed === 'object') {
            // 1. Ready event
            if (parsed.event === 'ready') {
              return;
            }

            // 2. Busy / Pool Exhausted event
            if (parsed.event === 'busy') {
              const msg = parsed.message || 'Spracherkennungsdienst ist ausgelastet. Bitte kurz warten.';
              setError(msg);
              optionsRef.current?.onError?.(new Error(msg));
              fullTeardown();
              return;
            }

            // 3. Partial event (combines committed and tentative for real-time responsiveness)
            if (parsed.event === 'partial') {
              const committed = typeof parsed.committed === 'string' ? parsed.committed : '';
              const tentative = typeof parsed.tentative === 'string' ? parsed.tentative : '';
              const combined = [committed, tentative].filter(Boolean).join(' ');
              const cleaned = cleanTranscript(combined);
              if (cleaned) {
                setTranscript(cleaned);
                optionsRef.current?.onTranscript?.(cleaned, false);
              }
              return;
            }

            // 4. Final event from streaming ASR
            if (parsed.event === 'final') {
              const finalText =
                typeof parsed.text === 'string'
                  ? parsed.text
                  : typeof parsed.transcript === 'string'
                  ? parsed.transcript
                  : typeof parsed.committed === 'string'
                  ? parsed.committed
                  : '';
              const cleaned = cleanTranscript(finalText);
              if (cleaned) {
                setTranscript(cleaned);
                optionsRef.current?.onTranscript?.(cleaned, true);
              }
              closeWs();
              return;
            }

            // 5. Fallback for legacy JSON format (e.g. { text: "...", is_final: boolean })
            const extracted = parsed.text || parsed.transcript || parsed.committed;
            if (typeof extracted === 'string') {
              const cleaned = cleanTranscript(extracted);
              if (cleaned) {
                setTranscript(cleaned);
                optionsRef.current?.onTranscript?.(
                  cleaned,
                  Boolean(parsed.is_final)
                );
              }
              return;
            }
          }
        } catch {
          // Plain text response from server (e.g. legacy /ws/stt emits raw text string)
        }
        if (typeof event.data === 'string') {
          const isFinal = streamRef.current === null;
          const cleaned = cleanTranscript(event.data);
          if (cleaned) {
            setTranscript(cleaned);
            optionsRef.current?.onTranscript?.(cleaned, isFinal);
          }
          if (isFinal && event.data.trim().startsWith('StreamText(')) {
            closeWs();
          }
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (event.code === 4029) {
          const msg = 'Spracherkennungsdienst ist ausgelastet (4029). Bitte kurz warten.';
          setError(msg);
          optionsRef.current?.onError?.(new Error(msg));
        }
        fullTeardown();
      };

      ws.onerror = () => {
        const err = new Error('Verbindung zum Spracherkennungsdienst fehlgeschlagen.');
        setError(err.message);
        optionsRef.current?.onError?.(err);
        fullTeardown();
      };

      // Step 4: Guard with client-side timeout to prevent resource exhaustion / DoS
      const maxSeconds = optionsRef.current?.maxDurationSeconds ?? 60;
      timeoutRef.current = setTimeout(() => {
        stopRecording();
      }, maxSeconds * 1000);

      setIsRecording(true);
    } catch (err: unknown) {
      let message = 'Fehler beim Starten der Audioaufnahme.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          message = 'Mikrofonzugriff wurde verweigert.';
        } else {
          message = err.message;
        }
      }
      setError(message);
      optionsRef.current?.onError?.(err instanceof Error ? err : new Error(message));
      fullTeardown();
    }
  }, [isRecording, stopRecording, teardownAudio, closeWs, fullTeardown]);

  useEffect(() => {
    return () => {
      fullTeardown();
    };
  }, [fullTeardown]);

  return {
    isRecording,
    transcript,
    error,
    audioLevel,
    startRecording,
    stopRecording,
  };
}
