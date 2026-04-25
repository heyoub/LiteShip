export type SampleSummary = {
  readonly min: number;
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
};

export type DivergenceClass = 'aligned' | 'proxy-dominant' | 'browser-dominant';

export type PairedTruthStatus = 'pass' | 'gate-fail' | 'seam-drift' | 'invalid-measurement';
export type EventBoundaryParity = 'matched' | 'mismatched';
export type SupportBaselineKind = 'node-parity';

export interface PairTruthBudget {
  readonly kind: 'browser-startup';
  readonly p99Ms: number;
  readonly maxMs?: number;
  readonly maxFrameBudgetExceedances?: number;
}

export interface PairedTruthLane {
  readonly label: string;
  readonly unit: 'ms' | 'pct' | 'ns';
  readonly summary: SampleSummary | null;
  readonly sampleCount: number | null;
  readonly rawSamples?: readonly number[];
}

export interface PairedTruthShapeGuard {
  readonly code: string;
  readonly passed: boolean;
  readonly summary: string;
}

export interface PairedTruthFidelity {
  readonly driftTargetPct: number;
  readonly eventBoundaryParity: EventBoundaryParity;
  readonly supportBaselineKind: SupportBaselineKind;
  readonly modeledStages: readonly string[];
  readonly missingStages: readonly string[];
  readonly supportRawSamples: readonly number[];
  readonly dominantSupportStages: readonly string[];
}

export interface PairedTruthOutlier {
  readonly iteration: number;
  readonly valueMs: number;
  readonly note?: string;
}

export interface PairedTruthEntry {
  readonly id: string;
  readonly label: string;
  readonly primaryLane: PairedTruthLane & {
    readonly budget: PairTruthBudget;
    readonly frameBudgetMs?: number;
    readonly exceededFrameBudgetCount?: number;
  };
  readonly supportLane: PairedTruthLane;
  readonly divergence: {
    readonly pct: number | null;
    readonly class: DivergenceClass;
  };
  readonly status: PairedTruthStatus;
  readonly shapeGuards: readonly PairedTruthShapeGuard[];
  readonly fidelity: PairedTruthFidelity;
  readonly stages?: readonly string[];
  readonly outliers?: readonly PairedTruthOutlier[];
}

export const PAIRED_TRUTH_DIVERGENCE_THRESHOLD_PCT = 25;
export const DEFAULT_FIDELITY_DRIFT_TARGET_PCT = 50;
export const PAIRED_TRUTH_IMMATERIAL_ABSOLUTE_DRIFT_MS = 0.125;
export const WORKER_STARTUP_BUDGET: PairTruthBudget = {
  kind: 'browser-startup',
  p99Ms: 8,
  maxMs: 16,
  maxFrameBudgetExceedances: 0,
};
export const LLM_STARTUP_BUDGET: PairTruthBudget = {
  kind: 'browser-startup',
  p99Ms: 1,
};

export function sampleSummaryAbsoluteDeltaMs(
  primarySummary: SampleSummary | null | undefined,
  supportSummary: SampleSummary | null | undefined,
): number | null {
  if (!primarySummary || !supportSummary) {
    return null;
  }

  return Number(Math.abs(primarySummary.mean - supportSummary.mean).toFixed(4));
}

function isImmaterialAbsoluteDrift(
  absoluteDeltaMs: number | null,
  materialityFloorMs = PAIRED_TRUTH_IMMATERIAL_ABSOLUTE_DRIFT_MS,
): boolean {
  return absoluteDeltaMs !== null && absoluteDeltaMs <= materialityFloorMs;
}

export function classifyDivergence(
  divergencePct: number | null,
  options?: {
    readonly absoluteDeltaMs?: number | null;
    readonly materialityFloorMs?: number;
  },
): DivergenceClass {
  if (divergencePct === null) {
    return 'aligned';
  }
  if (isImmaterialAbsoluteDrift(options?.absoluteDeltaMs ?? null, options?.materialityFloorMs)) {
    return 'aligned';
  }
  if (divergencePct <= -PAIRED_TRUTH_DIVERGENCE_THRESHOLD_PCT) {
    return 'proxy-dominant';
  }
  if (divergencePct >= PAIRED_TRUTH_DIVERGENCE_THRESHOLD_PCT) {
    return 'browser-dominant';
  }
  return 'aligned';
}

export function isMonotonicSummary(summary: SampleSummary): boolean {
  return (
    summary.min <= summary.median &&
    summary.median <= summary.p75 &&
    summary.p75 <= summary.p95 &&
    summary.p95 <= summary.p99 &&
    summary.p99 <= summary.max
  );
}

export function topOutliers(
  samples: readonly number[],
  limit = 3,
  notes?: readonly (string | undefined)[],
): readonly PairedTruthOutlier[] {
  return samples
    .map((valueMs, iteration) => ({
      iteration,
      valueMs,
      note: notes?.[iteration],
    }))
    .sort((left, right) => right.valueMs - left.valueMs)
    .slice(0, limit)
    .map((entry) => ({
      iteration: entry.iteration,
      valueMs: Number(entry.valueMs.toFixed(4)),
      note: entry.note,
    }));
}

export function buildPairedTruthGuard(
  code: string,
  passed: boolean,
  summary: string,
): PairedTruthShapeGuard {
  return { code, passed, summary };
}

