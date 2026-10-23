import React from 'react';
import { getPdfDownloadUrl, getPdfPreviewUrl } from '../../api/client';
import { FormProgress } from '../../types';

export interface PDFToolbarProps {
  threadId: string;
  filename: string | null;
  version: number;
  progress?: FormProgress | null;
  activePage?: number;
  onRefresh: () => void;
  onClose?: () => void;
}

export const PDFToolbar: React.FC<PDFToolbarProps> = ({
  threadId,
  filename,
  version,
  progress,
  activePage,
  onRefresh,
  onClose,
}) => {
  const percentage =
    progress && progress.total > 0
      ? Math.round((progress.filled / progress.total) * 100)
      : 0;

  return (
    <div className="flex items-center justify-between border-b border-app-border bg-app-surface px-4 py-2 gap-2">
      <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
        <span className="text-[10px] font-mono font-bold text-app-accent uppercase tracking-wider shrink-0">[PDF]</span>
        <span className="truncate text-xs font-mono font-medium text-app-text">
          {filename || 'Kein Dokument geladen'}
        </span>
        {filename && progress && progress.total > 0 && (
          <span className="rounded-[2px] border border-app-border bg-app-raised px-2 py-0.5 text-[11px] font-mono text-app-text whitespace-nowrap shrink-0">
            [PROGRESS: {progress.filled}/{progress.total} ({percentage}%)]
          </span>
        )}
        {filename && activePage && activePage > 1 && (
          <span className="rounded-[2px] border border-app-border bg-app-raised px-2 py-0.5 text-[11px] font-mono text-app-text whitespace-nowrap shrink-0">
            [PAGE {activePage}]
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 font-mono shrink-0">
        {filename && (
          <>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-xs font-medium text-app-text hover:bg-app-active hover:text-app-text transition-colors cursor-pointer shadow-none"
            >
              Refresh
            </button>
            <a
              href={getPdfPreviewUrl(threadId, filename, version, activePage)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex md:hidden rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-xs font-medium text-app-text hover:bg-app-active hover:text-app-text transition-colors shadow-none"
            >
              Open Tab
            </a>
            <a
              href={getPdfDownloadUrl(threadId, filename)}
              download={filename}
              className="rounded-[2px] bg-app-success px-2.5 py-1 text-xs font-bold text-app-success-contrast hover:opacity-90 transition-opacity shadow-none"
            >
              Download PDF
            </a>
          </>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="PDF Vorschau schließen"
            className="rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-xs font-medium text-app-text hover:bg-app-active hover:text-app-text transition-colors cursor-pointer shadow-none"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};
