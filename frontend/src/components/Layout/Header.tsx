import React from 'react';
import { ModelInfo, ThemeMode, TextScale, TTSVoice, ALLOWED_TTS_VOICES, TTS_VOICE_CONFIG, DEFAULT_TTS_VOICE } from '../../types';

export interface HeaderProps {
  isHealthy: boolean;
  isSttHealthy?: boolean;
  isTtsHealthy?: boolean;
  threadId: string;
  hasActiveSession?: boolean;
  onResetSession: () => void;
  models?: ModelInfo[];
  selectedModel?: string;
  onSelectModel?: (modelName: string) => void;
  thinkEnabled?: boolean;
  onToggleThinking?: (enabled: boolean) => void;
  ttsEnabled?: boolean;
  onToggleTts?: (enabled: boolean) => void;
  selectedVoice?: TTSVoice;
  onSelectVoice?: (voice: TTSVoice) => void;
  onPreviewVoice?: () => void;
  isStreaming?: boolean;
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  textScale?: TextScale;
  onTextScaleChange?: (scale: TextScale) => void;
  isPdfVisible?: boolean;
  onTogglePdf?: () => void;
  onOpenShortcuts?: () => void;
  hasUserProfile?: boolean;
  onOpenUserProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isHealthy,
  isSttHealthy = false,
  isTtsHealthy = false,
  threadId,
  hasActiveSession = false,
  onResetSession,
  models = [],
  selectedModel = '',
  onSelectModel,
  thinkEnabled = false,
  onToggleThinking,
  ttsEnabled = true,
  onToggleTts,
  selectedVoice = DEFAULT_TTS_VOICE,
  onSelectVoice,
  onPreviewVoice,
  isStreaming = false,
  theme = 'live',
  onThemeChange,
  textScale = '100',
  onTextScaleChange,
  isPdfVisible = true,
  onTogglePdf,
  onOpenShortcuts,
  hasUserProfile = false,
  onOpenUserProfile,
}) => {
  const isMac =
    typeof window !== 'undefined' &&
    (('userAgentData' in navigator && (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS') ||
      /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  const altLabel = isMac ? 'Option' : 'Alt';
  const handleReset = () => {
    if (hasActiveSession) {
      const confirmed = window.confirm(
        'Möchtest du wirklich eine neue Sitzung starten? Alle bisherigen Daten werden zurückgesetzt.'
      );
      if (!confirmed) return;
    }
    onResetSession();
  };

  return (
    <header className="flex min-h-12 h-auto w-full flex-wrap items-center justify-between border-b border-app-border bg-app-surface px-4 py-2 gap-x-4 gap-y-2 shrink-0">
      {/* Left Zone: Workspace & Tooling Controls */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <h1 className="text-xs font-bold uppercase tracking-wider text-app-text font-mono leading-none whitespace-nowrap">PDF Form Agent</h1>
          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5" title={isHealthy ? 'Backend API ist online' : 'Backend API ist offline'}>
              <span
                data-testid="status-indicator-api"
                className={`inline-block h-2 w-2 rounded-[2px] ${isHealthy ? 'bg-app-success' : 'bg-app-danger'}`}
              />
              <span className="text-app-text font-medium">API: {isHealthy ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-1.5" title={isSttHealthy ? 'STT Sprachdienst ist online' : 'STT Sprachdienst ist offline'}>
              <span
                data-testid="status-indicator-stt"
                className={`inline-block h-2 w-2 rounded-[2px] ${isSttHealthy ? 'bg-app-success' : 'bg-app-danger'}`}
              />
              <span className="text-app-text font-medium">STT: {isSttHealthy ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-1.5" title={isTtsHealthy ? 'TTS Sprachdienst ist online' : 'TTS Sprachdienst ist offline'}>
              <span
                data-testid="status-indicator-tts"
                className={`inline-block h-2 w-2 rounded-[2px] ${isTtsHealthy ? 'bg-app-success' : 'bg-app-danger'}`}
              />
              <span className="text-app-text font-medium">TTS: {isTtsHealthy ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-app-border hidden sm:block" />

        <div className="flex items-center gap-2 flex-wrap">
          {models && models.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="model-select" className="text-[11px] font-mono text-app-text font-medium hidden lg:inline-block">
                Model:
              </label>
              <select
                id="model-select"
                value={selectedModel}
                disabled={isStreaming}
                onChange={(e) => onSelectModel?.(e.target.value)}
                className="rounded-[2px] border border-app-border bg-app-raised px-2 py-1 text-xs font-mono text-app-text focus:border-app-accent focus:outline-hidden disabled:opacity-50 cursor-pointer shadow-none max-w-[160px] sm:max-w-[200px] truncate"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name} className="bg-app-raised text-app-text">
                    {m.display_name}{m.parameter_size ? ` (${m.parameter_size})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            id="thinking-toggle"
            aria-pressed={thinkEnabled}
            disabled={isStreaming}
            onClick={() => onToggleThinking?.(!thinkEnabled)}
            title={thinkEnabled ? 'Thinking Mode aktiviert' : 'Thinking Mode deaktiviert'}
            className={`rounded-[2px] border px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer shadow-none disabled:opacity-50 ${
              thinkEnabled
                ? 'border-app-accent bg-app-accent text-app-accent-contrast font-semibold'
                : 'border-app-border bg-app-raised text-app-text font-medium hover:bg-app-active'
            }`}
          >
            Thinking: {thinkEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            id="tts-toggle"
            data-testid="tts-toggle"
            aria-pressed={ttsEnabled}
            onClick={() => onToggleTts?.(!ttsEnabled)}
            title={ttsEnabled ? `Sprachausgabe (TTS) aktiviert (${altLabel}+V)` : `Sprachausgabe (TTS) deaktiviert (${altLabel}+V)`}
            className={`rounded-[2px] border px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer shadow-none ${
              ttsEnabled
                ? 'border-app-accent bg-app-accent text-app-accent-contrast font-semibold'
                : 'border-app-border bg-app-raised text-app-text font-medium hover:bg-app-active'
            }`}
          >
            TTS: {ttsEnabled ? 'ON' : 'OFF'}
          </button>

          <div className="flex items-center gap-1.5">
            <label htmlFor="voice-select" className="text-[11px] font-mono text-app-text font-medium hidden lg:inline-block">
              Voice:
            </label>
            <select
              id="voice-select"
              data-testid="voice-select"
              aria-label="TTS Stimme"
              value={selectedVoice}
              disabled={!ttsEnabled || isStreaming}
              onChange={(e) => onSelectVoice?.(e.target.value as TTSVoice)}
              className="rounded-[2px] border border-app-border bg-app-raised px-2 py-1 text-xs font-mono text-app-text focus:border-app-accent focus:outline-hidden disabled:opacity-50 cursor-pointer shadow-none truncate"
            >
              {ALLOWED_TTS_VOICES.map((v) => (
                <option key={v} value={v} className="bg-app-raised text-app-text">
                  {TTS_VOICE_CONFIG[v]?.label || v}
                </option>
              ))}
            </select>
            <button
              type="button"
              id="voice-preview-btn"
              data-testid="voice-preview-btn"
              disabled={!ttsEnabled || isStreaming}
              onClick={() => onPreviewVoice?.()}
              title={!ttsEnabled ? 'Sprachausgabe deaktiviert' : 'Stimme vorhören'}
              className="rounded-[2px] border border-app-border bg-app-raised px-2 py-1 text-xs font-mono font-medium text-app-text hover:bg-app-active transition-colors cursor-pointer shadow-none disabled:opacity-50 whitespace-nowrap"
            >
              Probe
            </button>
          </div>

          <span className="hidden xl:inline-block rounded-[2px] bg-app-raised border border-app-border px-2.5 py-1 text-[11px] font-mono text-app-text font-medium">
            Session: {threadId.slice(0, 14)}
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-xs font-semibold text-app-text hover:bg-app-active transition-colors cursor-pointer shadow-none whitespace-nowrap"
          >
            New Session
          </button>
        </div>
      </div>

      {/* Right Zone: Viewport & Theme Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
        {/* Stammdaten / User Profile Trigger */}
        <button
          type="button"
          id="user-profile-toggle"
          onClick={onOpenUserProfile}
          title={`Stammdaten & Profil-Editor (${altLabel}+U)`}
          className={`rounded-[2px] border px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer shadow-none ${
            hasUserProfile
              ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-400 font-semibold hover:bg-emerald-900/40'
              : 'border-app-border bg-app-raised text-app-text font-medium hover:bg-app-active'
          }`}
        >
          {hasUserProfile ? '[STAMMDATEN: AKTIV]' : '[STAMMDATEN: LEER]'}
        </button>

        {/* PDF Panel Visibility Toggle */}
        <button
          type="button"
          id="pdf-toggle"
          aria-pressed={isPdfVisible}
          onClick={onTogglePdf}
          title={isPdfVisible ? `PDF Vorschau ausblenden (${altLabel}+P)` : `PDF Vorschau einblenden (${altLabel}+P)`}
          className={`rounded-[2px] border px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer shadow-none ${
            isPdfVisible
              ? 'border-app-border bg-app-raised text-app-text font-medium hover:bg-app-active'
              : 'border-app-accent bg-app-accent text-app-accent-contrast font-semibold'
          }`}
        >
          {isPdfVisible ? 'PDF ausblenden' : 'PDF anzeigen'}
        </button>

        {/* Theme Switcher Segment Control */}
        <div
          title={`Theme wechseln (${altLabel}+T)`}
          className="flex items-center rounded-[2px] border border-app-border bg-app-raised p-0.5 text-xs font-mono"
        >
          <span className="px-1.5 text-xs text-app-text font-semibold select-none hidden lg:inline-block">THEME:</span>
          <button
            type="button"
            aria-label="Ableton Live Theme"
            aria-pressed={theme === 'live'}
            onClick={() => onThemeChange?.('live')}
            className={`rounded-[2px] px-2 py-0.5 text-xs transition-colors cursor-pointer ${
              theme === 'live'
                ? 'bg-[#ff763b] text-black font-semibold'
                : 'text-app-text font-medium hover:bg-app-active'
            }`}
          >
            LIVE
          </button>
          <button
            type="button"
            aria-label="Swiss Paper Theme"
            aria-pressed={theme === 'paper'}
            onClick={() => onThemeChange?.('paper')}
            className={`rounded-[2px] px-2 py-0.5 text-xs transition-colors cursor-pointer ${
              theme === 'paper'
                ? 'bg-[#d63426] text-white font-semibold'
                : 'text-app-text font-medium hover:bg-app-active'
            }`}
          >
            PAPER
          </button>
          <button
            type="button"
            aria-label="High-Contrast Theme"
            aria-pressed={theme === 'contrast'}
            onClick={() => onThemeChange?.('contrast')}
            className={`rounded-[2px] px-2 py-0.5 text-xs transition-colors cursor-pointer ${
              theme === 'contrast'
                ? 'bg-[#ffff00] text-black font-semibold'
                : 'text-app-text font-medium hover:bg-app-active'
            }`}
          >
            CONTRAST
          </button>
        </div>

        {/* Text Scaling Segment Control */}
        <div
          title={`Textgröße anpassen (${altLabel}+S)`}
          className="flex items-center rounded-[2px] border border-app-border bg-app-raised p-0.5 text-xs font-mono"
        >
          <span className="px-1.5 text-xs text-app-text font-semibold select-none hidden lg:inline-block">TEXT:</span>
          {(['100', '125', '150'] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              aria-label={`Textgröße ${scale}%`}
              aria-pressed={textScale === scale}
              onClick={() => onTextScaleChange?.(scale)}
              className={`rounded-[2px] px-1.5 py-0.5 text-xs transition-colors cursor-pointer ${
                textScale === scale
                  ? 'bg-app-accent text-app-accent-contrast font-semibold'
                  : 'text-app-text font-medium hover:bg-app-active'
              }`}
            >
              {scale}%
            </button>
          ))}
        </div>

        {/* Shortcuts Discovery Trigger */}
        <button
          type="button"
          id="shortcuts-toggle"
          onClick={onOpenShortcuts}
          title="Tastaturkürzel anzeigen (?)"
          className="rounded-[2px] border border-app-border bg-app-raised px-2 py-1 text-xs font-mono text-app-text font-medium hover:bg-app-active cursor-pointer transition-colors"
        >
          Shortcuts
        </button>
      </div>
    </header>
  );
};
