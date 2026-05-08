import { Bench, type FnOptions } from 'tinybench';
import { LLM_STEADY_REPLICATE_EXCEEDANCE_MAX } from './flex-policy.js';
import { Boundary, GenFrame, TokenBuffer, UIQuality, RuntimeCoordinator, type CompositeState } from '@czap/core';
import { ClientHints, compileTheme, createEdgeHostAdapter, EdgeTier } from '@czap/edge';
import { LLMChunkNormalization, SSE, type LLMChunk } from '@czap/web';
import { WorkerHost } from '@czap/worker';
import { evaluateBoundary, parseBoundary } from '../../packages/astro/src/runtime/boundary.ts';
import { parseLLMChunk } from '../../packages/astro/src/runtime/llm.ts';
import { makeResolvedStateEnvelope } from '../../packages/worker/src/messages.ts';
import {
  createLLMSessionWithHost,
  createSupportLLMSessionHost,
  createSupportLLMTokenBoundaryHost,
} from '../../packages/astro/src/runtime/llm-session.ts';
import {
  WORKER_STARTUP_STAGE_LABELS,
  WORKER_STARTUP_DIAGNOSTIC_STAGE_LABELS,
  type WorkerStartupComparisonAudit,
  type WorkerStartupComparisonAuditRow,
  type WorkerStartupDiagnosticStage,
  type WorkerStartupSeamMetric,
  type WorkerStartupSharedMetric,
  type WorkerStartupSplitMetrics,
  buildLLMStartupScenario,
  buildWorkerStartupComparisonAudit,
  buildWorkerStartupSplitMetrics,
  collectNormalizedLLMStartupChunks,
  runWorkerStartupParityScenario,
  runWorkerStartupScenario,
} from '../../tests/e2e/fixtures/startup-scenarios.ts';

export interface BenchResult {
  readonly name: string;
  readonly opsPerSec: number;
  readonly meanNs: number;
  readonly p75Ns: number;
  readonly p99Ns: number;
  readonly latencyTier: string;
}

export type RuntimeClass = 'hot-path' | 'startup' | 'steady-state' | 'transport';

export interface BenchPair {
  readonly label: string;
  readonly directive: string;
  readonly baseline: string;
  readonly threshold: number;
  readonly gate: boolean;
  readonly warnOnThreshold?: boolean;
  readonly runtimeClass: RuntimeClass;
  readonly rationale: string;
}

export interface PairEvaluation extends BenchPair {
  readonly directiveResult?: BenchResult;
  readonly baselineResult?: BenchResult;
  readonly overhead: number | null;
  readonly missing: boolean;
  readonly pass: boolean;
}

export interface ReplicateResult {
  readonly replicate: number;
  readonly results: readonly BenchResult[];
  readonly pairs: readonly PairEvaluation[];
  readonly startupBreakdown: readonly WorkerStartupBreakdownStageResult[];
  readonly workerStartupAudit: WorkerStartupComparisonAudit;
  readonly workerStartupSplit: WorkerStartupSplitResult;
  readonly canaryContext: ReplicateCanaryContext;
}

export interface ReplicatedPairEvaluation extends BenchPair {
  readonly replicates: readonly PairEvaluation[];
  readonly validReplicates: number;
  readonly missingReplicates: number;
  readonly exceedances: number;
  readonly requiredExceedances: number;
  readonly medianDirectiveNs: number | null;
  readonly medianBaselineNs: number | null;
  readonly medianOverhead: number | null;
  readonly missing: boolean;
  readonly pass: boolean;
  readonly warning: boolean;
  readonly watch: boolean;
  readonly overheads: readonly (number | null)[];
  readonly spread: number | null;
}

export interface DirectiveBenchConfig {
  readonly warmupIterations: number;
  readonly iterations: number;
  readonly replicateCount: number;
  readonly hotLoopRepeat: number;
  readonly startupBreakdownIterations: number;
  readonly canaryTaskNames: readonly string[];
}

export interface ReplicateCanaryTaskContext {
  readonly name: string;
  readonly beforeMeanNs: number | null;
  readonly afterMeanNs: number | null;
  readonly deltaNs: number | null;
  readonly deltaPct: number | null;
}

export interface ReplicateCanaryContext {
  readonly tasks: readonly ReplicateCanaryTaskContext[];
  readonly ambientSpreadMeanNs: number | null;
  readonly ambientSpreadPct: number | null;
}

interface DirectiveBenchTaskDefinition {
  readonly name: string;
  readonly fn: () => void | Promise<void>;
  readonly options?: FnOptions;
}

export type WorkerStartupBreakdownStage = (typeof WORKER_STARTUP_STAGE_LABELS)[number]['stage'];

export interface WorkerStartupBreakdownStageResult {
  readonly stage: WorkerStartupBreakdownStage;
  readonly label: string;
  readonly modeled: boolean;
  readonly meanNs: number;
  readonly p75Ns: number;
  readonly p95Ns: number;
  readonly p99Ns: number;
}

export type WorkerStartupAuditRowResult = WorkerStartupComparisonAuditRow;

export type WorkerStartupAuditResult = WorkerStartupComparisonAudit;

export type WorkerStartupSharedPairResult = WorkerStartupSharedMetric;

export type WorkerStartupSeamNoteResult = WorkerStartupSeamMetric;

export type WorkerStartupSplitResult = WorkerStartupSplitMetrics;

export interface LLMRuntimeSteadySignals {
  readonly label: 'llm-runtime-steady';
  readonly replicateExceedanceRate: number;
  readonly directiveP99ToBaselineP99: number | null;
  readonly directiveP75ToBaselineP75: number | null;
  readonly longSessionSlopeNsPerChunk: number | null;
  readonly mixedChunkSlopeNsPerChunk: number | null;
  readonly conclusion: string;
}

export const HARD_GATE_OVERHEAD_THRESHOLD = 0.15;
export const DIAGNOSTIC_OVERHEAD_THRESHOLD = 0.25;
/**
 * Threshold for pairs whose overhead is dominated by the worker-transport
 * cost floor — the async-via-microtask shim that BenchWorker uses in Node
 * plus the CompositorWorker dispatch/receipt infrastructure. ADR-0002 §
 * "Transport cost floor" classifies this as accepted structural cost
 * (message-receipt is 'support-only' in the audit rows), so the parity
 * baseline intentionally does not model it. The 100% ceiling gives ~22pp
 * headroom over observed Node medians (~75-80%) while still failing loudly
 * if anyone regresses the shim beyond its honest floor.
 */
export const WORKER_TRANSPORT_FLOOR_THRESHOLD = 1.0;
export const DEFAULT_GATE_REPLICATES = 5;
const WORKER_SHARED_STARTUP_THRESHOLD_PCT = 25;
const DIAGNOSTIC_WATCH_HEADROOM_PCT = 5;
const DIAGNOSTIC_WATCH_EXCEEDANCES = 2;
const HARD_GATE_MARGIN_NOTE_PCT = 3;

const perfBoundary = Boundary.make({
  input: 'ops-per-sec',
  at: [
    [0, 'extreme'],
    [100_000, 'heavy'],
    [1_000_000, 'moderate'],
    [10_000_000, 'light'],
    [100_000_000, 'minimal'],
  ] as const,
});

const satelliteBoundary = {
  input: 'viewport.width',
  thresholds: [0, 768, 1280],
  states: ['mobile', 'tablet', 'desktop'],
  hysteresis: 40,
} as const;

const canonicalSatelliteBoundary = Boundary.make({
  input: satelliteBoundary.input,
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
  hysteresis: satelliteBoundary.hysteresis,
});
const sharedSatelliteBoundary = parseBoundary(
  JSON.stringify({
    id: 'layout',
    input: satelliteBoundary.input,
    thresholds: satelliteBoundary.thresholds,
    states: satelliteBoundary.states,
    hysteresis: satelliteBoundary.hysteresis,
  }),
);
const boundaryJSON = JSON.stringify({
  input: satelliteBoundary.input,
  thresholds: satelliteBoundary.thresholds,
  states: satelliteBoundary.states,
  hysteresis: satelliteBoundary.hysteresis,
});

const patchMessage = JSON.stringify({ type: 'patch', data: '<p>Updated</p>' });
const textChunk = JSON.stringify({ type: 'text', content: 'Hello world' });
const toolDelta = JSON.stringify({ type: 'tool-call-delta', toolArgs: '{"query":' });
const doneChunk = JSON.stringify({ type: 'done' });
const invalidSseData = 'this is not json at all';
const invalidSseEvent = { data: invalidSseData } as Pick<MessageEvent, 'data'>;
const patchEvent = { data: patchMessage } as Pick<MessageEvent, 'data'>;
const textEvent = { data: textChunk } as Pick<MessageEvent, 'data'>;
const toolDeltaEvent = { data: toolDelta } as Pick<MessageEvent, 'data'>;
const llmStartupScenarios = {
  simple: buildLLMStartupScenario('simple'),
  promoted: buildLLMStartupScenario('promoted'),
} as const;
const llmStartupChunks = {
  simple: collectNormalizedLLMStartupChunks('simple'),
  promoted: collectNormalizedLLMStartupChunks('promoted'),
} as const;
const llmFastRuntimeMessages = llmStartupScenarios.simple.messages.map((data) => ({ type: 'patch', data })) as readonly {
  readonly type: 'patch';
  readonly data: string;
}[];
const llmPromotedRuntimeMessages = llmStartupScenarios.promoted.messages.map((data) => ({ type: 'patch', data })) as readonly {
  readonly type: 'patch';
  readonly data: string;
}[];
const edgeHeaders = new Headers({
  'sec-ch-viewport-width': '1440',
  'sec-ch-device-memory': '8',
  'sec-ch-dpr': '2',
});
const HOT_LOOP_REPEAT = 250;
const STREAM_HOT_LOOP_REPEAT = 5000;
const LLM_HOT_LOOP_REPEAT = 5000;
const WORKER_STARTUP_BREAKDOWN_ITERATIONS = 40;
const BENCH_CANARY_TASK_NAMES = [
  '[CANARY] bench -- integer accumulator',
  '[CANARY] bench -- stable JSON encode',
] as const;
let workerRuntimeIndexSink = 0;
let workerRuntimePayloadSink = 0;
let benchCanarySink = 0;

