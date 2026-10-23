import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Layout/Header';
import { MobileTabNav } from './components/Layout/MobileTabNav';
import { DocumentUploader } from './components/Upload/DocumentUploader';
import { ChatContainer } from './components/Chat/ChatContainer';
import { ChatInput } from './components/Chat/ChatInput';
import { PDFViewer } from './components/PDFViewer/PDFViewer';
import { ShortcutsModal } from './components/Modal/ShortcutsModal';
import { UserProfileModal } from './components/Modal/UserProfileModal';
import { ProgressBar } from './components/Chat/ProgressBar';
import { FormInspector } from './components/Form/FormInspector';
import { useSessionState } from './hooks/useSessionState';
import { useChatStream } from './hooks/useChatStream';
import { useResizableSplit } from './hooks/useResizableSplit';
import { useTheme } from './hooks/useTheme';
import { useTextScale } from './hooks/useTextScale';
import { useTTSStream } from './hooks/useTTSStream';
import {
  checkHealth,
  checkSTTHealth,
  checkTTSHealth,
  fetchAvailableModels,
  fetchUserProfile,
  getPdfDownloadUrl,
} from './api/client';
import {
  DocumentUploadResponse,
  FormField,
  FormProgress,
  ModelInfo,
  TTSVoice,
  ALLOWED_TTS_VOICES,
  DEFAULT_TTS_VOICE,
  TTS_VOICE_CONFIG,
} from './types';

