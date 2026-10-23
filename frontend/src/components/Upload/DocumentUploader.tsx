import React, { useState, useRef, useEffect } from 'react';
import { uploadDocument } from '../../api/client';
import { DocumentUploadResponse } from '../../types';

interface DocumentUploaderProps {
  threadId: string;
  onUploadSuccess: (res: DocumentUploadResponse) => void;
  autofillEnabled?: boolean;
  onToggleAutofill?: (enabled: boolean) => void;
  hasUserProfile?: boolean;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  threadId,
  onUploadSuccess,
  autofillEnabled = false,
  onToggleAutofill,
  hasUserProfile = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUploadError(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [threadId]);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Nur PDF-Dateien sind zulässig.');
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const res = await uploadDocument(file, threadId);
      onUploadSuccess(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="border-b border-app-border bg-app-surface p-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            e.target.value = '';
            handleFile(file);
          }
        }}
      />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center justify-between gap-3 rounded-[2px] border border-dashed border-app-border bg-app-bg px-3.5 py-2 cursor-pointer hover:border-app-accent transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-mono text-app-text">
          <span className="text-app-accent font-bold text-[10px] tracking-wider">[LOAD]</span>
          <span className="font-medium">PDF-Formular hier ablegen oder auswählen</span>
        </div>

        {isUploading ? (
          <div className="flex items-center gap-1.5 text-xs text-app-accent font-mono">
            <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-app-accent animate-pulse" />
            <span>Analysiere Felder...</span>
          </div>
        ) : (
          <span className="rounded-[2px] bg-app-raised px-2.5 py-1 text-[11px] font-mono font-medium text-app-text border border-app-border shadow-none">
            Datei wählen
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-app-text">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="autofill-toggle"
            data-testid="autofill-toggle"
            aria-pressed={autofillEnabled}
            disabled={isUploading}
            onClick={() => onToggleAutofill?.(!autofillEnabled)}
            title={autofillEnabled ? 'Stammdaten-Autofill aktiviert' : 'Stammdaten-Autofill deaktiviert'}
            className={`rounded-[2px] border px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer shadow-none disabled:opacity-50 ${
              autofillEnabled
                ? 'border-app-accent bg-app-accent text-app-accent-contrast font-semibold'
                : 'border-app-border bg-app-raised text-app-text font-medium hover:bg-app-active'
            }`}
          >
            Autofill: {autofillEnabled ? 'ON' : 'OFF'}
          </button>
          <span className="text-app-text font-medium">
            {autofillEnabled ? 'Stammdaten aktiv' : 'Leeres Formular'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-app-muted">
          <span
            data-testid="profile-indicator-dot"
            className={`inline-block w-1.5 h-1.5 rounded-[1px] ${
              hasUserProfile ? 'bg-app-success' : 'bg-app-border'
            }`}
          />
          <span>{hasUserProfile ? 'Profil vorhanden' : 'Kein Profil'}</span>
        </div>
      </div>

      {uploadError && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-app-danger bg-app-danger/15 border border-app-danger/40 rounded-[2px] px-2.5 py-1 font-mono">
          <span className="font-bold text-[10px]">[ERR]</span>
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
};
