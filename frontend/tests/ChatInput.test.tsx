import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatInput } from '../src/components/Chat/ChatInput';

// Mock WebSocket for ChatInput integration
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  binaryType = 'blob';
  readyState = WebSocket.OPEN;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}
(globalThis as any).WebSocket = MockWebSocket;
(window as any).WebSocket = MockWebSocket;

describe('ChatInput', () => {
  it('submits message on Enter and clears textarea', () => {
    const onSendMessage = vi.fn();
    render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Max Mustermann' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSendMessage).toHaveBeenCalledWith('Max Mustermann');
    expect(textarea.value).toBe('');
  });

  it('allows newline on Shift+Enter without submitting', () => {
    const onSendMessage = vi.fn();
    render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Zeile 1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('renders Stop button and calls onStop when isStreaming is true', () => {
    const onStop = vi.fn();
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={onStop}
        isStreaming={true}
        disabled={false}
      />
    );

    const stopButton = screen.getByRole('button', { name: /stop/i });
    expect(stopButton).toBeInTheDocument();
    fireEvent.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders Dictate button in inactive state and disables when disabled prop is true', () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={true}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });
    expect(dictateButton).toBeInTheDocument();
    expect(dictateButton).toBeDisabled();
  });

  it('disables Dictate button when isStreaming is true', () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={true}
        disabled={false}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });
    expect(dictateButton).toBeInTheDocument();
    expect(dictateButton).toBeDisabled();
  });

  it('toggles recording on button click and supports Alt+D keyboard shortcut', async () => {
    MockWebSocket.instances = [];
    const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
    if (!navigator.mediaDevices) {
      (navigator as any).mediaDevices = {};
    }
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });
    expect(dictateButton).not.toBeDisabled();

    // Trigger via click
    await act(async () => {
      fireEvent.click(dictateButton);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();

    // Trigger via Alt+D keyboard shortcut
    await act(async () => {
      fireEvent.keyDown(window, { key: 'd', altKey: true });
    });
  });

  it('supports macOS Option+D shortcut where key produces special characters', async () => {
    MockWebSocket.instances = [];
    const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // Simulate macOS Option+D where e.key is '∂' (special character) but e.code is 'KeyD'
    await act(async () => {
      fireEvent.keyDown(window, { key: '∂', code: 'KeyD', altKey: true });
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('streams transcription into textarea and sends on submit', async () => {
    MockWebSocket.instances = [];
    const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
    const onSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });
    await act(async () => {
      fireEvent.click(dictateButton);
    });

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;

    // Simulate incoming partial transcript
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Hauptstraße 5', is_final: false }),
      } as MessageEvent);
    });
    expect(textarea.value).toBe('Hauptstraße 5');

    // Submit the dictated text
    act(() => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    });

    expect(onSendMessage).toHaveBeenCalledWith('Hauptstraße 5');
    expect(textarea.value).toBe('');

    // Simulate trailing final transcript from server after submit
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Hauptstraße 5', is_final: true }),
      } as MessageEvent);
    });

    // Textarea must remain empty and not repopulated
    expect(textarea.value).toBe('');
  });

  it('displays error message when microphone permission is denied', async () => {
    const notAllowedError = new Error('Permission denied');
    notAllowedError.name = 'NotAllowedError';
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(notAllowedError);

    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });
    await act(async () => {
      fireEvent.click(dictateButton);
    });

    expect(screen.getByText('Mikrofonzugriff wurde verweigert.')).toBeInTheDocument();
  });

  it('renders DAW VU-meter segments when recording is active', async () => {
    const mockMediaStream = {
      getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
    };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });
    expect(screen.queryByTestId('stt-vu-meter')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(dictateButton);
    });

    expect(screen.getByTestId('stt-vu-meter')).toBeInTheDocument();
    expect(screen.getByTestId('vu-segment-0')).toBeInTheDocument();
    expect(screen.getByTestId('vu-segment-1')).toBeInTheDocument();
    expect(screen.getByTestId('vu-segment-2')).toBeInTheDocument();
    expect(screen.getByTestId('vu-segment-3')).toBeInTheDocument();
  });

  it('pauses hands-free dictation during streaming and resumes when streaming ends', async () => {
    const mockMediaStream = {
      getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
    };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

    const { rerender } = render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const dictateButton = screen.getByRole('button', { name: /spracheingabe starten/i });

    // 1. Activate hands-free dictation
    await act(async () => {
      fireEvent.click(dictateButton);
    });
    expect(screen.getByText('Recording...')).toBeInTheDocument();

    // 2. Agent begins streaming response: hands-free pauses
    await act(async () => {
      rerender(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={true}
          disabled={false}
        />
      );
    });
    expect(screen.getByText('Paused...')).toBeInTheDocument();

    // 3. Agent finishes streaming response: hands-free resumes automatically
    await act(async () => {
      rerender(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
        />
      );
    });
    expect(screen.getByText('Recording...')).toBeInTheDocument();
  });

  it('applies privacy and anti-autocomplete attributes to textarea', () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;
    expect(textarea.getAttribute('autocomplete')).toBe('off');
    expect(textarea.getAttribute('autocorrect')).toBe('off');
    expect(textarea.getAttribute('spellcheck')).toBe('false');
    expect(textarea.getAttribute('data-gramm')).toBe('false');
  });

  it('pauses hands-free dictation during TTS playback and auto-resumes when TTS stops (STT-Interlock)', async () => {
    const { rerender } = render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        isTtsPlaying={false}
        disabled={false}
      />
    );

    // 1. User starts hands-free dictation
    const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
    await act(async () => {
      fireEvent.click(dictateBtn);
    });
    expect(screen.getByText('Recording...')).toBeInTheDocument();

    // 2. TTS audio starts playing (isTtsPlaying: true) -> dictation pauses (STT-Interlock)
    await act(async () => {
      rerender(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          isTtsPlaying={true}
          disabled={false}
        />
      );
    });
    expect(screen.getByText('Paused...')).toBeInTheDocument();

    // 3. TTS audio finishes playing (isTtsPlaying: false) -> dictation automatically resumes
    await act(async () => {
      rerender(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          isTtsPlaying={false}
          disabled={false}
        />
      );
    });
    expect(screen.getByText('Recording...')).toBeInTheDocument();
  });

  it('stops dictation and ignores trailing transcripts when user manually edits or deletes in textarea (Option A)', async () => {
    MockWebSocket.instances = [];
    const mockTrackStop = vi.fn();
    const mockMediaStream = {
      getTracks: vi.fn().mockReturnValue([{ stop: mockTrackStop }]),
    };
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
    await act(async () => {
      fireEvent.click(dictateBtn);
    });
    expect(screen.getByText('Recording...')).toBeInTheDocument();

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;

    // Simulate STT partial arrival
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Max Mustermann', is_final: false }),
      } as MessageEvent);
    });
    expect(textarea.value).toBe('Max Mustermann');

    // User manually deletes part of the text while dictation is active
    act(() => {
      fireEvent.change(textarea, { target: { value: 'Max' } });
    });

    // Recording must have stopped immediately
    expect(screen.queryByText('Recording...')).not.toBeInTheDocument();
    expect(textarea.value).toBe('Max');

    // Late in-flight STT partial/final message arriving from server must be ignored (no doubling!)
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Max Mustermann', is_final: false }),
      } as MessageEvent);
    });
    expect(textarea.value).toBe('Max');

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ text: 'Max Mustermann', is_final: true }),
      } as MessageEvent);
    });
    expect(textarea.value).toBe('Max');
  });

  describe('Voice Commands Interceptor', () => {
    it('triggers onRepeatQuestion and shows badge on "Wiederhole die Frage"', async () => {
      MockWebSocket.instances = [];
      const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
      const onRepeatQuestion = vi.fn();

      render(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
          onRepeatQuestion={onRepeatQuestion}
        />
      );

      const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
      await act(async () => {
        fireEvent.click(dictateBtn);
      });

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.onmessage?.({
          data: JSON.stringify({ text: 'Wiederhole die Frage', is_final: true }),
        } as MessageEvent);
      });

      expect(onRepeatQuestion).toHaveBeenCalledTimes(1);
      const badge = screen.getByTestId('voice-command-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('[BEFEHL: WIEDERHOLE FRAGE]');
      const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;
      expect(textarea.value).toBe('');
    });

    it('triggers onDownloadForm and shows badge on "Formular herunterladen"', async () => {
      MockWebSocket.instances = [];
      const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
      const onDownloadForm = vi.fn();

      render(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
          onDownloadForm={onDownloadForm}
        />
      );

      const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
      await act(async () => {
        fireEvent.click(dictateBtn);
      });

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.onmessage?.({
          data: JSON.stringify({ text: 'Formular herunterladen', is_final: true }),
        } as MessageEvent);
      });

      expect(onDownloadForm).toHaveBeenCalledTimes(1);
      const badge = screen.getByTestId('voice-command-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('[BEFEHL: DOWNLOAD]');
    });

    it('triggers onSendMessage with cleaned text on "Mustermann, senden"', async () => {
      MockWebSocket.instances = [];
      const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
      const onSendMessage = vi.fn();

      render(
        <ChatInput
          onSendMessage={onSendMessage}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
        />
      );

      const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
      await act(async () => {
        fireEvent.click(dictateBtn);
      });

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.onmessage?.({
          data: JSON.stringify({ text: 'Mustermann, senden', is_final: true }),
        } as MessageEvent);
      });

      expect(onSendMessage).toHaveBeenCalledWith('Mustermann');
      const badge = screen.getByTestId('voice-command-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('[BEFEHL: SENDEN]');
    });

    it('triggers onSendMessage with fallback prompt on "Einen Schritt zurück"', async () => {
      MockWebSocket.instances = [];
      const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);
      const onSendMessage = vi.fn();

      render(
        <ChatInput
          onSendMessage={onSendMessage}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
        />
      );

      const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
      await act(async () => {
        fireEvent.click(dictateBtn);
      });

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.onmessage?.({
          data: JSON.stringify({ text: 'Einen Schritt zurück', is_final: true }),
        } as MessageEvent);
      });

      expect(onSendMessage).toHaveBeenCalledWith('Einen Schritt zurück bitte');
      const badge = screen.getByTestId('voice-command-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('[BEFEHL: SCHRITT ZURÜCK]');
    });

    it('clears command badge after 2500ms timeout', async () => {
      vi.useFakeTimers();
      MockWebSocket.instances = [];
      const mockMediaStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

      render(
        <ChatInput
          onSendMessage={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
          onRepeatQuestion={vi.fn()}
        />
      );

      const dictateBtn = screen.getByRole('button', { name: /spracheingabe starten/i });
      await act(async () => {
        fireEvent.click(dictateBtn);
      });

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.onmessage?.({
          data: JSON.stringify({ text: 'Wiederhole die Frage', is_final: true }),
        } as MessageEvent);
      });

      expect(screen.getByTestId('voice-command-badge')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2500);
      });

      expect(screen.queryByTestId('voice-command-badge')).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });
});


