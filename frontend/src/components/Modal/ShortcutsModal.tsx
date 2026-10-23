import React, { useEffect } from 'react';

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const isMac =
    typeof window !== 'undefined' &&
    (('userAgentData' in navigator && (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS') ||
      /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));

  const altKey = isMac ? 'Option' : 'Alt';

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div
        className="bg-app-surface border border-app-border rounded-[2px] shadow-2xl max-w-md w-full p-5 text-app-text font-mono relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app-border pb-3 mb-4">
          <h2 id="shortcuts-modal-title" className="text-xs font-bold uppercase tracking-wider text-app-text">
            Tastaturkürzel / Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-[2px] border border-app-border bg-app-raised px-2 py-0.5 text-xs text-app-text hover:bg-app-active transition-colors cursor-pointer"
          >
            Schließen
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <div className="text-[11px] font-semibold text-app-text/70 uppercase tracking-wider mb-2">
              Chat & Spracheingabe
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Nachricht senden</span>
                <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                  Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Zeilenumbruch</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    Shift
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    Enter
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Diktat / Spracheingabe</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    D
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Auto-Send bei Sprechpause</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    A
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Sprachausgabe (TTS) an/aus</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    V
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-app-text/70 uppercase tracking-wider mb-2">
              Sprachbefehle (Freihand / Diktat)
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Eingabe abschicken</span>
                <span className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold text-[11px]">
                  "... senden" / "abschicken"
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Frage wiederholen</span>
                <span className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold text-[11px]">
                  "Wiederhole die Frage"
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>PDF herunterladen</span>
                <span className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold text-[11px]">
                  "Formular herunterladen"
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Schritt zurück</span>
                <span className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold text-[11px]">
                  "Einen Schritt zurück"
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-app-text/70 uppercase tracking-wider mb-2">
              Ansicht & Workspace
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Ansicht wechseln (Chat / Formular)</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    M
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>PDF ausblenden / anzeigen</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    P
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Stammdaten / Profil-Editor</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    U
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Theme wechseln (Live / Paper / Contrast)</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    T
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Textgröße anpassen (100% / 125% / 150%)</span>
                <div className="flex items-center gap-1">
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    {altKey}
                  </kbd>
                  <span>+</span>
                  <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                    S
                  </kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-app-border/40">
                <span>Shortcuts-Hilfe öffnen</span>
                <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                  ?
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>Schließen</span>
                <kbd className="border border-app-border bg-app-raised px-1.5 py-0.5 rounded-[2px] text-app-text font-semibold">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
