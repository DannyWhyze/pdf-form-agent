import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatInput } from '../src/components/Chat/ChatInput';

let mockAudioLevel = 0;
let mockIsRecording = false;
let mockOnTranscript: ((text: string, isFinal: boolean) => void) | undefined;
const mockStartRecording = vi.fn().mockImplementation(async () => {
  mockIsRecording = true;
});
const mockStopRecording = vi.fn().mockImplementation(() => {
  mockIsRecording = false;
});

vi.mock('../src/hooks/useSTTStream', () => ({
  useSTTStream: (options: any) => {
    mockOnTranscript = options?.onTranscript;
    return {
      isRecording: mockIsRecording,
      transcript: '',
      error: null,
      audioLevel: mockAudioLevel,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    };
  },
}));

describe('ChatInput Auto-Send & VAD Silence Detection (Plan 037)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockAudioLevel = 0;
    mockIsRecording = false;
    mockStartRecording.mockClear();
    mockStopRecording.mockClear();
    mockOnTranscript = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders AUTO-SEND: OFF by default and toggles to ON on click, persisting in localStorage', () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /auto-send: off/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(localStorage.getItem('pdf_form_agent_auto_send')).toBeNull();

    // Click to toggle ON
    fireEvent.click(toggleBtn);
    expect(screen.getByRole('button', { name: /auto-send: on/i })).toBeInTheDocument();
    expect(localStorage.getItem('pdf_form_agent_auto_send')).toBe('true');

    // Click to toggle OFF
    fireEvent.click(screen.getByRole('button', { name: /auto-send: on/i }));
    expect(screen.getByRole('button', { name: /auto-send: off/i })).toBeInTheDocument();
    expect(localStorage.getItem('pdf_form_agent_auto_send')).toBe('false');
  });

  it('toggles AUTO-SEND via Alt+A keyboard shortcut', () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    expect(screen.getByRole('button', { name: /auto-send: off/i })).toBeInTheDocument();

    // Trigger Alt+A
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    expect(screen.getByRole('button', { name: /auto-send: on/i })).toBeInTheDocument();
    expect(localStorage.getItem('pdf_form_agent_auto_send')).toBe('true');

    // Trigger Alt+A again
    fireEvent.keyDown(window, { key: 'A', code: 'KeyA', altKey: true });
    expect(screen.getByRole('button', { name: /auto-send: off/i })).toBeInTheDocument();
    expect(localStorage.getItem('pdf_form_agent_auto_send')).toBe('false');
  });

  it('does NOT trigger auto-send when AUTO-SEND: OFF even during prolonged silence', async () => {
    const onSendMessage = vi.fn();
    mockIsRecording = true;
    mockAudioLevel = 0.01; // Below 0.03 silence threshold

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // Simulate speech transcript arriving
    act(() => {
      mockOnTranscript?.('Meine Anschrift lautet Hauptstraße 10', true);
    });

    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Meine Anschrift lautet Hauptstraße 10');

    // Advance timers by 5 seconds of silence
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Auto-send should NOT have been triggered
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();
  });

  it('triggers countdown and auto-sends after 1800ms silence + 1000ms countdown when AUTO-SEND: ON', async () => {
    localStorage.setItem('pdf_form_agent_auto_send', 'true');
    const onSendMessage = vi.fn();
    mockIsRecording = true;
    mockAudioLevel = 0.01; // Silence

    const { rerender } = render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // Simulate incoming speech transcript
    act(() => {
      mockOnTranscript?.('Max Mustermann', true);
    });

    // Rerender so effect receives updated input and audioLevel
    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // No countdown badge yet before 1800ms
    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();

    // Advance by 1700ms (not yet 1800ms)
    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();
    expect(onSendMessage).not.toHaveBeenCalled();

    // Advance 100ms more -> 1800ms silence reached -> countdown starts
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('auto-send-countdown-badge')).toBeInTheDocument();
    expect(screen.getByText(/\[AUTO-SEND IN 1S\.\.\./i)).toBeInTheDocument();
    expect(onSendMessage).not.toHaveBeenCalled();

    // Advance 1000ms countdown period -> message sent!
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSendMessage).toHaveBeenCalledWith('Max Mustermann');
    expect(mockStopRecording).toHaveBeenCalled();
    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();

    // Command badge should appear
    expect(screen.getByTestId('voice-command-badge')).toHaveTextContent(/\[BEFEHL: AUTO-SEND\]/i);
  });

  it('aborts countdown immediately if user speaks again (audioLevel > 0.05)', async () => {
    localStorage.setItem('pdf_form_agent_auto_send', 'true');
    const onSendMessage = vi.fn();
    mockIsRecording = true;
    mockAudioLevel = 0.01;

    const { rerender } = render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    act(() => {
      mockOnTranscript?.('Berlin', true);
    });

    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // Reach countdown phase (1800ms silence)
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.getByTestId('auto-send-countdown-badge')).toBeInTheDocument();

    // User speaks again! audioLevel rises to 0.20
    mockAudioLevel = 0.20;
    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // Countdown badge must disappear immediately
    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();

    // Advance further -> must NOT send
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('aborts countdown immediately if user presses a key or edits text in textarea', async () => {
    localStorage.setItem('pdf_form_agent_auto_send', 'true');
    const onSendMessage = vi.fn();
    mockIsRecording = true;
    mockAudioLevel = 0.01;

    const { rerender } = render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    act(() => {
      mockOnTranscript?.('Musterstadt', true);
    });

    rerender(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    // Reach countdown phase
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.getByTestId('auto-send-countdown-badge')).toBeInTheDocument();

    // User presses backspace in textarea
    const textarea = screen.getByPlaceholderText('Antwort eingeben...') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Backspace' });

    // Countdown badge must disappear immediately
    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();

    // Advance 2 seconds -> no send
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('does not start silence timer if input is empty', () => {
    localStorage.setItem('pdf_form_agent_auto_send', 'true');
    const onSendMessage = vi.fn();
    mockIsRecording = true;
    mockAudioLevel = 0.01;

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByTestId('auto-send-countdown-badge')).not.toBeInTheDocument();
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
