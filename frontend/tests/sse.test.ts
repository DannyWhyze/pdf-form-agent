import { describe, it, expect } from 'vitest';
import { parseSSEStream } from '../src/api/sse';

describe('parseSSEStream', () => {
  it('correctly parses thought, token and tool events from stream', async () => {
    const streamData = [
      'data: {"event": "thought", "data": "Processing input"}\n\n',
      'data: {"event": "token", "data": "Hello "}\n\n',
      'data: {"event": "token", "data": "world!"}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockResponse = new Response(new TextEncoder().encode(streamData));
    const events = [];

    for await (const event of parseSSEStream(mockResponse)) {
      events.push(event);
    }

    expect(events).toEqual([
      { event: 'thought', data: 'Processing input' },
      { event: 'token', data: 'Hello ' },
      { event: 'token', data: 'world!' },
    ]);
  });
});
