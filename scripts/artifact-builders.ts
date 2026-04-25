import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import libCoverage from 'istanbul-lib-coverage';
import { coverageExclude, coverageInclude, repoRoot } from '../vitest.shared.js';
import type { ArtifactExpectedCounts } from './artifact-context.js';
import {
  DEFAULT_FIDELITY_DRIFT_TARGET_PCT,
  LLM_STARTUP_BUDGET,
  WORKER_STARTUP_BUDGET,
  buildShapeGuards,
  classifyDivergence,
  createPairedTruthEntry,
  sampleSummaryAbsoluteDeltaMs,
  type PairedTruthFidelity,
  type PairedTruthEntry,
  type SupportBaselineKind,
} from './paired-truth.js';
import type {
  MetricKey,
  MetricSummary,
  SampleSummary,
  FileArtifactMetadata,
  CoverageTotals,
  CoverageHotspot,
  CoverageMetaArtifact,
  CoverageFacts,
  RuntimeSeamPairSummary,
  BenchArtifact,
  BenchFacts,
  StartupRealityFacts,
  StartupRealityArtifact,
  RuntimeSeamsReportArtifact,
} from './artifact-types.js';

export type {
  MetricKey,
  MetricSummary,
  SampleSummary,
  FileArtifactMetadata,
  CoverageTotals,
  CoverageHotspot,
  CoverageMetaArtifact,
  CoverageFacts,
  RuntimeSeamPairSummary,
  BenchArtifact,
  BenchFacts,
  StartupRealityFacts,
  StartupRealityArtifact,
};

const { createCoverageMap } = libCoverage;

function hashContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

function normalizeMetric(summary: MetricSummary | Record<string, number | string>): MetricSummary {
  return {
    total: Number(summary.total),
    covered: Number(summary.covered),
    skipped: Number(summary.skipped),
    pct: Number(summary.pct),
  };
}

