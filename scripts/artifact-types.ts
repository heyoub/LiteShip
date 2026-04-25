import type { ArtifactExpectedCounts } from './artifact-context.js';
import type { PairedTruthEntry } from './paired-truth.js';

export type MetricKey = 'lines' | 'statements' | 'functions' | 'branches';

export interface MetricSummary {
  readonly total: number;
  readonly covered: number;
  readonly skipped: number;
  readonly pct: number;
}

export interface SampleSummary {
  readonly min: number;
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

export interface FileArtifactMetadata {
  readonly path: string;
  readonly fingerprint: string;
  readonly sizeBytes: number;
  readonly mtime: string;
}

export interface CoverageTotals {
  readonly statements: number;
  readonly branches: number;
  readonly functions: number;
  readonly lines: number;
}

export interface CoverageHotspot {
  readonly file: string;
  readonly package: string;
  readonly branchPct: number;
  readonly branchCovered: number;
  readonly branchTotal: number;
  readonly linePct: number;
}

export interface CoverageMetaArtifact {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly gauntletRunId: string;
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly expectedCounts: ArtifactExpectedCounts;
  readonly coverageFingerprint: string;
  readonly policyFingerprint: string;
  readonly totals: CoverageTotals;
  readonly zeroCoverageFileCount: number;
  readonly missingRuntimeFileCount: number;
  readonly zeroCoverageFiles: readonly string[];
  readonly missingRuntimeFiles: readonly string[];
  readonly coveragePath: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface CoverageFacts {
  readonly artifact: FileArtifactMetadata;
  readonly metaArtifact: FileArtifactMetadata | null;
  readonly meta: CoverageMetaArtifact | null;
  readonly totals: CoverageTotals;
  readonly topBranchHotspots: readonly CoverageHotspot[];
  readonly zeroCoverageFiles: readonly string[];
  readonly missingRuntimeFiles: readonly string[];
  readonly policyFingerprint: string;
}

export interface RuntimeSeamPairSummary {
  readonly label: string;
  readonly pass: boolean;
  readonly runtimeClass: string;
  readonly medianOverheadPct: number | null;
  readonly thresholdPct: number;
}

export interface BenchArtifact {
  readonly schemaVersion?: number;
  readonly generatedAt: string;
  readonly gauntletRunId?: string;
  readonly sourceFingerprint?: string;
  readonly environmentFingerprint?: string;
  readonly expectedCounts?: ArtifactExpectedCounts;
  readonly benchConfig?: {
    readonly iterations?: number;
    readonly warmupIterations?: number;
    readonly replicateCount?: number;
    readonly hotLoopRepeat?: number;
    readonly startupBreakdownIterations?: number;
    readonly canaryTaskNames?: readonly string[];
  };
  readonly canaries?: ReadonlyArray<{
    readonly name: string;
    readonly medianMeanNs: number | null;
    readonly medianP75Ns: number | null;
    readonly medianP99Ns: number | null;
    readonly spreadMeanNs: number | null;
  }>;
  readonly summary: {
    readonly passed: boolean;
    readonly failedHardGates: readonly string[];
    readonly hardGateCount: number;
    readonly diagnosticCount: number;
  };
  readonly pairs: ReadonlyArray<{
    readonly label: string;
    readonly gate: boolean;
    readonly pass: boolean;
    readonly runtimeClass: string;
    readonly medianOverhead: number | null;
    readonly threshold: number;
    readonly warning?: boolean;
    readonly watch?: boolean;
    readonly validReplicates?: number;
    readonly missingReplicates?: number;
    readonly exceedances?: number;
    readonly requiredExceedances?: number;
    readonly overheads?: readonly (number | null)[];
    readonly spread?: number | null;
  }>;
  readonly workerStartupAudit?: {
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
  readonly workerStartupSplit?: {
    readonly visibleFirstPaintMeanNs?: number;
    readonly workerTakeoverMeanNs?: number;
    readonly shared: {
      readonly label: string;
      readonly supportMeanNs: number;
      readonly parityMeanNs: number;
      readonly residualMeanNs: number;
      readonly overheadPct: number | null;
      readonly thresholdPct: number;
      readonly conclusion: string;
    };
    readonly seam: {
      readonly label: string;
      readonly absoluteMeanNs: number;
      readonly derivedPct: number | null;
      readonly dominantStage: string | null;
      readonly messageReceiptResidualNs?: number;
      readonly dispatchSendResidualNs?: number;
      readonly messageReceiptSharePct?: number | null;
      readonly dispatchSendSharePct?: number | null;
      readonly sharedResidualSharePct?: number | null;
      readonly toBrowserStartupMedianPct?: number | null;
      readonly tailRatioP99ToMedian?: number | null;
      readonly conclusion: string;
      readonly components: ReadonlyArray<{
        readonly stage: string;
        readonly label: string;
        readonly kind: 'worker-only' | 'shared-residual';
        readonly residualMeanNs: number;
      }>;
    };
  };
  readonly llmRuntimeSteadySignals?: {
    readonly label: string;
    readonly replicateExceedanceRate: number;
    readonly directiveP99ToBaselineP99: number | null;
    readonly directiveP75ToBaselineP75: number | null;
    readonly longSessionSlopeNsPerChunk: number | null;
    readonly mixedChunkSlopeNsPerChunk: number | null;
    readonly conclusion: string;
  };
  readonly replicates?: ReadonlyArray<{
    readonly replicate?: number;
    readonly canaryContext?: {
      readonly tasks: ReadonlyArray<{
        readonly name: string;
        readonly beforeMeanNs: number | null;
        readonly afterMeanNs: number | null;
        readonly deltaNs: number | null;
        readonly deltaPct: number | null;
      }>;
      readonly ambientSpreadMeanNs: number | null;
      readonly ambientSpreadPct: number | null;
    };
    readonly startupBreakdown?: ReadonlyArray<{
      readonly stage: string;
      readonly label: string;
      readonly modeled?: boolean;
      readonly meanNs: number;
      readonly p75Ns: number;
      readonly p95Ns: number;
      readonly p99Ns: number;
    }>;
    readonly workerStartupAudit?: {
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
    readonly workerStartupSplit?: {
      readonly visibleFirstPaintMeanNs?: number;
      readonly workerTakeoverMeanNs?: number;
      readonly shared: {
        readonly label: string;
        readonly supportMeanNs: number;
        readonly parityMeanNs: number;
        readonly residualMeanNs: number;
        readonly overheadPct: number | null;
        readonly thresholdPct: number;
        readonly conclusion: string;
      };
      readonly seam: {
        readonly label: string;
        readonly absoluteMeanNs: number;
        readonly derivedPct: number | null;
        readonly dominantStage: string | null;
        readonly messageReceiptResidualNs?: number;
        readonly dispatchSendResidualNs?: number;
        readonly messageReceiptSharePct?: number | null;
        readonly dispatchSendSharePct?: number | null;
        readonly sharedResidualSharePct?: number | null;
        readonly toBrowserStartupMedianPct?: number | null;
        readonly tailRatioP99ToMedian?: number | null;
        readonly conclusion: string;
        readonly components: ReadonlyArray<{
          readonly stage: string;
          readonly label: string;
          readonly kind: 'worker-only' | 'shared-residual';
          readonly residualMeanNs: number;
        }>;
      };
    };
    readonly results?: ReadonlyArray<{
      readonly name: string;
      readonly meanNs: number;
      readonly p75Ns?: number;
      readonly p99Ns?: number;
    }>;
    readonly pairs?: ReadonlyArray<{
      readonly label: string;
      readonly overhead: number | null;
    }>;
  }>;
}

export interface BenchFacts {
  readonly artifact: FileArtifactMetadata;
  readonly bench: BenchArtifact;
  readonly hardGates: readonly RuntimeSeamPairSummary[];
}

export interface StartupRealityFacts {
  readonly artifact: FileArtifactMetadata;
  readonly startupReality: StartupRealityArtifact;
}

export interface StartupRealityArtifact {
  readonly schemaVersion?: number;
  readonly generatedAt: string;
  readonly gauntletRunId?: string;
  readonly sourceFingerprint?: string;
  readonly environmentFingerprint?: string;
  readonly expectedCounts?: ArtifactExpectedCounts;
  readonly sourceArtifacts?: {
    readonly bench?: {
      readonly fingerprint: string;
    };
  };
  readonly nodeProxy: {
    readonly workerRuntimeStartupMeanNs: number | null;
    readonly llmRuntimeStartupMeanNs: number | null;
    readonly llmRuntimePromotedStartupMeanNs?: number | null;
  };
  readonly browser: {
    readonly worker: {
      readonly iterations: number;
      readonly frameBudgetMs: number;
      readonly exceededFrameBudgetCount: number;
      readonly rawSamples?: readonly number[];
      readonly topOutliers?: readonly {
        readonly iteration: number;
        readonly valueMs: number;
        readonly note?: string;
      }[];
      readonly summary: {
        readonly totalStartupMs: SampleSummary | Record<string, number | string>;
        readonly stages: Record<string, SampleSummary | Record<string, number | string>>;
      };
    };
    readonly llm: {
      readonly iterations?: number;
      readonly simple: {
        readonly rawSamples?: readonly number[];
        readonly topOutliers?: readonly {
          readonly iteration: number;
          readonly valueMs: number;
          readonly note?: string;
        }[];
        readonly initToFirstTokenMs: SampleSummary | Record<string, number | string>;
        readonly openToFirstTokenMs: SampleSummary | Record<string, number | string>;
        readonly chunkToFirstTokenMs: SampleSummary | Record<string, number | string>;
        readonly resolution: {
          readonly timerResolutionFloorMs: number;
          readonly timerFloorLimited: boolean;
        };
      };
      readonly promoted?: {
        readonly rawSamples?: readonly number[];
        readonly topOutliers?: readonly {
          readonly iteration: number;
          readonly valueMs: number;
          readonly note?: string;
        }[];
        readonly initToFirstTokenMs: SampleSummary | Record<string, number | string>;
        readonly openToFirstTokenMs: SampleSummary | Record<string, number | string>;
        readonly chunkToFirstTokenMs: SampleSummary | Record<string, number | string>;
        readonly resolution: {
          readonly timerResolutionFloorMs: number;
          readonly timerFloorLimited: boolean;
        };
      };
    };
  };
  readonly divergence: {
    readonly workerRuntimeStartupPct: number | null;
    readonly llmRuntimeStartupPct: number | null;
    readonly llmRuntimePromotedStartupPct?: number | null;
  };
}

export interface RuntimeSeamsSourceArtifact {
  readonly path: string;
  readonly fingerprint: string;
  readonly sizeBytes: number;
  readonly mtime: string;
  readonly generatedAt: string | null;
  readonly summary: Record<string, unknown>;
}

export interface RuntimeSeamsIntegrityCheck {
  readonly code: string;
  readonly passed: boolean;
  readonly severity: 'error';
  readonly summary: string;
}

export interface RuntimeSeamsReportArtifact {
  readonly schemaVersion?: number;
  readonly generatedAt: string;
  readonly gauntletRunId?: string;
  readonly sourceFingerprint?: string;
  readonly environmentFingerprint?: string;
  readonly expectedCounts?: ArtifactExpectedCounts;
  readonly previousReport?: {
    readonly generatedAt: string;
  } | null;
  readonly sourceArtifacts?: {
    readonly coverage?: RuntimeSeamsSourceArtifact;
    readonly coverageMeta?: RuntimeSeamsSourceArtifact;
    readonly bench?: RuntimeSeamsSourceArtifact;
    readonly startupReality?: RuntimeSeamsSourceArtifact;
  };
  readonly integrity?: {
    readonly passed: boolean;
    readonly checks: readonly RuntimeSeamsIntegrityCheck[];
  };
  readonly hardGates?: {
    readonly passed: boolean;
    readonly failed: readonly string[];
    readonly pairs: readonly RuntimeSeamPairSummary[];
  };
  readonly coverage?: {
    readonly topBranchHotspots?: readonly CoverageHotspot[];
    readonly zeroCoveredFiles?: readonly string[];
    readonly missingRuntimeFiles?: readonly string[];
  };
  readonly diagnostics?: ReadonlyArray<{
    readonly label: string;
    readonly runtimeClass: string;
    readonly medianOverheadPct: number | null;
    readonly thresholdPct: number;
    readonly warning?: boolean;
  }>;
  readonly startupBreakdown?: ReadonlyArray<{
    readonly stage: string;
    readonly modeled?: boolean;
    readonly meanNs: number;
    readonly p75Ns?: number;
    readonly p95Ns?: number;
    readonly p99Ns?: number;
  }>;
  readonly workerStartupAudit?: {
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
  readonly workerStartupSplit?: {
    readonly visibleFirstPaintMeanNs?: number;
    readonly workerTakeoverMeanNs?: number;
    readonly shared: {
      readonly label: string;
      readonly supportMeanNs: number;
      readonly parityMeanNs: number;
      readonly residualMeanNs: number;
      readonly overheadPct: number | null;
      readonly thresholdPct: number;
      readonly conclusion: string;
    };
    readonly seam: {
      readonly label: string;
      readonly absoluteMeanNs: number;
      readonly derivedPct: number | null;
      readonly dominantStage: string | null;
      readonly messageReceiptResidualNs?: number;
      readonly dispatchSendResidualNs?: number;
      readonly messageReceiptSharePct?: number | null;
      readonly dispatchSendSharePct?: number | null;
      readonly sharedResidualSharePct?: number | null;
      readonly toBrowserStartupMedianPct?: number | null;
      readonly tailRatioP99ToMedian?: number | null;
      readonly conclusion: string;
      readonly components: ReadonlyArray<{
        readonly stage: string;
        readonly label: string;
        readonly kind: 'worker-only' | 'shared-residual';
        readonly residualMeanNs: number;
      }>;
    };
  };
  readonly llmRuntimeSteadySignals?: {
    readonly label: string;
    readonly replicateExceedanceRate: number;
    readonly directiveP99ToBaselineP99: number | null;
    readonly directiveP75ToBaselineP75: number | null;
    readonly longSessionSlopeNsPerChunk: number | null;
    readonly mixedChunkSlopeNsPerChunk: number | null;
    readonly conclusion: string;
  };
  readonly metricClassification?: {
    readonly pairedTruth: readonly string[];
    readonly singleLaneHardGate: readonly string[];
    readonly singleLaneDiagnostic: readonly string[];
    readonly transportNote: readonly string[];
    readonly seamNote?: readonly string[];
  };
  readonly pairedTruth?: readonly PairedTruthEntry[];
  readonly transportDiagnostics?: ReadonlyArray<{
    readonly label: string;
    readonly runtimeClass: string;
    readonly medianOverheadPct: number | null;
    readonly thresholdPct: number;
    readonly warning?: boolean;
  }>;
  readonly benchStability?: ReadonlyArray<{
    readonly label: string;
    readonly runtimeClass: string;
    readonly medianOverheadPct: number | null;
    readonly thresholdPct: number;
    readonly validReplicates: number;
    readonly exceedances: number;
    readonly requiredExceedances: number;
    readonly spreadPct: number | null;
    readonly replicateOverheadsPct: readonly (number | null)[];
    readonly canarySpreadMeanNs: number | null;
    readonly canarySpreadPct: number | null;
    readonly replicateCanaryContext: ReadonlyArray<{
      readonly replicate: number;
      readonly ambientSpreadMeanNs: number | null;
      readonly ambientSpreadPct: number | null;
      readonly tasks: ReadonlyArray<{
        readonly name: string;
        readonly beforeMeanNs: number | null;
        readonly afterMeanNs: number | null;
        readonly deltaNs: number | null;
        readonly deltaPct: number | null;
      }>;
    }>;
    readonly trustGrade: 'stable' | 'watch' | 'noisy';
    readonly trustReason: string;
    readonly noisy: boolean;
  }>;
}

export interface RuntimeSeamsVerification {
  readonly passed: boolean;
  readonly checks: readonly RuntimeSeamsIntegrityCheck[];
}

export interface FeedbackVerification {
  readonly passed: boolean;
  readonly runtimeSeams: RuntimeSeamsVerification;
  readonly auditChecks: readonly RuntimeSeamsIntegrityCheck[];
  readonly satelliteScanChecks: readonly RuntimeSeamsIntegrityCheck[];
  readonly checks: readonly RuntimeSeamsIntegrityCheck[];
}
