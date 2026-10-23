import React, { useEffect, useRef } from 'react';
import { getPdfDownloadUrl } from '../../api/client';
import { ChatMessageData, FormField, FormProgress } from '../../types';
import { extractActionChips } from '../../utils/actionChips';
import { ChatMessage } from './ChatMessage';

interface ChatContainerProps {
  messages: ChatMessageData[];
  isStreaming: boolean;
  activeMessageId?: string | null;
  isTTSPlaying?: boolean;
  onSpeak?: (messageId: string, text: string) => void;
  onStopTTS?: () => void;
  isTtsHealthy?: boolean;
  ttsEnabled?: boolean;
  formProgress?: FormProgress | null;
  activeFilename?: string | null;
  threadId?: string;
  formFields?: FormField[];
  onSendMessage?: (message: string) => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isStreaming,
  activeMessageId,
  isTTSPlaying,
  onSpeak,
  onStopTTS,
  isTtsHealthy = true,
  ttsEnabled = true,
  formProgress,
  activeFilename,
  threadId,
  formFields,
  onSendMessage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = containerRef.current;
    // If distance from bottom is greater than 80px, user scrolled up
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 80;
  };

  useEffect(() => {
    // If user scrolled up to read history, do not forcefully hijack the scroll position
    if (userScrolledUpRef.current && isStreaming) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-app-muted">
        <div className="rounded-[2px] bg-app-bg border border-dashed border-app-border px-4 py-3 mb-3">
          <span className="font-mono text-xs font-semibold tracking-wider text-app-accent">PDF FORM CONSOLE</span>
        </div>
        <h3 className="font-mono font-bold text-app-text text-xs uppercase tracking-wider">Bereit zum Ausfüllen</h3>
        <p className="text-xs text-app-text/90 mt-1.5 max-w-sm leading-relaxed">
          Lade oben ein PDF-Formular hoch. Der Agent analysiert die AcroForm-Felder und führt dich Schritt für Schritt durch das Formular.
        </p>
      </div>
    );
  }

  const isFormCompleted = Boolean(
    formProgress &&
      formProgress.total > 0 &&
      formProgress.filled >= formProgress.total &&
      activeFilename &&
      threadId
  );

  const completionDownloadUrl =
    isFormCompleted && !isStreaming
      ? getPdfDownloadUrl(threadId!, activeFilename!)
      : null;

  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-3 space-y-2 bg-app-surface"
    >
      {messages.map((msg, idx) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          onSpeak={onSpeak}
          onStopSpeaking={onStopTTS}
          isSpeakingThis={activeMessageId === msg.id && Boolean(isTTSPlaying)}
          isTtsHealthy={isTtsHealthy}
          ttsEnabled={ttsEnabled}
          completionDownloadUrl={idx === lastAssistantIdx ? completionDownloadUrl : null}
          filename={idx === lastAssistantIdx ? activeFilename : null}
          actionChips={
            idx === lastAssistantIdx && !isStreaming
              ? extractActionChips(msg.content, formFields)
              : undefined
          }
          onSelectChip={onSendMessage}
          isStreaming={isStreaming}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
