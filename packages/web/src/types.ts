/**
 * `@czap/web` -- Core Web Types
 *
 * DOM runtime type definitions for slot addressing, island modes,
 * physical state capture/restore, morph configuration, SSE streaming,
 * and resumption protocol.
 *
 * @module
 */

import type { Millis } from '@czap/core';

// =============================================================================
// Slot Types
// =============================================================================

/**
 * Slot path is a forward-slash prefixed branded path string.
 * Used to address regions within the DOM.
 */
export type SlotPath = `/${string}` & { readonly _brand: 'SlotPath' };

/**
 * Brand an already-validated slot path string.
 *
 * Sanctioned single-site cast for `SlotPath`. Callers that have externally
 * validated the shape (e.g. via `SlotAddressing.isValid`, attribute provenance,
 * or a literal `/...` template) should use this helper instead of inline-casting.
 */
export const SlotPath = (value: string): SlotPath => value as SlotPath;

/**
 * Island modes -- determines how much JavaScript runs for the island.
 */
export type IslandMode = 'static' | 'partial' | 'rich' | 'gpu';

/**
 * Slot registry entry -- maps a slot path to its DOM element.
 */
export interface SlotEntry {
  readonly path: SlotPath;
  readonly element: Element;
  readonly mode: IslandMode;
  readonly mounted: boolean;
}

// =============================================================================
// Physical State Types
// =============================================================================

/**
 * Physical state captures DOM state that should survive morphing.
 */
export interface PhysicalState {
  readonly activeElementPath: string | null;
  readonly focusState: FocusState | null;
  readonly scrollPositions: Record<string, ScrollPosition>;
  readonly selection: SelectionState | null;
  readonly ime: IMEState | null;
}

/**
 * Focus state with cursor and selection details for input elements.
 */
export interface FocusState {
  readonly elementId: string;
  readonly cursorPosition: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly selectionDirection: string;
}

/**
 * Scroll position for an element.
 */
export interface ScrollPosition {
  readonly top: number;
  readonly left: number;
}

/**
 * Text selection state.
 */
export interface SelectionState {
  readonly elementPath: string;
  readonly start: number;
  readonly end: number;
  readonly direction: string;
}

/**
 * IME (Input Method Editor) composition state.
 */
