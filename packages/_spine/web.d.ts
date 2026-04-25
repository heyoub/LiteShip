/**
 * @czap/web type spine -- DOM runtime (morph, slots, SSE, physical state).
 * Salvaged from @kit/web, rebranded data-kit-* -> data-czap-*.
 */

import type { Effect, Stream, Scope } from 'effect';

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. CORE WEB TYPES (from @kit/web/types.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export type SlotPath = `/${string}` & { readonly _brand: 'SlotPath' };
export type IslandMode = 'static' | 'partial' | 'rich' | 'gpu';

export interface SlotEntry {
  readonly path: SlotPath;
  readonly element: Element;
  readonly mode: IslandMode;
  readonly mounted: boolean;
}

export interface PhysicalState {
  readonly activeElementPath: string | null;
  readonly focusState: FocusState | null;
  readonly scrollPositions: Record<string, ScrollPosition>;
  readonly selection: SelectionState | null;
  readonly ime: IMEState | null;
}

export interface FocusState {
  readonly elementId: string;
  readonly cursorPosition: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly selectionDirection: string;
}

export interface ScrollPosition {
  readonly top: number;
  readonly left: number;
}

export interface SelectionState {
  readonly elementPath: string;
  readonly start: number;
  readonly end: number;
  readonly direction: string;
}

export interface IMEState {
  readonly elementPath: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. MORPH (idiomorph-style DOM diffing)
// ═══════════════════════════════════════════════════════════════════════════════

export interface MorphHints {
  readonly preserveIds?: readonly string[];
  readonly semanticIds?: readonly string[];
  readonly idMap?: ReadonlyMap<string, string>;
  readonly preserveFocus?: readonly string[];
  readonly preserveScroll?: readonly string[];
  readonly preserve?: readonly string[];
  readonly remap?: Record<string, string>;
}

export interface MorphConfig {
  readonly preserveFocus: boolean;
  readonly preserveScroll: boolean;
  readonly preserveSelection: boolean;
  readonly morphStyle: 'innerHTML' | 'outerHTML';
  readonly callbacks?: MorphCallbacks;
}

export interface MorphCallbacks {
  beforeRemove?(node: Node): boolean;
  afterAdd?(node: Node): void;
  beforeAttributeUpdate?(element: Element, name: string, value: string | null): boolean;
}

export type MorphResult =
  | { readonly type: 'success' }
  | { readonly type: 'rejected'; readonly rejection: MorphRejection };

export interface MorphRejection {
  readonly type: string;
  readonly missingIds?: readonly string[];
  readonly slot?: SlotPath;
  readonly reason: string;
}

export declare const Morph: {
  morph(oldNode: Element, newHTML: string, config?: Partial<MorphConfig>, hints?: MorphHints): Effect.Effect<void>;
  morphWithState(
    oldNode: Element,
    newHTML: string,
    config?: Partial<MorphConfig>,
    hints?: MorphHints,
  ): Effect.Effect<MorphResult>;
  parseHTML(html: string): DocumentFragment;
  readonly defaultConfig: MorphConfig;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. SEMANTIC ID
// ═══════════════════════════════════════════════════════════════════════════════

export type MatchPriority = 'semantic' | 'dom-id' | 'structural' | 'none';

export interface MatchResult {
  readonly matches: boolean;
  readonly priority: MatchPriority;
  readonly matchedId?: string;
}

export declare const SemanticId: {
  readonly ATTR: string;
  get(element: Element): string | null;
  set(element: Element, id: string): void;
  matches(a: Element, b: Element): boolean;
  generate(element: Element, index: number): string;
  buildIndex(root: Element): Map<string, Element>;
  find(root: Element, id: string): Element | null;
  matchNodes(oldNode: Element, newNode: Element): MatchResult;
  findBestMatch(target: Element, candidates: Element[]): { element: Element; result: MatchResult } | null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. MORPH HINTS
// ═══════════════════════════════════════════════════════════════════════════════

export declare const Hints: {
  empty(): MorphHints;
  preserveIds(...ids: string[]): MorphHints;
  withSemanticIds(...ids: string[]): MorphHints;
  withIdMap(map: Map<string, string>): MorphHints;
  preserveFocus(...selectors: string[]): MorphHints;
  preserveScroll(...selectors: string[]): MorphHints;
  merge(...hints: MorphHints[]): MorphHints;
  fromElement(element: Element): MorphHints;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 5. SLOT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export interface SlotRegistryShape {
  get(path: SlotPath): SlotEntry | undefined;
  register(entry: SlotEntry): void;
  unregister(path: SlotPath): void;
  has(path: SlotPath): boolean;
  entries(): ReadonlyMap<SlotPath, SlotEntry>;
  findByPrefix(prefix: SlotPath): readonly SlotEntry[];
}

export declare const SlotRegistry: {
  create(): SlotRegistryShape;
  scanDOM(registry: SlotRegistryShape, root: Element, defaultMode?: IslandMode): void;
  observe(registry: SlotRegistryShape, root: Element): Effect.Effect<void, never, Scope>;
  findElement(path: SlotPath): Element | null;
  getPath(element: Element): SlotPath | null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 6. SLOT ADDRESSING
// ═══════════════════════════════════════════════════════════════════════════════

export declare const SlotAddressing: {
  parse(path: string): SlotPath;
  isValid(path: string): path is SlotPath;
  toSelector(path: SlotPath): string;
  parent(path: SlotPath): SlotPath | null;
  ancestors(path: SlotPath): readonly SlotPath[];
  isDescendant(path: SlotPath, ancestor: SlotPath): boolean;
  join(base: SlotPath, ...segments: string[]): SlotPath;
  basename(path: SlotPath): string;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 7. SSE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

export type SSEState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface SSEConfig {
  readonly url: string;
  readonly artifactId?: string;
  readonly lastEventId?: string;
  readonly reconnect?: ReconnectConfig;
  readonly heartbeatInterval?: number;
}

export interface ReconnectConfig {
  readonly maxAttempts: number;
  readonly initialDelay: number;
  readonly maxDelay: number;
  readonly factor: number;
}

export interface BackpressureHint {
  readonly bufferSize: number;
  readonly maxBufferSize: number;
  readonly percentFull: number;
  readonly dropping: boolean;
}

export interface SSEClient {
  readonly messages: Stream.Stream<SSEMessage>;
  readonly state: Effect.Effect<SSEState>;
  close(): Effect.Effect<void>;
  reconnect(): Effect.Effect<void>;
  readonly lastEventId: Effect.Effect<string | null>;
  readonly backpressure: Effect.Effect<BackpressureHint>;
}

export type SSEMessage =
  | { readonly type: 'patch'; readonly data: unknown }
  | { readonly type: 'batch'; readonly data: unknown }
  | { readonly type: 'signal'; readonly data: unknown }
  | { readonly type: 'receipt'; readonly data: unknown }
  | { readonly type: 'heartbeat' }
  | { readonly type: 'snapshot'; readonly data: unknown };

export declare const SSE: {
  create(config: SSEConfig): Effect.Effect<SSEClient, never, Scope.Scope>;
  parseMessage(event: MessageEvent): SSEMessage | null;
  calculateDelay(attempt: number, config: ReconnectConfig): number;
  buildUrl(baseUrl: string, artifactId?: string, lastEventId?: string): string;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 8. RESUMPTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResumptionConfig {
  readonly maxGapSize: number;
  readonly snapshotUrl?: string;
  readonly replayUrl?: string;
  readonly timeout?: number;
}

export interface ResumptionState {
  readonly lastEventId: string;
  readonly lastSequence: number;
  readonly artifactId: string;
  readonly timestamp: number;
}

export type ResumeResponse =
  | { readonly type: 'replay'; readonly patches: readonly unknown[] }
  | { readonly type: 'snapshot'; readonly html: string; readonly signals: unknown; readonly lastEventId: string };

export declare const Resumption: {
  saveState(state: ResumptionState): Effect.Effect<void>;
  loadState(artifactId: string): Effect.Effect<ResumptionState | null>;
  clearState(artifactId: string): Effect.Effect<void>;
  canResume(lastEventId: string, serverOldestId: string): boolean;
  resume(
    artifactId: string,
    currentEventId: string,
    config?: Partial<ResumptionConfig>,
  ): Effect.Effect<ResumeResponse, Error>;
  parseEventId(eventId: string): { raw: string; sequence: number; timestamp?: number; nodeId?: string };
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 9. PHYSICAL STATE (capture + restore)
// ═══════════════════════════════════════════════════════════════════════════════

export declare const Physical: {
  capture(root: Element): Effect.Effect<PhysicalState>;
  restore(state: PhysicalState, root: Element, remap?: Record<string, string>): Effect.Effect<void>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 10. CAPTURE (WebCodecs video encoding)
// ═══════════════════════════════════════════════════════════════════════════════

import type { FrameCapture, CaptureConfig, CaptureFrame, CaptureResult, CompositeState, VideoRenderer } from './core';

export interface WebCodecsCaptureOptions {
  readonly codec?: string;
  readonly bitrate?: number;
  readonly keyframeInterval?: number;
}

export type RenderFn = (ctx: OffscreenCanvasRenderingContext2D, state: CompositeState, canvas: OffscreenCanvas) => void;

export declare namespace WebCodecsCapture {
  export function make(options?: WebCodecsCaptureOptions): FrameCapture;
}

export declare function renderToCanvas(state: CompositeState, canvas: OffscreenCanvas, renderFn?: RenderFn): void;

export declare function captureVideo(
  renderer: VideoRenderer,
  capture: FrameCapture,
  renderFn?: RenderFn,
): Promise<CaptureResult>;