export function hasNegativeStageDurations(stages: Record<string, SampleSummary | null> | undefined): boolean {
  if (!stages) {
    return false;
  }

  return Object.values(stages).some((summary) => {
    if (!summary) {
      return false;
    }

    return summary.min < 0 || summary.median < 0 || summary.p75 < 0 || summary.p95 < 0 || summary.p99 < 0 || summary.max < 0;
  });
}

export function buildShapeGuards(
  id: string,
  primaryLane: PairedTruthEntry['primaryLane'],
  supportLane: PairedTruthEntry['supportLane'],
  expectedSamples: number,
  options?: {
    readonly stages?: Record<string, SampleSummary | null>;
    readonly fidelity?: PairedTruthFidelity;
  },
): readonly PairedTruthShapeGuard[] {
  const guards: PairedTruthShapeGuard[] = [];
  guards.push(
    buildPairedTruthGuard(
      `${id}-primary-present`,
      primaryLane.summary !== null,
      primaryLane.summary
        ? `${id} primary lane is present.`
        : `${id} primary lane is missing.`,
    ),
  );
  guards.push(
    buildPairedTruthGuard(
      `${id}-primary-samples`,
      primaryLane.sampleCount === expectedSamples,
      primaryLane.sampleCount === expectedSamples
        ? `${id} primary lane sample count matches ${expectedSamples}.`
        : `${id} primary lane sample count does not match ${expectedSamples}.`,
    ),
  );
  guards.push(
    buildPairedTruthGuard(
      `${id}-primary-monotonic`,
      primaryLane.summary !== null && isMonotonicSummary(primaryLane.summary),
      primaryLane.summary !== null && isMonotonicSummary(primaryLane.summary)
        ? `${id} primary summary ordering is monotonic.`
        : `${id} primary summary ordering is invalid.`,
    ),
  );
  guards.push(
    buildPairedTruthGuard(
      `${id}-support-monotonic`,
      supportLane.summary !== null && isMonotonicSummary(supportLane.summary),
      supportLane.summary !== null && isMonotonicSummary(supportLane.summary)
        ? `${id} support summary ordering is monotonic.`
        : `${id} support summary ordering is invalid.`,
    ),
  );
  guards.push(
    buildPairedTruthGuard(
      `${id}-stages-non-negative`,
      !hasNegativeStageDurations(options?.stages),
      !hasNegativeStageDurations(options?.stages)
        ? `${id} staged durations are non-negative.`
        : `${id} staged durations include negative values.`,
    ),
  );
  guards.push(
    buildPairedTruthGuard(
      `${id}-event-boundary-parity`,
      options?.fidelity?.eventBoundaryParity === 'matched' || options?.fidelity?.eventBoundaryParity === 'mismatched',
      options?.fidelity?.eventBoundaryParity === 'matched'
        ? `${id} support and primary lanes use the same event boundary.`
        : options?.fidelity?.eventBoundaryParity === 'mismatched'
          ? `${id} support and primary lanes use different event boundaries.`
          : `${id} support lane event-boundary parity metadata is missing.`,
    ),
  );
  guards.push(
    buildPairedTruthGuard(
      `${id}-modeled-stage-accounting`,
      (options?.fidelity?.modeledStages ?? []).every(
        (stage) => !(options?.fidelity?.missingStages ?? []).includes(stage),
      ),
      (options?.fidelity?.modeledStages ?? []).every(
        (stage) => !(options?.fidelity?.missingStages ?? []).includes(stage),
      )
        ? `${id} modeled and missing stage declarations do not overlap.`
        : `${id} modeled and missing stage declarations overlap.`,
    ),
  );
  return guards;
}

function budgetPasses(
  primaryLane: PairedTruthEntry['primaryLane'],
): boolean {
  const summary = primaryLane.summary;
  if (!summary) {
    return false;
  }

  if (summary.p99 > primaryLane.budget.p99Ms) {
    return false;
  }
  if (primaryLane.budget.maxMs !== undefined && summary.max > primaryLane.budget.maxMs) {
    return false;
  }
  if (
    primaryLane.budget.maxFrameBudgetExceedances !== undefined &&
    (primaryLane.exceededFrameBudgetCount ?? 0) > primaryLane.budget.maxFrameBudgetExceedances
  ) {
    return false;
  }

  return true;
}

export function derivePairedTruthStatus(entry: Omit<PairedTruthEntry, 'status'>): PairedTruthStatus {
  if (!entry.shapeGuards.every((guard) => guard.passed)) {
    return 'invalid-measurement';
  }
  if (!budgetPasses(entry.primaryLane)) {
    return 'gate-fail';
  }
  if (entry.divergence.class !== 'aligned') {
    return 'seam-drift';
  }
  return 'pass';
}

export function createPairedTruthEntry(entry: Omit<PairedTruthEntry, 'status'>): PairedTruthEntry {
  return {
    ...entry,
    status: derivePairedTruthStatus(entry),
  };
}

export function fidelityMissesTarget(
  entry: Pick<PairedTruthEntry, 'divergence' | 'fidelity' | 'primaryLane' | 'supportLane'>,
): boolean {
  const divergence = Math.abs(entry.divergence.pct ?? 0);
  const absoluteDeltaMs = sampleSummaryAbsoluteDeltaMs(entry.primaryLane.summary, entry.supportLane.summary);
  return divergence > entry.fidelity.driftTargetPct && !isImmaterialAbsoluteDrift(absoluteDeltaMs);
}
