import { useState, useRef, useCallback, useEffect } from 'react';
import { ChatMessageData, FormProgress } from '../types';
import { parseSSEStream } from '../api/sse';

export function useChatStream(
  threadId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>,
  onPdfUpdated?: () => void,
  selectedModel?: string,
  thinkEnabled: boolean = false,
  onProgressUpdated?: (progress: FormProgress, activePage?: number) => void
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setError(null);
  }, [threadId]);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || isStreaming) return;

    setError(null);
    setIsStreaming(true);

    const userMessage: ChatMessageData = {
      id: 'msg_' + Date.now() + '_user',
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };

    const assistantMessageId = 'msg_' + (Date.now() + 1) + '_assistant';
    const assistantMessage: ChatMessageData = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      reasoningContent: '',
      toolCalls: [],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          message: userText,
          model_name: selectedModel || undefined,
          think_enabled: thinkEnabled,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat API error (${response.status}): ${await response.text()}`);
      }

      const toolNameMap = new Map<string, string>();
      let lastRunningToolName = '';

      for await (const chunk of parseSSEStream(response)) {
        if (chunk.event === 'error') {
          const errMsg = typeof chunk.data === 'string' ? chunk.data : 'Fehler bei der Kommunikation mit dem KI-Modell';
          setError(errMsg);
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                msg.id !== assistantMessageId ||
                Boolean(msg.content) ||
                Boolean(msg.reasoningContent) ||
                Boolean(msg.toolCalls && msg.toolCalls.length > 0)
            )
          );
          break;
        }

        if (chunk.event === 'tool_start' && typeof chunk.data === 'object' && chunk.data !== null) {
          const toolData = chunk.data as { id?: string; name?: string; args?: Record<string, unknown> };
          if (toolData.id && toolData.name) {
            toolNameMap.set(toolData.id, toolData.name);
          }
          if (toolData.name) {
            lastRunningToolName = toolData.name;
          }
        }

        // Handle side-effects cleanly in the loop (outside state updater!)
        if (chunk.event === 'tool_end' && typeof chunk.data === 'object' && chunk.data !== null) {
          const endData = chunk.data as { tool_call_id?: string; content?: string };
          const toolName = endData.tool_call_id ? toolNameMap.get(endData.tool_call_id) : lastRunningToolName;
          
          // Only bump PDF version and update progress if form filling tool completed
          if (toolName === 'fill_pdf_form') {
            if (onPdfUpdated) {
              onPdfUpdated();
            }
            if (onProgressUpdated && endData.content) {
              try {
                const parsed = JSON.parse(endData.content);
                if (typeof parsed.total_fields === 'number' && typeof parsed.filled_fields === 'number') {
                  onProgressUpdated(
                    { total: parsed.total_fields, filled: parsed.filled_fields },
                    typeof parsed.active_page === 'number' ? parsed.active_page : undefined
                  );
                }
              } catch {
                // Ignore parse errors from mock/non-json content
              }
            }
          }
        }

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg;

            if (chunk.event === 'thought' && typeof chunk.data === 'string') {
              return {
                ...msg,
                reasoningContent: (msg.reasoningContent || '') + chunk.data,
              };
            }

            if (chunk.event === 'token' && typeof chunk.data === 'string') {
              return {
                ...msg,
                content: msg.content + chunk.data,
              };
            }

            if (chunk.event === 'tool_start' && typeof chunk.data === 'object' && chunk.data !== null) {
              const toolData = chunk.data as { id?: string; name?: string; args?: Record<string, unknown> };
              return {
                ...msg,
                toolCalls: [
                  ...(msg.toolCalls || []),
                  {
                    id: toolData.id,
                    name: toolData.name || 'tool',
                    args: toolData.args,
                    status: 'running',
                  },
                ],
              };
            }

            if (chunk.event === 'tool_end' && typeof chunk.data === 'object' && chunk.data !== null) {
              const endData = chunk.data as { tool_call_id?: string; content?: string };
              const updatedCalls = [...(msg.toolCalls || [])];
              
              // Target by tool_call_id or last running call
              let targetIdx = -1;
              if (endData.tool_call_id) {
                targetIdx = updatedCalls.findIndex((tc) => tc.id === endData.tool_call_id);
              }
              if (targetIdx === -1) {
                for (let i = updatedCalls.length - 1; i >= 0; i--) {
                  if (updatedCalls[i].status === 'running') {
                    targetIdx = i;
                    break;
                  }
                }
              }

              if (targetIdx !== -1) {
                updatedCalls[targetIdx] = {
                  ...updatedCalls[targetIdx],
                  status: 'completed',
                  result: endData.content,
                };
              }

              return {
                ...msg,
                toolCalls: updatedCalls,
              };
            }

            return msg;
          })
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User aborted intentionally
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Unknown streaming error';
        setError(errorMsg);
      }

      // Remove empty assistant placeholder if no content/thoughts/tools were received
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== assistantMessageId ||
            Boolean(msg.content) ||
            Boolean(msg.reasoningContent) ||
            Boolean(msg.toolCalls && msg.toolCalls.length > 0)
        )
      );
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [threadId, isStreaming, setMessages, onPdfUpdated, selectedModel, thinkEnabled]);

  return {
    isStreaming,
    error,
    sendMessage,
    stopStream,
  };
}
