[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / LLMAdapter

# Variable: LLMAdapter

> `const` **LLMAdapter**: `object`

Defined in: [web/src/stream/llm-adapter.ts:173](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-adapter.ts#L173)

LLM adapter namespace.

Provider-agnostic LLM stream adapter. Normalizes any LLM streaming API
(OpenAI, Anthropic, etc.) into czap's typed chunk buffer via a user-provided
[ChunkParser](../type-aliases/ChunkParser.md). Handles tool-call accumulation, JSON argument parsing,
and produces a convenience `textTokens` stream for feeding into a
token buffer.

## Type Declaration

### collect

> **collect**: (`config`) => readonly [`LLMChunk`](../interfaces/LLMChunk.md)[] = `_collect`

#### Parameters

##### config

###### parser

[`ChunkParser`](../type-aliases/ChunkParser.md)

###### source

`Iterable`\<[`SSEMessage`](../type-aliases/SSEMessage.md)\>

#### Returns

readonly [`LLMChunk`](../interfaces/LLMChunk.md)[]

### create

> **create**: (`config`) => [`LLMAdapterShape`](../interfaces/LLMAdapterShape.md) = `_create`

Create an LLM adapter that normalizes any LLM streaming API into typed
chunk and text-token streams.

The user supplies a [ChunkParser](../type-aliases/ChunkParser.md) function that converts SSE messages
into [LLMChunk](../interfaces/LLMChunk.md) objects. The adapter handles tool-call accumulation,
JSON argument parsing, and text-token extraction.

#### Parameters

##### config

[`LLMStreamConfig`](../interfaces/LLMStreamConfig.md)

Stream source and parser configuration

#### Returns

[`LLMAdapterShape`](../interfaces/LLMAdapterShape.md)

An [LLMAdapterShape](../interfaces/LLMAdapterShape.md) with `chunks` and `textTokens` streams

#### Example

```ts
import { LLMAdapter } from '@czap/web';
import { Stream, Effect } from 'effect';

const adapter = LLMAdapter.create({
  source: sseMessageStream,
  parser: (event) => {
    if (event.type !== 'patch') return null;
    const data = event.data as { type?: string; content?: string };
    if (data.type === 'text' && typeof data.content === 'string') {
      return { type: 'text', partial: false, content: data.content };
    }
    return null;
  },
});
// adapter.textTokens is a Stream<string> of text content
// adapter.chunks is a Stream<LLMChunk> of all parsed chunks
```

## Example

```ts
import { LLMAdapter, SSE } from '@czap/web';
import { Effect, Stream } from 'effect';

const program = Effect.scoped(Effect.gen(function* () {
  const client = yield* SSE.create({ url: '/api/llm/stream' });
  const adapter = LLMAdapter.create({
    source: client.messages,
    parser: (msg) => {
      if (msg.type !== 'patch') return null;
      const data = msg.data as { type?: string; content?: string };
      return data.type === 'text' && typeof data.content === 'string'
        ? { type: 'text', partial: false, content: data.content }
        : null;
    },
  });
  yield* Stream.runForEach(adapter.textTokens, (token) =>
    Effect.sync(() => process.stdout.write(token)),
  );
}));
```
