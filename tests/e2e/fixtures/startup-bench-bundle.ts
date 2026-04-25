import { WorkerHost } from '@czap/worker';
import { topOutliers } from '../../../scripts/paired-truth.js';
import llmDirective from '../../../packages/astro/src/client-directives/llm.js';
import {
  WORKER_STARTUP_STAGE_LABELS,
  type WorkerStartupStage,
  runWorkerStartupScenario,
  buildLLMStartupScenario,
  type LLMStartupMode,
} from './startup-scenarios.js';

declare global {
  interface Window {
    __startupRealityPromise: Promise<void>;
    __startupRealityResult: StartupRealityBrowserResult;
    __startupRealityError: string | null;
  }
}

interface SampleSummary {
  readonly min: number;
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

type WorkerStartupStageSummary = Record<WorkerStartupStage, SampleSummary | null>;

interface WorkerRealityResult {
  readonly iterations: number;
  readonly frameBudgetMs: number;
  readonly exceededFrameBudgetCount: number;
  readonly rawSamples: readonly number[];
  readonly topOutliers: ReturnType<typeof topOutliers>;
  readonly summary: {
    readonly totalStartupMs: SampleSummary;
    readonly stages: WorkerStartupStageSummary;
  };
}

interface LLMStartupSummary {
  readonly rawSamples: readonly number[];
  readonly topOutliers: ReturnType<typeof topOutliers>;
  readonly initToFirstTokenMs: SampleSummary;
  readonly openToFirstTokenMs: SampleSummary;
  readonly chunkToFirstTokenMs: SampleSummary;
}

interface LLMRealityResult {
  readonly iterations: number;
  readonly simple: LLMStartupSummary;
  readonly promoted: LLMStartupSummary;
}

interface StartupRealityBrowserResult {
  readonly worker: WorkerRealityResult;
  readonly llm: LLMRealityResult;
}

class EventSourceHarness {
  static instances: EventSourceHarness[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;

  constructor(readonly url: string) {
    EventSourceHarness.instances.push(this);
  }

  emitMessage(data: string, lastEventId = ''): void {
    this.readyState = 1;
    const event = new MessageEvent('message', { data });
    Object.defineProperty(event, 'lastEventId', {
      configurable: true,
      value: lastEventId,
    });
    this.onmessage?.(event);
  }

  close(): void {
    this.readyState = 2;
  }
}

function percentile(samples: readonly number[], ratio: number): number {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Number((sorted[index] ?? 0).toFixed(4));
}

function summarize(samples: readonly number[]): SampleSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    min: Number((sorted[0] ?? 0).toFixed(4)),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: Number((sorted.at(-1) ?? 0).toFixed(4)),
    mean: Number((samples.length === 0 ? 0 : total / samples.length).toFixed(4)),
  };
}

function summarizeOrNull(samples: readonly number[]): SampleSummary | null {
  return samples.length === 0 ? null : summarize(samples);
}