export function App() {
  const {
    threadId,
    activeFilename,
    messages,
    pdfVersion,
    selectedModel,
    thinkEnabled,
    formProgress,
    activePage,
    setSelectedModel,
    setThinkEnabled,
    setActiveFilename,
    setMessages,
    bumpPdfVersion,
    setFormProgress,
    setActivePage,
    resetSession,
  } = useSessionState();

  const { theme, setTheme, toggleTheme } = useTheme();
  const { textScale, setTextScale, cycleTextScale } = useTextScale();
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'pdf'>('chat');
  const [isHealthy, setIsHealthy] = useState(true);
  const [isSttHealthy, setIsSttHealthy] = useState(false);
  const [isTtsHealthy, setIsTtsHealthy] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [hasUserProfile, setHasUserProfile] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pdf_form_agent_tts_enabled');
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return true;
  });
  const [selectedVoice, setSelectedVoice] = useState<TTSVoice>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pdf_form_agent_tts_voice') as TTSVoice | null;
      if (stored && (ALLOWED_TTS_VOICES as readonly string[]).includes(stored)) {
        return stored;
      }
    }
    return DEFAULT_TTS_VOICE;
  });
  const [autofillEnabled, setAutofillEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pdf_form_agent_autofill_enabled');
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return false;
  });
  const [workspaceView, setWorkspaceView] = useState<'chat' | 'form'>('chat');
  const [formFields, setFormFields] = useState<FormField[]>([]);

  const handleToggleAutofill = useCallback((enabled: boolean) => {
    setAutofillEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pdf_form_agent_autofill_enabled', String(enabled));
    }
  }, []);

  const refreshUserProfileStatus = useCallback(() => {
    fetchUserProfile()
      .then((res) => {
        setHasUserProfile(Boolean(res.exists && res.content?.trim()));
      })
      .catch(() => {
        setHasUserProfile(false);
      });
  }, []);

  useEffect(() => {
    refreshUserProfileStatus();
  }, [refreshUserProfileStatus]);

  useEffect(() => {
    checkHealth().then(setIsHealthy);
    checkSTTHealth().then(setIsSttHealthy);
    checkTTSHealth().then(setIsTtsHealthy);
    const interval = setInterval(() => {
      checkHealth().then(setIsHealthy);
      checkSTTHealth().then(setIsSttHealthy);
      checkTTSHealth().then(setIsTtsHealthy);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchAvailableModels()
      .then((res) => {
        setAvailableModels(res.models);
        if (!selectedModel && res.models.length > 0) {
          const current = res.models.find((m) => m.is_current) || res.models[0];
          setSelectedModel(current.name);
        }
      })
      .catch((err) => {
        console.warn('Failed to load models:', err);
      });
  }, [selectedModel, setSelectedModel]);

  const handleProgressUpdated = useCallback((prog: FormProgress, page?: number) => {
    setFormProgress(prog);
    if (page) setActivePage(page);
  }, [setFormProgress, setActivePage]);

  const { isStreaming, error, sendMessage, stopStream } = useChatStream(
    threadId,
    setMessages,
    bumpPdfVersion,
    selectedModel,
    thinkEnabled,
    handleProgressUpdated
  );

  const {
    isPlaying: isTtsPlaying,
    activeMessageId: activeTtsMessageId,
    error: ttsError,
    speak: speakTTS,
    stop: stopTTS,
  } = useTTSStream({ defaultVoice: selectedVoice, enabled: ttsEnabled });

  const handleToggleTts = useCallback((enabled: boolean) => {
    setTtsEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pdf_form_agent_tts_enabled', String(enabled));
    }
    if (!enabled) {
      stopTTS();
    }
  }, [stopTTS]);

  const handleSelectVoice = useCallback(
    (voice: TTSVoice) => {
      setSelectedVoice(voice);
      if (typeof window !== 'undefined') {
        localStorage.setItem('pdf_form_agent_tts_voice', voice);
      }
      if (ttsEnabled && isTtsHealthy) {
        const previewText = TTS_VOICE_CONFIG[voice]?.previewText || 'Hallo.';
        speakTTS('preview_' + voice, previewText, voice);
      }
    },
    [ttsEnabled, isTtsHealthy, speakTTS]
  );

  const handlePreviewVoice = useCallback(() => {
    if (ttsEnabled && isTtsHealthy) {
      const previewText = TTS_VOICE_CONFIG[selectedVoice]?.previewText || 'Hallo.';
      speakTTS('preview_' + selectedVoice, previewText, selectedVoice);
    }
  }, [selectedVoice, ttsEnabled, isTtsHealthy, speakTTS]);

  const handleResetSession = useCallback(() => {
    stopTTS();
    resetSession();
    setFormFields([]);
    setWorkspaceView('chat');
  }, [stopTTS, resetSession]);

  const handleRepeatQuestion = useCallback(() => {
    if (!ttsEnabled || !isTtsHealthy) {
      return;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.content) {
        speakTTS(msg.id, msg.content, selectedVoice);
        break;
      }
    }
  }, [messages, speakTTS, ttsEnabled, isTtsHealthy, selectedVoice]);

  const handleSpeakAssistant = useCallback(
    (messageId: string, text: string) => {
      speakTTS(messageId, text, selectedVoice);
    },
    [speakTTS, selectedVoice]
  );

  const handleDownloadForm = useCallback(() => {
    if (activeFilename) {
      window.open(getPdfDownloadUrl(threadId, activeFilename), '_blank');
    }
  }, [threadId, activeFilename]);

  const {
    splitRatio,
    isDragging,
    containerRef,
    startDragging,
    resetRatio,
    isPdfVisible,
    setIsPdfVisible,
    togglePdfVisibility,
  } = useResizableSplit();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute('contenteditable') === 'true';

      // Alt+P / Option+P -> Toggle PDF (STOP 2)
      if (e.altKey && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) {
        e.preventDefault();
        togglePdfVisibility();
        return;
      }

      // Alt+T / Option+T -> Toggle Theme (STOP 2)
      if (e.altKey && (e.key === 't' || e.key === 'T' || e.code === 'KeyT')) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // Alt+S / Option+S -> Cycle Text Scale
      if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
        e.preventDefault();
        cycleTextScale();
        return;
      }

      // Alt+U / Option+U -> Toggle User Profile Modal
      if (e.altKey && (e.key === 'u' || e.key === 'U' || e.code === 'KeyU')) {
        e.preventDefault();
        setIsUserProfileOpen((prev) => !prev);
        return;
      }

      // Alt+V / Option+V -> Toggle TTS (Voice)
      if (e.altKey && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) {
        e.preventDefault();
        handleToggleTts(!ttsEnabled);
        return;
      }

      // Alt+M / Option+M -> Toggle Workspace View (Chat vs Formular)
      if (e.altKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
        e.preventDefault();
        setWorkspaceView((prev) => (prev === 'chat' ? 'form' : 'chat'));
        return;
      }

      // ? -> Toggle Shortcuts Modal (only when NOT focused in input/textarea, STOP 1)
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      // Escape -> Close Modals if open
      if (e.key === 'Escape') {
        if (isUserProfileOpen) {
          e.preventDefault();
          setIsUserProfileOpen(false);
          return;
        }
        if (isShortcutsOpen) {
          e.preventDefault();
          setIsShortcutsOpen(false);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePdfVisibility, toggleTheme, cycleTextScale, isShortcutsOpen, isUserProfileOpen, handleToggleTts, ttsEnabled]);

  const handleUploadSuccess = (res: DocumentUploadResponse) => {
    setActiveFilename(res.filename);
    bumpPdfVersion();
    const total = res.fields_summary?.total_fields ?? 0;
    const filled = res.fields_summary?.filled_fields ?? 0;
    setFormProgress({ total, filled });
    setFormFields(res.fields_summary?.fields || []);
    setActivePage(1);

    if (total === 0) {
      const initialGreeting = `Dokument **${res.filename}** geladen: Keine ausfüllbaren AcroForm-Felder erkannt (gescanntes oder statisches PDF).`;
      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Date.now(),
          role: 'system',
          content: initialGreeting,
          timestamp: Date.now(),
        },
      ]);
      sendMessage(`Ich habe das Dokument ${res.filename} geladen. Es enthält keine Formularfelder. Bitte prüfe den sichtbaren Text und informiere mich über den Inhalt.`);
    } else {
      const initialGreeting = `Dokument **${res.filename}** erfolgreich geladen (${total} Felder erkannt). Ich analysiere nun die Felder und beginne mit den Fragen.`;
      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Date.now(),
          role: 'system',
          content: initialGreeting,
          timestamp: Date.now(),
        },
      ]);
      if (autofillEnabled) {
        sendMessage(`Ich habe das Dokument ${res.filename} hochgeladen. Bitte lies das Formular ein und stelle mir die erste Frage.`);
      } else {
        sendMessage(`Ich habe das Dokument ${res.filename} hochgeladen. WICHTIG: Das Formular wird für eine andere Person ausgefüllt. Verwende KEINE gespeicherten Profil-Stammdaten und rufe kein get_user_profile auf, sondern frage alle Felder ab Schritt 1 neutral ab.`);
      }
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-app-bg text-app-text overflow-hidden">
      <Header
        isHealthy={isHealthy}
        isSttHealthy={isSttHealthy}
        isTtsHealthy={isTtsHealthy}
        threadId={threadId}
        hasActiveSession={messages.length > 0 || Boolean(activeFilename)}
        onResetSession={handleResetSession}
        models={availableModels}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        thinkEnabled={thinkEnabled}
        onToggleThinking={setThinkEnabled}
        ttsEnabled={ttsEnabled}
        onToggleTts={handleToggleTts}
        selectedVoice={selectedVoice}
        onSelectVoice={handleSelectVoice}
        onPreviewVoice={handlePreviewVoice}
        isStreaming={isStreaming}
        theme={theme}
        onThemeChange={setTheme}
        textScale={textScale}
        onTextScaleChange={setTextScale}
        isPdfVisible={isPdfVisible}
        onTogglePdf={togglePdfVisibility}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        hasUserProfile={hasUserProfile}
        onOpenUserProfile={() => setIsUserProfileOpen(true)}
      />

      {!isHealthy && (
        <div className="bg-app-danger/20 border-b border-app-danger/50 px-4 py-1.5 text-center text-xs text-app-danger font-mono">
          Verbindung zum Backend unterbrochen. Bitte überprüfe den FastAPI-Dienst auf Port 8001.
        </div>
      )}

      <MobileTabNav
        activeTab={activeMobileTab}
        onTabChange={setActiveMobileTab}
        hasPdfUpdate={Boolean(activeFilename)}
      />

      <main
        ref={containerRef}
        style={{ '--chat-pane-width': `${splitRatio}%` } as React.CSSProperties}
        className={`flex flex-1 min-h-0 w-full overflow-hidden relative ${
          isDragging ? 'select-none cursor-col-resize' : ''
        }`}
      >
        {/* Left Pane (Chat & Upload) */}
        <div
          className={`flex-col min-w-0 bg-app-surface ${
            activeMobileTab === 'chat' ? 'flex flex-1 w-full' : 'hidden'
          } ${
            isPdfVisible
              ? 'md:flex md:flex-none md:w-[var(--chat-pane-width)] border-r border-app-border'
              : 'md:flex md:flex-1 md:w-full border-r-0'
          }`}
        >
          <DocumentUploader
            key={threadId}
            threadId={threadId}
            onUploadSuccess={handleUploadSuccess}
            autofillEnabled={autofillEnabled}
            onToggleAutofill={handleToggleAutofill}
            hasUserProfile={hasUserProfile}
          />
          <ProgressBar progress={formProgress} />
          {formProgress && formProgress.total === 0 && activeFilename && (
            <div className="bg-app-accent/15 border-b border-app-accent/40 px-4 py-1.5 text-xs text-app-text font-mono flex items-center justify-between">
              <span>[INFO] Kein interaktives Formular: Dieses Dokument enthält keine digitalen Formularfelder.</span>
            </div>
          )}
          {activeFilename && (
            <div className="flex items-center justify-between border-b border-app-border bg-app-surface px-4 py-1.5 text-xs font-mono shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-app-muted text-[11px] font-medium mr-1">ANSICHT:</span>
                <button
                  type="button"
                  data-testid="view-chat-btn"
                  onClick={() => setWorkspaceView('chat')}
                  className={`rounded-[2px] px-2.5 py-0.5 text-xs font-mono transition-colors cursor-pointer border ${
                    workspaceView === 'chat'
                      ? 'border-app-accent bg-app-accent text-app-accent-contrast font-bold'
                      : 'border-app-border bg-app-raised text-app-text hover:bg-app-active'
                  }`}
                >
                  CHAT
                </button>
                <button
                  type="button"
                  data-testid="view-form-btn"
                  onClick={() => setWorkspaceView('form')}
                  className={`rounded-[2px] px-2.5 py-0.5 text-xs font-mono transition-colors cursor-pointer border ${
                    workspaceView === 'form'
                      ? 'border-app-accent bg-app-accent text-app-accent-contrast font-bold'
                      : 'border-app-border bg-app-raised text-app-text hover:bg-app-active'
                  }`}
                >
                  FORMULAR
                </button>
              </div>
            </div>
          )}
          {workspaceView === 'form' && activeFilename ? (
            <FormInspector
              threadId={threadId}
              filename={activeFilename}
              initialFields={formFields}
              onFieldsUpdated={setFormFields}
              onPdfUpdated={bumpPdfVersion}
              onProgressUpdated={handleProgressUpdated}
            />
          ) : (
            <>
              <ChatContainer
                messages={messages}
                isStreaming={isStreaming}
                activeMessageId={activeTtsMessageId}
                isTTSPlaying={isTtsPlaying}
                onSpeak={handleSpeakAssistant}
                onStopTTS={stopTTS}
                isTtsHealthy={isTtsHealthy}
                ttsEnabled={ttsEnabled}
                formProgress={formProgress}
                activeFilename={activeFilename}
                threadId={threadId}
                formFields={formFields}
                onSendMessage={sendMessage}
              />
              {(error || ttsError) && (
                <div className="bg-app-danger/15 border-t border-app-danger/40 px-4 py-1.5 text-xs text-app-danger font-mono">
                  {error || ttsError}
                </div>
              )}
              <ChatInput
                onSendMessage={sendMessage}
                onStop={stopStream}
                isStreaming={isStreaming}
                isTtsPlaying={isTtsPlaying}
                disabled={!activeFilename}
                onRepeatQuestion={handleRepeatQuestion}
                onDownloadForm={handleDownloadForm}
              />
            </>
          )}
        </div>

        {/* Desktop Resizer Handle */}
        {isPdfVisible && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startDragging}
            onDoubleClick={resetRatio}
            title="Ziehen zum Anpassen der Breite (Doppelklick für 40/60 Standard)"
            className="hidden md:flex items-center justify-center w-3 -mx-1.5 shrink-0 cursor-col-resize z-20 group select-none relative"
          >
            <div
              className={`w-[2px] h-full transition-colors ${
                isDragging ? 'bg-app-accent' : 'bg-app-border group-hover:bg-app-accent'
              }`}
            />
          </div>
        )}

        {/* Right Pane (Live PDF Preview) */}
        <div
          className={`flex-col min-w-0 bg-app-bg overflow-hidden relative ${
            !isPdfVisible
              ? 'hidden'
              : activeMobileTab === 'pdf'
              ? 'flex flex-1 w-full'
              : 'hidden md:flex md:flex-1'
          }`}
        >
          <PDFViewer
            threadId={threadId}
            filename={activeFilename}
            version={pdfVersion}
            progress={formProgress}
            activePage={activePage}
            onRefresh={bumpPdfVersion}
            onClose={() => setIsPdfVisible(false)}
          />
        </div>

        {/* Fullscreen transparent shield during dragging to prevent iframe from swallowing mouse events */}
        {isDragging && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none bg-transparent" />
        )}
      </main>

      {/* Keyboard Shortcuts Discovery Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Stammdaten / User Profile Modal */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        onProfileUpdated={refreshUserProfileStatus}
      />
    </div>
  );
}

export default App;