export const WORKER_STARTUP_BREAKDOWN_STAGES = WORKER_STARTUP_STAGE_LABELS;

export function buildDirectiveBenchConfig(
  replicates = DEFAULT_GATE_REPLICATES,
): DirectiveBenchConfig {
  return {
    warmupIterations: 200,
    iterations: 1000,
    replicateCount: replicates,
    hotLoopRepeat: HOT_LOOP_REPEAT,
    startupBreakdownIterations: WORKER_STARTUP_BREAKDOWN_ITERATIONS,
    canaryTaskNames: [...BENCH_CANARY_TASK_NAMES],
  };
}

function buildCompositeState(state: string): void {
  const discrete: Record<string, string> = { layout: state };
  const css: Record<string, string> = { '--czap-layout': state };
  const glsl: Record<string, number> = { u_layout: satelliteBoundary.states.indexOf(state) };
  const aria: Record<string, string> = { 'data-czap-layout': state };
  void discrete;
  void css;
  void glsl;
  void aria;
}

function buildCompositePayload(state: string): {
  readonly discrete: Record<string, string>;
  readonly css: Record<string, string>;
  readonly glsl: Record<string, number>;
  readonly aria: Record<string, string>;
} {
  return {
    discrete: { layout: state },
    css: { '--czap-layout': state },
    glsl: { u_layout: satelliteBoundary.states.indexOf(state) },
    aria: { 'data-czap-layout': state },
  };
}

function buildWorkerCompositeState(name: string, state: string): CompositeState {
  const stateIndex = satelliteBoundary.states.indexOf(state);

  return {
    discrete: { [name]: state },
    blend: {
      [name]: Object.fromEntries(satelliteBoundary.states.map((candidate) => [candidate, candidate === state ? 1 : 0])),
    },
    outputs: {
      css: { [`--czap-${name}`]: state },
      glsl: { [`u_${name}`]: stateIndex },
      aria: { [`data-czap-${name}`]: state },
    },
  };
}

function buildResolvedStatePayload(state: string): readonly BenchResolvedState[] {
  return Array.from({ length: 16 }, (_, index) => ({
    name: `layout-${index}`,
    state: satelliteBoundary.states[index % satelliteBoundary.states.length] ?? state,
    generation: index + 1,
  }));
}

type BenchWorkerMessage = {
  readonly type: string;
  readonly [key: string]: unknown;
};

type BenchResolvedState = {
  readonly name: string;
  readonly state: string;
  readonly generation: number;
};

function invokeBenchListener(listener: EventListenerOrEventListenerObject, event: Event): void {
  if (typeof listener === 'function') {
    listener(event);
    return;
  }

  listener.handleEvent(event);
}

class BenchBlob {
  constructor(
    readonly parts: readonly unknown[],
    readonly options?: {
      readonly type?: string;
    },
  ) {}
}

class BenchWorker {
  private readonly messageListeners = new Set<EventListenerOrEventListenerObject>();
  private readonly errorListeners = new Set<EventListenerOrEventListenerObject>();
  private readonly states = new Map<string, { currentState: string; initialState: string }>();

  constructor(_url: string | URL, _options?: WorkerOptions) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') {
      this.messageListeners.add(listener);
      return;
    }

    if (type === 'error') {
      this.errorListeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') {
      this.messageListeners.delete(listener);
      return;
    }

    if (type === 'error') {
      this.errorListeners.delete(listener);
    }
  }

  postMessage(message: BenchWorkerMessage): void {
    switch (message.type) {
      case 'init':
        this.dispatchMessageAsync({ type: 'ready' });
        break;
      case 'add-quantizer': {
        this.registerQuantizer(message);
        break;
      }
      case 'bootstrap-quantizers': {
        const registrations = Array.isArray(message.registrations)
          ? message.registrations.filter((registration): registration is { name?: unknown; states?: unknown } => !!registration && typeof registration === 'object')
          : [];
        for (const registration of registrations) {
          this.registerQuantizer(registration);
        }
        break;
      }
      case 'startup-compute': {
        this.states.clear();
        const packet =
          message.packet && typeof message.packet === 'object'
            ? (message.packet as { registrations?: unknown; updates?: unknown })
            : { registrations: [], updates: [] };
        const registrations = Array.isArray(packet.registrations)
          ? packet.registrations.filter((registration): registration is { name?: unknown; states?: unknown } => !!registration && typeof registration === 'object')
          : [];
        for (const registration of registrations) {
          this.registerQuantizer(registration);
        }

        const updates = Array.isArray(packet.updates)
          ? packet.updates.filter((update): update is BenchWorkerMessage => !!update && typeof update === 'object')
          : [];
        for (const update of updates) {
          this.applyUpdate(update);
        }

        const [name, state] = this.states.entries().next().value ?? [
          'layout',
          { currentState: satelliteBoundary.states[0], initialState: satelliteBoundary.states[0] },
        ];
        this.dispatchMessageAsync(
          {
            type: 'state',
            state: buildWorkerCompositeState(name, state.currentState),
          },
          1,
        );
        break;
      }
      case 'apply-updates': {
        const updates = Array.isArray(message.updates)
          ? message.updates.filter((update): update is BenchWorkerMessage => !!update && typeof update === 'object')
          : [];
        for (const update of updates) {
          this.applyUpdate(update);
        }
        break;
      }
      case 'bootstrap-resolved-state':
      case 'apply-resolved-state': {
        const states = Array.isArray(message.states)
          ? message.states.filter(
              (entry): entry is BenchResolvedState =>
                !!entry &&
                typeof entry === 'object' &&
                typeof entry.name === 'string' &&
                typeof entry.state === 'string' &&
                typeof entry.generation === 'number',
            )
          : [];
        for (const entry of states) {
          const existing = this.states.get(entry.name);
          if (!existing) {
            continue;
          }

          this.states.set(entry.name, {
            currentState: entry.state,
            initialState: existing.initialState,
          });
        }
        if (message.ack === true) {
          this.dispatchMessageAsync(
            {
              type: 'resolved-state-ack',
              generation: states[0]?.generation ?? 0,
              states: states.map((state) => ({ name: state.name, state: state.state })),
              additionalOutputsChanged: false,
            },
            1,
          );
        }
        break;
      }
      case 'warm-reset':
        for (const state of this.states.values()) {
          state.currentState = state.initialState;
        }
        break;
      case 'compute': {
        const [name, state] = this.states.entries().next().value ?? [
          'layout',
          { currentState: satelliteBoundary.states[0], initialState: satelliteBoundary.states[0] },
        ];
        this.dispatchMessageAsync(
          {
          type: 'state',
          state: buildWorkerCompositeState(name, state.currentState),
          },
          1,
        );
        break;
      }
      case 'dispose':
        this.terminate();
        break;
      default:
        break;
    }
  }

  terminate(): void {
    this.states.clear();
    this.messageListeners.clear();
    this.errorListeners.clear();
  }

  private applyUpdate(update: BenchWorkerMessage): void {
    switch (update.type) {
      case 'remove-quantizer':
        if (typeof update.name === 'string') {
          this.states.delete(update.name);
        }
        break;
      case 'evaluate':
        if (typeof update.name === 'string' && typeof update.value === 'number') {
          const existing = this.states.get(update.name);
          this.states.set(update.name, {
            currentState: evaluateWorkerDirectiveState(update.value),
            initialState: existing?.initialState ?? satelliteBoundary.states[0],
          });
        }
        break;
      case 'set-blend':
      default:
        break;
    }
  }

  private registerQuantizer(registration: { readonly name?: unknown; readonly states?: unknown; readonly initialState?: unknown }): void {
    const name = typeof registration.name === 'string' ? registration.name : 'layout';
    const states = Array.isArray(registration.states)
      ? registration.states.filter((state): state is string => typeof state === 'string')
      : [];
    const initialState = typeof registration.initialState === 'string' ? registration.initialState : states[0] ?? '';
    this.states.set(name, {
      currentState: initialState,
      initialState: states[0] ?? initialState,
    });
  }

  private dispatchMessage(message: BenchWorkerMessage): void {
    const event = {
      type: 'message',
      data: message,
    } as MessageEvent<BenchWorkerMessage>;

    for (const listener of this.messageListeners) {
      invokeBenchListener(listener, event);
    }
  }

  private dispatchMessageAsync(message: BenchWorkerMessage, hops = 1): void {
    const dispatch = (remainingHops: number): void => {
      queueMicrotask(() => {
        if (remainingHops > 1) {
          dispatch(remainingHops - 1);
          return;
        }

        if (this.messageListeners.size === 0) {
          return;
        }

        this.dispatchMessage(message);
      });
    };

    dispatch(Math.max(1, hops));
  }
}

function restoreGlobalDescriptor(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  delete (target as Record<PropertyKey, unknown>)[key];
}

