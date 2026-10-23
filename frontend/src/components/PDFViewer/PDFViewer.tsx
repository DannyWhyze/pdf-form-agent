import React from 'react';
import { PDFToolbar } from './PDFToolbar';
import { getPdfPreviewUrl } from '../../api/client';
import { FormProgress } from '../../types';

export interface PDFViewerProps {
  threadId: string;
  filename: string | null;
  version: number;
  progress?: FormProgress | null;
  activePage?: number;
  onRefresh: () => void;
  onClose?: () => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  threadId,
  filename,
  version,
  progress,
  activePage,
  onRefresh,
  onClose,
}) => {
  if (!filename) {
    return (
      <div className="flex h-full w-full flex-col bg-app-bg overflow-hidden">
        <PDFToolbar
          threadId={threadId}
          filename={null}
          version={version}
          progress={progress}
          activePage={activePage}
          onRefresh={onRefresh}
          onClose={onClose}
        />
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-app-muted">
          <div className="rounded-[2px] border border-dashed border-app-border px-6 py-4 text-center">
            <p className="text-xs font-mono uppercase tracking-wider text-app-text font-semibold">Kein PDF geladen</p>
          </div>
        </div>
      </div>
    );
  }

  const previewUrl = getPdfPreviewUrl(threadId, filename, version, activePage);

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-app-bg overflow-hidden">
      <PDFToolbar
        threadId={threadId}
        filename={filename}
        version={version}
        progress={progress}
        activePage={activePage}
        onRefresh={onRefresh}
        onClose={onClose}
      />
      <div className="flex-1 w-full bg-app-bg overflow-hidden relative">
        <iframe
          src={previewUrl}
          className="w-full h-full border-none block"
          title={filename}
        />
      </div>
    </div>
  );
};
