import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ALLOWED_TTS_VOICES,
  DEFAULT_TTS_VOICE,
  TTSVoice,
  TTSChunkMessage,
  UseTTSStreamOptions,
  UseTTSStreamReturn,
} from '../types';

/**
 * Resolves the WebSocket URL for the local TTS microservice (Port 8005).
 */
export function resolveTTSWsUrl(configuredUrl?: string): string {
  if (configuredUrl) {
    return configuredUrl;
  }
  const envUrl = import.meta.env?.VITE_TTS_WS_URL;
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location && window.location.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '8001') {
      const hostname = window.location.hostname || '127.0.0.1';
      return `${protocol}//${hostname}:8005/ws/tts`;
    }
    return `${protocol}//${window.location.host}/ws/tts`;
  }
  return 'ws://127.0.0.1:8005/ws/tts';
}

/**
 * Validates the requested voice against the strict whitelist.
 * Protects against path traversal and arbitrary file loading (Rules 9, 21).
 */
export function validateTTSVoice(voice?: string): TTSVoice {
  if (!voice) {
    return DEFAULT_TTS_VOICE;
  }
  if ((ALLOWED_TTS_VOICES as readonly string[]).includes(voice)) {
    return voice as TTSVoice;
  }
  return DEFAULT_TTS_VOICE;
}

/**
 * Strips code blocks, inline code, markdown formatting, HTML tags, and system artefacts.
 * Normalizes whitespace and caps length at 4,000 characters to prevent DoS/OOM (Rules 9, 23).
 */