function installBenchWorkerGlobals(): () => void {
  const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const blobDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Blob');
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: BenchWorker as unknown as typeof Worker,
  });
  Object.defineProperty(globalThis, 'Blob', {
    configurable: true,
    writable: true,
    value: BenchBlob as unknown as typeof Blob,
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: () => 'blob:bench-worker',
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: () => {},
  });

  return () => {
    restoreGlobalDescriptor(globalThis, 'Worker', workerDescriptor);
    restoreGlobalDescriptor(globalThis, 'Blob', blobDescriptor);
    restoreGlobalDescriptor(URL, 'createObjectURL', createObjectUrlDescriptor);
    restoreGlobalDescriptor(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
  };
}

function withBenchWorkerGlobals<T>(run: () => T): T {
  const restore = installBenchWorkerGlobals();
  try {
    return run();
  } finally {
    restore();
  }
}

async function withBenchWorkerGlobalsAsync<T>(run: () => Promise<T>): Promise<T> {
  const restore = installBenchWorkerGlobals();
  try {
    return await run();
  } finally {
    restore();
  }
}

function currentTimeMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function currentTimeNs(): number {
  return currentTimeMs() * 1e6;
}

function quantile(values: readonly number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(percentile * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

function evaluateSatelliteDirectiveState(value: number): string {
  if (!sharedSatelliteBoundary) {
    throw new Error('Shared satellite boundary benchmark fixture failed to parse.');
  }

  return evaluateBoundary(sharedSatelliteBoundary, value);
}

function evaluateWorkerDirectiveState(value: number): string {
  return evaluateSatelliteDirectiveState(value);
}

function evaluateWorkerBaselineState(value: number): string {
  return Boundary.evaluate(canonicalSatelliteBoundary, value) as string;
}

function createBenchLLMRuntimeSession() {
  const tokenBuffer = TokenBuffer.make<string>({ capacity: 64 });
  const quality = UIQuality.make({ deviceTier: 'animations' });
  const scheduler = GenFrame.make({
    tokenBuffer,
    getQualityTier: () => quality.evaluate(tokenBuffer.occupancy, 'animations'),
  });

  // A real live session only resets at end-of-stream. Between chunks the
  // scheduler keeps its frame-count / rate-EMA state. We run one reset
  // here at session creation so the first iteration starts clean, then
  // never again — per-chunk reset would charge setup cost on every bench
  // iteration, which is exactly the pollution this pair is meant to
  // surface against the raw-parse baseline.
  tokenBuffer.reset();
  scheduler.reset();

  // Drain only tokens that are actually buffered. We skip the scheduler
  // entirely when the buffer is empty so we never pay the interpolated-
  // frame path (fnv1a + object literal) just because rate-EMA tipped
  // into "stalled". Real runtimes emit interpolated frames via rAF, not
  // inside the ingest path — mirroring that here keeps the measurement
  // focused on productive frame work.
  const drainScheduledFrames = (): void => {
    for (let remaining = 32; remaining > 0; remaining--) {
      if (tokenBuffer.length === 0) {
        break;
      }
      const frame = scheduler.tick();
      if (frame === null) {
        break;
      }
    }
  };

  return {
    run(chunks: readonly LLMChunk[]): void {
      let pendingText = '';
      for (const chunk of chunks) {
        if (chunk.type === 'text' && chunk.content) {
          pendingText += chunk.content;
          continue;
        }

        if (pendingText) {
          tokenBuffer.push(pendingText);
          pendingText = '';
        }
      }

      if (pendingText) {
        tokenBuffer.push(pendingText);
      }

      drainScheduledFrames();
    },
  };
}

type BenchTextNode = {
  readonly textContent: string;
};

type BenchTargetElement = {
  innerHTML: string;
  appendChild(node: BenchTextNode): void;
  replaceChildren(): void;
};

type BenchHostElement = EventTarget & {
  readonly __target: BenchTargetElement;
};

function createBenchTargetElement(): BenchTargetElement {
  return {
    innerHTML: '',
    appendChild(node: BenchTextNode): void {
      this.innerHTML += node.textContent;
    },
    replaceChildren(): void {
      this.innerHTML = '';
    },
  };
}

function createBenchHostElement(target: BenchTargetElement): BenchHostElement {
  const host = new EventTarget() as BenchHostElement;
  Object.defineProperty(host, '__target', {
    configurable: true,
    enumerable: false,
    value: target,
  });
  return host;
}

async function withBenchDocumentGlobalsAsync<T>(fn: () => Promise<T>): Promise<T> {
  const globalRecord = globalThis as typeof globalThis & {
    document?: { createTextNode(text: string): BenchTextNode };
    CustomEvent?: typeof CustomEvent;
  };
  const previousDocument = globalRecord.document;
  const previousCustomEvent = globalRecord.CustomEvent;

  globalRecord.document = {
    createTextNode(text: string): BenchTextNode {
      return { textContent: text };
    },
  };

  if (typeof globalRecord.CustomEvent === 'undefined') {
    class BenchCustomEvent<T = unknown> extends Event {
      readonly detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type, init);
        this.detail = init?.detail as T;
      }
    }

    globalRecord.CustomEvent = BenchCustomEvent as typeof CustomEvent;
  }

  try {
    return await fn();
  } finally {
    if (previousDocument === undefined) {
      delete globalRecord.document;
    } else {
      globalRecord.document = previousDocument;
    }

    if (previousCustomEvent === undefined) {
      delete globalRecord.CustomEvent;
    } else {
      globalRecord.CustomEvent = previousCustomEvent;
    }
  }
}

function parseRuntimeLLMChunks(
  messages: readonly {
    readonly data: string;
  }[] = llmPromotedRuntimeMessages,
): readonly LLMChunk[] {
  return messages
    .map((message) => parseLLMChunk({ data: message.data }))
    .filter((chunk): chunk is LLMChunk => chunk !== null);
}

function runBenchLLMRuntimeSession(session = createBenchLLMRuntimeSession()): void {
  session.run(parseRuntimeLLMChunks());
}

async function runLLMStartupSupportScenario(mode: LLMStartupMode): Promise<void> {
  const scenario = llmStartupScenarios[mode];
  const chunks = llmStartupChunks[mode];
  let tokenCount = 0;
  let resolveTokenBoundary: (() => void) | null = null;

  const session = createLLMSessionWithHost(
    {
      mode: 'append',
      getDeviceTier: () => 'animations',
    },
    createSupportLLMTokenBoundaryHost(() => {
      tokenCount += 1;
      if (tokenCount === scenario.firstTokenOrdinal) {
        resolveTokenBoundary?.();
        resolveTokenBoundary = null;
      }
    }),
  );

  for (const chunk of chunks) {
    session.ingest(chunk);
    if (tokenCount >= scenario.firstTokenOrdinal) {
      break;
    }
  }

  if (tokenCount < scenario.firstTokenOrdinal) {
    await new Promise<void>((resolve) => {
      resolveTokenBoundary = resolve;
    });
  }
  session.dispose();
}

async function runSharedLLMRuntimeStartup(): Promise<void> {
  await runLLMStartupSupportScenario('simple');
}

async function runPromotedLLMRuntimeStartup(): Promise<void> {
  await runLLMStartupSupportScenario('promoted');
}

async function runLLMStartupParityBaseline(mode: LLMStartupMode): Promise<void> {
  const scenario = llmStartupScenarios[mode];
  const chunks = llmStartupChunks[mode];
  let tokenCount = 0;
  let resolveTokenBoundary: (() => void) | null = null;

  const session = createLLMSessionWithHost(
    {
      mode: 'append',
      getDeviceTier: () => 'animations',
    },
    {
      setTarget() {},
      renderText() {
        return true;
      },
      renderFrame(frame) {
        return frame.tokens.length > 0;
      },
      emitToken() {
        tokenCount += 1;
        if (tokenCount === scenario.firstTokenOrdinal) {
          resolveTokenBoundary?.();
          resolveTokenBoundary = null;
        }
      },
      emitFrame() {},
      emitToolStart() {},
      emitToolEnd() {},
      emitDone() {},
    },
  );

  for (const chunk of chunks) {
    session.ingest(chunk);
    if (tokenCount >= scenario.firstTokenOrdinal) {
      break;
    }
  }

  if (tokenCount < scenario.firstTokenOrdinal) {
    await new Promise<void>((resolve) => {
      resolveTokenBoundary = resolve;
    });
  }

  session.dispose();
}

const sharedLLMRuntimeSession = createBenchLLMRuntimeSession();
const sharedLLMRuntimeChunks = parseRuntimeLLMChunks();

function buildLongTextRuntimeChunks(chunkCount: number): readonly LLMChunk[] {
  return [
    ...Array.from({ length: chunkCount }, (_, index) => ({
      type: 'text' as const,
      partial: false,
      content: `chunk-${index}`,
    })),
    { type: 'done' as const, partial: false },
  ];
}

function buildMixedRuntimeChunks(visibleChunkCount: number): readonly LLMChunk[] {
  const chunks: LLMChunk[] = [];
  for (let index = 0; index < visibleChunkCount; index++) {
    chunks.push({
      type: 'text',
      partial: false,
      content: `chunk-${index}`,
    });

    if ((index + 1) % 8 === 0) {
      chunks.push({ type: 'tool-call-start', partial: false, toolName: 'search' });
      chunks.push({ type: 'tool-call-delta', partial: true, content: '{"query":' });
      chunks.push({ type: 'tool-call-delta', partial: false, content: `"${index}"}` });
      chunks.push({ type: 'tool-call-end', partial: false });
    }
  }

  chunks.push({ type: 'done', partial: false });
  return chunks;
}

