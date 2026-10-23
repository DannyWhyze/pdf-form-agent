import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStream } from '../src/hooks/useChatStream';
import { ChatMessageData } from '../src/types';

describe('useChatStream', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('handles message streaming and updates messages correctly', async () => {
    const streamData = [
      'data: {"event": "thought", "data": "Analyzing form"}\n\n',
      'data: {"event": "token", "data": "What is your name?"}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockResponse = new Response(new TextEncoder().encode(streamData), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const onPdfUpdated = vi.fn();

    const { result } = renderHook(() =>
      useChatStream('session_123', setMessages as any, onPdfUpdated)
    );

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ thread_id: 'session_123', message: 'Hello', think_enabled: false }),
      })
    );

    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].reasoningContent).toBe('Analyzing form');
    expect(messages[1].content).toBe('What is your name?');
  });

  it('forwards model_name and think_enabled in request payload', async () => {
    const streamData = 'data: {"event": "token", "data": "OK"}\n\ndata: [DONE]\n\n';
    const mockResponse = new Response(new TextEncoder().encode(streamData), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const { result } = renderHook(() =>
      useChatStream('session_123', setMessages as any, undefined, 'llama3.1:8b', true)
    );

    await act(async () => {
      await result.current.sendMessage('Explain');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          thread_id: 'session_123',
          message: 'Explain',
          model_name: 'llama3.1:8b',
          think_enabled: true,
        }),
      })
    );
  });

  it('removes empty assistant placeholder on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const { result } = renderHook(() =>
      useChatStream('session_123', setMessages as any)
    );

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.error).toBe('Network connection failed');
    // Only the user message should remain in messages
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
  });

  it('triggers onPdfUpdated when fill_pdf_form completes', async () => {
    const streamData = [
      'data: {"event": "tool_start", "data": {"id": "call_1", "name": "fill_pdf_form", "args": {}}}\n\n',
      'data: {"event": "tool_end", "data": {"tool_call_id": "call_1", "content": "Done"}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockResponse = new Response(new TextEncoder().encode(streamData), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const onPdfUpdated = vi.fn();

    const { result } = renderHook(() =>
      useChatStream('session_123', setMessages as any, onPdfUpdated)
    );

    await act(async () => {
      await result.current.sendMessage('Fill form');
    });

    expect(onPdfUpdated).toHaveBeenCalledTimes(1);
  });

  it('triggers onProgressUpdated with parsed progress and activePage when fill_pdf_form completes', async () => {
    const payload = JSON.stringify({
      error: false,
      status: 'success',
      total_fields: 15,
      filled_fields: 5,
      active_page: 2,
    });

    const streamData = [
      'data: {"event": "tool_start", "data": {"id": "call_2", "name": "fill_pdf_form", "args": {}}}\n\n',
      `data: {"event": "tool_end", "data": {"tool_call_id": "call_2", "content": ${JSON.stringify(payload)}}}\n\n`,
      'data: [DONE]\n\n',
    ].join('');

    const mockResponse = new Response(new TextEncoder().encode(streamData), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const onPdfUpdated = vi.fn();
    const onProgressUpdated = vi.fn();

    const { result } = renderHook(() =>
      useChatStream(
        'session_123',
        setMessages as any,
        onPdfUpdated,
        undefined,
        false,
        onProgressUpdated
      )
    );

    await act(async () => {
      await result.current.sendMessage('Fill page 2');
    });

    expect(onPdfUpdated).toHaveBeenCalledTimes(1);
    expect(onProgressUpdated).toHaveBeenCalledWith(
      { total: 15, filled: 5 },
      2
    );
  });

  it('clears error when threadId changes (New Session)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const { result, rerender } = renderHook(
      ({ threadId }) => useChatStream(threadId, setMessages as any),
      { initialProps: { threadId: 'session_1' } }
    );

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.error).toBe('Network failure');

    // Simulate New Session
    rerender({ threadId: 'session_2' });

    expect(result.current.error).toBeNull();
  });

  it('handles SSE error chunk and cleans up empty placeholder', async () => {
    const streamData = [
      'data: {"event": "error", "data": "Ollama-Dienst auf Port 11434 nicht erreichbar. Bitte \'ollama serve\' starten."}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockResponse = new Response(new TextEncoder().encode(streamData), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    let messages: ChatMessageData[] = [];
    const setMessages = vi.fn((updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    });

    const { result } = renderHook(() =>
      useChatStream('session_123', setMessages as any)
    );

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.error).toBe(
      "Ollama-Dienst auf Port 11434 nicht erreichbar. Bitte 'ollama serve' starten."
    );
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
  });
});