export function sanitizeTextForTTS(rawText: string): string {
  if (!rawText) return '';

  return (
    rawText
      // 1. Remove fenced code blocks (``` ... ```)
      .replace(/```[\s\S]*?```/g, ' ')
      // 2. Remove inline code (`...`)
      .replace(/`[^`]*`/g, ' ')
      // 3. Remove markdown images (![alt](url))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      // 4. Transform markdown links ([text](url) -> text)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // 5. Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // 6. Remove blockquote markers, list markers, headers
      .replace(/^[\s>#-*+]+ /gm, ' ')
      // 7. Remove emphasis markers (*, _, ~, #)
      .replace(/[*_~#]/g, '')
      // 8. Normalize consecutive whitespace and newlines to a single space
      .replace(/\s+/g, ' ')
      .trim()
      // 9. Cap strictly at 4,000 characters (STOP 2)
      .slice(0, 4000)
  );
}

/**
 * Custom Hook for real-time TTS audio streaming using Web Audio API (24 kHz mono linear PCM).
 * Enforces single-GPU concurrency management (Rule 25) and memory leak protection (Rules 23, 26).
 */
export function useTTSStream(options?: UseTTSStreamOptions): UseTTSStreamReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const isDoneRef = useRef<boolean>(false);
  const activeMessageIdRef = useRef<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setAutoDismissError = useCallback((errMsg: string | null) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setError(errMsg);
    if (errMsg) {
      errorTimerRef.current = setTimeout(() => {
        setError(null);
        errorTimerRef.current = null;
      }, 4000);
    }
  }, []);

  // Stops all playing audio nodes and resets audio queue
  const stopAudio = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source might already have ended or disconnected
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    isDoneRef.current = false;
  }, []);

  // Closes active WebSocket connection safely and detaches all listeners to prevent ghost events
  const closeWs = useCallback(() => {
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      } catch {
        // Ignore close errors
      }
    }
  }, []);

  // Central stop function (releases audio, closes WS, resets state)
  const stop = useCallback(() => {
    stopAudio();
    closeWs();
    activeMessageIdRef.current = null;
    setIsPlaying(false);
    setActiveMessageId(null);
  }, [stopAudio, closeWs]);

  // Decodes base64-encoded 16-bit signed PCM into AudioBuffer and schedules gapless playback
  const scheduleAudioChunk = useCallback(
    (base64Data: string, sampleRate = 24000) => {
      if (!base64Data || !audioContextRef.current) return;
      const ctx = audioContextRef.current;

      try {
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        if (int16Array.length === 0) return;

        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        const currentTime = ctx.currentTime;
        const startTime = Math.max(currentTime, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + audioBuffer.duration;

        activeSourcesRef.current.push(source);

        source.onended = () => {
          activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
          if (isDoneRef.current && activeSourcesRef.current.length === 0) {
            const finishedId = activeMessageIdRef.current;
            activeMessageIdRef.current = null;
            setIsPlaying(false);
            setActiveMessageId(null);
            if (finishedId) {
              optionsRef.current?.onPlaybackEnd?.(finishedId);
            }
          }
        };
      } catch (decodeErr) {
        console.warn('TTS Audio chunk decode/schedule error:', decodeErr);
      }
    },
    []
  );

  // If disabled via options, stop immediately
  useEffect(() => {
    if (options?.enabled === false) {
      stop();
    }
  }, [options?.enabled, stop]);

  const speak = useCallback(
    async (messageId: string, text: string, voice?: string) => {
      // If disabled via options, do not attempt to speak or connect
      if (optionsRef.current?.enabled === false) {
        return;
      }

      // STOP 3: Single-GPU Concurrency Management (Rule 25).
      // Immediately stop any currently playing or loading stream before starting a new one.
      stop();

      const sanitizedText = sanitizeTextForTTS(text);
      if (!sanitizedText) {
        return;
      }

      const validatedVoice = validateTTSVoice(voice || optionsRef.current?.defaultVoice);
      setAutoDismissError(null);
      setIsPlaying(true);
      setActiveMessageId(messageId);
      activeMessageIdRef.current = messageId;
      isDoneRef.current = false;

      // Lazy initialization of AudioContext on user interaction
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) {
          throw new Error('Web Audio API wird von diesem Browser nicht unterstützt.');
        }

        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtx();
        }

        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        nextStartTimeRef.current = audioContextRef.current.currentTime;
      } catch (ctxErr) {
        const err = ctxErr instanceof Error ? ctxErr : new Error('AudioContext Fehler');
        setAutoDismissError(err.message);
        optionsRef.current?.onError?.(err);
        stop();
        return;
      }

      // Establish WebSocket connection to TTS microservice (Port 8005)
      try {
        const targetWsUrl = resolveTTSWsUrl(optionsRef.current?.wsUrl);
        const ws = new WebSocket(targetWsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          try {
            ws.send(JSON.stringify({ text: sanitizedText, voice: validatedVoice }));
          } catch (sendErr) {
            console.warn('TTS WebSocket send error:', sendErr);
          }
        };

        ws.onmessage = (event: MessageEvent) => {
          if (wsRef.current !== ws) return;
          if (!event.data) return;
          try {
            const chunk: TTSChunkMessage =
              typeof event.data === 'string' ? JSON.parse(event.data) : null;
            if (!chunk) return;

            if (chunk.error) {
              const err = new Error(chunk.error);
              setAutoDismissError(err.message);
              optionsRef.current?.onError?.(err);
              stop();
              return;
            }

            if (chunk.data) {
              scheduleAudioChunk(chunk.data, chunk.sample_rate || 24000);
            }

            if (chunk.done) {
              isDoneRef.current = true;
              closeWs();
              if (activeSourcesRef.current.length === 0) {
                const finishedId = activeMessageIdRef.current;
                activeMessageIdRef.current = null;
                setIsPlaying(false);
                setActiveMessageId(null);
                if (finishedId) {
                  optionsRef.current?.onPlaybackEnd?.(finishedId);
                }
              }
            }
          } catch (parseErr) {
            console.warn('TTS WebSocket chunk parse error:', parseErr);
          }
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          // STOP 1: Service offline or port 8005 unreachable - do not freeze UI
          const err = new Error('Verbindung zum Sprachausgabedienst fehlgeschlagen.');
          setAutoDismissError(err.message);
          optionsRef.current?.onError?.(err);
          stop();
        };

        ws.onclose = () => {
          if (wsRef.current !== ws) return;
          // If closed before done flag and no sources playing, mark stopped
          if (!isDoneRef.current && activeSourcesRef.current.length === 0) {
            stop();
          }
        };
      } catch (wsErr) {
        const err = wsErr instanceof Error ? wsErr : new Error('WebSocket Verbindungsfehler');
        setAutoDismissError(err.message);
        optionsRef.current?.onError?.(err);
        stop();
      }
    },
    [stop, closeWs, scheduleAudioChunk, setAutoDismissError]
  );

  // Teardown on unmount
  useEffect(() => {
    return () => {
      stop();
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch {
          // Ignore close error on unmount
        }
        audioContextRef.current = null;
      }
    };
  }, [stop]);

  return {
    isPlaying,
    activeMessageId,
    error,
    speak,
    stop,
  };
}