function measureLLMSteadyScenario(chunks: readonly LLMChunk[], iterations = 20): number {
  let totalDurationNs = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const session = createLLMSessionWithHost(
      {
        mode: 'append',
        getDeviceTier: () => 'animations',
      },
      createSupportLLMSessionHost(),
    );
    const startNs = currentTimeNs();
    for (const chunk of chunks) {
      session.ingest(chunk);
    }
    totalDurationNs += currentTimeNs() - startNs;
    session.dispose();
  }

  return totalDurationNs / iterations;
}

function runSharedLLMRuntimeSteady(): void {
  sharedLLMRuntimeSession.run(sharedLLMRuntimeChunks);
}

function runBaselineLLMRuntime(): void {
  let accumulated = '';
  for (const message of llmPromotedRuntimeMessages) {
    const parsed = JSON.parse(message.data) as { type?: string; content?: string };
    if (parsed.type === 'text' && typeof parsed.content === 'string') {
      accumulated += parsed.content;
    }
  }
  void accumulated;
}

const edgeHostAdapter = createEdgeHostAdapter({
  theme: {
    prefix: 'bench',
    tokens: {
      'color.primary': '#ff5500',
      'space.base': 16,
    },
  },
});

async function resolveSharedEdgeRequest(): Promise<void> {
  await edgeHostAdapter.resolve(edgeHeaders);
}

function resolveBaselineEdgeRequest(): void {
  const caps = ClientHints.parseClientHints(edgeHeaders);
  const tier = EdgeTier.detectTier(edgeHeaders);
  const theme = compileTheme({
    prefix: 'bench',
    tokens: {
      'color.primary': '#ff5500',
      'space.base': 16,
    },
  });
  void caps;
  void tier;
  void theme;
}

async function runWorkerHostRuntimeStartup(): Promise<void> {
  await runWorkerStartupScenario(
    (startupTelemetry) => WorkerHost.create({ poolCapacity: 8 }, startupTelemetry),
    {
      now: currentTimeMs,
      nowNs: currentTimeNs,
    },
  );
}

async function runWorkerRuntimeStartupParityBaseline(): Promise<void> {
  const scenario = await runWorkerStartupParityScenario({
    now: currentTimeMs,
    nowNs: currentTimeNs,
  });
  workerRuntimePayloadSink = Math.round(scenario.totalStartupMs * 1e6);
  if (workerRuntimePayloadSink < 0) {
    throw new Error('unreachable worker runtime startup parity sink');
  }
}

const sharedWorkerRuntimeCoordinator = RuntimeCoordinator.create({ capacity: 8, name: 'bench-worker-runtime-steady' });
sharedWorkerRuntimeCoordinator.registerQuantizer('layout', satelliteBoundary.states);
const workerResolvedStatePayload = buildResolvedStatePayload(evaluateWorkerDirectiveState(800));
const workerResolvedStateEnvelope = makeResolvedStateEnvelope('apply-resolved-state', workerResolvedStatePayload, true);

function runWorkerRuntimeCoordinatorSteady(): void {
  sharedWorkerRuntimeCoordinator.markDirty('layout');
  const state = evaluateWorkerDirectiveState(800);
  workerRuntimeIndexSink = sharedWorkerRuntimeCoordinator.applyState('layout', state);
  const payload = buildCompositePayload(state);
  workerRuntimePayloadSink = JSON.stringify(payload).length + workerRuntimeIndexSink;
  if (workerRuntimeIndexSink < -1 || workerRuntimePayloadSink < -1) {
    throw new Error('unreachable worker runtime steady sink');
  }
}

function registerBenchWorkerQuantizer(host: WorkerHost.Shape): void {
  host.compositor.addQuantizer('layout', {
    id: 'layout',
    states: satelliteBoundary.states,
    thresholds: satelliteBoundary.thresholds,
  });
}

export async function measureWorkerStartupBreakdown(
  iterations = WORKER_STARTUP_BREAKDOWN_ITERATIONS,
): Promise<readonly WorkerStartupBreakdownStageResult[]> {
  const stageSamples = new Map<WorkerStartupBreakdownStage, number[]>(
    WORKER_STARTUP_BREAKDOWN_STAGES.map((entry) => [entry.stage, []]),
  );

  await withBenchWorkerGlobalsAsync(async () => {
    for (let iteration = 0; iteration < iterations; iteration++) {
      const scenario = await runWorkerStartupScenario(
        (startupTelemetry) => WorkerHost.create({ poolCapacity: 8 }, startupTelemetry),
        {
          now: currentTimeMs,
          nowNs: currentTimeNs,
        },
      );

      for (const [stage, durationMs] of Object.entries(scenario.stages)) {
        stageSamples.get(stage as WorkerStartupBreakdownStage)?.push(durationMs * 1e6);
      }
    }
  });

  return WORKER_STARTUP_BREAKDOWN_STAGES.map(({ stage, label }) => {
    const samples = stageSamples.get(stage) ?? [];
    const meanNs = samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
      stage,
      label,
      modeled: samples.length > 0,
      meanNs,
      p75Ns: quantile(samples, 0.75),
      p95Ns: quantile(samples, 0.95),
      p99Ns: quantile(samples, 0.99),
    };
  });
}

export async function measureWorkerStartupAudit(
  iterations = WORKER_STARTUP_BREAKDOWN_ITERATIONS,
): Promise<WorkerStartupAuditResult> {
  const analysis = await measureWorkerStartupAnalysis(iterations);
  return analysis.audit;
}

export async function measureWorkerStartupSplit(
  iterations = WORKER_STARTUP_BREAKDOWN_ITERATIONS,
): Promise<WorkerStartupSplitResult> {
  const analysis = await measureWorkerStartupAnalysis(iterations);
  return analysis.split;
}

async function measureWorkerStartupAnalysis(
  iterations = WORKER_STARTUP_BREAKDOWN_ITERATIONS,
): Promise<{
  readonly audit: WorkerStartupAuditResult;
  readonly split: WorkerStartupSplitResult;
}> {
  const supportScenarios = await withBenchWorkerGlobalsAsync(async () => {
    const scenarios = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
      scenarios.push(
        await runWorkerStartupScenario(
          (startupTelemetry) => WorkerHost.create({ poolCapacity: 8 }, startupTelemetry),
          {
            now: currentTimeMs,
            nowNs: currentTimeNs,
          },
        ),
      );
    }

    return scenarios;
  });

  const parityScenarios = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    parityScenarios.push(
      await runWorkerStartupParityScenario({
        now: currentTimeMs,
        nowNs: currentTimeNs,
      }),
    );
  }

  const audit = buildWorkerStartupComparisonAudit(supportScenarios, parityScenarios);
  return {
    audit,
    split: buildWorkerStartupSplitMetrics(supportScenarios, parityScenarios, audit),
  };
}

function repeatHotPath(fn: () => void, iterations = HOT_LOOP_REPEAT): void {
  for (let i = 0; i < iterations; i++) {
    fn();
  }
}

async function repeatHotPathAsync(fn: () => Promise<void>, iterations = HOT_LOOP_REPEAT): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
}

function isPatchMessage(value: unknown): value is { readonly type: 'patch'; readonly data?: unknown } {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'patch';
}

