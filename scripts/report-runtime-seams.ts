import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../vitest.shared.js';
import { ensureArtifactContext } from './artifact-context.js';
import { isDirectExecution, writeTextFile } from './audit/shared.js';
import {
  buildBenchFacts,
  buildExpectedBenchStability,
  buildCoverageFacts,
  buildExpectedPairedTruth,
  buildStartupRealityFacts,
  createRuntimeSeamsSourceArtifacts,
  type RuntimeSeamsIntegrityCheck,
  type RuntimeSeamsReportArtifact,
  verifyRuntimeSeamsReport,
} from './artifact-integrity.js';
import type { PairedTruthEntry } from './paired-truth.js';
import { LLM_STEADY_REPLICATE_EXCEEDANCE_MAX } from './bench/flex-policy.js';

type PreviousHotspotEntry = {
  file: string;
  branchPct: number;
};

type PreviousDiagnosticEntry = {
  label: string;
  medianOverheadPct: number | null;
};

type PreviousStartupBreakdownEntry = {
  stage: string;
  meanNs: number;
};

interface ExtendedRuntimeSeamsReport extends RuntimeSeamsReportArtifact {
  readonly schemaVersion: 7;
  readonly previousReport: {
    readonly generatedAt: string;
  } | null;
  readonly hardGates: {
    readonly passed: boolean;
    readonly failed: readonly string[];
    readonly pairs: readonly {
      readonly label: string;
      readonly pass: boolean;
      readonly runtimeClass: string;
      readonly medianOverheadPct: number | null;
      readonly thresholdPct: number;
    }[];
  };
  readonly coverage: {
    readonly topBranchHotspots: ReadonlyArray<{
      readonly file: string;
      readonly package: string;
      readonly branchPct: number;
      readonly previousBranchPct: number | null;
      readonly deltaBranchPct: number | null;
      readonly branchCovered: number;
      readonly branchTotal: number;
      readonly linePct: number;
    }>;
    readonly topMovers: ReadonlyArray<{
      readonly file: string;
      readonly package: string;
      readonly branchPct: number;
      readonly previousBranchPct: number | null;
      readonly deltaBranchPct: number | null;
    }>;
    readonly zeroCoveredFiles: readonly string[];
    readonly missingRuntimeFiles: readonly string[];
  };
  readonly diagnostics: ReadonlyArray<{
    readonly label: string;
    readonly runtimeClass: string;
    readonly medianOverheadPct: number | null;
    readonly previousMedianOverheadPct: number | null;
    readonly deltaMedianOverheadPct: number | null;
    readonly thresholdPct: number;
    readonly warning: boolean;
  }>;
  readonly startupBreakdown: ReadonlyArray<{
    readonly stage: string;
    readonly label: string;
    readonly modeled: boolean;
    readonly meanNs: number;
    readonly previousMeanNs: number | null;
    readonly deltaMeanNs: number | null;
    readonly p75Ns: number;
    readonly p95Ns: number;
    readonly p99Ns: number;
  }>;
  readonly workerStartupAudit: {
    readonly posture: 'optimize-current-contract' | 'accept-honest-residual' | 'reframe-parity-envelope';
    readonly conclusion: string;
    readonly dominantStage: string | null;
    readonly rows: ReadonlyArray<{
      readonly stage: string;
      readonly label: string;
      readonly inclusion: 'both' | 'support-only';
      readonly supportMeanNs: number;
      readonly parityMeanNs: number | null;
      readonly residualMeanNs: number;
    }>;
  };
  readonly workerStartupSplit: {
    readonly visibleFirstPaintMeanNs: number;
    readonly workerTakeoverMeanNs: number;
    readonly shared: {
      readonly label: string;
      readonly supportMeanNs: number;
      readonly parityMeanNs: number;
      readonly residualMeanNs: number;
      readonly overheadPct: number | null;
      readonly previousOverheadPct: number | null;
      readonly deltaOverheadPct: number | null;
      readonly thresholdPct: number;
      readonly conclusion: string;
    };
    readonly seam: {
      readonly label: string;
      readonly absoluteMeanNs: number;
      readonly previousAbsoluteMeanNs: number | null;
      readonly deltaAbsoluteMeanNs: number | null;
      readonly derivedPct: number | null;
      readonly previousDerivedPct: number | null;
      readonly deltaDerivedPct: number | null;
      readonly dominantStage: string | null;
      readonly messageReceiptResidualNs: number;
      readonly dispatchSendResidualNs: number;
      readonly messageReceiptSharePct: number | null;
      readonly dispatchSendSharePct: number | null;
      readonly sharedResidualSharePct: number | null;
      readonly toBrowserStartupMedianPct: number | null;
      readonly tailRatioP99ToMedian: number | null;
      readonly conclusion: string;
      readonly components: ReadonlyArray<{
        readonly stage: string;
        readonly label: string;
        readonly kind: 'worker-only' | 'shared-residual';
        readonly residualMeanNs: number;
      }>;
    };
  };
  readonly llmRuntimeSteadySignals: NonNullable<RuntimeSeamsReportArtifact['llmRuntimeSteadySignals']>;
  readonly metricClassification: {
    readonly pairedTruth: readonly string[];
    readonly singleLaneHardGate: readonly string[];
    readonly singleLaneDiagnostic: readonly string[];
    readonly transportNote: readonly string[];
    readonly seamNote: readonly string[];
  };
  readonly pairedTruth: readonly PairedTruthEntry[];
  readonly transportDiagnostics: ReadonlyArray<{
    readonly label: string;
    readonly runtimeClass: string;
    readonly medianOverheadPct: number | null;
    readonly previousMedianOverheadPct: number | null;
    readonly deltaMedianOverheadPct: number | null;
    readonly thresholdPct: number;
    readonly warning: boolean;
  }>;
  readonly benchStability: NonNullable<RuntimeSeamsReportArtifact['benchStability']>;
  readonly integrity: {
    readonly passed: boolean;
    readonly checks: readonly RuntimeSeamsIntegrityCheck[];
  };
}

