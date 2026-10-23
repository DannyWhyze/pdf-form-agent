import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../src/components/Chat/ChatMessage';

describe('ChatMessage', () => {
  it('renders user message text correctly', () => {
    render(
      <ChatMessage
        message={{
          id: '1',
          role: 'user',
          content: 'Hello World',
          timestamp: Date.now(),
        }}
      />
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders reasoning collapsible and tool chips for assistant messages', () => {
    render(
      <ChatMessage
        message={{
          id: '2',
          role: 'assistant',
          content: 'Here is your answer',
          reasoningContent: 'Deep thought analysis',
          toolCalls: [{ name: 'read_pdf_form', status: 'completed' }],
          timestamp: Date.now(),
        }}
      />
    );
    expect(screen.getByText('Thought Process')).toBeInTheDocument();
    expect(screen.getByText('Tool: read_pdf_form')).toBeInTheDocument();
    expect(screen.getByText('Here is your answer')).toBeInTheDocument();
  });

  it('renders Vorlesen button for assistant message when callbacks provided', () => {
    const onSpeak = vi.fn();
    const onStopSpeaking = vi.fn();

    render(
      <ChatMessage
        message={{
          id: 'msg_3',
          role: 'assistant',
          content: 'Bitte tragen Sie Ihren Namen ein.',
          timestamp: Date.now(),
        }}
        onSpeak={onSpeak}
        onStopSpeaking={onStopSpeaking}
        isSpeakingThis={false}
        isTtsHealthy={true}
      />
    );

    const button = screen.getByRole('button', { name: /nachricht vorlesen/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Vorlesen');
    expect(button).not.toBeDisabled();

    button.click();
    expect(onSpeak).toHaveBeenCalledWith('msg_3', 'Bitte tragen Sie Ihren Namen ein.');
  });

  it('does not render Vorlesen button for user messages', () => {
    const onSpeak = vi.fn();
    const onStopSpeaking = vi.fn();

    render(
      <ChatMessage
        message={{
          id: 'msg_user',
          role: 'user',
          content: 'Mein Name ist Danny.',
          timestamp: Date.now(),
        }}
        onSpeak={onSpeak}
        onStopSpeaking={onStopSpeaking}
      />
    );

    expect(screen.queryByRole('button', { name: /vorlesen/i })).not.toBeInTheDocument();
  });

  it('renders Stop button when isSpeakingThis is true and triggers onStopSpeaking', () => {
    const onSpeak = vi.fn();
    const onStopSpeaking = vi.fn();

    render(
      <ChatMessage
        message={{
          id: 'msg_4',
          role: 'assistant',
          content: 'Text wird gerade gesprochen.',
          timestamp: Date.now(),
        }}
        onSpeak={onSpeak}
        onStopSpeaking={onStopSpeaking}
        isSpeakingThis={true}
        isTtsHealthy={true}
      />
    );

    const stopButton = screen.getByRole('button', { name: /wiedergabe stoppen/i });
    expect(stopButton).toBeInTheDocument();
    expect(stopButton).toHaveTextContent('Stop');

    stopButton.click();
    expect(onStopSpeaking).toHaveBeenCalled();
  });

  it('disables Vorlesen button when isTtsHealthy is false', () => {
    const onSpeak = vi.fn();
    const onStopSpeaking = vi.fn();

    render(
      <ChatMessage
        message={{
          id: 'msg_5',
          role: 'assistant',
          content: 'Dienst ist offline.',
          timestamp: Date.now(),
        }}
        onSpeak={onSpeak}
        onStopSpeaking={onStopSpeaking}
        isSpeakingThis={false}
        isTtsHealthy={false}
      />
    );

    const button = screen.getByRole('button', { name: /nachricht vorlesen/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Sprachausgabe offline (Port 8005)');
  });

  it('disables Vorlesen button when ttsEnabled is false', () => {
    const onSpeak = vi.fn();
    const onStopSpeaking = vi.fn();

    render(
      <ChatMessage
        message={{
          id: 'msg_disabled_tts',
          role: 'assistant',
          content: 'Sprachausgabe ist aus.',
          timestamp: Date.now(),
        }}
        onSpeak={onSpeak}
        onStopSpeaking={onStopSpeaking}
        isSpeakingThis={false}
        isTtsHealthy={true}
        ttsEnabled={false}
      />
    );

    const button = screen.getByRole('button', { name: /nachricht vorlesen/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Sprachausgabe im Header deaktiviert');
  });

  it('renders download safety net banner when completionDownloadUrl is present and message has no download link', () => {
    render(
      <ChatMessage
        message={{
          id: 'msg_done',
          role: 'assistant',
          content: 'Alles erledigt! Vielen Dank.',
          timestamp: Date.now(),
        }}
        completionDownloadUrl="/api/v1/download/sess_1/test.pdf?download=true"
        filename="test.pdf"
      />
    );

    expect(screen.getByTestId('download-fallback-banner')).toBeInTheDocument();
    expect(screen.getByText('[FERTIG]')).toBeInTheDocument();
    expect(screen.getByText('Formular vollständig ausgefüllt')).toBeInTheDocument();
    const downloadLink = screen.getByTestId('download-fallback-link');
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute('href', '/api/v1/download/sess_1/test.pdf?download=true');
    expect(downloadLink).toHaveAttribute('download', 'test.pdf');
  });

  it('does not render safety net banner when message already contains a valid download url', () => {
    render(
      <ChatMessage
        message={{
          id: 'msg_done_with_link',
          role: 'assistant',
          content: 'Alles fertig: [PDF herunterladen](/api/v1/download/sess_1/test.pdf)',
          timestamp: Date.now(),
        }}
        completionDownloadUrl="/api/v1/download/sess_1/test.pdf?download=true"
        filename="test.pdf"
      />
    );

    expect(screen.queryByTestId('download-fallback-banner')).not.toBeInTheDocument();
  });
});