function summaryToObject(
  summary: { data: Record<MetricKey, MetricSummary | Record<string, number | string>> } | Record<MetricKey, MetricSummary | Record<string, number | string>>,
): Record<MetricKey, MetricSummary> {
  const raw = 'data' in summary ? summary.data : summary;
  return {
    lines: normalizeMetric(raw.lines),
    statements: normalizeMetric(raw.statements),
    functions: normalizeMetric(raw.functions),
    branches: normalizeMetric(raw.branches),
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function buildCoveragePolicyFingerprint(): string {
  return hashContent(
    JSON.stringify({
      include: [...coverageInclude],
      exclude: [...coverageExclude],
    }),
  );
}

export function fingerprintFile(filePath: string): FileArtifactMetadata {
  const absolutePath = normalizePath(filePath);
  const content = readText(absolutePath);
  const stats = statSync(absolutePath);
  return {
    path: absolutePath,
    fingerprint: hashContent(content),
    sizeBytes: stats.size,
    mtime: stats.mtime.toISOString(),
  };
}

export function buildCoverageFacts(root = repoRoot): CoverageFacts {
  const normalizedRoot = normalizePath(root);
  const coveragePath = resolve(root, 'coverage', 'coverage-final.json');
  if (!existsSync(coveragePath)) {
    throw new Error(`Missing merged coverage artifact at ${normalizePath(coveragePath)}.`);
  }

  const coverageArtifact = fingerprintFile(coveragePath);
  const coverageMap = createCoverageMap(readJson<Record<string, unknown>>(coveragePath));
  const totalsSummary = summaryToObject(coverageMap.getCoverageSummary());
  const runtimeFiles = fg
    .sync(coverageInclude, {
      cwd: root,
      absolute: true,
      onlyFiles: true,
      ignore: coverageExclude,
    })
    .map((file) => normalizePath(file));
  const coveredFiles = new Set(
    coverageMap.files().map((file) => {
      const normalized = normalizePath(file);
      return normalized.startsWith(normalizedRoot) ? normalized : normalizePath(resolve(root, normalized));
    }),
  );
  const missingRuntimeFiles = runtimeFiles
    .filter((file) => !coveredFiles.has(file))
    .map((file) => file.replace(/^.*?packages\//, 'packages/'))
    .sort((a, b) => a.localeCompare(b));

  const branchEntries = coverageMap
    .files()
    .map((file) => {
      const normalized = normalizePath(file);
      const relativeFile = normalized.startsWith(normalizedRoot)
        ? normalized.replace(/^.*?packages\//, 'packages/')
        : normalized.replace(/^.*?packages\//, 'packages/');
      const summary = summaryToObject(coverageMap.fileCoverageFor(file).toSummary());
      const packageName = relativeFile.match(/packages\/([^/]+)\/src\//)?.[1] ?? 'other';
      return {
        file: relativeFile,
        package: packageName,
        branches: summary.branches,
        lines: summary.lines,
      };
    })
    .filter((entry) => entry.branches.total > 0)
    .sort((a, b) => a.branches.pct - b.branches.pct);

  const topBranchHotspots = branchEntries.slice(0, 10).map((entry) => ({
    file: entry.file,
    package: entry.package,
    branchPct: entry.branches.pct,
    branchCovered: entry.branches.covered,
    branchTotal: entry.branches.total,
    linePct: entry.lines.pct,
  }));

  const zeroCoverageFiles = coverageMap
    .files()
    .map((file) => {
      const normalized = normalizePath(file);
      const relativeFile = normalized.startsWith(normalizedRoot)
        ? normalized.replace(/^.*?packages\//, 'packages/')
        : normalized.replace(/^.*?packages\//, 'packages/');
      const summary = summaryToObject(coverageMap.fileCoverageFor(file).toSummary());
      return {
        file: relativeFile,
        lines: summary.lines,
      };
    })
    .filter((entry) => entry.lines.total > 0 && entry.lines.covered === 0)
    .map((entry) => entry.file)
    .sort((a, b) => a.localeCompare(b));

  const coverageMetaPath = resolve(root, 'coverage', 'coverage-meta.json');
  const metaArtifact = existsSync(coverageMetaPath) ? fingerprintFile(coverageMetaPath) : null;
  const meta = existsSync(coverageMetaPath) ? readJson<CoverageMetaArtifact>(coverageMetaPath) : null;

  return {
    artifact: coverageArtifact,
    metaArtifact,
    meta,
    totals: {
      statements: totalsSummary.statements.pct,
      branches: totalsSummary.branches.pct,
      functions: totalsSummary.functions.pct,
      lines: totalsSummary.lines.pct,
    },
    topBranchHotspots,
    zeroCoverageFiles,
    missingRuntimeFiles,
    policyFingerprint: buildCoveragePolicyFingerprint(),
  };
}

function normalizeRuntimeSeamPair(pair: BenchArtifact['pairs'][number]): RuntimeSeamPairSummary {
  return {
    label: pair.label,
    pass: pair.pass,
    runtimeClass: pair.runtimeClass,
    medianOverheadPct: pair.medianOverhead === null ? null : Number((pair.medianOverhead * 100).toFixed(2)),
    thresholdPct: Number((pair.threshold * 100).toFixed(2)),
  };
}

function runtimeSeamPairOverheadPct(
  benchFacts: BenchFacts | undefined,
  label: string,
): number | null {
  const matchedPair = benchFacts?.hardGates.find((pair) => pair.label === label);
  return matchedPair?.medianOverheadPct ?? null;
}

export function buildBenchFacts(root = repoRoot): BenchFacts {
  const benchPath = resolve(root, 'benchmarks', 'directive-gate.json');
  if (!existsSync(benchPath)) {
    throw new Error(`Missing bench artifact at ${normalizePath(benchPath)}.`);
  }

  const artifact = fingerprintFile(benchPath);
  const bench = readJson<BenchArtifact>(benchPath);

  return {
    artifact,
    bench,
    hardGates: bench.pairs.filter((pair) => pair.gate).map(normalizeRuntimeSeamPair),
  };
}

export function buildStartupRealityFacts(root = repoRoot): StartupRealityFacts {
  const startupRealityPath = resolve(root, 'benchmarks', 'startup-reality.json');
  if (!existsSync(startupRealityPath)) {
    throw new Error(`Missing startup reality artifact at ${normalizePath(startupRealityPath)}.`);
  }

  return {
    artifact: fingerprintFile(startupRealityPath),
    startupReality: readJson<StartupRealityArtifact>(startupRealityPath),
  };
}

function normalizeSampleSummary(
  summary: SampleSummary | Record<string, number | string> | undefined,
): SampleSummary | null {
  if (!summary) {
    return null;
  }

  return {
    min: Number(summary.min),
    median: Number(summary.median),
    p75: Number(summary.p75),
    p95: Number(summary.p95),
    p99: Number(summary.p99),
    max: Number(summary.max),
    mean: Number(summary.mean),
  };
}

function supportLaneSummaryFromSamples(samples: readonly number[]): SampleSummary | null {
  if (samples.length === 0) {
    return null;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const quantile = (ratio: number): number => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(ratio * (sorted.length - 1))));
    return Number((sorted[index] ?? 0).toFixed(4));
  };
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;

  return {
    min: Number((sorted[0] ?? 0).toFixed(4)),
    median: quantile(0.5),
    p75: quantile(0.75),
    p95: quantile(0.95),
    p99: quantile(0.99),
    max: Number((sorted.at(-1) ?? 0).toFixed(4)),
    mean: Number(mean.toFixed(4)),
  };
}

function taskMeanSamplesMs(bench: BenchArtifact, taskName: string): readonly number[] {
  const directSamples = bench.replicates
    ?.map((replicate) => replicate.results?.find((result) => result.name === taskName)?.meanNs ?? null)
    .filter((value): value is number => typeof value === 'number')
    .map((value) => Number((value / 1e6).toFixed(4)));
  if ((directSamples?.length ?? 0) > 0) {
    return directSamples!;
  }

  return [];
}

function workerSharedSupportSamplesMs(bench: BenchArtifact): readonly number[] {
  const directSamples = bench.replicates
    ?.map((replicate) => replicate.workerStartupSplit?.shared?.supportMeanNs ?? null)
    .filter((value): value is number => typeof value === 'number')
    .map((value) => Number((value / 1e6).toFixed(4)));
  if ((directSamples?.length ?? 0) > 0) {
    return directSamples!;
  }

  const summaryValue = bench.workerStartupSplit?.shared?.supportMeanNs;
  return typeof summaryValue === 'number' ? [Number((summaryValue / 1e6).toFixed(4))] : [];
}

function sumSampleSummaries(summaries: readonly (SampleSummary | null | undefined)[]): SampleSummary | null {
  const present = summaries.filter((summary): summary is SampleSummary => summary !== null && summary !== undefined);
  if (present.length === 0) {
    return null;
  }

  return {
    min: Number(present.reduce((sum, summary) => sum + summary.min, 0).toFixed(4)),
    median: Number(present.reduce((sum, summary) => sum + summary.median, 0).toFixed(4)),
    p75: Number(present.reduce((sum, summary) => sum + summary.p75, 0).toFixed(4)),
    p95: Number(present.reduce((sum, summary) => sum + summary.p95, 0).toFixed(4)),
    p99: Number(present.reduce((sum, summary) => sum + summary.p99, 0).toFixed(4)),
    max: Number(present.reduce((sum, summary) => sum + summary.max, 0).toFixed(4)),
    mean: Number(present.reduce((sum, summary) => sum + summary.mean, 0).toFixed(4)),
  };
}

function nsValueToMsSamples(value: number | null | undefined): readonly number[] {
  return typeof value === 'number' ? [Number((value / 1e6).toFixed(4))] : [];
}

function dominantSupportStages(
  startupBreakdown: RuntimeSeamsReportArtifact['startupBreakdown'] | undefined,
): readonly string[] {
  return (startupBreakdown ?? [])
    .filter((entry) => entry.meanNs > 0)
    .sort((left, right) => right.meanNs - left.meanNs)
    .slice(0, 3)
    .map((entry) => `${entry.stage}:${(entry.meanNs / 1e6).toFixed(4)}ms`);
}

function describeWorkerStartupOwnership(stage: string): string {
  switch (stage) {
    case 'request-compute':
      return 'request-compute:packet-finalization-and-dispatch';
    case 'state-delivery':
      return 'state-delivery:first-state-callback';
    case 'quantizer-bootstrap':
      return 'quantizer-bootstrap:startup-seed-and-bootstrap-confirmation';
    default:
      return stage;
  }
}

function dominantWorkerSupportStages(
  startupBreakdown: RuntimeSeamsReportArtifact['startupBreakdown'] | undefined,
): readonly string[] {
  return (startupBreakdown ?? [])
    .filter((entry) => entry.meanNs > 0)
    .sort((left, right) => right.meanNs - left.meanNs)
    .slice(0, 3)
    .map((entry) => `${describeWorkerStartupOwnership(entry.stage)}:${(entry.meanNs / 1e6).toFixed(4)}ms`);
}

function dominantCanarySpreadMeanNs(bench: BenchArtifact): number | null {
  const spreads = (bench.canaries ?? [])
    .map((canary) => canary.spreadMeanNs)
    .filter((value): value is number => value !== null);
  if (spreads.length === 0) {
    return null;
  }

  return Number(Math.max(...spreads).toFixed(2));
}

function dominantReplicateCanaryContexts(bench: BenchArtifact): readonly NonNullable<
  NonNullable<BenchArtifact['replicates']>[number]['canaryContext']
>[] {
  return (bench.replicates ?? [])
    .map((replicate) => replicate.canaryContext ?? null)
    .filter((context): context is NonNullable<typeof context> => context !== null);
}

function dominantCanarySpreadPct(bench: BenchArtifact): number | null {
  const spreads = dominantReplicateCanaryContexts(bench)
    .map((context) => context.ambientSpreadPct)
    .filter((value): value is number => value !== null);
  if (spreads.length === 0) {
    return null;
  }

  return Number(Math.max(...spreads).toFixed(2));
}

export function buildExpectedBenchStability(
  bench: BenchArtifact,
): NonNullable<RuntimeSeamsReportArtifact['benchStability']> {
  const canarySpreadMeanNs = dominantCanarySpreadMeanNs(bench);
  const canarySpreadPct = dominantCanarySpreadPct(bench);
  return bench.pairs
    .filter((pair) => pair.gate)
    .map((pair) => {
      const replicateOverheadsPct =
        pair.overheads?.map((value) => (typeof value === 'number' ? Number((value * 100).toFixed(2)) : null)) ?? [];
      const validReplicates =
        pair.validReplicates ??
        replicateOverheadsPct.filter((value): value is number => value !== null).length;
      const spreadPct = pair.spread === null || pair.spread === undefined ? null : Number((pair.spread * 100).toFixed(2));
      const thresholdPct = Number((pair.threshold * 100).toFixed(2));
      const medianOverheadPct =
        pair.medianOverhead === null || pair.medianOverhead === undefined
          ? null
          : Number((pair.medianOverhead * 100).toFixed(2));
      const exceedances = pair.exceedances ?? 0;
      const requiredExceedances = pair.requiredExceedances ?? Math.max(1, validReplicates - 1);
      const replicateCanaryContext = (bench.replicates ?? []).map((replicate, index) => ({
        replicate: replicate.replicate ?? index,
        ambientSpreadMeanNs: replicate.canaryContext?.ambientSpreadMeanNs ?? null,
        ambientSpreadPct: replicate.canaryContext?.ambientSpreadPct ?? null,
        tasks: replicate.canaryContext?.tasks ?? [],
      }));
      const spreadBeyondCanaryPct =
        spreadPct === null
          ? null
          : Number(Math.max(0, spreadPct - (canarySpreadPct ?? 0)).toFixed(2));
      const partialExceedance = exceedances > 0 && exceedances < requiredExceedances;
      const canaryDominatesThreshold =
        canarySpreadPct !== null &&
        canarySpreadPct >= thresholdPct;
      const canaryExplainsSpread =
        canarySpreadPct !== null &&
        spreadPct !== null &&
        canarySpreadPct > 0 &&
        spreadBeyondCanaryPct !== null &&
        spreadBeyondCanaryPct <= thresholdPct * 0.6;
      const canaryExplainsVariance = canaryExplainsSpread || canaryDominatesThreshold;
      const noisy =
        spreadPct !== null && spreadPct > thresholdPct && !canaryExplainsVariance
          ? true
          : partialExceedance && !canaryExplainsVariance;
      const watch =
        !noisy &&
        ((spreadPct !== null && spreadPct > thresholdPct * 0.75) ||
          canaryExplainsVariance ||
          partialExceedance ||
          (canarySpreadMeanNs !== null && spreadPct !== null && spreadPct > thresholdPct * 0.5 && canarySpreadMeanNs > 500));
      const trustGrade = noisy ? 'noisy' : watch ? 'watch' : 'stable';
      const trustReason = noisy
        ? spreadPct !== null && spreadPct > thresholdPct
          ? `replicate spread ${spreadPct.toFixed(2)}% exceeds threshold ${thresholdPct.toFixed(2)}% with ${spreadBeyondCanaryPct?.toFixed(2) ?? 'n/a'}% task variance beyond ambient canary jitter ${canarySpreadPct?.toFixed(2) ?? 'n/a'}%`
          : `only ${exceedances}/${validReplicates} replicates exceeded threshold`
        : watch
          ? canaryExplainsVariance
            ? `replicate spread ${spreadPct?.toFixed(2) ?? 'n/a'}% stays within ${spreadBeyondCanaryPct?.toFixed(2) ?? 'n/a'}% task variance beyond ambient canary jitter ${canarySpreadPct?.toFixed(2) ?? 'n/a'}%`
            : partialExceedance
            ? `only ${exceedances}/${validReplicates} replicates exceeded threshold while canary jitter remained comparable`
            : spreadPct !== null && spreadPct > thresholdPct * 0.75
            ? `replicate spread ${spreadPct.toFixed(2)}% is nearing threshold ${thresholdPct.toFixed(2)}%`
            : `canary spread ${canarySpreadMeanNs?.toFixed(2) ?? 'n/a'}ns suggests ambient jitter`
          : 'replicates and canaries remain aligned';

      return {
        label: pair.label,
        runtimeClass: pair.runtimeClass,
        medianOverheadPct,
        thresholdPct,
        validReplicates,
        exceedances,
        requiredExceedances,
        spreadPct,
        replicateOverheadsPct,
        canarySpreadMeanNs,
        canarySpreadPct,
        replicateCanaryContext,
        trustGrade,
        trustReason,
        noisy,
      };
    });
}

function buildFidelity(
  options: {
    readonly supportRawSamples: readonly number[];
    readonly modeledStages?: readonly string[];
    readonly missingStages?: readonly string[];
    readonly dominantSupportStages?: readonly string[];
    readonly driftTargetPct?: number;
    readonly eventBoundaryParity?: PairedTruthFidelity['eventBoundaryParity'];
    readonly supportBaselineKind?: SupportBaselineKind;
  },
): PairedTruthFidelity {
  return {
    driftTargetPct: options.driftTargetPct ?? DEFAULT_FIDELITY_DRIFT_TARGET_PCT,
    eventBoundaryParity: options.eventBoundaryParity ?? 'matched',
    supportBaselineKind: options.supportBaselineKind ?? 'node-parity',
    modeledStages: options.modeledStages ?? [],
    missingStages: options.missingStages ?? [],
    supportRawSamples: options.supportRawSamples,
    dominantSupportStages: options.dominantSupportStages ?? [],
  };
}

export function buildExpectedPairedTruth(
  report: RuntimeSeamsReportArtifact,
  startupReality: StartupRealityArtifact,
  benchFacts?: BenchFacts,
): readonly PairedTruthEntry[] {
  const workerSharedStageNames = [
    'claim-or-create',
    'coordinator-reset-or-create',
    'listener-bind',
    'quantizer-bootstrap',
  ] as const;
  const workerSummary = sumSampleSummaries(
    workerSharedStageNames.map((stage) => normalizeSampleSummary(startupReality.browser.worker.summary.stages[stage])),
  );
  const workerStages = Object.fromEntries(
    Object.entries(startupReality.browser.worker.summary.stages).map(([stage, summary]) => [stage, normalizeSampleSummary(summary)]),
  ) as Record<string, SampleSummary | null>;
  const llmSimpleSummary = normalizeSampleSummary(startupReality.browser.llm.simple.chunkToFirstTokenMs);
  const llmPromotedSummary = normalizeSampleSummary(startupReality.browser.llm.promoted?.chunkToFirstTokenMs);
  const workerSupportRawSamples =
    (benchFacts ? workerSharedSupportSamplesMs(benchFacts.bench) : []).length > 0
      ? (benchFacts ? workerSharedSupportSamplesMs(benchFacts.bench) : [])
      : nsValueToMsSamples(startupReality.nodeProxy.workerRuntimeStartupMeanNs);
  const llmSimpleBenchSamples = benchFacts
    ? taskMeanSamplesMs(benchFacts.bench, '[BASELINE] llm-startup-shared -- node first token boundary')
    : [];
  const llmSimpleSupportRawSamples =
    llmSimpleBenchSamples.length > 0 ? llmSimpleBenchSamples : nsValueToMsSamples(startupReality.nodeProxy.llmRuntimeStartupMeanNs);
  const llmPromotedBenchSamples = benchFacts
    ? taskMeanSamplesMs(benchFacts.bench, '[BASELINE] llm-promoted-startup-shared -- node second token boundary')
    : [];
  const llmPromotedSupportRawSamples =
    llmPromotedBenchSamples.length > 0
      ? llmPromotedBenchSamples
      : nsValueToMsSamples(startupReality.nodeProxy.llmRuntimePromotedStartupMeanNs);
  const workerModeledStages = [...workerSharedStageNames];
  const workerMissingStages: readonly string[] = [];
  const workerFidelity = buildFidelity({
    supportRawSamples: workerSupportRawSamples,
    supportBaselineKind: 'node-parity',
    modeledStages: workerModeledStages,
    missingStages: workerMissingStages,
    dominantSupportStages: dominantWorkerSupportStages(report.startupBreakdown),
  });
  const llmSimpleFidelity = buildFidelity({
    supportRawSamples: llmSimpleSupportRawSamples,
    supportBaselineKind: 'node-parity',
    eventBoundaryParity: 'matched',
    modeledStages: [
      'support-host-setup',
      'controller-construction',
      'fast-lane-immediate-token',
      'host-token-dispatch',
    ],
    dominantSupportStages: ['simple:controller-construction', 'simple:host-token-dispatch'],
  });
  const llmPromotedFidelity = buildFidelity({
    supportRawSamples: llmPromotedSupportRawSamples,
    supportBaselineKind: 'node-parity',
    eventBoundaryParity: 'matched',
    modeledStages: ['session-shell-construction', 'runtime-claim-attach', 'queued-flush', 'second-token-boundary'],
    dominantSupportStages: [
      'promoted:runtime-claim-attach',
      'promoted:queued-flush',
      'promoted:second-token-boundary',
    ],
  });
  const workerSupportSummary = supportLaneSummaryFromSamples(workerSupportRawSamples);
  const llmSimpleSupportSummary = supportLaneSummaryFromSamples(llmSimpleSupportRawSamples);
  const llmPromotedSupportSummary = supportLaneSummaryFromSamples(llmPromotedSupportRawSamples);
  const workerAbsoluteDeltaMs = sampleSummaryAbsoluteDeltaMs(workerSummary, workerSupportSummary);
  const llmSimpleAbsoluteDeltaMs = sampleSummaryAbsoluteDeltaMs(llmSimpleSummary, llmSimpleSupportSummary);
  const llmPromotedAbsoluteDeltaMs = sampleSummaryAbsoluteDeltaMs(llmPromotedSummary, llmPromotedSupportSummary);
  const workerSharedDivergencePct =
    runtimeSeamPairOverheadPct(benchFacts, 'worker-runtime-startup-shared') ?? startupReality.divergence.workerRuntimeStartupPct;
  const llmSharedDivergencePct =
    runtimeSeamPairOverheadPct(benchFacts, 'llm-startup-shared') ?? startupReality.divergence.llmRuntimeStartupPct;
  const llmPromotedSharedDivergencePct =
    runtimeSeamPairOverheadPct(benchFacts, 'llm-promoted-startup-shared') ??
    startupReality.divergence.llmRuntimePromotedStartupPct ??
    null;

  return [
    createPairedTruthEntry({
      id: 'worker-startup',
      label: 'Worker startup',
      primaryLane: {
        label: 'browser-shared-startup-slice',
        unit: 'ms',
        summary: workerSummary,
        sampleCount: startupReality.browser.worker.iterations,
        budget: WORKER_STARTUP_BUDGET,
        frameBudgetMs: startupReality.browser.worker.frameBudgetMs,
        exceededFrameBudgetCount: startupReality.browser.worker.exceededFrameBudgetCount,
      },
      supportLane: {
        label: 'node-shared-startup-slice',
        unit: 'ms',
        summary: workerSupportSummary,
        sampleCount: workerSupportRawSamples.length > 0 ? workerSupportRawSamples.length : 1,
        rawSamples: workerSupportRawSamples,
      },
      divergence: {
        pct: workerSharedDivergencePct,
        class: classifyDivergence(workerSharedDivergencePct, {
          absoluteDeltaMs: workerAbsoluteDeltaMs,
        }),
      },
      fidelity: workerFidelity,
      shapeGuards: buildShapeGuards('worker-startup', {
        label: 'browser-shared-startup-slice',
        unit: 'ms',
        summary: workerSummary,
        sampleCount: startupReality.browser.worker.iterations,
        budget: WORKER_STARTUP_BUDGET,
        frameBudgetMs: startupReality.browser.worker.frameBudgetMs,
        exceededFrameBudgetCount: startupReality.browser.worker.exceededFrameBudgetCount,
      }, {
        label: 'node-shared-startup-slice',
        unit: 'ms',
        summary: workerSupportSummary,
        sampleCount: workerSupportRawSamples.length > 0 ? workerSupportRawSamples.length : 1,
        rawSamples: workerSupportRawSamples,
      }, startupReality.browser.worker.iterations, { stages: workerStages, fidelity: workerFidelity }),
      stages: workerSharedStageNames
        .map((stage) => [stage, workerStages[stage]] as const)
        .filter(([, summary]) => summary !== null)
        .map(([stage, summary]) => `${stage}:${summary?.median.toFixed(4) ?? '0.0000'}ms`),
    }),
    createPairedTruthEntry({
      id: 'llm-startup',
      label: 'LLM startup',
      primaryLane: {
        label: 'browser-chunk-to-first-token',
        unit: 'ms',
        summary: llmSimpleSummary,
        sampleCount: startupReality.browser.llm.iterations ?? startupReality.browser.llm.simple.rawSamples?.length ?? null,
        rawSamples: startupReality.browser.llm.simple.rawSamples,
        budget: LLM_STARTUP_BUDGET,
      },
      supportLane: {
        label: 'node-first-token-boundary',
        unit: 'ms',
        summary: llmSimpleSupportSummary,
        sampleCount: llmSimpleSupportRawSamples.length > 0 ? llmSimpleSupportRawSamples.length : 1,
        rawSamples: llmSimpleSupportRawSamples,
      },
      divergence: {
        pct: llmSharedDivergencePct,
        class: classifyDivergence(llmSharedDivergencePct, {
          absoluteDeltaMs: llmSimpleAbsoluteDeltaMs,
        }),
      },
      fidelity: llmSimpleFidelity,
      shapeGuards: buildShapeGuards(
        'llm-startup',
        {
          label: 'browser-simple-shared-startup',
          unit: 'ms',
          summary: llmSimpleSummary,
          sampleCount: startupReality.browser.llm.iterations ?? startupReality.browser.llm.simple.rawSamples?.length ?? null,
          rawSamples: startupReality.browser.llm.simple.rawSamples,
          budget: LLM_STARTUP_BUDGET,
        },
        {
          label: 'node-first-token-boundary',
          unit: 'ms',
          summary: llmSimpleSupportSummary,
          sampleCount: llmSimpleSupportRawSamples.length > 0 ? llmSimpleSupportRawSamples.length : 1,
          rawSamples: llmSimpleSupportRawSamples,
        },
        startupReality.browser.llm.iterations ?? startupReality.browser.llm.simple.rawSamples?.length ?? 0,
        { fidelity: llmSimpleFidelity },
      ),
      stages: llmSimpleFidelity.dominantSupportStages,
      outliers: startupReality.browser.llm.simple.topOutliers,
    }),
    createPairedTruthEntry({
      id: 'llm-promoted-startup',
      label: 'LLM promoted startup',
      primaryLane: {
        label: 'browser-chunk-to-second-token',
        unit: 'ms',
        summary: llmPromotedSummary,
        sampleCount: startupReality.browser.llm.iterations ?? startupReality.browser.llm.promoted?.rawSamples?.length ?? null,
        rawSamples: startupReality.browser.llm.promoted?.rawSamples,
        budget: LLM_STARTUP_BUDGET,
      },
      supportLane: {
        label: 'node-promoted-token-boundary',
        unit: 'ms',
        summary: llmPromotedSupportSummary,
        sampleCount: llmPromotedSupportRawSamples.length > 0 ? llmPromotedSupportRawSamples.length : 1,
        rawSamples: llmPromotedSupportRawSamples,
      },
      divergence: {
        pct: llmPromotedSharedDivergencePct,
        class: classifyDivergence(llmPromotedSharedDivergencePct, {
          absoluteDeltaMs: llmPromotedAbsoluteDeltaMs,
        }),
      },
      fidelity: llmPromotedFidelity,
      shapeGuards: buildShapeGuards(
        'llm-promoted-startup',
        {
          label: 'browser-promoted-shared-startup',
          unit: 'ms',
          summary: llmPromotedSummary,
          sampleCount: startupReality.browser.llm.iterations ?? startupReality.browser.llm.promoted?.rawSamples?.length ?? null,
          rawSamples: startupReality.browser.llm.promoted?.rawSamples,
          budget: LLM_STARTUP_BUDGET,
        },
        {
          label: 'node-promoted-token-boundary',
          unit: 'ms',
          summary: llmPromotedSupportSummary,
          sampleCount: llmPromotedSupportRawSamples.length > 0 ? llmPromotedSupportRawSamples.length : 1,
          rawSamples: llmPromotedSupportRawSamples,
        },
        startupReality.browser.llm.iterations ?? startupReality.browser.llm.promoted?.rawSamples?.length ?? 0,
        { fidelity: llmPromotedFidelity },
      ),
      stages: llmPromotedFidelity.dominantSupportStages,
      outliers: startupReality.browser.llm.promoted?.topOutliers,
    }),
  ];
}

export function buildCoverageMetaArtifact(
  facts: CoverageFacts,
  generatedAt: string,
  context: {
    readonly gauntletRunId: string;
    readonly sourceFingerprint: string;
    readonly environmentFingerprint: string;
    readonly expectedCounts: ArtifactExpectedCounts;
  },
): CoverageMetaArtifact {
  return {
    schemaVersion: 1,
    generatedAt,
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    expectedCounts: context.expectedCounts,
    coverageFingerprint: facts.artifact.fingerprint,
    policyFingerprint: facts.policyFingerprint,
    totals: facts.totals,
    zeroCoverageFileCount: facts.zeroCoverageFiles.length,
    missingRuntimeFileCount: facts.missingRuntimeFiles.length,
    zeroCoverageFiles: facts.zeroCoverageFiles,
    missingRuntimeFiles: facts.missingRuntimeFiles,
    coveragePath: facts.artifact.path,
    include: [...coverageInclude],
    exclude: [...coverageExclude],
  };
}

export function createRuntimeSeamsSourceArtifacts(
  coverageFacts: CoverageFacts,
  benchFacts: BenchFacts,
  startupRealityFacts: StartupRealityFacts,
): RuntimeSeamsReportArtifact['sourceArtifacts'] {
  if (!coverageFacts.meta || !coverageFacts.metaArtifact) {
    throw new Error('Missing coverage provenance sidecar at coverage/coverage-meta.json.');
  }

  return {
    coverage: {
      ...coverageFacts.artifact,
      generatedAt: coverageFacts.meta.generatedAt,
      summary: {
        totals: coverageFacts.totals,
        zeroCoverageFileCount: coverageFacts.zeroCoverageFiles.length,
        missingRuntimeFileCount: coverageFacts.missingRuntimeFiles.length,
        policyFingerprint: coverageFacts.policyFingerprint,
      },
    },
    coverageMeta: {
      ...coverageFacts.metaArtifact,
      generatedAt: coverageFacts.meta.generatedAt,
      summary: {
        schemaVersion: coverageFacts.meta.schemaVersion,
        coverageFingerprint: coverageFacts.meta.coverageFingerprint,
        policyFingerprint: coverageFacts.meta.policyFingerprint,
        totals: coverageFacts.meta.totals,
        zeroCoverageFileCount: coverageFacts.meta.zeroCoverageFileCount,
        missingRuntimeFileCount: coverageFacts.meta.missingRuntimeFileCount,
      },
    },
    bench: {
      ...benchFacts.artifact,
      generatedAt: benchFacts.bench.generatedAt,
      summary: {
        schemaVersion: benchFacts.bench.schemaVersion ?? null,
        passed: benchFacts.bench.summary.passed,
        failedHardGates: [...benchFacts.bench.summary.failedHardGates],
        hardGateCount: benchFacts.bench.summary.hardGateCount,
        diagnosticCount: benchFacts.bench.summary.diagnosticCount,
      },
    },
    startupReality: {
      ...startupRealityFacts.artifact,
      generatedAt: startupRealityFacts.startupReality.generatedAt,
      summary: {
        schemaVersion: startupRealityFacts.startupReality.schemaVersion ?? null,
        workerMedianMs: startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs.median,
        llmSimpleMedianMs: startupRealityFacts.startupReality.browser.llm.simple.initToFirstTokenMs.median,
        llmPromotedMedianMs: startupRealityFacts.startupReality.browser.llm.promoted?.initToFirstTokenMs.median ?? null,
      },
    },
  };
}
