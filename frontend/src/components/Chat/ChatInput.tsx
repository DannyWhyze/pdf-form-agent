import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { useSTTStream } from '../../hooks/useSTTStream';
import { parseVoiceCommand } from '../../utils/voiceCommands';

interface ChatInputProps {
  onSendMessage: (msg: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  isTtsPlaying?: boolean;
  onRepeatQuestion?: () => void;
  onDownloadForm?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStop,
  isStreaming,
  disabled = false,
  isTtsPlaying = false,
  onRepeatQuestion,
  onDownloadForm,
}) => {
  const [input, setInput] = useState('');
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [activeCommandBadge, setActiveCommandBadge] = useState<string | null>(null);
  const [isAutoSend, setIsAutoSend] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pdf_form_agent_auto_send') === 'true';
    }
    return false;
  });
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseInputRef = useRef('');
  const ignoreTranscriptsRef = useRef(false);
  const prevStreamingRef = useRef(isStreaming);
  const prevTtsPlayingRef = useRef(isTtsPlaying);
  const prevInputRef = useRef(input);

  const inputRef = useRef(input);
  inputRef.current = input;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const isAudioLocked = isStreaming || isTtsPlaying;

  const cancelAutoSendTimers = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownSeconds(null);
  }, []);

  const handleToggleAutoSend = useCallback(() => {
    setIsAutoSend((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('pdf_form_agent_auto_send', String(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (badgeTimerRef.current) {
        clearTimeout(badgeTimerRef.current);
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, []);

  const {
    isRecording,
    error: sttError,
    audioLevel,
    startRecording,
    stopRecording,
  } = useSTTStream({
    onTranscript: (liveText, isFinal) => {
      if (ignoreTranscriptsRef.current) return;
      const trimmed = liveText.trim();
      if (!trimmed) return;
      const base = baseInputRef.current;
      const separator = base && !base.endsWith(' ') ? ' ' : '';
      const updated = base ? `${base}${separator}${trimmed}` : trimmed;

      const command = parseVoiceCommand(updated);
      if (command.type !== 'NONE') {
        ignoreTranscriptsRef.current = true;
        stopRecording();
        setInput('');
        baseInputRef.current = '';
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }

        if (command.badgeLabel) {
          if (badgeTimerRef.current) {
            clearTimeout(badgeTimerRef.current);
          }
          setActiveCommandBadge(command.badgeLabel);
          badgeTimerRef.current = setTimeout(() => {
            setActiveCommandBadge(null);
          }, 2500);
        }

        switch (command.type) {
          case 'SEND': {
            const textToSend = command.cleanedText ?? '';
            if (textToSend) {
              onSendMessage(textToSend);
            }
            break;
          }
          case 'REPEAT_QUESTION': {
            onRepeatQuestion?.();
            break;
          }
          case 'DOWNLOAD_FORM': {
            onDownloadForm?.();
            break;
          }
          case 'STEP_BACK': {
            onSendMessage('Einen Schritt zurück bitte');
            break;
          }
        }
        return;
      }

      setInput(updated);
      if (isFinal) {
        baseInputRef.current = updated;
      }
    },
  });

  const activeSegments = isRecording
    ? audioLevel > 0.6
      ? 4
      : audioLevel > 0.35
      ? 3
      : audioLevel > 0.15
      ? 2
      : audioLevel > 0.03
      ? 1
      : 0
    : 0;

  const handleToggleRecord = useCallback(async () => {
    if (disabled) return;
    if (isRecording || isHandsFree) {
      setIsHandsFree(false);
      stopRecording();
      cancelAutoSendTimers();
      baseInputRef.current = input;
    } else {
      if (isAudioLocked) return;
      setIsHandsFree(true);
      ignoreTranscriptsRef.current = false;
      baseInputRef.current = input;
      await startRecording();
    }
  }, [disabled, isAudioLocked, isRecording, isHandsFree, input, startRecording, stopRecording, cancelAutoSendTimers]);

  useEffect(() => {
    if (prevInputRef.current !== input) {
      prevInputRef.current = input;
      cancelAutoSendTimers();
    }

    if (!isRecording || !isAutoSend || !input.trim() || isStreaming || disabled || isAudioLocked) {
      cancelAutoSendTimers();
      return;
    }

    if (audioLevel > 0.05) {
      cancelAutoSendTimers();
      return;
    }

    if (audioLevel <= 0.03 && !silenceTimeoutRef.current && countdownSeconds === null) {
      silenceTimeoutRef.current = setTimeout(() => {
        silenceTimeoutRef.current = null;
        setCountdownSeconds(1);

        countdownTimerRef.current = setTimeout(() => {
          countdownTimerRef.current = null;
          setCountdownSeconds(null);

          const textToSend = inputRef.current.trim();
          if (textToSend && !isStreamingRef.current && !disabledRef.current) {
            ignoreTranscriptsRef.current = true;
            stopRecording();
            setIsHandsFree(false);
            setInput('');
            baseInputRef.current = '';
            prevInputRef.current = '';
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
            onSendMessage(textToSend);

            if (badgeTimerRef.current) {
              clearTimeout(badgeTimerRef.current);
            }
            setActiveCommandBadge('AUTO-SEND');
            badgeTimerRef.current = setTimeout(() => {
              setActiveCommandBadge(null);
            }, 2500);
          }
        }, 1000);
      }, 1800);
    }
  }, [
    isRecording,
    isAutoSend,
    input,
    audioLevel,
    isStreaming,
    disabled,
    isAudioLocked,
    countdownSeconds,
    cancelAutoSendTimers,
    stopRecording,
    onSendMessage,
  ]);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    const wasTtsPlaying = prevTtsPlayingRef.current;
    prevTtsPlayingRef.current = isTtsPlaying;

    if (isAudioLocked) {
      if (isRecording) {
        ignoreTranscriptsRef.current = true;
        stopRecording();
      }
    } else {
      // Neither streaming nor playing TTS: auto-resume hands-free dictation if just finished
      const justFinishedStreaming = wasStreaming && !isStreaming;
      const justFinishedTts = wasTtsPlaying && !isTtsPlaying;

      if ((justFinishedStreaming || justFinishedTts) && isHandsFree && !disabled && !isRecording) {
        ignoreTranscriptsRef.current = false;
        startRecording();
      }
    }
  }, [isAudioLocked, isStreaming, isTtsPlaying, isRecording, isHandsFree, disabled, stopRecording, startRecording]);

  const isMac =
    typeof navigator !== 'undefined' &&
    Boolean(
      (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' ||
        /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
    );
  const shortcutLabel = isMac ? 'Option+D' : 'Alt+D';

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
        e.preventDefault();
        handleToggleRecord();
      } else if (e.altKey && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) {
        e.preventDefault();
        handleToggleAutoSend();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleToggleRecord, handleToggleAutoSend]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [isStreaming, disabled]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 144)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    cancelAutoSendTimers();
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (input.trim() && !isStreaming && !disabled) {
        ignoreTranscriptsRef.current = true;
        if (isRecording) {
          stopRecording();
        }
        onSendMessage(input.trim());
        setInput('');
        baseInputRef.current = '';
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    cancelAutoSendTimers();
    if (input.trim() && !isStreaming && !disabled) {
      ignoreTranscriptsRef.current = true;
      if (isRecording) {
        stopRecording();
      }
      onSendMessage(input.trim());
      setInput('');
      baseInputRef.current = '';
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    cancelAutoSendTimers();
    const nextVal = e.target.value;
    if (isRecording || isHandsFree) {
      ignoreTranscriptsRef.current = true;
      setIsHandsFree(false);
      if (isRecording) {
        stopRecording();
      }
    }
    setInput(nextVal);
    baseInputRef.current = nextVal;
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-app-border bg-app-surface p-3">
      {countdownSeconds !== null && (
        <div
          data-testid="auto-send-countdown-badge"
          className="inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-app-accent text-app-accent-contrast mb-1.5 animate-pulse"
        >
          [AUTO-SEND IN {countdownSeconds}S... (TASTE/SPRECHEN BRICHT AB)]
        </div>
      )}
      <div className="relative flex items-center rounded-[2px] border border-app-border bg-app-bg focus-within:border-app-accent transition-colors">
        {activeCommandBadge && (
          <div
            data-testid="voice-command-badge"
            className="absolute -top-2.5 left-2 bg-app-accent text-app-accent-contrast font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-[2px] tracking-wider shadow-sm z-10 pointer-events-none"
          >
            [BEFEHL: {activeCommandBadge}]
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Bitte zuerst ein Formular-PDF hochladen...' : 'Antwort eingeben...'}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-gramm="false"
          className="w-full resize-none bg-transparent px-3 py-2.5 text-xs text-app-text placeholder-app-dim focus:outline-none disabled:cursor-not-allowed max-h-36 overflow-y-auto font-sans"
        />
        <div className="flex items-center gap-1.5 pr-2">
          <button
            type="button"
            onClick={handleToggleAutoSend}
            className={`rounded-[2px] px-2 py-1 text-[11px] font-mono font-medium transition-colors border cursor-pointer ${
              isAutoSend
                ? 'bg-app-accent/20 text-app-accent border-app-accent hover:bg-app-accent/30'
                : 'bg-app-raised text-app-dim border-app-border hover:bg-app-active hover:text-app-text'
            }`}
            title={`Automatisches Absenden bei Sprechpause ein-/ausschalten (${isMac ? 'Option+A' : 'Alt+A'})`}
          >
            AUTO-SEND: {isAutoSend ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={handleToggleRecord}
            disabled={disabled || (!isHandsFree && isAudioLocked)}
            aria-label={
              isRecording
                ? 'Spracheingabe beenden'
                : isHandsFree && isAudioLocked
                ? 'Freihand-Modus beenden'
                : 'Spracheingabe starten'
            }
            title={
              isRecording
                ? `Spracheingabe beenden (${shortcutLabel})`
                : isHandsFree && isAudioLocked
                ? `Freihand-Modus beenden (${shortcutLabel})`
                : `Spracheingabe starten (${shortcutLabel})`
            }
            className={`flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-xs font-mono font-medium transition-colors cursor-pointer shadow-none ${
              isRecording
                ? 'bg-app-danger text-white border border-app-danger animate-pulse'
                : isHandsFree && isAudioLocked
                ? 'bg-app-raised text-app-accent border border-app-accent'
                : 'bg-app-raised text-app-text border border-app-border hover:bg-app-active hover:border-app-accent hover:text-app-text disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
          >
            <Mic
              className={`w-3.5 h-3.5 ${
                isRecording
                  ? 'text-white'
                  : isHandsFree && isAudioLocked
                  ? 'text-app-accent animate-pulse'
                  : 'text-app-accent'
              }`}
            />
            <span className="hidden sm:inline font-mono text-[11px]">
              {isRecording ? 'Recording...' : isHandsFree && isAudioLocked ? 'Paused...' : 'Dictate'}
            </span>
            {isRecording && (
              <div data-testid="stt-vu-meter" className="flex items-center gap-[2px] h-3 ml-0.5" aria-hidden="true">
                {[0, 1, 2, 3].map((segIdx) => (
                  <span
                    key={segIdx}
                    data-testid={`vu-segment-${segIdx}`}
                    className={`w-[3px] h-2.5 rounded-[0.5px] transition-colors ${
                      segIdx < activeSegments
                        ? segIdx === 3
                          ? 'bg-app-accent'
                          : 'bg-white'
                        : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>
            )}
          </button>
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-[2px] bg-app-danger px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider text-white hover:opacity-90 transition-opacity cursor-pointer shadow-none"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || disabled}
              title="Nachricht senden (Enter)"
              className="rounded-[2px] bg-app-accent px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-app-accent-contrast hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer shadow-none"
            >
              Send
            </button>
          )}
        </div>
      </div>
      {sttError && (
        <div className="text-xs text-app-danger bg-app-danger/15 border border-app-danger/40 rounded-[2px] px-2.5 py-1 mt-1.5 font-mono">
          {sttError}
        </div>
      )}
    </form>
  );
};