function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }

  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function formatPct(value: number | null): string {
  return value === null ? 'n/a' : `${value}%`;
}

function formatRatio(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(2)}x`;
}

function classifyWorkerStartupEarlyWarning(
  split: ExtendedRuntimeSeamsReport['workerStartupSplit'],
  sharedOverheadPct: number | null,
): string {
  if ((sharedOverheadPct ?? Number.POSITIVE_INFINITY) > split.shared.thresholdPct) {
    return 'investigate shared bootstrap drift before reading the seam as pure transport cost.';
  }

  if ((split.seam.dominantStage ?? '') === 'state-delivery:callback-queue-turn') {
    return 'investigate host callback congestion because queue-turn pressure is overtaking message receipt.';
  }

  if ((split.seam.messageReceiptSharePct ?? 0) >= 60) {
    return 'green-to-watch: the residual is concentrated in off-thread handoff pressure, so transport still dominates but the seam is at least sharply attributed.';
  }

  return 'green: shared parity is healthy and the seam is spread across smaller worker-only stages instead of one runaway choke point.';
}

function classifyLLMRuntimeSteadySignals(signals: ExtendedRuntimeSeamsReport['llmRuntimeSteadySignals']): string {
  if (signals.replicateExceedanceRate > LLM_STEADY_REPLICATE_EXCEEDANCE_MAX) {
    return 'watch: replicate exceedance rate is elevated, so the steady lane is still flirting with the diagnostic threshold.';
  }

  if ((signals.directiveP99ToBaselineP99 ?? 0) >= 1.25 && (signals.directiveP75ToBaselineP75 ?? 0) < 1.15) {
    return 'watch: the tail is inflating faster than the center, which points to burst-sensitive scheduling rather than a flat per-chunk tax.';
  }

  if (
    signals.longSessionSlopeNsPerChunk !== null &&
    signals.mixedChunkSlopeNsPerChunk !== null &&
    signals.mixedChunkSlopeNsPerChunk > signals.longSessionSlopeNsPerChunk * 1.1
  ) {
    return 'watch: mixed text/tool traffic scales worse than text-only traffic, which suggests tool delta normalization or flush churn.';
  }

  return 'green: steady-state behavior is acting like a bounded scheduling tax with no obvious early-warning smell.';
}

function readPreviousReport(root: string): RuntimeSeamsReportArtifact | null {
  return readJsonIfExists<RuntimeSeamsReportArtifact>(resolve(root, 'reports', 'runtime-seams.json'));
}

export function buildRuntimeSeamsReport(root = repoRoot, generatedAt = new Date().toISOString()): ExtendedRuntimeSeamsReport {
  const context = ensureArtifactContext(root);
  const coverageFacts = buildCoverageFacts(root);
  const benchFacts = buildBenchFacts(root);
  const startupRealityFacts = buildStartupRealityFacts(root);
  const previousReport = readPreviousReport(root);

  const previousHotspotsByFile = new Map(
    (previousReport?.coverage?.topBranchHotspots ?? []).map((entry: PreviousHotspotEntry) => [entry.file, entry.branchPct] as const),
  );
  const branchHotspots = coverageFacts.topBranchHotspots.map((entry) => {
    const previousBranchPct = previousHotspotsByFile.get(entry.file) ?? null;
    return {
      ...entry,
      previousBranchPct,
      deltaBranchPct: previousBranchPct === null ? null : Number((entry.branchPct - previousBranchPct).toFixed(2)),
    };
  });

  const topMovers = branchHotspots
    .map((entry) => ({
      file: entry.file,
      package: entry.package,
      branchPct: entry.branchPct,
      previousBranchPct: entry.previousBranchPct,
      deltaBranchPct: entry.deltaBranchPct,
    }))
    .sort((a, b) => Math.abs(b.deltaBranchPct ?? 0) - Math.abs(a.deltaBranchPct ?? 0))
    .slice(0, 10);

  const previousDiagnosticsByLabel = new Map(
    (previousReport?.diagnostics ?? []).map((entry: PreviousDiagnosticEntry) => [entry.label, entry.medianOverheadPct] as const),
  );
  const previousTransportDiagnosticsByLabel = new Map(
    (previousReport?.transportDiagnostics ?? []).map((entry: PreviousDiagnosticEntry) => [entry.label, entry.medianOverheadPct] as const),
  );
  const previousStartupBreakdownByStage = new Map(
    (previousReport?.startupBreakdown ?? []).map((entry: PreviousStartupBreakdownEntry) => [entry.stage, entry.meanNs] as const),
  );
  const previousWorkerSharedOverheadPct = previousReport?.workerStartupSplit?.shared?.overheadPct ?? null;
  const previousWorkerSeamAbsoluteMeanNs = previousReport?.workerStartupSplit?.seam?.absoluteMeanNs ?? null;
  const previousWorkerSeamDerivedPct = previousReport?.workerStartupSplit?.seam?.derivedPct ?? null;
  const browserWorkerStartupMedianMs =
    startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs &&
    'median' in startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs
      ? Number(startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs.median)
      : null;
  const benchWorkerStartupSplit = benchFacts.bench.workerStartupSplit;
  const seamAbsoluteMeanNs = benchWorkerStartupSplit?.seam.absoluteMeanNs ?? 0;
  const workerSeamToBrowserStartupMedianPct =
    browserWorkerStartupMedianMs === null || browserWorkerStartupMedianMs <= 0
      ? null
      : Number(((seamAbsoluteMeanNs / (browserWorkerStartupMedianMs * 1e6)) * 100).toFixed(2));

  const diagnostics = benchFacts.bench.pairs
    .filter((pair) => !pair.gate && pair.runtimeClass !== 'transport')
    .sort((a, b) => (b.medianOverhead ?? Number.NEGATIVE_INFINITY) - (a.medianOverhead ?? Number.NEGATIVE_INFINITY))
    .map((pair) => {
      const medianOverheadPct = pair.medianOverhead === null ? null : Number((pair.medianOverhead * 100).toFixed(2));
      const previousMedianOverheadPct = previousDiagnosticsByLabel.get(pair.label) ?? null;
      return {
        label: pair.label,
        runtimeClass: pair.runtimeClass,
        medianOverheadPct,
        previousMedianOverheadPct,
        deltaMedianOverheadPct:
          medianOverheadPct === null || previousMedianOverheadPct === null
            ? null
            : Number((medianOverheadPct - previousMedianOverheadPct).toFixed(2)),
        thresholdPct: Number((pair.threshold * 100).toFixed(2)),
        warning: Boolean(pair.warning),
      };
    });

  const transportDiagnostics = benchFacts.bench.pairs
    .filter((pair) => !pair.gate && pair.runtimeClass === 'transport')
    .sort((a, b) => (b.medianOverhead ?? Number.NEGATIVE_INFINITY) - (a.medianOverhead ?? Number.NEGATIVE_INFINITY))
    .map((pair) => {
      const medianOverheadPct = pair.medianOverhead === null ? null : Number((pair.medianOverhead * 100).toFixed(2));
      const previousMedianOverheadPct = previousTransportDiagnosticsByLabel.get(pair.label) ?? null;
      return {
        label: pair.label,
        runtimeClass: pair.runtimeClass,
        medianOverheadPct,
        previousMedianOverheadPct,
        deltaMedianOverheadPct:
          medianOverheadPct === null || previousMedianOverheadPct === null
            ? null
            : Number((medianOverheadPct - previousMedianOverheadPct).toFixed(2)),
        thresholdPct: Number((pair.threshold * 100).toFixed(2)),
        warning: Boolean(pair.warning),
      };
    });

  const startupBreakdownOrder =
    benchFacts.bench.replicates?.find((replicate) => (replicate.startupBreakdown?.length ?? 0) > 0)?.startupBreakdown?.map(
      (entry) => entry.stage,
    ) ?? [];
  const startupBreakdown = startupBreakdownOrder
    .map((stage) => {
      const samples = (benchFacts.bench.replicates ?? [])
        .map((replicate) => replicate.startupBreakdown?.find((entry) => entry.stage === stage) ?? null)
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      if (samples.length === 0) {
        return null;
      }

      const meanNs = median(samples.map((entry) => entry.meanNs)) ?? 0;
      const p75Ns = median(samples.map((entry) => entry.p75Ns)) ?? 0;
      const p95Ns = median(samples.map((entry) => entry.p95Ns)) ?? 0;
      const p99Ns = median(samples.map((entry) => entry.p99Ns)) ?? 0;
      const previousMeanNs = previousStartupBreakdownByStage.get(stage) ?? null;

      return {
        stage,
        label: samples[0]?.label ?? stage,
        modeled: samples.some((entry) => entry.modeled !== false),
        meanNs: Number(meanNs.toFixed(2)),
        previousMeanNs,
        deltaMeanNs: previousMeanNs === null ? null : Number((meanNs - previousMeanNs).toFixed(2)),
        p75Ns: Number(p75Ns.toFixed(2)),
        p95Ns: Number(p95Ns.toFixed(2)),
        p99Ns: Number(p99Ns.toFixed(2)),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const baseReport: ExtendedRuntimeSeamsReport = {
    schemaVersion: 7,
    generatedAt,
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    expectedCounts: context.expectedCounts,
    previousReport: previousReport ? { generatedAt: previousReport.generatedAt } : null,
    sourceArtifacts: createRuntimeSeamsSourceArtifacts(coverageFacts, benchFacts, startupRealityFacts),
    hardGates: {
      passed: benchFacts.bench.summary.passed,
      failed: benchFacts.bench.summary.failedHardGates,
      pairs: benchFacts.hardGates,
    },
    coverage: {
      topBranchHotspots: branchHotspots,
      topMovers,
      zeroCoveredFiles: coverageFacts.zeroCoverageFiles,
      missingRuntimeFiles: coverageFacts.missingRuntimeFiles,
    },
    diagnostics,
    startupBreakdown,
    workerStartupAudit: benchFacts.bench.workerStartupAudit ?? {
      posture: 'accept-honest-residual',
      conclusion: 'worker startup audit was missing, so the residual remains unattributed beyond the public 7-stage table.',
      dominantStage: null,
      rows: [],
    },
    workerStartupSplit: {
      visibleFirstPaintMeanNs: benchWorkerStartupSplit?.visibleFirstPaintMeanNs ?? 0,
      workerTakeoverMeanNs: benchWorkerStartupSplit?.workerTakeoverMeanNs ?? 0,
      shared: {
        label: benchWorkerStartupSplit?.shared.label ?? 'worker-runtime-startup-shared',
        supportMeanNs: benchWorkerStartupSplit?.shared.supportMeanNs ?? 0,
        parityMeanNs: benchWorkerStartupSplit?.shared.parityMeanNs ?? 0,
        residualMeanNs: benchWorkerStartupSplit?.shared.residualMeanNs ?? 0,
        overheadPct: benchWorkerStartupSplit?.shared.overheadPct ?? null,
        previousOverheadPct: previousWorkerSharedOverheadPct,
        deltaOverheadPct:
          benchWorkerStartupSplit?.shared.overheadPct === null || previousWorkerSharedOverheadPct === null
            ? null
            : Number((benchWorkerStartupSplit.shared.overheadPct - previousWorkerSharedOverheadPct).toFixed(2)),
        thresholdPct: benchWorkerStartupSplit?.shared.thresholdPct ?? 25,
        conclusion:
          benchWorkerStartupSplit?.shared.conclusion ??
          'Shared worker startup parity was missing, so the report cannot distinguish bootstrap parity from worker-only seam cost.',
      },
      seam: {
        label: benchWorkerStartupSplit?.seam.label ?? 'worker-runtime-startup-seam',
        absoluteMeanNs: seamAbsoluteMeanNs,
        previousAbsoluteMeanNs: previousWorkerSeamAbsoluteMeanNs,
        deltaAbsoluteMeanNs:
          benchWorkerStartupSplit?.seam.absoluteMeanNs === undefined || previousWorkerSeamAbsoluteMeanNs === null
            ? null
            : Number((benchWorkerStartupSplit.seam.absoluteMeanNs - previousWorkerSeamAbsoluteMeanNs).toFixed(2)),
        derivedPct: benchWorkerStartupSplit?.seam.derivedPct ?? null,
        previousDerivedPct: previousWorkerSeamDerivedPct,
        deltaDerivedPct:
          benchWorkerStartupSplit?.seam.derivedPct === null || benchWorkerStartupSplit?.seam.derivedPct === undefined || previousWorkerSeamDerivedPct === null
            ? null
            : Number((benchWorkerStartupSplit.seam.derivedPct - previousWorkerSeamDerivedPct).toFixed(2)),
        dominantStage: benchWorkerStartupSplit?.seam.dominantStage ?? null,
        messageReceiptResidualNs: benchWorkerStartupSplit?.seam.messageReceiptResidualNs ?? 0,
        dispatchSendResidualNs: benchWorkerStartupSplit?.seam.dispatchSendResidualNs ?? 0,
        messageReceiptSharePct: benchWorkerStartupSplit?.seam.messageReceiptSharePct ?? null,
        dispatchSendSharePct: benchWorkerStartupSplit?.seam.dispatchSendSharePct ?? null,
        sharedResidualSharePct: benchWorkerStartupSplit?.seam.sharedResidualSharePct ?? null,
        toBrowserStartupMedianPct: workerSeamToBrowserStartupMedianPct,
        tailRatioP99ToMedian: benchWorkerStartupSplit?.seam.tailRatioP99ToMedian ?? null,
        conclusion:
          benchWorkerStartupSplit?.seam.conclusion ??
          'Worker-only startup seam data was missing, so the report cannot separate dispatch and callback residual from shared startup work.',
        components: benchWorkerStartupSplit?.seam.components ?? [],
      },
    },
    llmRuntimeSteadySignals: benchFacts.bench.llmRuntimeSteadySignals ?? {
      label: 'llm-runtime-steady',
      replicateExceedanceRate: 0,
      directiveP99ToBaselineP99: null,
      directiveP75ToBaselineP75: null,
      longSessionSlopeNsPerChunk: null,
      mixedChunkSlopeNsPerChunk: null,
      conclusion: 'LLM steady-state signals were missing from the bench artifact.',
    },
    metricClassification: {
      pairedTruth: [],
      singleLaneHardGate: benchFacts.hardGates.map((pair) => pair.label),
      singleLaneDiagnostic: diagnostics.map((entry) => entry.label),
      transportNote: transportDiagnostics.map((entry) => entry.label),
      seamNote: ['worker-runtime-startup-seam'],
    },
    pairedTruth: [],
    transportDiagnostics,
    benchStability: buildExpectedBenchStability(benchFacts.bench),
    integrity: {
      passed: true,
      checks: [],
    },
  };
  const pairedTruth = buildExpectedPairedTruth(baseReport, startupRealityFacts.startupReality, benchFacts);
  const draftReport: ExtendedRuntimeSeamsReport = {
    ...baseReport,
    metricClassification: {
      ...baseReport.metricClassification,
      pairedTruth: pairedTruth.map((entry) => entry.id),
    },
    pairedTruth,
  };

  const integrity = verifyRuntimeSeamsReport(draftReport, root);
  if (!integrity.passed) {
    const summaries = integrity.checks.filter((check) => !check.passed).map((check) => `- ${check.summary}`);
    throw new Error(`Runtime seams integrity failed:\n${summaries.join('\n')}`);
  }

  return {
    ...draftReport,
    integrity,
  };
}

export function renderRuntimeSeamsMarkdown(report: ExtendedRuntimeSeamsReport): string {
  const workerStartupTruth = report.pairedTruth.find((entry) => entry.id === 'worker-startup');
  const workerTailWatchLine = workerStartupTruth
    ? `- Worker browser startup tail is a watch item: p99 ${workerStartupTruth.primaryLane.summary?.p99?.toFixed(4) ?? 'n/a'}ms / max ${workerStartupTruth.primaryLane.summary?.max?.toFixed(4) ?? 'n/a'}ms stays within the ${workerStartupTruth.primaryLane.frameBudgetMs ?? 16}ms frame budget.`
    : null;
  const workerEarlyWarning = classifyWorkerStartupEarlyWarning(
    report.workerStartupSplit,
    report.workerStartupSplit.shared.overheadPct,
  );
  const llmEarlyWarning = classifyLLMRuntimeSteadySignals(report.llmRuntimeSteadySignals);

  return [
    '# Runtime Seams Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Previous report: ${report.previousReport?.generatedAt ?? 'none'}`,
    '',
    '## Feedback Integrity',
    '',
    `- Passed: ${report.integrity.passed}`,
    ...report.integrity.checks.map((check) => `- ${check.passed ? 'ok' : 'fail'} ${check.code} -- ${check.summary}`),
    '',
    '## Hard Gates',
    '',
    `- Passed: ${report.hardGates.passed}`,
    `- Failed pairs: ${report.hardGates.failed.length === 0 ? 'none' : report.hardGates.failed.join(', ')}`,
    '',
    '## Reading This Report',
    '',
    '- Browser-budget truth is the release signal; support-lane startup drift is steering debt, not a gate failure by itself.',
    '- `watch` trust means the lane currently passes with ambient or limited replicate variance; it is not a failing gate.',
    '- `seam-drift` in paired truth means the support lane still diverges from browser truth enough to need attribution or measurement cleanup.',
    '- Worker startup is now split three ways: the broad continuity metric, a shared-startup parity diagnostic, and a worker-only seam note that is read in absolute time first.',
    ...(workerTailWatchLine === null ? [] : [workerTailWatchLine]),
    `- Worker early warning: ${workerEarlyWarning}`,
    `- LLM steady early warning: ${llmEarlyWarning}`,
    '',
    '| Pair | Pass | Class | Median overhead | Threshold |',
    '| --- | --- | --- | ---: | ---: |',
    ...report.hardGates.pairs.map(
      (pair) =>
        `| ${pair.label} | ${pair.pass ? 'yes' : 'no'} | ${pair.runtimeClass} | ${formatPct(pair.medianOverheadPct)} | ${pair.thresholdPct}% |`,
    ),
    '',
    '## Top Branch Hotspots',
    '',
    '| Package | File | Branches | Lines | Delta |',
    '| --- | --- | ---: | ---: | ---: |',
    ...report.coverage.topBranchHotspots.map(
      (entry) =>
        `| ${entry.package} | ${entry.file} | ${entry.branchPct}% (${entry.branchCovered}/${entry.branchTotal}) | ${entry.linePct}% | ${entry.deltaBranchPct === null ? 'n/a' : `${entry.deltaBranchPct}%`} |`,
    ),
    '',
    '## Top Movers',
    '',
    '| Package | File | Branches | Previous | Delta |',
    '| --- | --- | ---: | ---: | ---: |',
    ...(report.coverage.topMovers.length === 0
      ? ['| n/a | none | n/a | n/a | n/a |']
      : report.coverage.topMovers.map(
          (entry) =>
            `| ${entry.package} | ${entry.file} | ${entry.branchPct}% | ${entry.previousBranchPct === null ? 'n/a' : `${entry.previousBranchPct}%`} | ${entry.deltaBranchPct === null ? 'n/a' : `${entry.deltaBranchPct}%`} |`,
        )),
    '',
    '## Hottest Diagnostics',
    '',
    '| Pair | Class | Median overhead | Previous | Delta | Threshold | Status |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...report.diagnostics.map(
      (entry) =>
        `| ${entry.label} | ${entry.runtimeClass} | ${formatPct(entry.medianOverheadPct)} | ${formatPct(entry.previousMedianOverheadPct)} | ${formatPct(entry.deltaMedianOverheadPct)} | ${entry.thresholdPct}% | ${entry.warning ? 'warn' : 'diag'} |`,
    ),
    '',
    '## Bench Stability',
    '',
    '| Pair | Median overhead | Spread | Replicates over threshold | Canary spread | Trust |',
    '| --- | ---: | ---: | --- | ---: | --- |',
    ...(report.benchStability.length === 0
      ? ['| none | n/a | n/a | n/a | n/a | n/a |']
      : report.benchStability.map(
          (entry) =>
            `| ${entry.label} | ${formatPct(entry.medianOverheadPct)} | ${formatPct(entry.spreadPct)} | ${entry.exceedances}/${entry.validReplicates} (fail ${entry.requiredExceedances}) | ${entry.canarySpreadMeanNs === null ? 'n/a' : `${entry.canarySpreadMeanNs}ns / ${entry.canarySpreadPct === null ? 'n/a' : `${entry.canarySpreadPct}%`}`} | ${entry.trustGrade} (${entry.trustReason}) |`,
        )),
    '',
    ...(report.benchStability.length === 0
      ? []
      : [
          '### Canary Sandwich',
          '',
          ...report.benchStability.flatMap((entry) => [
            `- ${entry.label}: ${entry.replicateCanaryContext
              .map(
                (context) =>
                  `r${context.replicate} ${context.ambientSpreadMeanNs === null ? 'n/a' : `${context.ambientSpreadMeanNs}ns`} / ${context.ambientSpreadPct === null ? 'n/a' : `${context.ambientSpreadPct}%`}`,
              )
              .join(', ')}`,
          ]),
          '',
        ]),
    '## Metric Classification',
    '',
    `- paired-truth: ${report.metricClassification.pairedTruth.join(', ') || 'none'}`,
    `- single-lane hard gate: ${report.metricClassification.singleLaneHardGate.join(', ') || 'none'}`,
    `- single-lane diagnostic: ${report.metricClassification.singleLaneDiagnostic.join(', ') || 'none'}`,
    `- transport note: ${report.metricClassification.transportNote.join(', ') || 'none'}`,
    `- seam note: ${report.metricClassification.seamNote.join(', ') || 'none'}`,
    '',
    '## Paired Truth',
    '',
    '- `gate-fail`: browser-budget truth failed.',
    '- `seam-drift`: browser truth passed, but the support lane still diverges enough to remain steering debt.',
    '- `invalid-measurement`: the telemetry chain no longer supports the claimed comparison.',
    '',
    '| Metric | Status | Primary lane | Support lane | Divergence | Fidelity | Primary p99 | Primary max |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: |',
    ...report.pairedTruth.map(
      (entry) =>
        `| ${entry.label} | ${entry.status} | ${entry.primaryLane.label} | ${entry.supportLane.label} | ${entry.divergence.pct === null ? 'n/a' : `${entry.divergence.pct.toFixed(2)}% (${entry.divergence.class})`} | ${entry.fidelity.supportBaselineKind} / target ${entry.fidelity.driftTargetPct}% / ${entry.fidelity.eventBoundaryParity} | ${entry.primaryLane.summary?.p99?.toFixed(4) ?? 'n/a'} | ${entry.primaryLane.summary?.max?.toFixed(4) ?? 'n/a'} |`,
    ),
    '',
    '## Worker Startup Breakdown',
    '',
    '| Stage | Focus | Modeled | Mean | Previous | Delta | P75 | P95 | P99 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...(report.startupBreakdown.length === 0
      ? ['| none | none | n/a | n/a | n/a | n/a | n/a | n/a | n/a |']
      : report.startupBreakdown.map(
          (entry) =>
            `| ${entry.stage} | ${entry.label} | ${entry.modeled ? 'yes' : 'missing'} | ${entry.meanNs}ns | ${entry.previousMeanNs === null ? 'n/a' : `${entry.previousMeanNs}ns`} | ${entry.deltaMeanNs === null ? 'n/a' : `${entry.deltaMeanNs}ns`} | ${entry.p75Ns}ns | ${entry.p95Ns}ns | ${entry.p99Ns}ns |`,
        )),
    '',
    '## Worker Startup Audit',
    '',
    `- Posture: ${report.workerStartupAudit.posture}`,
    `- Conclusion: ${report.workerStartupAudit.conclusion}`,
    `- Dominant residual stage: ${report.workerStartupAudit.dominantStage ?? 'none'}`,
    '',
    '| Stage | Focus | Inclusion | Support mean | Parity mean | Residual |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...(report.workerStartupAudit.rows.length === 0
      ? ['| none | none | n/a | n/a | n/a | n/a |']
      : report.workerStartupAudit.rows.map(
          (entry) =>
            `| ${entry.stage} | ${entry.label} | ${entry.inclusion} | ${entry.supportMeanNs}ns | ${entry.parityMeanNs === null ? 'n/a' : `${entry.parityMeanNs}ns`} | ${entry.residualMeanNs}ns |`,
        )),
    '',
    '## Worker Startup Split',
    '',
    '- Broad continuity metric: `worker-runtime-startup` stays in diagnostics and paired truth for historical continuity.',
    `- Broad current conclusion: ${report.workerStartupAudit.conclusion}`,
    ...(workerTailWatchLine === null ? [] : [workerTailWatchLine]),
    '',
    '### Shared Startup Parity',
    '',
    `- Visible first paint: ${report.workerStartupSplit.visibleFirstPaintMeanNs}ns`,
    `- Worker takeover seam: ${report.workerStartupSplit.workerTakeoverMeanNs}ns`,
    '',
    `- Pair: ${report.workerStartupSplit.shared.label}`,
    `- Support mean: ${report.workerStartupSplit.shared.supportMeanNs}ns`,
    `- Parity mean: ${report.workerStartupSplit.shared.parityMeanNs}ns`,
    `- Residual: ${report.workerStartupSplit.shared.residualMeanNs}ns`,
    `- Median overhead: ${formatPct(report.workerStartupSplit.shared.overheadPct)}`,
    `- Previous overhead: ${formatPct(report.workerStartupSplit.shared.previousOverheadPct)}`,
    `- Delta overhead: ${formatPct(report.workerStartupSplit.shared.deltaOverheadPct)}`,
    `- Threshold: ${report.workerStartupSplit.shared.thresholdPct}%`,
    `- Conclusion: ${report.workerStartupSplit.shared.conclusion}`,
    '',
    '### Worker-Only Seam Note',
    '',
    `- Note: ${report.workerStartupSplit.seam.label}`,
    `- Absolute seam: ${report.workerStartupSplit.seam.absoluteMeanNs}ns`,
    `- Previous absolute seam: ${report.workerStartupSplit.seam.previousAbsoluteMeanNs === null ? 'n/a' : `${report.workerStartupSplit.seam.previousAbsoluteMeanNs}ns`}`,
    `- Delta absolute seam: ${report.workerStartupSplit.seam.deltaAbsoluteMeanNs === null ? 'n/a' : `${report.workerStartupSplit.seam.deltaAbsoluteMeanNs}ns`}`,
    `- Derived percent: ${formatPct(report.workerStartupSplit.seam.derivedPct)}`,
    `- Previous derived percent: ${formatPct(report.workerStartupSplit.seam.previousDerivedPct)}`,
    `- Delta derived percent: ${formatPct(report.workerStartupSplit.seam.deltaDerivedPct)}`,
    `- Dominant seam stage: ${report.workerStartupSplit.seam.dominantStage ?? 'none'}`,
    `- Message receipt residual: ${report.workerStartupSplit.seam.messageReceiptResidualNs}ns`,
    `- Dispatch send residual: ${report.workerStartupSplit.seam.dispatchSendResidualNs}ns`,
    `- Message receipt share: ${formatPct(report.workerStartupSplit.seam.messageReceiptSharePct)}`,
    `- Dispatch send share: ${formatPct(report.workerStartupSplit.seam.dispatchSendSharePct)}`,
    `- Shared residual share: ${formatPct(report.workerStartupSplit.seam.sharedResidualSharePct)}`,
    `- Seam to browser startup median: ${formatPct(report.workerStartupSplit.seam.toBrowserStartupMedianPct)}`,
    `- Seam tail ratio (p99 / median): ${formatRatio(report.workerStartupSplit.seam.tailRatioP99ToMedian)}`,
    `- Conclusion: ${report.workerStartupSplit.seam.conclusion}`,
    '',
    '| Stage | Focus | Kind | Residual |',
    '| --- | --- | --- | ---: |',
    ...(report.workerStartupSplit.seam.components.length === 0
      ? ['| none | none | n/a | n/a |']
      : report.workerStartupSplit.seam.components.map(
          (component) =>
            `| ${component.stage} | ${component.label} | ${component.kind} | ${component.residualMeanNs}ns |`,
        )),
    '',
    '### Worker Early Warning',
    '',
    '- Green: shared parity healthy, message receipt dominant, browser truth within budget.',
    '- Watch: message receipt share or absolute seam rises while browser startup stays flat.',
    '- Investigate: queue-turn share rises materially, which points to host callback congestion.',
    '- Escalate: if seam absolute mean exceeds 10000ns and message receipt share stays at or above 60% for two consecutive verified runs, trigger a separate transport architecture evaluation.',
    '',
    '## LLM Steady Signals',
    '',
    `- Label: ${report.llmRuntimeSteadySignals.label}`,
    `- Replicate exceedance rate: ${report.llmRuntimeSteadySignals.replicateExceedanceRate.toFixed(2)}`,
    `- Directive p75 to baseline p75: ${formatRatio(report.llmRuntimeSteadySignals.directiveP75ToBaselineP75)}`,
    `- Directive p99 to baseline p99: ${formatRatio(report.llmRuntimeSteadySignals.directiveP99ToBaselineP99)}`,
    `- Long-session slope: ${report.llmRuntimeSteadySignals.longSessionSlopeNsPerChunk === null ? 'n/a' : `${report.llmRuntimeSteadySignals.longSessionSlopeNsPerChunk}ns/chunk`}`,
    `- Mixed-session slope: ${report.llmRuntimeSteadySignals.mixedChunkSlopeNsPerChunk === null ? 'n/a' : `${report.llmRuntimeSteadySignals.mixedChunkSlopeNsPerChunk}ns/chunk`}`,
    `- Conclusion: ${report.llmRuntimeSteadySignals.conclusion}`,
    `- Early warning: ${llmEarlyWarning}`,
    '',
    '## Transport Diagnostics',
    '',
    '| Pair | Class | Median overhead | Previous | Delta | Threshold | Status |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...(report.transportDiagnostics.length === 0
      ? ['| none | transport | n/a | n/a | n/a | n/a | n/a |']
      : report.transportDiagnostics.map(
          (entry) =>
            `| ${entry.label} | ${entry.runtimeClass} | ${formatPct(entry.medianOverheadPct)} | ${formatPct(entry.previousMedianOverheadPct)} | ${formatPct(entry.deltaMedianOverheadPct)} | ${entry.thresholdPct}% | ${entry.warning ? 'warn' : 'diag'} |`,
        )),
    '',
    '## Zero / Missing Coverage',
    '',
    `- Zero-covered files: ${report.coverage.zeroCoveredFiles.length === 0 ? 'none' : report.coverage.zeroCoveredFiles.join(', ')}`,
    `- Missing runtime files: ${report.coverage.missingRuntimeFiles.length === 0 ? 'none' : report.coverage.missingRuntimeFiles.join(', ')}`,
    '',
  ].join('\n');
}

function main(): void {
  const report = buildRuntimeSeamsReport(repoRoot);
  const jsonPath = resolve(repoRoot, 'reports', 'runtime-seams.json');
  const mdPath = resolve(repoRoot, 'reports', 'runtime-seams.md');
  writeTextFile(jsonPath, JSON.stringify(report, null, 2));
  writeTextFile(mdPath, renderRuntimeSeamsMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

if (isDirectExecution(import.meta.url)) {
  main();
}
