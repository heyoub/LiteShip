import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';
import { repoRoot } from '../vitest.shared.js';
import { ensureArtifactContext } from './artifact-context.js';
import { buildBenchFacts } from './artifact-integrity.js';
import { isDirectExecution, writeTextFile } from './audit/shared.js';

interface SampleSummary {
  readonly min: number;
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

type WorkerStartupStage =
  | 'claim-or-create'
  | 'coordinator-reset-or-create'
  | 'listener-bind'
  | 'quantizer-bootstrap'
  | 'request-compute'
  | 'state-delivery'
  | 'dispose';

type WorkerStartupStageSummary = Record<WorkerStartupStage, SampleSummary | null>;

interface WorkerRealityResult {
  readonly iterations: number;
  readonly frameBudgetMs: number;
  readonly exceededFrameBudgetCount: number;
  readonly rawSamples: readonly number[];
  readonly topOutliers: readonly {
    readonly iteration: number;
    readonly valueMs: number;
    readonly note?: string;
  }[];
  readonly summary: {
    readonly totalStartupMs: SampleSummary;
    readonly stages: WorkerStartupStageSummary;
  };
}

interface LLMStartupSummary {
  readonly rawSamples: readonly number[];
  readonly topOutliers: readonly {
    readonly iteration: number;
    readonly valueMs: number;
    readonly note?: string;
  }[];
  readonly initToFirstTokenMs: SampleSummary;
  readonly openToFirstTokenMs: SampleSummary;
  readonly chunkToFirstTokenMs: SampleSummary;
  readonly resolution: {
    readonly timerResolutionFloorMs: number;
    readonly timerFloorLimited: boolean;
  };
}

interface LLMRealityResult {
  readonly iterations: number;
  readonly simple: LLMStartupSummary;
  readonly promoted: LLMStartupSummary;
}

type RawLLMStartupSummary = Omit<LLMStartupSummary, 'resolution'> & {
  readonly resolution?: LLMStartupSummary['resolution'];
};

interface RawLLMRealityResult {
  readonly iterations: number;
  readonly simple: RawLLMStartupSummary;
  readonly promoted: RawLLMStartupSummary;
}

interface RawStartupRealityBrowserResult {
  readonly worker: WorkerRealityResult;
  readonly llm: RawLLMRealityResult;
}

interface StartupRealityArtifact {
  readonly schemaVersion: 4;
  readonly generatedAt: string;
  readonly gauntletRunId: string;
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly expectedCounts: ReturnType<typeof ensureArtifactContext>['expectedCounts'];
  readonly sourceArtifacts: {
    readonly bench: {
      readonly path: string;
      readonly fingerprint: string;
      readonly generatedAt: string | null;
    };
  };
  readonly nodeProxy: {
    readonly workerRuntimeStartupMeanNs: number | null;
    readonly llmRuntimeStartupMeanNs: number | null;
    readonly llmRuntimePromotedStartupMeanNs: number | null;
  };
  readonly browser: {
    readonly worker: WorkerRealityResult;
    readonly llm: LLMRealityResult;
  };
  readonly divergence: {
    readonly workerRuntimeStartupPct: number | null;
    readonly llmRuntimeStartupPct: number | null;
    readonly llmRuntimePromotedStartupPct: number | null;
  };
}

type BenchReplicateResults = {
  readonly results?: ReadonlyArray<{
    readonly name: string;
    readonly meanNs: number;
  }>;
};

type StartupRealityWindow = Window & {
  __startupRealityPromise?: Promise<void>;
  __startupRealityResult?: RawStartupRealityBrowserResult;
  __startupRealityError?: string | null;
};

export type StartupRealityBrowserResult = StartupRealityArtifact['browser'];

const LLM_TIMER_RESOLUTION_FLOOR_MS = 0.125;

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function computeDivergence(browserMs: number, proxyNs: number | null): number | null {
  if (proxyNs === null || proxyNs <= 0) {
    return null;
  }

  const browserNs = browserMs * 1e6;
  const denominatorNs = Math.max(proxyNs, 100_000);
  return Number((((browserNs - proxyNs) / denominatorNs) * 100).toFixed(2));
}

function medianTaskMeanNs(replicates: readonly BenchReplicateResults[] | undefined, taskName: string): number | null {
  const samples =
    replicates
      ?.map((replicate) => replicate.results?.find((result) => result.name === taskName)?.meanNs ?? null)
      .filter((value): value is number => value !== null) ?? [];
  return median(samples);
}

function medianWorkerSharedSupportMeanNs(
  replicates:
    | readonly (BenchReplicateResults & {
        readonly workerStartupSplit?: {
          readonly shared?: {
            readonly supportMeanNs?: number | null;
          };
        };
      })[]
    | undefined,
): number | null {
  const samples =
    replicates
      ?.map((replicate) => replicate.workerStartupSplit?.shared?.supportMeanNs ?? null)
      .filter((value): value is number => typeof value === 'number') ?? [];
  return median(samples);
}

function browserWorkerSharedStartupMeanMs(browser: StartupRealityArtifact['browser']['worker']): number {
  const sharedStages: readonly WorkerStartupStage[] = [
    'claim-or-create',
    'coordinator-reset-or-create',
    'listener-bind',
    'quantizer-bootstrap',
  ];

  return Number(
    sharedStages
      .reduce((sum, stage) => sum + (browser.summary.stages[stage]?.mean ?? 0), 0)
      .toFixed(4),
  );
}

function withResolution(summary: RawLLMStartupSummary): LLMStartupSummary {
  const timerFloorLimited =
    summary.chunkToFirstTokenMs.median < LLM_TIMER_RESOLUTION_FLOOR_MS &&
    summary.chunkToFirstTokenMs.p75 < LLM_TIMER_RESOLUTION_FLOOR_MS;

  return {
    ...summary,
    resolution: {
      timerResolutionFloorMs: LLM_TIMER_RESOLUTION_FLOOR_MS,
      timerFloorLimited,
    },
  };
}

function findBenchPair(
  benchFacts: ReturnType<typeof buildBenchFacts>,
  label: string,
): (typeof benchFacts.bench.pairs)[number] | undefined {
  return benchFacts.bench.pairs.find((pair) => pair.label === label);
}

export function formatSharedStartupLine(
  label: string,
  summary: LLMStartupSummary,
  pair: (ReturnType<typeof buildBenchFacts>['bench']['pairs'][number]) | undefined,
  divergencePct: number | null,
): string {
  const prefix = `${label}: ${summary.chunkToFirstTokenMs.median.toFixed(4)}ms (p99 ${summary.chunkToFirstTokenMs.p99.toFixed(4)}ms`;

  if (summary.resolution.timerFloorLimited) {
    const verdict = pair?.pass === false ? 'FAIL' : 'PASS';
    const overhead =
      pair?.medianOverhead === null || pair?.medianOverhead === undefined
        ? 'n/a'
        : `${(pair.medianOverhead * 100).toFixed(1)}%`;
    return `${prefix}, timer-floor-limited; shared pair ${verdict} @ ${overhead} median overhead)`;
  }

  return `${prefix}, divergence ${divergencePct ?? 'n/a'}%)`;
}

async function buildBrowserBenchBundle(): Promise<string> {
  const fixturesRoot = resolve(repoRoot, 'tests', 'e2e', 'fixtures');
  const entry = resolve(fixturesRoot, 'startup-bench-bundle.ts');
  const result = await build({
    configFile: resolve(repoRoot, 'vite.config.ts'),
    root: fixturesRoot,
    build: {
      lib: {
        entry,
        formats: ['es'],
        fileName: 'startup-bench',
      },
      write: false,
      minify: false,
      sourcemap: 'inline',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'silent',
  });

  const output = Array.isArray(result) ? result[0] : result;
  const chunk = output.output.find((entry): entry is typeof output.output[number] & { readonly type: 'chunk'; readonly code: string } => entry.type === 'chunk');
  if (!chunk || typeof chunk.code !== 'string') {
    throw new Error('Unable to build startup reality browser bundle.');
  }

  return chunk.code;
}

async function measureBrowserStartup(): Promise<RawStartupRealityBrowserResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const html = readFileSync(resolve(repoRoot, 'tests', 'e2e', 'fixtures', 'startup-bench-harness.html'), 'utf8');
    const bundle = await buildBrowserBenchBundle();

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: bundle, type: 'module' });
    await page.waitForFunction(() => Boolean((window as StartupRealityWindow).__startupRealityPromise));
    await page.evaluate(() => (window as StartupRealityWindow).__startupRealityPromise);

    const error = await page.evaluate(() => (window as StartupRealityWindow).__startupRealityError ?? null);
    if (error) {
      throw new Error(error);
    }

    const result = await page.evaluate(() => (window as StartupRealityWindow).__startupRealityResult ?? null);
    if (!result) {
      throw new Error('Startup reality harness did not produce a browser result.');
    }

    return result;
  } finally {
    await page.close();
    await browser.close();
  }
}

