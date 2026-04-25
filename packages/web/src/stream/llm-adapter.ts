/**
 * LLM Adapter -- provider-agnostic LLM stream adapter.
 *
 * Thin adapter that normalizes any LLM streaming API into czap's
 * token buffer. Pure plumbing, model-blind.
 *
 * The user provides a ChunkParser function. czap handles everything
 * downstream: buffering, quality adaptation, frame scheduling,
 * DOM application, receipt tracking.
 *
 * @module
 */

import { Effect, Stream } from 'effect';
import type { SSEMessage } from '../types.js';
import { LLMChunkNormalization, type LLMChunk, type ToolCallAccumulator } from './llm-chunks.js';
export type { LLMChunk, LLMChunkType } from './llm-chunks.js';

// ---------------------------------------------------------------------------
// Chunk parser (user-provided)
// ---------------------------------------------------------------------------

/**
 * User-provided function that converts a raw SSE message into an
 * {@link LLMChunk} (or `null` to drop it). The adapter calls this
 * exactly once per incoming message.
 */
export type ChunkParser = (event: SSEMessage) => LLMChunk | null;

// ---------------------------------------------------------------------------
// LLM stream config
// ---------------------------------------------------------------------------

/**
 * Configuration accepted by {@link LLMAdapter.create}.
 *
 * `source` is typically the `messages` stream of an {@link SSE} client,
 * but any `Stream.Stream<SSEMessage>` will do -- including mock streams
 * in tests.
 */
export interface LLMStreamConfig {
  /** Stream of parsed SSE messages. */
  readonly source: Stream.Stream<SSEMessage>;
  /** Parser mapping SSE messages to typed LLM chunks. */
  readonly parser: ChunkParser;
}

// ---------------------------------------------------------------------------
// LLM adapter
// ---------------------------------------------------------------------------

/**
 * Host-facing surface of an LLM adapter. Exposes both the typed
 * {@link LLMChunk} stream and the decoded text-token stream derived
 * from it. Returned by {@link LLMAdapter.create}.
 */
export interface LLMAdapterShape {
  readonly chunks: Stream.Stream<LLMChunk>;
  readonly textTokens: Stream.Stream<string>;
}

/**
 * Create an LLM adapter that normalizes any LLM streaming API into typed
 * chunk and text-token streams.
 *
 * The user supplies a {@link ChunkParser} function that converts SSE messages
 * into {@link LLMChunk} objects. The adapter handles tool-call accumulation,
 * JSON argument parsing, and text-token extraction.
 *
 * @example
 * ```ts
 * import { LLMAdapter } from '@czap/web';
 * import { Stream, Effect } from 'effect';
 *
 * const adapter = LLMAdapter.create({
 *   source: sseMessageStream,
 *   parser: (event) => {
 *     if (event.type !== 'patch') return null;
 *     const data = event.data as { type?: string; content?: string };
 *     if (data.type === 'text' && typeof data.content === 'string') {
 *       return { type: 'text', partial: false, content: data.content };
 *     }
 *     return null;
 *   },
 * });
 * // adapter.textTokens is a Stream<string> of text content
 * // adapter.chunks is a Stream<LLMChunk> of all parsed chunks
 * ```
 *
 * @param config - Stream source and parser configuration
 * @returns An {@link LLMAdapterShape} with `chunks` and `textTokens` streams
 */
function _create(config: LLMStreamConfig): LLMAdapterShape {
  let toolCallBuffer: ToolCallAccumulator = null;

  const chunks: Stream.Stream<LLMChunk> = config.source.pipe(
    Stream.mapEffect((event) =>
      Effect.sync(() => {
        const chunk = config.parser(event);
        if (!chunk) return null;
        const normalized = LLMChunkNormalization.normalize(chunk, toolCallBuffer);
        toolCallBuffer = normalized.toolCallBuffer;
        return normalized.chunk;
      }),
    ),
    Stream.filter((chunk): chunk is LLMChunk => chunk !== null),
  );

  // Convenience stream of just text tokens (for feeding into TokenBuffer)
  const textTokens: Stream.Stream<string> = chunks.pipe(
    Stream.filter((chunk) => chunk.type === 'text' && chunk.content !== undefined),
    Stream.map((chunk) => chunk.content!),
  );

  return { chunks, textTokens };
}

function _collect(config: {
  readonly source: Iterable<SSEMessage>;
  readonly parser: ChunkParser;
}): readonly LLMChunk[] {
  const chunks: LLMChunk[] = [];
  let toolCallBuffer: ToolCallAccumulator = null;

  for (const event of config.source) {
    const parsed = config.parser(event);
    if (!parsed) {
      continue;
    }

    const normalized = LLMChunkNormalization.normalize(parsed, toolCallBuffer);
    toolCallBuffer = normalized.toolCallBuffer;
    if (normalized.chunk) {
      chunks.push(normalized.chunk);
    }
  }

  return chunks;
}

/**
 * LLM adapter namespace.
 *
 * Provider-agnostic LLM stream adapter. Normalizes any LLM streaming API
 * (OpenAI, Anthropic, etc.) into czap's typed chunk buffer via a user-provided
 * {@link ChunkParser}. Handles tool-call accumulation, JSON argument parsing,
 * and produces a convenience `textTokens` stream for feeding into a
 * token buffer.
 *
 * @example
 * ```ts
 * import { LLMAdapter, SSE } from '@czap/web';
 * import { Effect, Stream } from 'effect';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const client = yield* SSE.create({ url: '/api/llm/stream' });
 *   const adapter = LLMAdapter.create({
 *     source: client.messages,
 *     parser: (msg) => {
 *       if (msg.type !== 'patch') return null;
 *       const data = msg.data as { type?: string; content?: string };
 *       return data.type === 'text' && typeof data.content === 'string'
 *         ? { type: 'text', partial: false, content: data.content }
 *         : null;
 *     },
 *   });
 *   yield* Stream.runForEach(adapter.textTokens, (token) =>
 *     Effect.sync(() => process.stdout.write(token)),
 *   );
 * }));
 * ```
 */
export const LLMAdapter = { create: _create, collect: _collect };

export declare namespace LLMAdapter {
  /** Public adapter surface (`chunks` + `textTokens`). */
  export type Shape = LLMAdapterShape;
  /** Adapter config type alias. */
  export type Config = LLMStreamConfig;
  /** Normalized LLM chunk type alias. */
  export type Chunk = LLMChunk;
  /** User-provided chunk-parser function. */
  export type Parser = ChunkParser;
}
