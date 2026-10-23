import React, { useState } from 'react';
import { ToolCallData } from '../../types';

function getToolCallSummary(toolCall: ToolCallData): string | null {
  if (!toolCall.args) return null;

  if (toolCall.name === 'fill_pdf_form') {
    const fieldValues = toolCall.args.field_values as Record<string, unknown> | undefined;
    if (fieldValues && typeof fieldValues === 'object') {
      const entries = Object.entries(fieldValues);
      if (entries.length === 1) {
        const [k, v] = entries[0];
        const valStr = typeof v === 'string' ? `"${v}"` : String(v);
        return `${k}: ${valStr}`;
      } else if (entries.length > 1) {
        return `${entries.length} Felder befüllt`;
      }
    }
  }

  if (toolCall.name === 'read_pdf_form' || toolCall.name === 'read_pdf_text_for_form') {
    const filepath = toolCall.args.filepath;
    if (typeof filepath === 'string') {
      return filepath;
    }
  }

  return null;
}

function formatPayload(data: unknown): string {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export const ToolCallBadge: React.FC<{ toolCall: ToolCallData }> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = toolCall.status === 'running';
  const isError = toolCall.status === 'error';
  const summary = getToolCallSummary(toolCall);
  const hasArgs = Boolean(toolCall.args && Object.keys(toolCall.args).length > 0);
  const hasResult = Boolean(toolCall.result && toolCall.result.trim().length > 0);
  const hasDetails = hasArgs || hasResult || isRunning;

  return (
    <div className="rounded-[2px] border border-app-border bg-app-bg text-xs font-mono overflow-hidden mb-1.5 max-w-full">
      <button
        type="button"
        onClick={() => hasDetails && setIsOpen(!isOpen)}
        disabled={!hasDetails}
        className={`flex w-full items-center justify-between px-2.5 py-1 text-app-text transition-colors text-left ${
          hasDetails ? 'hover:bg-app-raised cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0 pr-2">
          {hasDetails && (
            <span className="text-[10px] text-app-muted shrink-0">{isOpen ? '▼' : '▶'}</span>
          )}
          <span
            className={`inline-block w-1.5 h-1.5 rounded-[1px] shrink-0 ${
              isRunning ? 'bg-app-accent animate-pulse' : isError ? 'bg-app-danger' : 'bg-app-success'
            }`}
          />
          <span className="text-[11px] font-semibold text-app-text shrink-0">Tool: {toolCall.name}</span>
          {summary && (
            <span className="text-[11px] text-app-muted truncate" title={summary}>
              ({summary})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-app-muted uppercase font-bold">
            [{isRunning ? 'RUNNING' : isError ? 'ERR' : 'DONE'}]
          </span>
          {hasDetails && (
            <span className="text-[9px] text-app-dim uppercase">
              {isOpen ? 'COLLAPSE' : 'DETAILS'}
            </span>
          )}
        </div>
      </button>

      {isOpen && hasDetails && (
        <div className="border-t border-app-border p-2.5 bg-app-surface text-[11px] space-y-2 max-h-60 overflow-y-auto">
          {hasArgs && (
            <div>
              <span className="text-[10px] uppercase font-bold text-app-muted block mb-1">[INPUT]</span>
              <pre className="p-1.5 rounded-[2px] bg-app-bg border border-app-border text-app-text overflow-x-auto whitespace-pre-wrap text-[10px]">
                {formatPayload(toolCall.args)}
              </pre>
            </div>
          )}
          {hasResult && (
            <div>
              <span className="text-[10px] uppercase font-bold text-app-muted block mb-1">[OUTPUT]</span>
              <pre className="p-1.5 rounded-[2px] bg-app-bg border border-app-border text-app-text overflow-x-auto whitespace-pre-wrap text-[10px]">
                {formatPayload(toolCall.result)}
              </pre>
            </div>
          )}
          {isRunning && (
            <div className="text-[10px] text-app-accent animate-pulse font-mono">
              Warte auf Ausführung...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