function isTextChunk(value: unknown): value is { readonly type: 'text'; readonly content?: unknown } {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'text';
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function spread(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.max(...values) - Math.min(...values);
}

export const DIRECTIVE_BENCH_PAIRS: readonly BenchPair[] = [
  {
    label: 'satellite',
    directive: '[DIRECTIVE] satellite -- evaluate + state string (hot path)',
    baseline: '[MANUAL] satellite -- Boundary.evaluate + state string',
    threshold: HARD_GATE_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'hot-path',
    rationale: 'Hot-path state evaluation should stay close to the canonical boundary evaluator.',
  },
  {
    label: 'stream',
    directive: '[DIRECTIVE] stream -- parse SSE + extract patch',
    baseline: '[MANUAL] stream -- direct JSON.parse',
    threshold: HARD_GATE_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'hot-path',
    rationale: 'Stream hydration should not add meaningful overhead beyond JSON parsing.',
  },
  {
    label: 'stream-preflight',
    directive: '[DIAGNOSTIC] stream-preflight -- parseMessage invalid (non-JSON)',
    baseline: '[BASELINE] stream-preflight -- parseMessage valid JSON',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: false,
    runtimeClass: 'transport',
    rationale: 'Pre-flight character check should make invalid SSE messages cheaper than valid JSON parsing.',
  },
  {
    label: 'llm',
    directive: '[DIRECTIVE] llm -- parse text chunk + accumulate',
    baseline: '[MANUAL] llm -- direct JSON.parse text',
    threshold: HARD_GATE_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'hot-path',
    rationale: 'Token streaming should stay close to raw chunk parsing.',
  },
  {
    label: 'worker',
    directive: '[DIRECTIVE] worker -- shared evaluate + composite build',
    baseline: '[MANUAL] worker -- Boundary.evaluate + composite build',
    threshold: HARD_GATE_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'hot-path',
    rationale: 'Normalized worker fallback evaluation should stay close to the canonical boundary evaluator.',
  },
  {
    label: 'worker-envelope',
    directive: '[DIAGNOSTIC] worker -- state envelope structured clone',
    baseline: '[BASELINE] worker -- state payload structured clone',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: false,
    runtimeClass: 'transport',
    rationale: 'Worker transport diagnostics should isolate envelope overhead from the structured-clone cost of the payload itself.',
  },
  {
    label: 'llm-startup-shared',
    directive: '[GATE] llm-startup-shared -- first token boundary',
    baseline: '[BASELINE] llm-startup-shared -- node first token boundary',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'startup',
    rationale: 'LLM shared startup parity should keep the token-boundary slice close to the node support analogue.',
  },
  {
    label: 'llm-promoted-startup-shared',
    directive: '[GATE] llm-promoted-startup-shared -- second token boundary',
    baseline: '[BASELINE] llm-promoted-startup-shared -- node second token boundary',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'startup',
    rationale: 'Promoted LLM shared startup parity should keep the second-token boundary slice close to the node support analogue.',
  },
  {
    label: 'llm-runtime-steady',
    directive: '[DIAGNOSTIC] llm-runtime-steady -- live session frame scheduling',
    baseline: '[BASELINE] llm-runtime-steady -- parse and accumulate text',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: false,
    runtimeClass: 'steady-state',
    rationale: 'LLM runtime steady-state diagnostics should reuse a live session instead of charging setup on every chunk.',
  },
  {
    label: 'edge-request',
    directive: '[DIAGNOSTIC] edge-request -- shared adapter resolve',
    baseline: '[BASELINE] edge-request -- direct hints + tier + theme',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: false,
    runtimeClass: 'steady-state',
    rationale: 'Edge host diagnostics should measure the full shared host-resolution path, not just the leaf utilities.',
  },
  {
    label: 'worker-runtime-startup',
    directive: '[DIAGNOSTIC] worker-runtime-startup -- host bootstrap + first compute',
    baseline: '[BASELINE] worker-runtime-startup -- in-process parity bootstrap',
    // Uses the transport-floor threshold because the gap is structural
    // (see WORKER_TRANSPORT_FLOOR_THRESHOLD rationale). The parity path
    // is sync by design — the `state-delivery:message-receipt` stage is
    // classified 'support-only' in WORKER_STARTUP_DIAGNOSTIC_STAGE_LABELS,
    // meaning it has no in-process analogue. The `worker-runtime-startup-
    // shared` pair (15% hard gate) covers the shared portion in isolation.
    threshold: WORKER_TRANSPORT_FLOOR_THRESHOLD,
    gate: false,
    warnOnThreshold: false,
    runtimeClass: 'startup',
    rationale:
      'Worker runtime startup diagnostics include the worker-transport cost floor (message-receipt + dispatch-send), which has no analogue in the in-process parity bootstrap. The shared-portion gate (worker-runtime-startup-shared, 15%) covers reducible overhead; this pair tracks the honest seam cost and must only fail on drift beyond the accepted structural floor.',
  },
  {
    label: 'worker-runtime-startup-shared',
    directive: '[DIAGNOSTIC] worker-runtime-startup-shared -- shared bootstrap parity',
    baseline: '[BASELINE] worker-runtime-startup-shared -- shared in-process analogue',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: true,
    runtimeClass: 'startup',
    rationale: 'Shared worker startup diagnostics should isolate claim, coordinator, listener, bootstrap, and packet-finalize work that has a real in-process analogue before the worker-only seam is considered.',
  },
  {
    label: 'worker-runtime-steady',
    directive: '[DIAGNOSTIC] worker-runtime-steady -- live runtime coordinator update',
    baseline: '[BASELINE] worker-runtime-steady -- shared evaluate only',
    threshold: DIAGNOSTIC_OVERHEAD_THRESHOLD,
    gate: false,
    runtimeClass: 'steady-state',
    rationale: 'Worker runtime steady-state diagnostics should measure updates on an existing coordinator.',
  },
] as const;

export function classifyResult(opsPerSec: number): string {
  return Boundary.evaluate(perfBoundary, opsPerSec) as string;
}

const syncBenchTaskOptions = { async: false } satisfies FnOptions;
const asyncBenchTaskOptions = { async: true } satisfies FnOptions;

export const DIRECTIVE_BENCH_TASKS: readonly DirectiveBenchTaskDefinition[] = [
  {
    name: '[DIRECTIVE] satellite -- evaluate + state string (hot path)',
    fn: () => {
      repeatHotPath(() => {
        const state = evaluateSatelliteDirectiveState(800);
        void `data-czap-state=${state}`;
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[MANUAL] satellite -- Boundary.evaluate + state string',
    fn: () => {
      repeatHotPath(() => {
        const state = Boundary.evaluate(canonicalSatelliteBoundary, 800);
        void `data-czap-state=${state}`;
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[OVERHEAD] satellite -- JSON.parse boundary (hydration)',
    fn: () => {
      repeatHotPath(() => {
        void JSON.parse(boundaryJSON);
      }, 25);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIRECTIVE] stream -- parse SSE + extract patch',
    fn: () => {
      repeatHotPath(() => {
        const data = SSE.parseMessage(patchEvent as MessageEvent);
        if (isPatchMessage(data) && typeof data.data === 'string') {
          void data.data;
        }
      }, STREAM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[MANUAL] stream -- direct JSON.parse',
    fn: () => {
      repeatHotPath(() => {
        const data = JSON.parse(patchMessage);
        if (isPatchMessage(data) && typeof data.data === 'string') {
          void data.data;
        }
      }, STREAM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIAGNOSTIC] stream-preflight -- parseMessage invalid (non-JSON)',
    fn: () => {
      repeatHotPath(() => {
        void SSE.parseMessage(invalidSseEvent as MessageEvent);
      }, STREAM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[BASELINE] stream-preflight -- parseMessage valid JSON',
    fn: () => {
      repeatHotPath(() => {
        void SSE.parseMessage(patchEvent as MessageEvent);
      }, STREAM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIRECTIVE] llm -- parse text chunk + accumulate',
    fn: () => {
      repeatHotPath(() => {
        const chunk = parseLLMChunk(textEvent);
        if (chunk?.type === 'text') {
          void String(chunk.content ?? '');
        }
      }, LLM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[MANUAL] llm -- direct JSON.parse text',
    fn: () => {
      repeatHotPath(() => {
        const data = JSON.parse(textChunk);
        if (isTextChunk(data)) {
          void data.content;
        }
      }, LLM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIRECTIVE] llm -- parse tool delta',
    fn: () => {
      repeatHotPath(() => {
        const chunk = parseLLMChunk(toolDeltaEvent);
        if (chunk?.type === 'tool-call-delta') {
          void String(chunk.toolArgs ?? '');
        }
      }, LLM_HOT_LOOP_REPEAT);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIRECTIVE] worker -- shared evaluate + composite build',
    fn: () => {
      repeatHotPath(() => {
        const state = evaluateWorkerDirectiveState(800);
        buildCompositeState(state);
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[MANUAL] worker -- Boundary.evaluate + composite build',
    fn: () => {
      repeatHotPath(() => {
        const state = evaluateWorkerBaselineState(800);
        buildCompositeState(state);
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIAGNOSTIC] worker -- state envelope structured clone',
    fn: () => {
      repeatHotPath(() => {
        void structuredClone(workerResolvedStateEnvelope);
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[BASELINE] worker -- state payload structured clone',
    fn: () => {
      repeatHotPath(() => {
        void structuredClone(workerResolvedStatePayload);
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[GATE] llm-startup-shared -- first token boundary',
    fn: async () => {
      await repeatHotPathAsync(async () => {
        await runSharedLLMRuntimeStartup();
      }, 20);
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[BASELINE] llm-startup-shared -- node first token boundary',
    fn: async () => {
      await repeatHotPathAsync(async () => {
        await runLLMStartupParityBaseline('simple');
      }, 20);
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[GATE] llm-promoted-startup-shared -- second token boundary',
    fn: async () => {
      await repeatHotPathAsync(async () => {
        await runPromotedLLMRuntimeStartup();
      }, 20);
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[BASELINE] llm-promoted-startup-shared -- node second token boundary',
    fn: async () => {
      await repeatHotPathAsync(async () => {
        await runLLMStartupParityBaseline('promoted');
      }, 20);
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[DIAGNOSTIC] llm-runtime-steady -- live session frame scheduling',
    fn: () => {
      repeatHotPath(() => {
        runSharedLLMRuntimeSteady();
      }, 20);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[BASELINE] llm-runtime-steady -- parse and accumulate text',
    fn: () => {
      repeatHotPath(() => {
        runBaselineLLMRuntime();
      }, 20);
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIAGNOSTIC] edge-request -- shared adapter resolve',
    fn: async () => {
      await resolveSharedEdgeRequest();
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[BASELINE] edge-request -- direct hints + tier + theme',
    fn: () => {
      resolveBaselineEdgeRequest();
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[DIAGNOSTIC] worker-runtime-startup -- host bootstrap + first compute',
    fn: async () => {
      await withBenchWorkerGlobalsAsync(async () => {
        for (let iteration = 0; iteration < HOT_LOOP_REPEAT; iteration++) {
          await runWorkerHostRuntimeStartup();
        }
      });
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[BASELINE] worker-runtime-startup -- in-process parity bootstrap',
    fn: async () => {
      await repeatHotPathAsync(async () => {
        await runWorkerRuntimeStartupParityBaseline();
      });
    },
    options: asyncBenchTaskOptions,
  },
  {
    name: '[DIAGNOSTIC] worker-runtime-steady -- live runtime coordinator update',
    fn: () => {
      repeatHotPath(() => {
        runWorkerRuntimeCoordinatorSteady();
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[BASELINE] worker-runtime-steady -- shared evaluate only',
    fn: () => {
      repeatHotPath(() => {
        const state = evaluateWorkerDirectiveState(800);
        const payload = buildCompositePayload(state);
        workerRuntimePayloadSink = JSON.stringify(payload).length;
        if (workerRuntimePayloadSink < -1) {
          throw new Error('unreachable worker runtime steady baseline sink');
        }
      });
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[CANARY] bench -- integer accumulator',
    fn: () => {
      let accumulator = 0;
      repeatHotPath(() => {
        accumulator = (accumulator + 17) & 0xffff;
      });
      benchCanarySink = accumulator;
    },
    options: syncBenchTaskOptions,
  },
  {
    name: '[CANARY] bench -- stable JSON encode',
    fn: () => {
      let total = 0;
      repeatHotPath(() => {
        total += JSON.stringify({ value: 123, tier: 'good', active: true }).length;
      }, 50);
      benchCanarySink = total;
    },
    options: syncBenchTaskOptions,
  },
] as const;

const CANARY_BENCH_TASKS = DIRECTIVE_BENCH_TASKS.filter((task) =>
  BENCH_CANARY_TASK_NAMES.includes(task.name as (typeof BENCH_CANARY_TASK_NAMES)[number]),
);

function createCanaryBench(options?: Partial<ConstructorParameters<typeof Bench>[0]>): Bench {
  const config = buildDirectiveBenchConfig();
  const bench = new Bench({
    warmupIterations: config.warmupIterations,
    iterations: config.iterations,
    ...options,
  });

  for (const task of CANARY_BENCH_TASKS) {
    bench.add(task.name, task.fn, task.options);
  }

  return bench;
}

async function runCanarySnapshot(options?: Partial<ConstructorParameters<typeof Bench>[0]>): Promise<readonly BenchResult[]> {
  const bench = createCanaryBench(options);
  await bench.run();
  return collectBenchResults(bench);
}

function buildReplicateCanaryContext(
  before: readonly BenchResult[],
  after: readonly BenchResult[],
): ReplicateCanaryContext {
  const tasks = BENCH_CANARY_TASK_NAMES.map((name) => {
    const beforeMeanNs = before.find((result) => result.name === name)?.meanNs ?? null;
    const afterMeanNs = after.find((result) => result.name === name)?.meanNs ?? null;
    const deltaNs =
      beforeMeanNs === null || afterMeanNs === null ? null : Number((afterMeanNs - beforeMeanNs).toFixed(2));
    const deltaPct =
      beforeMeanNs === null || afterMeanNs === null || beforeMeanNs === 0
        ? null
        : Number((((afterMeanNs - beforeMeanNs) / beforeMeanNs) * 100).toFixed(2));

    return {
      name,
      beforeMeanNs,
      afterMeanNs,
      deltaNs,
      deltaPct,
    } satisfies ReplicateCanaryTaskContext;
  });

  const ambientSpreadsNs = tasks
    .map((task) => (task.deltaNs === null ? null : Math.abs(task.deltaNs)))
    .filter((value): value is number => value !== null);
  const ambientSpreadsPct = tasks
    .map((task) => (task.deltaPct === null ? null : Math.abs(task.deltaPct)))
    .filter((value): value is number => value !== null);

  return {
    tasks,
    ambientSpreadMeanNs: ambientSpreadsNs.length === 0 ? null : Number(Math.max(...ambientSpreadsNs).toFixed(2)),
    ambientSpreadPct: ambientSpreadsPct.length === 0 ? null : Number(Math.max(...ambientSpreadsPct).toFixed(2)),
  };
}

export function createDirectiveBench(options?: Partial<ConstructorParameters<typeof Bench>[0]>): Bench {
  const config = buildDirectiveBenchConfig();
  const bench = new Bench({
    warmupIterations: config.warmupIterations,
    iterations: config.iterations,
    ...options,
  });

  for (const task of DIRECTIVE_BENCH_TASKS) {
    bench.add(task.name, task.fn, task.options);
  }

  return bench;
}

export function collectBenchResults(bench: Pick<Bench, 'tasks'>): BenchResult[] {
  return bench.tasks.map((task) => {
    const latency = task.result?.latency;
    const throughput = task.result?.throughput;
    const opsPerSec = throughput?.mean ?? 0;
    const fallbackMeanNs = opsPerSec > 0 ? 1e9 / opsPerSec : 0;
    const meanNs = latency?.mean && latency.mean > 0 ? latency.mean * 1e6 : fallbackMeanNs;
    return {
      name: task.name,
      opsPerSec,
      meanNs,
      p75Ns: latency?.p75 && latency.p75 > 0 ? latency.p75 * 1e6 : meanNs,
      p99Ns: latency?.p99 && latency.p99 > 0 ? latency.p99 * 1e6 : meanNs,
      latencyTier: classifyResult(opsPerSec),
    };
  });
}

export function evaluateBenchPairs(
  results: readonly BenchResult[],
  pairs: readonly BenchPair[] = DIRECTIVE_BENCH_PAIRS,
  workerStartupSplit?: WorkerStartupSplitResult,
): PairEvaluation[] {
  return pairs.map((pair) => {
    if (pair.label === 'worker-runtime-startup-shared') {
      const supportMeanNs = workerStartupSplit?.shared.supportMeanNs ?? null;
      const parityMeanNs = workerStartupSplit?.shared.parityMeanNs ?? null;
      const overhead =
        supportMeanNs === null || parityMeanNs === null || parityMeanNs <= 0
          ? null
          : Number((((supportMeanNs - parityMeanNs) / parityMeanNs)).toFixed(4));

      return {
        ...pair,
        directiveResult:
          supportMeanNs === null
            ? undefined
            : {
                name: pair.directive,
                opsPerSec: supportMeanNs <= 0 ? 0 : 1e9 / supportMeanNs,
                meanNs: supportMeanNs,
                p75Ns: supportMeanNs,
                p99Ns: supportMeanNs,
                latencyTier: classifyResult(supportMeanNs <= 0 ? 0 : 1e9 / supportMeanNs),
              },
        baselineResult:
          parityMeanNs === null
            ? undefined
            : {
                name: pair.baseline,
                opsPerSec: parityMeanNs <= 0 ? 0 : 1e9 / parityMeanNs,
                meanNs: parityMeanNs,
                p75Ns: parityMeanNs,
                p99Ns: parityMeanNs,
                latencyTier: classifyResult(parityMeanNs <= 0 ? 0 : 1e9 / parityMeanNs),
              },
        overhead,
        missing: supportMeanNs === null || parityMeanNs === null || parityMeanNs <= 0,
        pass: supportMeanNs !== null && parityMeanNs !== null && parityMeanNs > 0,
      };
    }

    const directiveResult = results.find((result) => result.name === pair.directive);
    const baselineResult = results.find((result) => result.name === pair.baseline);

    if (!directiveResult || !baselineResult || baselineResult.meanNs <= 0) {
      return {
        ...pair,
        directiveResult,
        baselineResult,
        overhead: null,
        missing: true,
        pass: false,
      };
    }

    const overhead = (directiveResult.meanNs - baselineResult.meanNs) / baselineResult.meanNs;
    return {
      ...pair,
      directiveResult,
      baselineResult,
      overhead,
      missing: false,
      pass: overhead <= pair.threshold,
    };
  });
}

export async function runDirectiveBenchReplicates(
  replicates = DEFAULT_GATE_REPLICATES,
  options?: Partial<ConstructorParameters<typeof Bench>[0]>,
): Promise<ReplicateResult[]> {
  const results: ReplicateResult[] = [];

  for (let replicate = 0; replicate < replicates; replicate++) {
    const canaryBefore = await runCanarySnapshot(options);
    const bench = createDirectiveBench(options);
    await bench.run();
    const benchResults = collectBenchResults(bench);
    const canaryAfter = await runCanarySnapshot(options);
    const startupBreakdown = await measureWorkerStartupBreakdown();
    const workerStartupAnalysis = await measureWorkerStartupAnalysis();
    results.push({
      replicate,
      results: benchResults,
      pairs: evaluateBenchPairs(benchResults, DIRECTIVE_BENCH_PAIRS, workerStartupAnalysis.split),
      startupBreakdown,
      workerStartupAudit: workerStartupAnalysis.audit,
      workerStartupSplit: workerStartupAnalysis.split,
      canaryContext: buildReplicateCanaryContext(canaryBefore, canaryAfter),
    });
  }

  return results;
}

export function evaluateBenchPairsAcrossReplicates(
  replicateResults: readonly ReplicateResult[],
  pairs: readonly BenchPair[] = DIRECTIVE_BENCH_PAIRS,
): ReplicatedPairEvaluation[] {
  return pairs.map((pair) => {
    const replicates = replicateResults.map((result) => result.pairs.find((candidate) => candidate.label === pair.label) ?? {
      ...pair,
      overhead: null,
      missing: true,
      pass: false,
    });

    const valid = replicates.filter(
      (result): result is PairEvaluation & { readonly overhead: number } => !result.missing && result.overhead !== null,
    );
    const overheads = replicates.map((result) => result.overhead);
    const missingReplicates = replicates.length - valid.length;
    const medianOverhead = median(valid.map((result) => result.overhead));
    const medianDirectiveNs = median(valid.map((result) => result.directiveResult!.meanNs));
    const medianBaselineNs = median(valid.map((result) => result.baselineResult!.meanNs));
    const exceedances = valid.filter((result) => result.overhead > pair.threshold).length;
    const requiredExceedances = valid.length > 0 ? Math.max(1, valid.length - 1) : 1;
    const missing = missingReplicates > 0;
    const failGate = missing || (medianOverhead !== null && medianOverhead > pair.threshold && exceedances >= requiredExceedances);
    const warning =
      !pair.gate &&
      (pair.warnOnThreshold ?? true) &&
      medianOverhead !== null &&
      medianOverhead > pair.threshold;
    const medianHeadroomPct =
      medianOverhead === null ? null : Number((((pair.threshold - medianOverhead) * 100)).toFixed(2));
    const watch =
      !pair.gate &&
      !missing &&
      (warning ||
        exceedances >= DIAGNOSTIC_WATCH_EXCEEDANCES ||
        (medianHeadroomPct !== null && medianHeadroomPct <= DIAGNOSTIC_WATCH_HEADROOM_PCT));

    return {
      ...pair,
      replicates,
      validReplicates: valid.length,
      missingReplicates,
      exceedances,
      requiredExceedances,
      medianDirectiveNs,
      medianBaselineNs,
      medianOverhead,
      missing,
      pass: pair.gate ? !failGate : !missing,
      warning,
      watch,
      overheads,
      spread: spread(valid.map((result) => result.overhead)),
    };
  });
}

export function summarizeWorkerStartupAudit(
  replicateResults: readonly ReplicateResult[],
): WorkerStartupAuditResult {
  const audits = replicateResults.map((replicate) => replicate.workerStartupAudit);
  const rows = WORKER_STARTUP_DIAGNOSTIC_STAGE_LABELS.map(({ stage, label, inclusion }) => {
    const supportSamples = audits.map((audit) => audit.rows.find((row) => row.stage === stage)?.supportMeanNs ?? 0);
    const paritySamples = audits.map((audit) => audit.rows.find((row) => row.stage === stage)?.parityMeanNs ?? 0);
    const residualSamples = audits.map((audit) => audit.rows.find((row) => row.stage === stage)?.residualMeanNs ?? 0);

    return {
      stage,
      label,
      inclusion,
      supportMeanNs: Number((median(supportSamples) ?? 0).toFixed(2)),
      parityMeanNs: inclusion === 'both' ? Number((median(paritySamples) ?? 0).toFixed(2)) : null,
      residualMeanNs: Number((median(residualSamples) ?? 0).toFixed(2)),
    } satisfies WorkerStartupAuditRowResult;
  });

  const dominantRow = [...rows].sort((left, right) => right.residualMeanNs - left.residualMeanNs)[0] ?? null;
  const dominantStage = dominantRow?.stage ?? null;
  const posture =
    dominantStage === 'request-compute:packet-finalize' || dominantStage === 'request-compute:post-send-bookkeeping'
      ? 'optimize-current-contract'
      : dominantStage === 'coordinator-reset-or-create:runtime-reset-reuse'
        ? 'reframe-parity-envelope'
        : 'accept-honest-residual';
  const conclusion =
    posture === 'optimize-current-contract'
      ? 'request-compute remains dominant because startup packet or dispatch-adjacent bookkeeping still looks mechanically reducible inside the current contract.'
      : posture === 'reframe-parity-envelope'
        ? 'the current parity baseline still under-charges equivalent lifecycle work, so part of the residual is metric-envelope drift rather than product debt.'
        : 'state delivery and worker-only handoff remain dominant, so the residual is mostly honest async worker seam cost inside the current contract.';

  return {
    posture,
    conclusion,
    dominantStage,
    rows,
  };
}

export function summarizeWorkerStartupSplit(
  replicateResults: readonly ReplicateResult[],
): WorkerStartupSplitResult {
  const visibleFirstPaintSamples = replicateResults.map((replicate) => replicate.workerStartupSplit.visibleFirstPaintMeanNs);
  const workerTakeoverSamples = replicateResults.map((replicate) => replicate.workerStartupSplit.workerTakeoverMeanNs);
  const sharedSupportSamples = replicateResults.map((replicate) => replicate.workerStartupSplit.shared.supportMeanNs);
  const sharedParitySamples = replicateResults.map((replicate) => replicate.workerStartupSplit.shared.parityMeanNs);
  const sharedResidualSamples = replicateResults.map((replicate) => replicate.workerStartupSplit.shared.residualMeanNs);
  const sharedOverheadSamples = replicateResults
    .map((replicate) => replicate.workerStartupSplit.shared.overheadPct)
    .filter((value): value is number => typeof value === 'number');
  const seamAbsoluteSamples = replicateResults.map((replicate) => replicate.workerStartupSplit.seam.absoluteMeanNs);
  const seamDerivedSamples = replicateResults
    .map((replicate) => replicate.workerStartupSplit.seam.derivedPct)
    .filter((value): value is number => typeof value === 'number');
  const messageReceiptResidualSamples = replicateResults.map(
    (replicate) => replicate.workerStartupSplit.seam.messageReceiptResidualNs,
  );
  const dispatchSendResidualSamples = replicateResults.map(
    (replicate) => replicate.workerStartupSplit.seam.dispatchSendResidualNs,
  );
  const messageReceiptShareSamples = replicateResults
    .map((replicate) => replicate.workerStartupSplit.seam.messageReceiptSharePct)
    .filter((value): value is number => typeof value === 'number');
  const dispatchSendShareSamples = replicateResults
    .map((replicate) => replicate.workerStartupSplit.seam.dispatchSendSharePct)
    .filter((value): value is number => typeof value === 'number');
  const sharedResidualShareSamples = replicateResults
    .map((replicate) => replicate.workerStartupSplit.seam.sharedResidualSharePct)
    .filter((value): value is number => typeof value === 'number');
  const tailRatioSamples = replicateResults
    .map((replicate) => replicate.workerStartupSplit.seam.tailRatioP99ToMedian)
    .filter((value): value is number => typeof value === 'number');

  const seamComponents = Array.from(
    new Set(
      replicateResults.flatMap((replicate) => replicate.workerStartupSplit.seam.components.map((component) => component.stage)),
    ),
  ).map((stage) => {
    const sampleComponents = replicateResults
      .map((replicate) => replicate.workerStartupSplit.seam.components.find((component) => component.stage === stage) ?? null)
      .filter((component): component is NonNullable<typeof component> => component !== null);

    return {
      stage,
      label: sampleComponents[0]?.label ?? stage,
      kind: sampleComponents[0]?.kind ?? 'worker-only',
      residualMeanNs: Number((median(sampleComponents.map((component) => component.residualMeanNs)) ?? 0).toFixed(2)),
    };
  });
  const dominantSeamComponent = [...seamComponents].sort((left, right) => right.residualMeanNs - left.residualMeanNs)[0] ?? null;
  const sharedOverheadMedian = median(sharedOverheadSamples);
  const messageReceiptShareMedian = median(messageReceiptShareSamples);
  const dispatchSendShareMedian = median(dispatchSendShareSamples);
  const sharedResidualShareMedian = median(sharedResidualShareSamples);
  const tailRatioMedian = median(tailRatioSamples);
  const seamConclusion =
    dominantSeamComponent === null
      ? 'No worker-only seam residual was captured in the current startup audit.'
      : (sharedOverheadMedian ?? Number.POSITIVE_INFINITY) > WORKER_SHARED_STARTUP_THRESHOLD_PCT
        ? 'Shared bootstrap drift is still materially present, so the seam should be read as mixed bootstrap-plus-handoff residue until parity settles again.'
        : (messageReceiptShareMedian ?? 0) >= 60
          ? 'Off-thread handoff pressure dominates the remaining seam, with message receipt clearly outweighing dispatch and shared bootstrap residue.'
          : dominantSeamComponent.stage === 'state-delivery:callback-queue-turn'
            ? 'Host callback congestion is now the dominant worker-only residue, so queue-turn pressure matters more than transport payload size.'
            : 'Worker-only dispatch, receipt, and callback residual dominate the remaining worker startup seam, so this note should be read as honest off-thread cost first and percent second.';

  return {
    visibleFirstPaintMeanNs: Number((median(visibleFirstPaintSamples) ?? 0).toFixed(2)),
    workerTakeoverMeanNs: Number((median(workerTakeoverSamples) ?? 0).toFixed(2)),
    shared: {
      label: 'worker-runtime-startup-shared',
      supportMeanNs: Number((median(sharedSupportSamples) ?? 0).toFixed(2)),
      parityMeanNs: Number((median(sharedParitySamples) ?? 0).toFixed(2)),
      residualMeanNs: Number((median(sharedResidualSamples) ?? 0).toFixed(2)),
      overheadPct: sharedOverheadSamples.length === 0 ? null : Number((median(sharedOverheadSamples) ?? 0).toFixed(2)),
      thresholdPct: WORKER_SHARED_STARTUP_THRESHOLD_PCT,
      conclusion:
        (median(sharedOverheadSamples) ?? Number.POSITIVE_INFINITY) <= WORKER_SHARED_STARTUP_THRESHOLD_PCT
          ? 'Shared worker startup work is within the diagnostic target, so the broad residual is no longer dominated by bootstrap parity debt.'
          : 'Shared worker startup work is still above the diagnostic target, so comparable bootstrap work remains a valid optimization surface.',
    },
    seam: {
      label: 'worker-runtime-startup-seam',
      absoluteMeanNs: Number((median(seamAbsoluteSamples) ?? 0).toFixed(2)),
      derivedPct: seamDerivedSamples.length === 0 ? null : Number((median(seamDerivedSamples) ?? 0).toFixed(2)),
      dominantStage: dominantSeamComponent?.stage ?? null,
      messageReceiptResidualNs: Number((median(messageReceiptResidualSamples) ?? 0).toFixed(2)),
      dispatchSendResidualNs: Number((median(dispatchSendResidualSamples) ?? 0).toFixed(2)),
      messageReceiptSharePct:
        messageReceiptShareSamples.length === 0 ? null : Number((messageReceiptShareMedian ?? 0).toFixed(2)),
      dispatchSendSharePct:
        dispatchSendShareSamples.length === 0 ? null : Number((dispatchSendShareMedian ?? 0).toFixed(2)),
      sharedResidualSharePct:
        sharedResidualShareSamples.length === 0 ? null : Number((sharedResidualShareMedian ?? 0).toFixed(2)),
      toBrowserStartupMedianPct: null,
      tailRatioP99ToMedian: tailRatioSamples.length === 0 ? null : Number((tailRatioMedian ?? 0).toFixed(2)),
      conclusion: seamConclusion,
      components: seamComponents,
    },
  };
}

export function summarizeLLMRuntimeSteadySignals(
  replicateResults: readonly ReplicateResult[],
): LLMRuntimeSteadySignals {
  const steadyPairs = replicateResults
    .map((replicate) => replicate.pairs.find((pair) => pair.label === 'llm-runtime-steady') ?? null)
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null);
  const validSteadyPairCount = steadyPairs.filter((pair) => !pair.missing).length;
  const exceedanceCount = steadyPairs.filter(
    (pair) => !pair.missing && pair.overhead !== null && pair.overhead > pair.threshold,
  ).length;
  const directiveSteadyResults = replicateResults
    .map(
      (replicate) =>
        replicate.results.find((result) => result.name === '[DIAGNOSTIC] llm-runtime-steady -- live session frame scheduling')
          ?? null,
    )
    .filter((result): result is NonNullable<typeof result> => result !== null);
  const baselineSteadyResults = replicateResults
    .map(
      (replicate) =>
        replicate.results.find((result) => result.name === '[BASELINE] llm-runtime-steady -- parse and accumulate text')
          ?? null,
    )
    .filter((result): result is NonNullable<typeof result> => result !== null);
  const longText64Ns = measureLLMSteadyScenario(buildLongTextRuntimeChunks(64));
  const longText256Ns = measureLLMSteadyScenario(buildLongTextRuntimeChunks(256));
  const mixed64Ns = measureLLMSteadyScenario(buildMixedRuntimeChunks(64));
  const mixed256Ns = measureLLMSteadyScenario(buildMixedRuntimeChunks(256));
  const directiveP99Median = median(directiveSteadyResults.map((result) => result.p99Ns));
  const baselineP99Median = median(baselineSteadyResults.map((result) => result.p99Ns));
  const directiveP75Median = median(directiveSteadyResults.map((result) => result.p75Ns));
  const baselineP75Median = median(baselineSteadyResults.map((result) => result.p75Ns));
  const replicateExceedanceRate =
    validSteadyPairCount === 0 ? 0 : Number((exceedanceCount / validSteadyPairCount).toFixed(4));
  const directiveP99ToBaselineP99 =
    directiveP99Median === null || baselineP99Median === null || baselineP99Median <= 0
      ? null
      : Number((directiveP99Median / baselineP99Median).toFixed(4));
  const directiveP75ToBaselineP75 =
    directiveP75Median === null || baselineP75Median === null || baselineP75Median <= 0
      ? null
      : Number((directiveP75Median / baselineP75Median).toFixed(4));
  const longSessionSlopeNsPerChunk = Number(((longText256Ns - longText64Ns) / (256 - 64)).toFixed(2));
  const mixedChunkSlopeNsPerChunk = Number(((mixed256Ns - mixed64Ns) / (256 - 64)).toFixed(2));
  const conclusion =
    replicateExceedanceRate > LLM_STEADY_REPLICATE_EXCEEDANCE_MAX
      ? 'LLM steady-state still shows real threshold flirtation across replicates, so burst handling and queue coalescing remain active watch items.'
      : (directiveP99ToBaselineP99 ?? 0) >= 1.25 && (directiveP75ToBaselineP75 ?? 0) < 1.15
        ? 'Median steady-state cost is controlled, but the tail is still more inflated than the center, which points to scheduler sensitivity under bursts.'
        : mixedChunkSlopeNsPerChunk > longSessionSlopeNsPerChunk * 1.1
          ? 'Mixed text and tool-call traffic scales worse than text-only sessions, so tool delta buffering and flush churn remain the sharper watch area.'
          : 'LLM steady-state looks materially closer to the baseline path, with residual cost behaving like a bounded scheduling tax instead of a runaway tail.';

  return {
    label: 'llm-runtime-steady',
    replicateExceedanceRate,
    directiveP99ToBaselineP99,
    directiveP75ToBaselineP75,
    longSessionSlopeNsPerChunk,
    mixedChunkSlopeNsPerChunk,
    conclusion,
  };
}

export function formatPairReport(result: ReplicatedPairEvaluation | PairEvaluation): string[] {
  if ('replicates' in result) {
    const status = result.missing ? (result.gate ? 'FAIL' : 'DIAG') : result.gate ? (result.pass ? 'PASS' : 'FAIL') : result.warning ? 'WARN' : 'DIAG';
    const overheadSummary = result.overheads
      .map((overhead) => (overhead === null ? 'missing' : `${(overhead * 100).toFixed(1)}%`))
      .join(', ');
    const headroomPct =
      result.medianOverhead === null ? null : Number(((result.threshold - result.medianOverhead) * 100).toFixed(1));
    const marginLine =
      result.gate &&
      !result.missing &&
      headroomPct !== null &&
      headroomPct >= 0 &&
      headroomPct < HARD_GATE_MARGIN_NOTE_PCT
        ? `        margin to threshold: ${headroomPct.toFixed(1)}pp`
        : null;

    if (result.missing) {
      return [
        `  [${status}] ${result.label}: missing benchmark task(s) in ${result.missingReplicates}/${result.replicates.length} replicates`,
        `        mode: ${result.gate ? 'hard gate' : 'diagnostic'} -- ${result.rationale}`,
      ];
    }

    return [
      `  [${status}] ${result.label}: median ${result.medianDirectiveNs!.toFixed(0)}ns vs ${result.medianBaselineNs!.toFixed(0)}ns`,
      `        median overhead: ${(result.medianOverhead! * 100).toFixed(1)}% (threshold: ${(result.threshold * 100).toFixed(1)}%)`,
      `        replicates over threshold: ${result.exceedances}/${result.validReplicates} (fail requires ${result.requiredExceedances}/${result.validReplicates})`,
      ...(marginLine === null ? [] : [marginLine]),
      `        class: ${result.runtimeClass} | spread: ${result.spread === null ? 'n/a' : `${(result.spread * 100).toFixed(1)}%`}`,
      `        replicate overheads: ${overheadSummary}`,
      `        mode: ${result.gate ? 'hard gate' : 'diagnostic'} -- ${result.rationale}`,
    ];
  }

  const status = result.pass ? 'PASS' : result.gate ? 'FAIL' : 'DIAG';
  const headroomPct =
    result.overhead === null ? null : Number(((result.threshold - result.overhead) * 100).toFixed(1));
  const marginLine =
    result.gate && headroomPct !== null && headroomPct >= 0 && headroomPct < HARD_GATE_MARGIN_NOTE_PCT
      ? `        margin to threshold: ${headroomPct.toFixed(1)}pp`
      : null;

  if (result.missing) {
    return [
      `  [${result.gate ? 'FAIL' : 'DIAG'}] ${result.label}: missing benchmark task(s) for ${result.directive} or ${result.baseline}`,
    ];
  }

  return [
    `  [${status}] ${result.label}: ${result.directiveResult!.meanNs.toFixed(0)}ns vs ${result.baselineResult!.meanNs.toFixed(0)}ns`,
    `        overhead: ${((result.overhead ?? 0) * 100).toFixed(1)}% (threshold: ${(result.threshold * 100).toFixed(1)}%)`,
    ...(marginLine === null ? [] : [marginLine]),
    `        class: ${result.runtimeClass}`,
    `        mode: ${result.gate ? 'hard gate' : 'diagnostic'} -- ${result.rationale}`,
  ];
}

export function formatDiagnosticWatchReport(results: readonly ReplicatedPairEvaluation[]): string[] {
  return results
    .filter((result) => result.watch)
    .map((result) => {
      const headroomPct =
        result.medianOverhead === null ? null : Number((((result.threshold - result.medianOverhead) * 100)).toFixed(1));
      const headroomSummary = headroomPct === null ? 'n/a' : `${headroomPct.toFixed(1)}pp`;
      return `  [WATCH] ${result.label}: headroom ${headroomSummary}, exceedances ${result.exceedances}/${result.validReplicates}, median ${(result.medianOverhead! * 100).toFixed(1)}% vs ${(result.threshold * 100).toFixed(1)}% threshold`;
    });
}

export function formatWorkerStartupSeamReport(split: WorkerStartupSplitResult | null | undefined): string[] {
  if (!split) {
    return [];
  }

  const workerOnlyShare =
    split.seam.messageReceiptSharePct === null || split.seam.dispatchSendSharePct === null
      ? null
      : Number((split.seam.messageReceiptSharePct + split.seam.dispatchSendSharePct).toFixed(1));
  const sharedResidualShare =
    split.seam.sharedResidualSharePct === null ? null : Number(split.seam.sharedResidualSharePct.toFixed(1));

  return [
    `        dominant seam: ${split.seam.dominantStage ?? 'n/a'}`,
    `        worker-only share: ${workerOnlyShare === null ? 'n/a' : `${workerOnlyShare.toFixed(1)}%`}`,
    `        shared residual share: ${sharedResidualShare === null ? 'n/a' : `${sharedResidualShare.toFixed(1)}%`}`,
  ];
}