export function buildStartupRealityArtifact(
  context: ReturnType<typeof ensureArtifactContext>,
  benchFacts: ReturnType<typeof buildBenchFacts>,
  browserResult: RawStartupRealityBrowserResult,
  generatedAt = new Date().toISOString(),
): StartupRealityArtifact {
  const benchWithResults = benchFacts.bench as typeof benchFacts.bench & {
    readonly replicates?: readonly BenchReplicateResults[];
  };
  const llmRuntimeStartupMeanNs = medianTaskMeanNs(
    benchWithResults.replicates,
    '[BASELINE] llm-startup-shared -- node first token boundary',
  ) ?? medianTaskMeanNs(benchWithResults.replicates, '[GATE] llm-startup-shared -- first token boundary');
  const llmRuntimePromotedStartupMeanNs = medianTaskMeanNs(
    benchWithResults.replicates,
    '[BASELINE] llm-promoted-startup-shared -- node second token boundary',
  ) ?? medianTaskMeanNs(benchWithResults.replicates, '[GATE] llm-promoted-startup-shared -- second token boundary');
  const workerSharedStartupMeanNs =
    medianWorkerSharedSupportMeanNs(benchWithResults.replicates) ??
    medianTaskMeanNs(benchWithResults.replicates, '[DIAGNOSTIC] worker-runtime-startup -- host bootstrap + first compute');
  const normalizedBrowser = {
    worker: browserResult.worker,
    llm: {
      iterations: browserResult.llm.iterations,
      simple: withResolution(browserResult.llm.simple),
      promoted: withResolution(browserResult.llm.promoted),
    },
  } satisfies StartupRealityArtifact['browser'];

  return {
    schemaVersion: 4,
    generatedAt,
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    expectedCounts: context.expectedCounts,
    sourceArtifacts: {
      bench: {
        path: benchFacts.artifact.path,
        fingerprint: benchFacts.artifact.fingerprint,
        generatedAt: benchFacts.bench.generatedAt,
      },
    },
    nodeProxy: {
      workerRuntimeStartupMeanNs: workerSharedStartupMeanNs,
      llmRuntimeStartupMeanNs,
      llmRuntimePromotedStartupMeanNs,
    },
    browser: normalizedBrowser,
    divergence: {
      workerRuntimeStartupPct: computeDivergence(
        browserWorkerSharedStartupMeanMs(normalizedBrowser.worker),
        workerSharedStartupMeanNs,
      ),
      llmRuntimeStartupPct: computeDivergence(
        normalizedBrowser.llm.simple.chunkToFirstTokenMs.mean,
        llmRuntimeStartupMeanNs,
      ),
      llmRuntimePromotedStartupPct: computeDivergence(
        normalizedBrowser.llm.promoted.chunkToFirstTokenMs.mean,
        llmRuntimePromotedStartupMeanNs,
      ),
    },
  };
}

