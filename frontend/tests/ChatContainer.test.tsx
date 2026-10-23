import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatContainer } from '../src/components/Chat/ChatContainer';
import { ChatMessageData } from '../src/types';

describe('ChatContainer', () => {
  it('renders empty state when there are no messages', () => {
    render(<ChatContainer messages={[]} isStreaming={false} />);
    expect(screen.getByText('Bereit zum Ausfüllen')).toBeInTheDocument();
    expect(screen.getByText(/Lade oben ein PDF-Formular hoch/)).toBeInTheDocument();
  });

  it('renders messages and invokes scroll on update', () => {
    const messages: ChatMessageData[] = [
      {
        id: '1',
        role: 'user',
        content: 'Hello agent',
        timestamp: 1000,
      },
      {
        id: '2',
        role: 'assistant',
        content: 'Hello! How can I help with your form?',
        timestamp: 2000,
      },
    ];

    render(<ChatContainer messages={messages} isStreaming={false} />);
    expect(screen.getByText('Hello agent')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help with your form?')).toBeInTheDocument();
  });

  it('passes completion download URL to the last assistant message when form is 100% complete', () => {
    const messages: ChatMessageData[] = [
      {
        id: '1',
        role: 'user',
        content: 'Ich heiße Max',
        timestamp: 1000,
      },
      {
        id: '2',
        role: 'assistant',
        content: 'Das Formular ist nun komplett ausgefüllt.',
        timestamp: 2000,
      },
    ];

    render(
      <ChatContainer
        messages={messages}
        isStreaming={false}
        formProgress={{ filled: 6, total: 6 }}
        activeFilename="test_form_3.pdf"
        threadId="session_test_123"
      />
    );

    expect(screen.getByTestId('download-fallback-banner')).toBeInTheDocument();
    expect(screen.getByTestId('download-fallback-link')).toHaveAttribute(
      'href',
      '/api/v1/download/session_test_123/test_form_3.pdf?download=true'
    );
  });
});

