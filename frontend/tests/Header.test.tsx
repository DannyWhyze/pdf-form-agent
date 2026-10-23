import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../src/components/Layout/Header';

describe('Header', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders online status and thread ID', () => {
    render(
      <Header
        isHealthy={true}
        isSttHealthy={false}
        isTtsHealthy={false}
        threadId="session_abcdef123456"
        hasActiveSession={false}
        onResetSession={vi.fn()}
      />
    );

    expect(screen.getByText('PDF Form Agent')).toBeInTheDocument();
    expect(screen.getByText('API: Online')).toBeInTheDocument();
    expect(screen.getByText('STT: Offline')).toBeInTheDocument();
    expect(screen.getByText('TTS: Offline')).toBeInTheDocument();
    expect(screen.getByText(/Session: session_abcdef/)).toBeInTheDocument();
  });

  it('renders triple status indicators for API, STT and TTS correctly', () => {
    const { rerender } = render(
      <Header
        isHealthy={true}
        isSttHealthy={true}
        isTtsHealthy={true}
        threadId="session_123"
        onResetSession={vi.fn()}
      />
    );

    expect(screen.getByText('API: Online')).toBeInTheDocument();
    expect(screen.getByText('STT: Online')).toBeInTheDocument();
    expect(screen.getByText('TTS: Online')).toBeInTheDocument();
    expect(screen.getByTestId('status-indicator-api')).toHaveClass('bg-app-success');
    expect(screen.getByTestId('status-indicator-stt')).toHaveClass('bg-app-success');
    expect(screen.getByTestId('status-indicator-tts')).toHaveClass('bg-app-success');

    rerender(
      <Header
        isHealthy={false}
        isSttHealthy={false}
        isTtsHealthy={false}
        threadId="session_123"
        onResetSession={vi.fn()}
      />
    );

    expect(screen.getByText('API: Offline')).toBeInTheDocument();
    expect(screen.getByText('STT: Offline')).toBeInTheDocument();
    expect(screen.getByText('TTS: Offline')).toBeInTheDocument();
    expect(screen.getByTestId('status-indicator-api')).toHaveClass('bg-app-danger');
    expect(screen.getByTestId('status-indicator-stt')).toHaveClass('bg-app-danger');
    expect(screen.getByTestId('status-indicator-tts')).toHaveClass('bg-app-danger');
  });

  it('resets immediately when hasActiveSession is false', () => {
    const onResetSession = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        hasActiveSession={false}
        onResetSession={onResetSession}
      />
    );

    const button = screen.getByRole('button', { name: /new session/i });
    fireEvent.click(button);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onResetSession).toHaveBeenCalledTimes(1);
  });

  it('prompts confirmation when hasActiveSession is true', () => {
    const onResetSession = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        hasActiveSession={true}
        onResetSession={onResetSession}
      />
    );

    const button = screen.getByRole('button', { name: /new session/i });
    fireEvent.click(button);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onResetSession).toHaveBeenCalledTimes(1);
  });

  it('cancels reset when user dismisses confirmation dialog', () => {
    const onResetSession = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        hasActiveSession={true}
        onResetSession={onResetSession}
      />
    );

    const button = screen.getByRole('button', { name: /new session/i });
    fireEvent.click(button);

    expect(onResetSession).not.toHaveBeenCalled();
  });

  it('renders model select dropdown and calls onSelectModel when changed', () => {
    const onSelectModel = vi.fn();
    const models = [
      { name: 'gemma4:e4b', display_name: 'gemma4:e4b', size: 4000, parameter_size: '4B' },
      { name: 'llama3.1:8b', display_name: 'llama3.1:8b', size: 8000, parameter_size: '8B' },
    ];

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        models={models}
        selectedModel="gemma4:e4b"
        onSelectModel={onSelectModel}
        onResetSession={vi.fn()}
      />
    );

    const select = screen.getByLabelText(/model:/i) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('gemma4:e4b');

    fireEvent.change(select, { target: { value: 'llama3.1:8b' } });
    expect(onSelectModel).toHaveBeenCalledWith('llama3.1:8b');
  });

  it('disables model select dropdown when isStreaming is true', () => {
    const models = [
      { name: 'gemma4:e4b', display_name: 'gemma4:e4b', size: 4000 },
    ];

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        models={models}
        selectedModel="gemma4:e4b"
        isStreaming={true}
        onResetSession={vi.fn()}
      />
    );

    const select = screen.getByLabelText(/model:/i) as HTMLSelectElement;
    expect(select).toBeDisabled();
  });

  it('renders thinking toggle button with correct state and handles click', () => {
    const onToggleThinking = vi.fn();

    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        thinkEnabled={false}
        onToggleThinking={onToggleThinking}
        onResetSession={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /thinking: off/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggleBtn);
    expect(onToggleThinking).toHaveBeenCalledWith(true);

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        thinkEnabled={true}
        onToggleThinking={onToggleThinking}
        onResetSession={vi.fn()}
      />
    );

    const activeToggleBtn = screen.getByRole('button', { name: /thinking: on/i });
    expect(activeToggleBtn).toBeInTheDocument();
    expect(activeToggleBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(activeToggleBtn);
    expect(onToggleThinking).toHaveBeenCalledWith(false);
  });

  it('disables thinking toggle button when isStreaming is true', () => {
    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        thinkEnabled={false}
        isStreaming={true}
        onResetSession={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /thinking: off/i });
    expect(toggleBtn).toBeDisabled();
  });

  it('renders theme switcher and handles switching between live, paper, and contrast', () => {
    const onThemeChange = vi.fn();

    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        theme="live"
        onThemeChange={onThemeChange}
        onResetSession={vi.fn()}
      />
    );

    const liveBtn = screen.getByRole('button', { name: /ableton live theme/i });
    const paperBtn = screen.getByRole('button', { name: /swiss paper theme/i });
    const contrastBtn = screen.getByRole('button', { name: /high-contrast theme/i });

    expect(liveBtn).toBeInTheDocument();
    expect(paperBtn).toBeInTheDocument();
    expect(contrastBtn).toBeInTheDocument();
    expect(liveBtn).toHaveAttribute('aria-pressed', 'true');
    expect(paperBtn).toHaveAttribute('aria-pressed', 'false');
    expect(contrastBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(contrastBtn);
    expect(onThemeChange).toHaveBeenCalledWith('contrast');

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        theme="contrast"
        onThemeChange={onThemeChange}
        onResetSession={vi.fn()}
      />
    );

    expect(contrastBtn).toHaveAttribute('aria-pressed', 'true');
    expect(liveBtn).toHaveAttribute('aria-pressed', 'false');
    expect(paperBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(paperBtn);
    expect(onThemeChange).toHaveBeenCalledWith('paper');

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        theme="paper"
        onThemeChange={onThemeChange}
        onResetSession={vi.fn()}
      />
    );

    expect(liveBtn).toHaveAttribute('aria-pressed', 'false');
    expect(paperBtn).toHaveAttribute('aria-pressed', 'true');
    expect(contrastBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(liveBtn);
    expect(onThemeChange).toHaveBeenCalledWith('live');
  });

  it('renders text scale segment control and handles scale changes', () => {
    const onTextScaleChange = vi.fn();

    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        textScale="100"
        onTextScaleChange={onTextScaleChange}
        onResetSession={vi.fn()}
      />
    );

    const scale100 = screen.getByRole('button', { name: /textgröße 100%/i });
    const scale125 = screen.getByRole('button', { name: /textgröße 125%/i });
    const scale150 = screen.getByRole('button', { name: /textgröße 150%/i });

    expect(scale100).toBeInTheDocument();
    expect(scale125).toBeInTheDocument();
    expect(scale150).toBeInTheDocument();
    expect(scale100).toHaveAttribute('aria-pressed', 'true');
    expect(scale125).toHaveAttribute('aria-pressed', 'false');
    expect(scale150).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(scale125);
    expect(onTextScaleChange).toHaveBeenCalledWith('125');

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        textScale="150"
        onTextScaleChange={onTextScaleChange}
        onResetSession={vi.fn()}
      />
    );

    expect(scale150).toHaveAttribute('aria-pressed', 'true');
    expect(scale100).toHaveAttribute('aria-pressed', 'false');
    expect(scale125).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders PDF toggle button and calls onTogglePdf when clicked', () => {
    const onTogglePdf = vi.fn();

    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        isPdfVisible={true}
        onTogglePdf={onTogglePdf}
        onResetSession={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /pdf ausblenden/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggleBtn);
    expect(onTogglePdf).toHaveBeenCalledTimes(1);

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        isPdfVisible={false}
        onTogglePdf={onTogglePdf}
        onResetSession={vi.fn()}
      />
    );

    const offBtn = screen.getByRole('button', { name: /pdf anzeigen/i });
    expect(offBtn).toBeInTheDocument();
    expect(offBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders Shortcuts button and calls onOpenShortcuts when clicked', () => {
    const onOpenShortcuts = vi.fn();

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        onOpenShortcuts={onOpenShortcuts}
        onResetSession={vi.fn()}
      />
    );

    const shortcutsBtn = screen.getByRole('button', { name: /shortcuts/i });
    expect(shortcutsBtn).toBeInTheDocument();
    expect(shortcutsBtn).toHaveAttribute('title', expect.stringContaining('?'));

    fireEvent.click(shortcutsBtn);
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('renders Stammdaten profile button and calls onOpenUserProfile when clicked', () => {
    const onOpenUserProfile = vi.fn();

    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        hasUserProfile={false}
        onOpenUserProfile={onOpenUserProfile}
        onResetSession={vi.fn()}
      />
    );

    const emptyBtn = screen.getByRole('button', { name: /\[STAMMDATEN: LEER\]/i });
    expect(emptyBtn).toBeInTheDocument();
    fireEvent.click(emptyBtn);
    expect(onOpenUserProfile).toHaveBeenCalledTimes(1);

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        hasUserProfile={true}
        onOpenUserProfile={onOpenUserProfile}
        onResetSession={vi.fn()}
      />
    );

    const activeBtn = screen.getByRole('button', { name: /\[STAMMDATEN: AKTIV\]/i });
    expect(activeBtn).toBeInTheDocument();
    fireEvent.click(activeBtn);
    expect(onOpenUserProfile).toHaveBeenCalledTimes(2);
  });

  it('renders TTS toggle button and handles toggling correctly', () => {
    const onToggleTts = vi.fn();

    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        ttsEnabled={true}
        onToggleTts={onToggleTts}
        onResetSession={vi.fn()}
      />
    );

    const ttsBtn = screen.getByTestId('tts-toggle');
    expect(ttsBtn).toHaveTextContent('TTS: ON');
    expect(ttsBtn).toHaveAttribute('aria-pressed', 'true');
    expect(ttsBtn).toHaveAttribute('title', expect.stringContaining('Sprachausgabe (TTS) aktiviert'));

    fireEvent.click(ttsBtn);
    expect(onToggleTts).toHaveBeenCalledWith(false);

    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        ttsEnabled={false}
        onToggleTts={onToggleTts}
        onResetSession={vi.fn()}
      />
    );

    expect(ttsBtn).toHaveTextContent('TTS: OFF');
    expect(ttsBtn).toHaveAttribute('aria-pressed', 'false');
    expect(ttsBtn).toHaveAttribute('title', expect.stringContaining('Sprachausgabe (TTS) deaktiviert'));

    fireEvent.click(ttsBtn);
    expect(onToggleTts).toHaveBeenCalledWith(true);
  });

  it('renders TTS voice selector and handles voice selection and preview', () => {
    const onSelectVoice = vi.fn();
    const onPreviewVoice = vi.fn();

    render(
      <Header
        isHealthy={true}
        threadId="session_123"
        ttsEnabled={true}
        selectedVoice="ger_klara_calm_female"
        onSelectVoice={onSelectVoice}
        onPreviewVoice={onPreviewVoice}
        onResetSession={vi.fn()}
      />
    );

    const select = screen.getByTestId('voice-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('ger_klara_calm_female');
    expect(select).not.toBeDisabled();

    // Verify all 3 options exist
    expect(screen.getByRole('option', { name: /Klara \(Ruhig\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Uwe \(Nachrichten\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Jonas \(Lässig\)/i })).toBeInTheDocument();

    // Select Uwe
    fireEvent.change(select, { target: { value: 'ger_uwe_newsreader_male' } });
    expect(onSelectVoice).toHaveBeenCalledWith('ger_uwe_newsreader_male');

    // Click Probe button
    const probeBtn = screen.getByTestId('voice-preview-btn');
    expect(probeBtn).toBeInTheDocument();
    expect(probeBtn).not.toBeDisabled();
    fireEvent.click(probeBtn);
    expect(onPreviewVoice).toHaveBeenCalledTimes(1);
  });

  it('disables voice select and preview button when ttsEnabled is false or during streaming', () => {
    const { rerender } = render(
      <Header
        isHealthy={true}
        threadId="session_123"
        ttsEnabled={false}
        isStreaming={false}
        onResetSession={vi.fn()}
      />
    );

    const select = screen.getByTestId('voice-select');
    const probeBtn = screen.getByTestId('voice-preview-btn');
    expect(select).toBeDisabled();
    expect(probeBtn).toBeDisabled();

    // Now test during streaming even if ttsEnabled is true
    rerender(
      <Header
        isHealthy={true}
        threadId="session_123"
        ttsEnabled={true}
        isStreaming={true}
        onResetSession={vi.fn()}
      />
    );

    expect(select).toBeDisabled();
    expect(probeBtn).toBeDisabled();
  });
});


