/**
 * `@czap/web` -- DOM runtime for the czap framework.
 *
 * This package stitches the compiled czap outputs into a live browser
 * document. It ships:
 *
 * - {@link Morph}: idiomorph-style DOM diffing that preserves focus,
 *   scroll, and form state across re-renders.
 * - {@link SlotRegistry} / {@link SlotAddressing}: stable addressing
 *   for server-rendered slots in streaming HTML.
 * - {@link SSE} / {@link Resumption}: an Effect-scoped Server-Sent
 *   Events client with reconnect and cross-tab resumption.
 * - {@link LLMAdapter} and {@link LLMChunkNormalization}: normalization
 *   of streaming LLM chunk formats (OpenAI / Anthropic / AI SDK).
 * - {@link Physical}: DOM state capture and restore for hot reloads.
 * - `WebCodecs` / `Mediabunny` capture helpers for client-side recording.
 * - `createAudioProcessor` for AudioWorklet-based real-time audio graphs.
 *
 * @module
 */

// Types
export type {
  SlotPath,
  IslandMode,
  SlotEntry,
  PhysicalState,
  FocusState,
  ScrollPosition,
  SelectionState,
  IMEState,
  MorphHints,
  MorphConfig,
  MorphCallbacks,
  MorphResult,
  MorphRejection,
  SSEState,
  SSEConfig,
  ReconnectConfig,
  BackpressureHint,
  SSEMessage,
  ResumptionConfig,
  ResumptionState,
  ResumeResponse,
  MatchPriority,
  MatchResult,
  HtmlPolicy,
  RuntimeEndpointKind,
  RuntimeEndpointPolicy,
} from './types.js';

// Morph
export { Morph } from './morph/diff.js';
export { SemanticId } from './morph/semantic-id.js';
export { Hints } from './morph/hints.js';
export { createHtmlFragment, resolveHtmlString, sanitizeHTML } from './security/html-trust.js';
export { isPrivateOrReservedIP, resolveRuntimeUrl } from './security/runtime-url.js';
export type { RuntimeUrlResolution } from './security/runtime-url.js';

// Slot
export { SlotRegistry } from './slot/registry.js';
export type { SlotRegistryShape } from './slot/registry.js';
export { SlotAddressing } from './slot/addressing.js';

// Stream
export type { SSEClient } from './stream/sse.js';
export { SSE } from './stream/sse.js';
export { Resumption } from './stream/resumption.js';

// Physical State
import { capture } from './physical/capture.js';
import { restore } from './physical/restore.js';

/**
 * Physical DOM-state helpers for save/restore across morphs and hot
 * reloads. Captures focus, selection, scroll, and IME composition so a
 * subsequent {@link Morph.morph} preserves them.
 */
export const Physical = {
  /** Snapshot focus/selection/scroll state on the document. */
  capture,
  /** Re-apply a snapshot produced by {@link Physical.capture}. */
  restore,
} as const;

// Capture
export { WebCodecsCapture, renderToCanvas, captureVideo } from './capture/index.js';
export type { WebCodecsCaptureOptions, RenderFn } from './capture/index.js';

// LLM Adapter
export { LLMAdapter } from './stream/llm-adapter.js';
export type { LLMChunk, LLMChunkType, ChunkParser, LLMStreamConfig, LLMAdapterShape } from './stream/llm-adapter.js';
export { LLMChunkNormalization } from './stream/llm-chunks.js';
export type { ToolCallAccumulator } from './stream/llm-chunks.js';

// Audio Processor
export { createAudioProcessor } from './audio/processor.js';
export type { AudioProcessor } from './audio/processor.js';

// Capsules
export { streamReceiptCapsule } from './capsules/stream-receipt.js';
