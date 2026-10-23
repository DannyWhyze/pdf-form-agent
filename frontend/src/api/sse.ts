import { SSEEventChunk } from '../types';

export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEventChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable.');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataContent = trimmed.slice(5).trim();
        if (dataContent === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(dataContent) as SSEEventChunk;
          yield parsed;
        } catch {
          // Ignore malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