export interface IMEState {
  readonly elementPath: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

// =============================================================================
// Morph Types
// =============================================================================

/**
 * Morph hints for fine-grained DOM diffing control.
 */
export interface MorphHints {
  readonly preserveIds?: readonly string[];
  readonly semanticIds?: readonly string[];
  readonly idMap?: ReadonlyMap<string, string>;
  readonly preserveFocus?: readonly string[];
  readonly preserveScroll?: readonly string[];
  readonly preserve?: readonly string[];
  readonly remap?: Record<string, string>;
}

/**
 * Morph configuration.
 */
export interface MorphConfig {
  readonly preserveFocus: boolean;
  readonly preserveScroll: boolean;
  readonly preserveSelection: boolean;
  readonly morphStyle: 'innerHTML' | 'outerHTML';
  readonly callbacks?: MorphCallbacks;
}

/**
 * Morph lifecycle callbacks.
 */
export interface MorphCallbacks {
  beforeRemove?(node: Node): boolean;
  afterAdd?(node: Node): void;
  beforeAttributeUpdate?(element: Element, name: string, value: string | null): boolean;
}

/**
 * Result of a morph operation.
 */
export type MorphResult =
  | { readonly type: 'success' }
  | { readonly type: 'rejected'; readonly rejection: MorphRejection };

/**
 * Morph rejection when preserve constraints are violated.
 */
export interface MorphRejection {
  readonly type: string;
  readonly missingIds?: readonly string[];
  readonly slot?: SlotPath;
  readonly reason: string;
}

// =============================================================================
// Trust / Runtime Policy Types
// =============================================================================

/**
 * Trust level a slot applies to string content injected into it.
 *
 * - `text`: always inserted via `textContent` (never parsed as HTML).
 * - `sanitized-html`: parsed and then passed through the project's
 *   sanitizer (`sanitizeHTML`).
 * - `trusted-html`: caller has proven the HTML is trusted (e.g. it came
 *   from a compiled template or a Trusted Types policy).
 */
export type HtmlPolicy = 'text' | 'sanitized-html' | 'trusted-html';

/**
 * Category of remote runtime endpoint. Used by
 * {@link RuntimeEndpointPolicy} to narrow the allowlist per feature.
 */
export type RuntimeEndpointKind = 'stream' | 'snapshot' | 'replay' | 'llm' | 'gpu-shader' | 'wasm';

/**
 * Host-provided policy that governs which origins the runtime may talk
 * to. `same-origin` is the default; `allowlist` consults
 * `allowOrigins` plus any per-kind overrides in `byKind`.
 */
export interface RuntimeEndpointPolicy {
  /** Enforcement mode. */
  readonly mode: 'same-origin' | 'allowlist';
  /** Allowed origins when `mode` is `allowlist`. */
  readonly allowOrigins?: readonly string[];
  /** Optional per-endpoint-kind override allowlists. */
  readonly byKind?: Partial<Record<RuntimeEndpointKind, readonly string[]>>;
}

// =============================================================================
// SSE Types
// =============================================================================

/**
 * SSE connection state.
 */
export type SSEState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

/**
 * SSE client configuration.
 */
export interface SSEConfig {
  readonly url: string;
  readonly artifactId?: string;
  readonly lastEventId?: string;
  readonly reconnect?: ReconnectConfig;
  readonly heartbeatInterval?: Millis;
}

/**
 * Reconnection configuration.
 */
export interface ReconnectConfig {
  readonly maxAttempts: number;
  readonly initialDelay: Millis;
  readonly maxDelay: Millis;
  readonly factor: number;
}

/**
 * Backpressure hint emitted when SSE buffer fills.
 */
export interface BackpressureHint {
  readonly bufferSize: number;
  readonly maxBufferSize: number;
  readonly percentFull: number;
  readonly dropping: boolean;
}

/**
 * SSE message types received from server.
 */
export type SSEMessage =
  | { readonly type: 'patch'; readonly data: unknown }
  | { readonly type: 'batch'; readonly data: unknown }
  | { readonly type: 'signal'; readonly data: unknown }
  | { readonly type: 'receipt'; readonly data: unknown }
  | { readonly type: 'heartbeat' }
  | { readonly type: 'snapshot'; readonly data: unknown };

// =============================================================================
// Resumption Types
// =============================================================================

/**
 * Resumption configuration for gap detection and recovery.
 */
export interface ResumptionConfig {
  readonly maxGapSize: number;
  readonly snapshotUrl?: string;
  readonly replayUrl?: string;
  readonly timeout?: Millis;
  readonly endpointPolicy?: RuntimeEndpointPolicy;
}

/**
 * Resumption state stored in sessionStorage.
 */
export interface ResumptionState {
  readonly lastEventId: string;
  readonly lastSequence: number;
  readonly artifactId: string;
  readonly timestamp: number;
}

/**
 * Resume response from the server.
 */
export type ResumeResponse =
  | { readonly type: 'replay'; readonly patches: readonly unknown[] }
  | { readonly type: 'snapshot'; readonly html: string; readonly signals: unknown; readonly lastEventId: string };

// =============================================================================
// Semantic ID Types
// =============================================================================

/**
 * Match priority levels for node comparison.
 */
export type MatchPriority = 'semantic' | 'dom-id' | 'structural' | 'none';

/**
 * Result of matching two nodes.
 */
export interface MatchResult {
  readonly matches: boolean;
  readonly priority: MatchPriority;
  readonly matchedId?: string;
}
