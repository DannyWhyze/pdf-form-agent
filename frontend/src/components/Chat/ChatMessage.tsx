import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessageData } from '../../types';
import { ActionChips } from './ActionChips';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolCallBadge } from './ToolCallBadge';

export interface ChatMessageProps {
  message: ChatMessageData;
  onSpeak?: (messageId: string, text: string) => void;
  onStopSpeaking?: () => void;
  isSpeakingThis?: boolean;
  isTtsHealthy?: boolean;
  ttsEnabled?: boolean;
  completionDownloadUrl?: string | null;
  filename?: string | null;
  actionChips?: string[];
  onSelectChip?: (option: string) => void;
  isStreaming?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onSpeak,
  onStopSpeaking,
  isSpeakingThis = false,
  isTtsHealthy = true,
  ttsEnabled = true,
  completionDownloadUrl,
  filename,
  actionChips,
  onSelectChip,
  isStreaming = false,
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="px-3.5 py-1.5 rounded-[2px] bg-app-raised border border-app-border text-xs font-mono text-app-muted text-center max-w-md">
          {message.content}
        </div>
      </div>
    );
  }

  const hasValidDownloadLink = Boolean(
    message.content && message.content.includes('/api/v1/download')
  );
  const showDownloadSafetyNet = Boolean(
    completionDownloadUrl && !hasValidDownloadLink
  );

  return (
    <div
      className={`rounded-[2px] border transition-colors p-3.5 my-2 ${
        isUser
          ? 'border-l-[3px] border-l-app-accent border-t-app-border border-r-app-border border-b-app-border bg-app-raised text-app-text'
          : 'border-l-[3px] border-l-app-secondary border-t-app-border border-r-app-border border-b-app-border bg-app-surface text-app-text'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`text-[11px] font-mono font-semibold uppercase tracking-wider ${
            isUser ? 'text-app-accent' : 'text-app-secondary'
          }`}
        >
          {isUser ? 'Benutzer' : 'Form Agent'}
        </span>
        {!isUser && onSpeak && onStopSpeaking && (
          <button
            type="button"
            onClick={() => {
              if (isSpeakingThis) {
                onStopSpeaking();
              } else {
                onSpeak(message.id, message.content);
              }
            }}
            disabled={!isSpeakingThis && (isTtsHealthy === false || ttsEnabled === false)}
            title={
              isSpeakingThis
                ? 'Wiedergabe stoppen'
                : !ttsEnabled
                ? 'Sprachausgabe im Header deaktiviert'
                : isTtsHealthy === false
                ? 'Sprachausgabe offline (Port 8005)'
                : 'Nachricht vorlesen'
            }
            aria-label={isSpeakingThis ? 'Wiedergabe stoppen' : 'Nachricht vorlesen'}
            className={`rounded-[2px] px-2 py-0.5 text-[11px] font-mono font-medium transition-colors cursor-pointer border ${
              isSpeakingThis
                ? 'text-app-danger hover:bg-app-danger/10 border-app-danger/40'
                : 'text-app-muted hover:text-app-text hover:bg-app-raised border-app-border'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isSpeakingThis ? 'Stop' : 'Vorlesen'}
          </button>
        )}
      </div>

      {!isUser && message.reasoningContent && (
        <ReasoningBlock reasoning={message.reasoningContent} />
      )}

      {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {message.toolCalls.map((tc, idx) => (
            <ToolCallBadge key={idx} toolCall={tc} />
          ))}
        </div>
      )}

      <div className="prose prose-sm max-w-none leading-relaxed break-words text-app-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>

      {!isUser && actionChips && actionChips.length > 0 && onSelectChip && (
        <ActionChips options={actionChips} onSelect={onSelectChip} disabled={isStreaming} />
      )}

      {!isUser && showDownloadSafetyNet && (
        <div
          data-testid="download-fallback-banner"
          className="mt-3 pt-3 border-t border-app-border flex items-center justify-between gap-3 bg-app-raised p-2.5 rounded-[2px]"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-app-success uppercase tracking-wider">
              [FERTIG]
            </span>
            <span className="text-xs font-mono text-app-text">
              Formular vollständig ausgefüllt
            </span>
          </div>
          <a
            href={completionDownloadUrl!}
            download={filename || 'formular.pdf'}
            className="inline-flex items-center gap-1.5 rounded-[2px] bg-app-success px-3 py-1.5 text-xs font-mono font-bold text-app-success-contrast hover:opacity-90 transition-opacity cursor-pointer shadow-none"
            data-testid="download-fallback-link"
          >
            [PDF herunterladen]
          </a>
        </div>
      )}
    </div>
  );
};
