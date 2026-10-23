import React, { useEffect, useRef, useState } from 'react';
import { deleteUserProfile, fetchUserProfile, saveUserProfile } from '../../api/client';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

const DEFAULT_PROFILE_TEMPLATE = `# Stammdaten / Nutzerprofil Notizzettel
Name: 
Vorname: 
Geburtsdatum: 
Geburtsort: 
Staatsangehörigkeit: deutsch
Straße & Hausnr.: 
PLZ & Ort: 
Telefon: 
E-Mail: 
IBAN: 
BIC: 
Kreditinstitut: 
Steuer-ID: 
Rentenversicherungsnummer: 
Familienstand: ledig
Kinder: keine
`;

const MAX_BYTES = 65536; // 64 KB

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const [content, setContent] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStatusMsg(null);
    setIsLoading(true);

    fetchUserProfile()
      .then((res) => {
        if (res.exists && res.content) {
          setContent(res.content);
          setLastSaved(res.updated_at || null);
        } else {
          setContent(DEFAULT_PROFILE_TEMPLATE);
          setLastSaved(null);
        }
      })
      .catch((err) => {
        setStatusMsg({ type: 'error', text: `Fehler beim Laden des Profils: ${err.message}` });
        setContent(DEFAULT_PROFILE_TEMPLATE);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const contentByteSize = new TextEncoder().encode(content).length;
  const isTooLarge = contentByteSize > MAX_BYTES;

  const handleSave = async () => {
    if (isTooLarge) {
      setStatusMsg({
        type: 'error',
        text: `Profil ist zu groß (${contentByteSize} Bytes). Maximal erlaubt sind 64 KB (${MAX_BYTES} Bytes).`,
      });
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await saveUserProfile(content);
      setLastSaved(res.updated_at);
      setStatusMsg({ type: 'success', text: 'Stammdaten erfolgreich gespeichert.' });
      onProfileUpdated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: 'error', text: `Fehler beim Speichern: ${message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Möchtest du das gespeicherte Profil wirklich vollständig löschen?')) {
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);
    try {
      await deleteUserProfile();
      setContent(DEFAULT_PROFILE_TEMPLATE);
      setLastSaved(null);
      setStatusMsg({ type: 'success', text: 'Profil gelöscht.' });
      onProfileUpdated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: 'error', text: `Fehler beim Löschen: ${message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setStatusMsg({
        type: 'error',
        text: `Die ausgewählte Datei ist zu groß (${file.size} Bytes, max. 64 KB erlaubt).`,
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setContent(text);
        setStatusMsg({ type: 'success', text: `Datei '${file.name}' erfolgreich importiert.` });
      }
    };
    reader.onerror = () => {
      setStatusMsg({ type: 'error', text: 'Fehler beim Lesen der lokalen Textdatei.' });
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleExportClick = () => {
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'user_profile.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMsg({ type: 'success', text: "Stammdaten als 'user_profile.txt' exportiert." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: 'error', text: `Fehler beim Export: ${message}` });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-modal-title"
    >
      <div
        className="bg-app-surface border border-app-border rounded-[2px] shadow-2xl max-w-2xl w-full p-5 text-app-text font-mono relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-app-border pb-3 mb-4 shrink-0">
          <div>
            <h2 id="user-profile-modal-title" className="text-xs font-bold uppercase tracking-wider text-app-text">
              Stammdaten / Profil-Notizen (Autofill)
            </h2>
            <div className="text-[11px] text-app-text/60 mt-0.5">
              Formloser Notizzettel für automatische Vorbelegung bei Formular-Upload
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-[2px] border border-app-border bg-app-raised px-2 py-0.5 text-xs text-app-text hover:bg-app-active transition-colors cursor-pointer"
          >
            Schließen
          </button>
        </div>

        {/* Toolbar: Import / Export */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={handleImportClick}
              className="rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-app-text hover:bg-app-active transition-colors cursor-pointer"
            >
              [TXT IMPORTIEREN]
            </button>
            <button
              type="button"
              onClick={handleExportClick}
              className="rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-app-text hover:bg-app-active transition-colors cursor-pointer"
            >
              [TXT EXPORTIEREN]
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-app-text/70">
            <span className={isTooLarge ? 'text-red-400 font-bold' : ''}>
              {contentByteSize} / {MAX_BYTES} Bytes
            </span>
            {lastSaved && (
              <span className="text-app-text/50">
                Stand: {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div
            className={`mb-3 p-2 text-xs rounded-[2px] border shrink-0 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-400'
                : 'bg-red-950/20 border-red-500/40 text-red-400'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Textarea Editor */}
        <div className="flex-1 min-h-[220px] mb-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isLoading || isSaving}
            aria-label="Stammdaten Notizzettel"
            placeholder="Name, Geburtsdatum, Anschrift, IBAN etc. eintragen..."
            className="w-full h-full min-h-[220px] p-3 rounded-[2px] border border-app-border bg-app-bg text-app-text text-xs font-mono resize-none focus:outline-hidden focus:border-app-accent leading-relaxed"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-app-border pt-3 shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isLoading || isSaving}
            className="rounded-[2px] border border-red-500/40 bg-red-950/10 hover:bg-red-950/30 text-red-400 px-3 py-1 text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            [PROFIL LÖSCHEN]
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[2px] border border-app-border bg-app-raised hover:bg-app-active text-app-text px-3 py-1 text-xs transition-colors cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || isSaving || isTooLarge}
              className="rounded-[2px] border border-emerald-500/60 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 font-bold px-4 py-1 text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSaving ? '[SPEICHERN...]' : '[SPEICHERN]'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