function currentTimeNs(): number {
  return performance.now() * 1e6;
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function measureWorkerStartup(iterations = 30): Promise<WorkerRealityResult> {
  const totalStartupMs: number[] = [];
  const frameBudgetMs = 16;
  const stageSamples: Record<WorkerStartupStage, number[]> = {
    'claim-or-create': [],
    'coordinator-reset-or-create': [],
    'listener-bind': [],
    'quantizer-bootstrap': [],
    'request-compute': [],
    'state-delivery': [],
    'dispose': [],
  };
  const iterationNotes: string[] = [];

  await runWorkerStartupScenario((startupTelemetry) => WorkerHost.create({ poolCapacity: 8 }, startupTelemetry));

  for (let iteration = 0; iteration < iterations; iteration++) {
    const iterationResult = await runWorkerStartupScenario(
      (startupTelemetry) => WorkerHost.create({ poolCapacity: 8 }, startupTelemetry),
    );

    totalStartupMs.push(iterationResult.totalStartupMs);
    for (const [stage, durationMs] of Object.entries(iterationResult.stages)) {
      stageSamples[stage as WorkerStartupStage].push(durationMs);
    }
    const dominantStage = [...WORKER_STARTUP_STAGE_LABELS]
      .sort(
        (left, right) =>
          (iterationResult.stages[right.stage as keyof typeof iterationResult.stages] ?? 0) -
          (iterationResult.stages[left.stage as keyof typeof iterationResult.stages] ?? 0),
      )[0];
    iterationNotes.push(
      dominantStage
        ? `dominant ${dominantStage.stage} ${(
            iterationResult.stages[dominantStage.stage as keyof typeof iterationResult.stages] ?? 0
          ).toFixed(4)}ms`
        : 'dominant stage unavailable',
    );
  }

  return {
    iterations,
    frameBudgetMs,
    exceededFrameBudgetCount: totalStartupMs.filter((sample) => sample > frameBudgetMs).length,
    rawSamples: totalStartupMs.map((sample) => Number(sample.toFixed(4))),
    topOutliers: topOutliers(totalStartupMs, 5, iterationNotes),
    summary: {
      totalStartupMs: summarize(totalStartupMs),
      stages: {
        'claim-or-create': summarizeOrNull(stageSamples['claim-or-create']),
        'coordinator-reset-or-create': summarizeOrNull(stageSamples['coordinator-reset-or-create']),
        'listener-bind': summarizeOrNull(stageSamples['listener-bind']),
        'quantizer-bootstrap': summarizeOrNull(stageSamples['quantizer-bootstrap']),
        'request-compute': summarizeOrNull(stageSamples['request-compute']),
        'state-delivery': summarizeOrNull(stageSamples['state-delivery']),
        dispose: summarizeOrNull(stageSamples.dispose),
      },
    },
  };
}

async function measureLLMStartupPath(
  mode: LLMStartupMode,
  iteration: number,
): Promise<{
  readonly initToFirstTokenMs: number;
  readonly openToFirstTokenMs: number;
  readonly chunkToFirstTokenMs: number;
}> {
  const host = document.createElement('section');
  host.setAttribute('data-czap-llm-url', '/llm');
  host.setAttribute('data-czap-llm-mode', 'append');
  const target = document.createElement('div');
  target.className = 'target';
  host.appendChild(target);
  document.body.appendChild(host);

  const initStart = performance.now();
  const scenario = buildLLMStartupScenario(mode);
  const tokenAt = new Promise<number>((resolve) => {
    let tokenCount = 0;
    host.addEventListener(
      'czap:llm-token',
      () => {
        tokenCount += 1;
        if (tokenCount === scenario.firstTokenOrdinal) {
          resolve(performance.now());
        }
      },
    );
  });

  llmDirective(async () => {}, {}, host);
  const source = EventSourceHarness.instances.at(-1);
  if (!source) {
    throw new Error('LLM startup harness failed to create an EventSource.');
  }

  source.onopen?.(new Event('open'));
  const openAt = performance.now();
  let chunkAt = openAt;
  for (const [index, message] of scenario.messages.entries()) {
    chunkAt = performance.now();
    source.emitMessage(message, `evt-${mode}-${iteration}-${index}`);
  }

  const firstTokenAt = await tokenAt;
  await waitForMicrotasks();

  host.dispatchEvent(new CustomEvent('czap:dispose'));
  host.remove();

  return {
    initToFirstTokenMs: Number((firstTokenAt - initStart).toFixed(4)),
    openToFirstTokenMs: Number((firstTokenAt - openAt).toFixed(4)),
    chunkToFirstTokenMs: Number((firstTokenAt - chunkAt).toFixed(4)),
  };
}

async function measureLLMStartup(iterations = 30): Promise<LLMRealityResult> {
  document.documentElement.setAttribute('data-czap-tier', 'reactive');

  const originalEventSource = window.EventSource;
  Object.defineProperty(window, 'EventSource', {
    configurable: true,
    value: EventSourceHarness,
  });

  const simple = {
    initToFirstTokenMs: [] as number[],
    openToFirstTokenMs: [] as number[],
    chunkToFirstTokenMs: [] as number[],
  };
  const promoted = {
    initToFirstTokenMs: [] as number[],
    openToFirstTokenMs: [] as number[],
    chunkToFirstTokenMs: [] as number[],
  };

  try {
    EventSourceHarness.instances = [];
    await measureLLMStartupPath('simple', -1);
    EventSourceHarness.instances = [];
    await measureLLMStartupPath('promoted', -1);

    for (let iteration = 0; iteration < iterations; iteration++) {
      EventSourceHarness.instances = [];
      const simpleResult = await measureLLMStartupPath('simple', iteration);
      simple.initToFirstTokenMs.push(simpleResult.initToFirstTokenMs);
      simple.openToFirstTokenMs.push(simpleResult.openToFirstTokenMs);
      simple.chunkToFirstTokenMs.push(simpleResult.chunkToFirstTokenMs);

      EventSourceHarness.instances = [];
      const promotedResult = await measureLLMStartupPath('promoted', iteration);
      promoted.initToFirstTokenMs.push(promotedResult.initToFirstTokenMs);
      promoted.openToFirstTokenMs.push(promotedResult.openToFirstTokenMs);
      promoted.chunkToFirstTokenMs.push(promotedResult.chunkToFirstTokenMs);
    }
  } finally {
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: originalEventSource,
    });
  }

  return {
    iterations,
    simple: {
      rawSamples: simple.chunkToFirstTokenMs.map((sample) => Number(sample.toFixed(4))),
      topOutliers: topOutliers(simple.chunkToFirstTokenMs, 5),
      initToFirstTokenMs: summarize(simple.initToFirstTokenMs),
      openToFirstTokenMs: summarize(simple.openToFirstTokenMs),
      chunkToFirstTokenMs: summarize(simple.chunkToFirstTokenMs),
    },
    promoted: {
      rawSamples: promoted.chunkToFirstTokenMs.map((sample) => Number(sample.toFixed(4))),
      topOutliers: topOutliers(promoted.chunkToFirstTokenMs, 5),
      initToFirstTokenMs: summarize(promoted.initToFirstTokenMs),
      openToFirstTokenMs: summarize(promoted.openToFirstTokenMs),
      chunkToFirstTokenMs: summarize(promoted.chunkToFirstTokenMs),
    },
  };
}

async function run(): Promise<void> {
  window.__startupRealityResult = {
    worker: await measureWorkerStartup(),
    llm: await measureLLMStartup(),
  };
}

window.__startupRealityError = null;
window.__startupRealityPromise = run().catch((error) => {
  window.__startupRealityError = String(error);
  throw error;
});