export async function runBenchReality(root = repoRoot): Promise<StartupRealityArtifact> {
  const context = ensureArtifactContext(root);
  const benchFacts = buildBenchFacts(root);
  const browserResult = await measureBrowserStartup();

  const artifact = buildStartupRealityArtifact(context, benchFacts, browserResult);
  const artifactPath = resolve(root, 'benchmarks', 'startup-reality.json');
  writeTextFile(artifactPath, JSON.stringify(artifact, null, 2));

  console.log(`Wrote ${artifactPath}`);
  console.log(
    `Browser worker startup median: ${artifact.browser.worker.summary.totalStartupMs.median.toFixed(4)}ms (p99 ${artifact.browser.worker.summary.totalStartupMs.p99.toFixed(4)}ms, divergence ${artifact.divergence.workerRuntimeStartupPct ?? 'n/a'}%)`,
  );
  console.log(
    formatSharedStartupLine(
      'Browser llm simple shared startup median',
      artifact.browser.llm.simple,
      findBenchPair(benchFacts, 'llm-startup-shared'),
      artifact.divergence.llmRuntimeStartupPct,
    ),
  );
  console.log(
    formatSharedStartupLine(
      'Browser llm promoted shared startup median',
      artifact.browser.llm.promoted,
      findBenchPair(benchFacts, 'llm-promoted-startup-shared'),
      artifact.divergence.llmRuntimePromotedStartupPct,
    ),
  );
  return artifact;
}

async function main(): Promise<void> {
  await runBenchReality();
}

if (isDirectExecution(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
