[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [web/src](../../README.md) / LLMAdapter

# LLMAdapter

LLM adapter namespace.

Provider-agnostic LLM stream adapter. Normalizes any LLM streaming API
(OpenAI, Anthropic, etc.) into czap's typed chunk buffer via a user-provided
[ChunkParser](../../type-aliases/ChunkParser.md). Handles tool-call accumulation, JSON argument parsing,
and produces a convenience `textTokens` stream for feeding into a
token buffer.

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

## Type Aliases

- [Chunk](type-aliases/Chunk.md)
- [Config](type-aliases/Config.md)
- [Parser](type-aliases/Parser.md)
- [Shape](type-aliases/Shape.md)
