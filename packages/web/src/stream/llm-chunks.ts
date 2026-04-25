/**
 * Normalised LLM chunk protocol used by `@czap/web`'s streaming
 * pipeline. Every provider (OpenAI, Anthropic, Vercel AI SDK, ...) is
 * translated into this shape by a user-supplied {@link ChunkParser}.
 *
 * @module
 */

/**
 * Discriminated kinds of LLM stream chunk:
 *
 * - `text`: a token or block of model-generated text.
 * - `tool-call-start` / `...-delta` / `...-end`: progressive delivery
 *   of a single tool invocation (partial deltas accumulate arguments).
 * - `done`: terminal sentinel emitted by the provider.
 */
export type LLMChunkType = 'text' | 'tool-call-start' | 'tool-call-delta' | 'tool-call-end' | 'done';

/**
 * One normalised chunk delivered by {@link LLMAdapter}. `partial` flags
 * streaming deltas that will be superseded by a later, finalised chunk.
 */
export interface LLMChunk {
  /** Kind of chunk. */
  readonly type: LLMChunkType;
  /** Whether this chunk is incremental (more is coming). */
  readonly partial: boolean;
  /** Text content (for `text` and tool-call deltas). */
  readonly content?: string;
  /** Tool name for tool-call chunks. */
  readonly toolName?: string;
  /** Parsed tool arguments (populated on `tool-call-end`). */
  readonly toolArgs?: unknown;
}

/**
 * Per-stream scratch state used to accumulate tool-call argument
 * fragments into a single JSON payload at `tool-call-end` time.
 * `null` means "no tool call in flight."
 */
export type ToolCallAccumulator = { name: string; argFragments: string[] } | null;

function parseAccumulatedToolArgs(toolCallBuffer: Exclude<ToolCallAccumulator, null>): unknown {
  const rawArgs = toolCallBuffer.argFragments.join('');

  if (!rawArgs) {
    return undefined;
  }

  try {
    return JSON.parse(rawArgs);
  } catch {
    return rawArgs;
  }
}

function normalize(
  chunk: LLMChunk,
  toolCallBuffer: ToolCallAccumulator,
): {
  readonly chunk: LLMChunk | null;
  readonly toolCallBuffer: ToolCallAccumulator;
} {
  if (chunk.type === 'tool-call-start') {
    return {
      chunk,
      toolCallBuffer: { name: chunk.toolName ?? '', argFragments: [] },
    };
  }

  if (chunk.type === 'tool-call-delta') {
    if (!toolCallBuffer) {
      return {
        chunk,
        toolCallBuffer,
      };
    }

    if (chunk.content) {
      toolCallBuffer.argFragments.push(chunk.content);
    }

    if (chunk.partial) {
      return {
        chunk: null,
        toolCallBuffer,
      };
    }

    return {
      chunk,
      toolCallBuffer,
    };
  }

  if (chunk.type === 'tool-call-end') {
    if (!toolCallBuffer) {
      return { chunk, toolCallBuffer: null };
    }

    return {
      chunk: {
        type: 'tool-call-end' as const,
        partial: false,
        toolName: toolCallBuffer.name,
        toolArgs: parseAccumulatedToolArgs(toolCallBuffer),
      },
      toolCallBuffer: null,
    };
  }

  return {
    chunk,
    toolCallBuffer,
  };
}

/**
 * Pure normalisation helpers for provider-agnostic LLM chunk streams.
 *
 * `normalize` is the state machine that accumulates tool-call deltas
 * into a finalised `tool-call-end` chunk; `parseAccumulatedToolArgs`
 * tries JSON-parsing the concatenated argument fragments and falls
 * back to the raw string on parse failure.
 */
export const LLMChunkNormalization = {
  normalize,
  parseAccumulatedToolArgs,
} as const;
