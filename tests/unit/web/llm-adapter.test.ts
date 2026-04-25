import { describe, expect, test } from 'vitest';
import { Effect, Stream } from 'effect';
import { LLMAdapter, LLMChunkNormalization } from '@czap/web';
import type { LLMChunk } from '@czap/web';

function makeSSEMessage(data: string) {
  return { id: '', event: '', data, retry: undefined };
}

function parseChunk(event: { readonly data: string }): LLMChunk | null {
  try {
    const data = JSON.parse(event.data);
    return {
      type: data.type,
      partial: data.partial ?? false,
      content: data.content,
      toolName: data.toolName,
      toolArgs: data.toolArgs,
    };
  } catch {
    return null;
  }
}

async function collectChunks(events: readonly ReturnType<typeof makeSSEMessage>[]): Promise<readonly LLMChunk[]> {
  const adapter = LLMAdapter.create({
    source: Stream.fromIterable(events),
    parser: parseChunk,
  });

  const collected: LLMChunk[] = [];
  await Effect.runPromise(
    adapter.chunks.pipe(
      Stream.runForEach((chunk) =>
        Effect.sync(() => {
          collected.push(chunk);
        }),
      ),
    ),
  );

  return collected;
}

describe('LLMAdapter', () => {
  test('passes through tool chunks that arrive without an accumulator', async () => {
    const chunks = await collectChunks([
      makeSSEMessage('{"type":"tool-call-delta","content":"{\\"raw\\":true}","partial":false}'),
      makeSSEMessage('{"type":"tool-call-end","toolName":"search","toolArgs":{"query":"direct"}}'),
    ]);

    expect(chunks).toEqual([
      {
        type: 'tool-call-delta',
        partial: false,
        content: '{"raw":true}',
        toolName: undefined,
        toolArgs: undefined,
      },
      {
        type: 'tool-call-end',
        partial: false,
        content: undefined,
        toolName: 'search',
        toolArgs: { query: 'direct' },
      },
    ]);
  });

  test('falls back to raw accumulated args when tool-call JSON is invalid', async () => {
    const chunks = await collectChunks([
      makeSSEMessage('{"type":"tool-call-start","toolName":"search"}'),
      makeSSEMessage('{"type":"tool-call-delta","content":"{\\"query\\":","partial":true}'),
      makeSSEMessage('{"type":"tool-call-delta","content":"oops","partial":false}'),
      makeSSEMessage('{"type":"tool-call-end"}'),
    ]);

    expect(chunks).toEqual([
      {
        type: 'tool-call-start',
        partial: false,
        content: undefined,
        toolName: 'search',
        toolArgs: undefined,
      },
      {
        type: 'tool-call-delta',
        partial: false,
        content: 'oops',
        toolName: undefined,
        toolArgs: undefined,
      },
      {
        type: 'tool-call-end',
        partial: false,
        toolName: 'search',
        toolArgs: '{"query":oops',
      },
    ]);
  });

  test('textTokens continues to emit only text while partial tool deltas stay suppressed', async () => {
    const adapter = LLMAdapter.create({
      source: Stream.fromIterable([
        makeSSEMessage('{"type":"text","content":"Hello"}'),
        makeSSEMessage('{"type":"tool-call-start","toolName":"search"}'),
        makeSSEMessage('{"type":"tool-call-delta","content":"{\\"query\\":","partial":true}'),
        makeSSEMessage('{"type":"text","content":" world"}'),
        makeSSEMessage('{"type":"tool-call-end"}'),
      ]),
      parser: parseChunk,
    });

    const tokens: string[] = [];
    await Effect.runPromise(
      adapter.textTokens.pipe(
        Stream.runForEach((token) =>
          Effect.sync(() => {
            tokens.push(token);
          }),
        ),
      ),
    );

    expect(tokens).toEqual(['Hello', ' world']);
  });

  test('collect drops parser nulls while preserving completed tool-call normalization', () => {
    const chunks = LLMAdapter.collect({
      source: [
        makeSSEMessage('{"type":"text","content":"Hello"}'),
        makeSSEMessage('not-json'),
        makeSSEMessage('{"type":"tool-call-start","toolName":"search"}'),
        makeSSEMessage('{"type":"tool-call-delta","content":"{\\"query\\":","partial":true}'),
        makeSSEMessage('{"type":"tool-call-delta","content":"\\"runtime\\"}","partial":false}'),
        makeSSEMessage('{"type":"tool-call-end"}'),
      ],
      parser: parseChunk,
    });

    expect(chunks).toEqual([
      {
        type: 'text',
        partial: false,
        content: 'Hello',
        toolName: undefined,
        toolArgs: undefined,
      },
      {
        type: 'tool-call-start',
        partial: false,
        content: undefined,
        toolName: 'search',
        toolArgs: undefined,
      },
      {
        type: 'tool-call-delta',
        partial: false,
        content: '"runtime"}',
        toolName: undefined,
        toolArgs: undefined,
      },
      {
        type: 'tool-call-end',
        partial: false,
        toolName: 'search',
        toolArgs: { query: 'runtime' },
      },
    ]);
  });

  test('adapter chunks drop parser nulls before normalization', async () => {
    const chunks = await collectChunks([
      makeSSEMessage('not-json'),
      makeSSEMessage('{"type":"text","content":"kept"}'),
    ]);

    expect(chunks).toEqual([
      {
        type: 'text',
        partial: false,
        content: 'kept',
        toolName: undefined,
        toolArgs: undefined,
      },
    ]);
  });

  test('shared chunk normalization suppresses partial tool deltas until the tool call closes', () => {
    let toolCallBuffer = null;

    const start = LLMChunkNormalization.normalize(
      { type: 'tool-call-start', partial: false, toolName: 'search' },
      toolCallBuffer,
    );
    toolCallBuffer = start.toolCallBuffer;

    const partialDelta = LLMChunkNormalization.normalize(
      { type: 'tool-call-delta', partial: true, content: '{"query":' },
      toolCallBuffer,
    );
    toolCallBuffer = partialDelta.toolCallBuffer;

    const finalDelta = LLMChunkNormalization.normalize(
      { type: 'tool-call-delta', partial: false, content: '"czap"}' },
      toolCallBuffer,
    );
    toolCallBuffer = finalDelta.toolCallBuffer;

    const end = LLMChunkNormalization.normalize(
      { type: 'tool-call-end', partial: false },
      toolCallBuffer,
    );

    expect(start.chunk).toEqual({
      type: 'tool-call-start',
      partial: false,
      toolName: 'search',
    });
    expect(partialDelta.chunk).toBeNull();
    expect(finalDelta.chunk).toEqual({
      type: 'tool-call-delta',
      partial: false,
      content: '"czap"}',
    });
    expect(end.chunk).toEqual({
      type: 'tool-call-end',
      partial: false,
      toolName: 'search',
      toolArgs: { query: 'czap' },
    });
    expect(end.toolCallBuffer).toBeNull();
  });

  test('shared chunk normalization passes through tool-call-end events when no accumulator exists', () => {
    const normalized = LLMChunkNormalization.normalize(
      {
        type: 'tool-call-end',
        partial: false,
        toolName: 'search',
        toolArgs: { query: 'direct' },
      },
      null,
    );

    expect(normalized.chunk).toEqual({
      type: 'tool-call-end',
      partial: false,
      toolName: 'search',
      toolArgs: { query: 'direct' },
    });
    expect(normalized.toolCallBuffer).toBeNull();
  });

  test('shared chunk normalization defaults missing tool names and preserves empty arg buffers', () => {
    expect(LLMChunkNormalization.parseAccumulatedToolArgs({ name: 'search', argFragments: [] })).toBeUndefined();

    const started = LLMChunkNormalization.normalize(
      {
        type: 'tool-call-start',
        partial: false,
      },
      null,
    );

    expect(started.toolCallBuffer).toEqual({ name: '', argFragments: [] });

    const delta = LLMChunkNormalization.normalize(
      {
        type: 'tool-call-delta',
        partial: false,
      },
      started.toolCallBuffer,
    );

    expect(delta.chunk).toEqual({
      type: 'tool-call-delta',
      partial: false,
    });
    expect(delta.toolCallBuffer).toEqual({ name: '', argFragments: [] });

    const ended = LLMChunkNormalization.normalize(
      {
        type: 'tool-call-end',
        partial: false,
      },
      delta.toolCallBuffer,
    );

    expect(ended.chunk).toEqual({
      type: 'tool-call-end',
      partial: false,
      toolName: '',
      toolArgs: undefined,
    });
    expect(ended.toolCallBuffer).toBeNull();
  });
});
