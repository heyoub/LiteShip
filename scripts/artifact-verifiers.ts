import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../vitest.shared.js';
import { buildCurrentArtifactContext } from './artifact-context.js';
import {
  CODEBASE_AUDIT_SCHEMA_VERSION,
  getCodebaseAuditRuntimeSeamsStatus,
  hasCodebaseAuditCounts,
  hasCurrentCodebaseAuditSchema,
  hasCodebaseAuditRuntimeSeamsStatus,
  type CodebaseAuditArtifactEnvelope,
} from './audit/artifact-contract.js';
import { verifySatelliteScanReport, type SatelliteScanReport } from './report-satellite-scan.js';
import {
  buildBenchFacts,
  buildCoverageFacts,
  buildExpectedBenchStability,
  buildExpectedPairedTruth,
  buildStartupRealityFacts,
} from './artifact-builders.js';
import type {
  CoverageFacts,
  CoverageHotspot,
  RuntimeSeamsIntegrityCheck,
  RuntimeSeamsReportArtifact,
  RuntimeSeamsVerification,
  FeedbackVerification,
  BenchArtifact,
} from './artifact-types.js';

export type {
  RuntimeSeamsIntegrityCheck,
  RuntimeSeamsVerification,
  FeedbackVerification,
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function compareJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildCheck(
  code: string,
  passed: boolean,
  summary: string,
): RuntimeSeamsIntegrityCheck {
  return {
    code,
    passed,
    severity: 'error',
    summary,
  };
}

function projectCoverageHotspots(
  hotspots:
    | ReadonlyArray<{
        readonly file: string;
        readonly package: string;
        readonly branchPct: number;
        readonly branchCovered: number;
        readonly branchTotal: number;
        readonly linePct: number;
      }>
    | undefined,
): readonly CoverageHotspot[] {
  return (hotspots ?? []).map((entry) => ({
    file: entry.file,
    package: entry.package,
    branchPct: entry.branchPct,
    branchCovered: entry.branchCovered,
    branchTotal: entry.branchTotal,
    linePct: entry.linePct,
  }));
}

function projectWorkerStartupSplit(
  split: RuntimeSeamsReportArtifact['workerStartupSplit'] | BenchArtifact['workerStartupSplit'] | null | undefined,
):
  | {
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
        readonly messageReceiptResidualNs: number | null;
        readonly dispatchSendResidualNs: number | null;
      readonly messageReceiptSharePct: number | null;
      readonly dispatchSendSharePct: number | null;
      readonly sharedResidualSharePct: number | null;
      readonly tailRatioP99ToMedian: number | null;
        readonly conclusion: string;
        readonly components: ReadonlyArray<{
          readonly stage: string;
          readonly label: string;
          readonly kind: 'worker-only' | 'shared-residual';
          readonly residualMeanNs: number;
        }>;
      };
    }
  | null {
  if (!split) {
    return null;
  }

  return {
    shared: {
      label: split.shared.label,
      supportMeanNs: split.shared.supportMeanNs,
      parityMeanNs: split.shared.parityMeanNs,
      residualMeanNs: split.shared.residualMeanNs,
      overheadPct: split.shared.overheadPct,
      thresholdPct: split.shared.thresholdPct,
      conclusion: split.shared.conclusion,
    },
    seam: {
      label: split.seam.label,
      absoluteMeanNs: split.seam.absoluteMeanNs,
      derivedPct: split.seam.derivedPct,
      dominantStage: split.seam.dominantStage,
      messageReceiptResidualNs: split.seam.messageReceiptResidualNs ?? null,
      dispatchSendResidualNs: split.seam.dispatchSendResidualNs ?? null,
      messageReceiptSharePct: split.seam.messageReceiptSharePct ?? null,
      dispatchSendSharePct: split.seam.dispatchSendSharePct ?? null,
      sharedResidualSharePct: split.seam.sharedResidualSharePct ?? null,
      tailRatioP99ToMedian: split.seam.tailRatioP99ToMedian ?? null,
      conclusion: split.seam.conclusion,
      components: split.seam.components,
    },
  };
}

function projectLLMRuntimeSteadySignals(
  signals: RuntimeSeamsReportArtifact['llmRuntimeSteadySignals'] | BenchArtifact['llmRuntimeSteadySignals'] | null | undefined,
):
  | {
      readonly label: string;
      readonly replicateExceedanceRate: number;
      readonly directiveP99ToBaselineP99: number | null;
      readonly directiveP75ToBaselineP75: number | null;
      readonly longSessionSlopeNsPerChunk: number | null;
      readonly mixedChunkSlopeNsPerChunk: number | null;
      readonly conclusion: string;
    }
  | null {
  if (!signals) {
    return null;
  }

  return {
    label: signals.label,
    replicateExceedanceRate: signals.replicateExceedanceRate,
    directiveP99ToBaselineP99: signals.directiveP99ToBaselineP99,
    directiveP75ToBaselineP75: signals.directiveP75ToBaselineP75,
    longSessionSlopeNsPerChunk: signals.longSessionSlopeNsPerChunk,
    mixedChunkSlopeNsPerChunk: signals.mixedChunkSlopeNsPerChunk,
    conclusion: signals.conclusion,
  };
}

function pushCoverageMetaChecks(
  checks: RuntimeSeamsIntegrityCheck[],
  coverageFacts: CoverageFacts,
  currentContext: ReturnType<typeof buildCurrentArtifactContext>,
): void {
  if (!coverageFacts.meta || !coverageFacts.metaArtifact) {
    checks.push(
      buildCheck(
        'coverage-meta-present',
        false,
        'coverage/coverage-meta.json is missing, so merged coverage provenance cannot be verified.',
      ),
    );
    return;
  }

  const meta = coverageFacts.meta;
  checks.push(
    buildCheck(
      'coverage-meta-schema-version',
      meta.schemaVersion === 1,
      meta.schemaVersion === 1
        ? 'coverage-meta schema version is current.'
        : 'coverage-meta schema version is missing or unsupported.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-source-fingerprint',
      meta.sourceFingerprint === currentContext.sourceFingerprint,
      meta.sourceFingerprint === currentContext.sourceFingerprint
        ? 'coverage-meta source fingerprint matches the current source tree.'
        : 'coverage-meta source fingerprint does not match the current source tree.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-environment-fingerprint',
      meta.environmentFingerprint === currentContext.environmentFingerprint,
      meta.environmentFingerprint === currentContext.environmentFingerprint
        ? 'coverage-meta environment fingerprint matches the current environment profile.'
        : 'coverage-meta environment fingerprint does not match the current environment profile.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-expected-counts',
      compareJson(meta.expectedCounts, currentContext.expectedCounts),
      compareJson(meta.expectedCounts, currentContext.expectedCounts)
        ? 'coverage-meta expected suite counts match the current repo layout.'
        : 'coverage-meta expected suite counts do not match the current repo layout.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-fingerprint',
      meta.coverageFingerprint === coverageFacts.artifact.fingerprint,
      meta.coverageFingerprint === coverageFacts.artifact.fingerprint
        ? 'coverage-meta fingerprint matches coverage-final.json.'
        : 'coverage-meta fingerprint does not match coverage-final.json.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-policy',
      meta.policyFingerprint === coverageFacts.policyFingerprint,
      meta.policyFingerprint === coverageFacts.policyFingerprint
        ? 'coverage-meta policy fingerprint matches vitest coverage policy.'
        : 'coverage-meta policy fingerprint does not match vitest coverage policy.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-totals',
      compareJson(meta.totals, coverageFacts.totals),
      compareJson(meta.totals, coverageFacts.totals)
        ? 'coverage-meta totals match the merged coverage artifact.'
        : 'coverage-meta totals do not match the merged coverage artifact.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-zero-files',
      compareJson(meta.zeroCoverageFiles, coverageFacts.zeroCoverageFiles) &&
        meta.zeroCoverageFileCount === coverageFacts.zeroCoverageFiles.length,
      compareJson(meta.zeroCoverageFiles, coverageFacts.zeroCoverageFiles) &&
        meta.zeroCoverageFileCount === coverageFacts.zeroCoverageFiles.length
        ? 'coverage-meta zero-covered file list matches merged coverage.'
        : 'coverage-meta zero-covered file list does not match merged coverage.',
    ),
  );
  checks.push(
    buildCheck(
      'coverage-meta-missing-runtime-files',
      compareJson(meta.missingRuntimeFiles, coverageFacts.missingRuntimeFiles) &&
        meta.missingRuntimeFileCount === coverageFacts.missingRuntimeFiles.length,
      compareJson(meta.missingRuntimeFiles, coverageFacts.missingRuntimeFiles) &&
        meta.missingRuntimeFileCount === coverageFacts.missingRuntimeFiles.length
        ? 'coverage-meta missing runtime file list matches merged coverage.'
        : 'coverage-meta missing runtime file list does not match merged coverage.',
    ),
  );
}

export function verifyRuntimeSeamsReport(
  report: RuntimeSeamsReportArtifact,
  root = repoRoot,
): RuntimeSeamsVerification {
  const checks: RuntimeSeamsIntegrityCheck[] = [];
  const coverageFacts = buildCoverageFacts(root);
  const benchFacts = buildBenchFacts(root);
  const startupRealityFacts = buildStartupRealityFacts(root);
  const currentContext = buildCurrentArtifactContext(root);

  pushCoverageMetaChecks(checks, coverageFacts, currentContext);

  const sourceArtifacts = report.sourceArtifacts;
  const coverageSource = sourceArtifacts?.coverage;
  const coverageMetaSource = sourceArtifacts?.coverageMeta;
  const benchSource = sourceArtifacts?.bench;
  const startupRealitySource = sourceArtifacts?.startupReality;

  checks.push(
    buildCheck(
      'bench-schema-version',
      benchFacts.bench.schemaVersion === 8,
      benchFacts.bench.schemaVersion === 8
        ? 'Bench artifact schema version is current.'
        : 'Bench artifact schema version is missing or unsupported.',
    ),
  );
  checks.push(
    buildCheck(
      'startup-reality-schema-version',
      startupRealityFacts.startupReality.schemaVersion === 4,
      startupRealityFacts.startupReality.schemaVersion === 4
        ? 'Startup reality schema version is current.'
        : 'Startup reality schema version is missing or unsupported.',
    ),
  );
  checks.push(
    buildCheck(
      'startup-reality-llm-phase-shapes',
      Boolean(
        startupRealityFacts.startupReality.browser.llm.simple.initToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.simple.openToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.simple.chunkToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.simple.resolution &&
          startupRealityFacts.startupReality.browser.llm.promoted?.initToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.promoted?.openToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.promoted?.chunkToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.promoted?.resolution,
      ),
      Boolean(
        startupRealityFacts.startupReality.browser.llm.simple.initToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.simple.openToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.simple.chunkToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.simple.resolution &&
          startupRealityFacts.startupReality.browser.llm.promoted?.initToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.promoted?.openToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.promoted?.chunkToFirstTokenMs &&
          startupRealityFacts.startupReality.browser.llm.promoted?.resolution,
      )
        ? 'Startup reality LLM phase summaries and timer-resolution metadata are present.'
        : 'Startup reality is missing LLM phase summaries or timer-resolution metadata.',
    ),
  );
  checks.push(
    buildCheck(
      'startup-reality-source-fingerprint',
      startupRealityFacts.startupReality.sourceFingerprint === currentContext.sourceFingerprint,
      startupRealityFacts.startupReality.sourceFingerprint === currentContext.sourceFingerprint
        ? 'Startup reality source fingerprint matches the current source tree.'
        : 'Startup reality source fingerprint does not match the current source tree.',
    ),
  );
  checks.push(
    buildCheck(
      'startup-reality-environment-fingerprint',
      startupRealityFacts.startupReality.environmentFingerprint === currentContext.environmentFingerprint,
      startupRealityFacts.startupReality.environmentFingerprint === currentContext.environmentFingerprint
        ? 'Startup reality environment fingerprint matches the current environment profile.'
        : 'Startup reality environment fingerprint does not match the current environment profile.',
    ),
  );
  checks.push(
    buildCheck(
      'startup-reality-expected-counts',
      compareJson(startupRealityFacts.startupReality.expectedCounts ?? null, currentContext.expectedCounts),
      compareJson(startupRealityFacts.startupReality.expectedCounts ?? null, currentContext.expectedCounts)
        ? 'Startup reality expected suite counts match the current repo layout.'
        : 'Startup reality expected suite counts do not match the current repo layout.',
    ),
  );
  checks.push(
    buildCheck(
      'bench-source-fingerprint',
      benchFacts.bench.sourceFingerprint === currentContext.sourceFingerprint,
      benchFacts.bench.sourceFingerprint === currentContext.sourceFingerprint
        ? 'Bench artifact source fingerprint matches the current source tree.'
        : 'Bench artifact source fingerprint does not match the current source tree.',
    ),
  );
  checks.push(
    buildCheck(
      'bench-environment-fingerprint',
      benchFacts.bench.environmentFingerprint === currentContext.environmentFingerprint,
      benchFacts.bench.environmentFingerprint === currentContext.environmentFingerprint
        ? 'Bench artifact environment fingerprint matches the current environment profile.'
        : 'Bench artifact environment fingerprint does not match the current environment profile.',
    ),
  );
  checks.push(
    buildCheck(
      'bench-expected-counts',
      compareJson(benchFacts.bench.expectedCounts ?? null, currentContext.expectedCounts),
      compareJson(benchFacts.bench.expectedCounts ?? null, currentContext.expectedCounts)
        ? 'Bench artifact expected suite counts match the current repo layout.'
        : 'Bench artifact expected suite counts do not match the current repo layout.',
    ),
  );
  checks.push(
    buildCheck(
      'bench-summary-hard-gates',
      benchFacts.bench.summary.hardGateCount === benchFacts.bench.pairs.filter((pair) => pair.gate).length,
      benchFacts.bench.summary.hardGateCount === benchFacts.bench.pairs.filter((pair) => pair.gate).length
        ? 'Bench artifact hard-gate count matches its pair list.'
        : 'Bench artifact hard-gate count does not match its pair list.',
    ),
  );
  checks.push(
    buildCheck(
      'bench-summary-diagnostics',
      benchFacts.bench.summary.diagnosticCount === benchFacts.bench.pairs.filter((pair) => !pair.gate).length,
      benchFacts.bench.summary.diagnosticCount === benchFacts.bench.pairs.filter((pair) => !pair.gate).length
        ? 'Bench artifact diagnostic count matches its pair list.'
        : 'Bench artifact diagnostic count does not match its pair list.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-schema-version',
      report.schemaVersion === 7,
      report.schemaVersion === 7
        ? 'Runtime seams schema version is current.'
        : 'Runtime seams schema version is missing or unsupported.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-source-coverage-fingerprint',
      coverageSource?.fingerprint === coverageFacts.artifact.fingerprint,
      coverageSource?.fingerprint === coverageFacts.artifact.fingerprint
        ? 'Runtime seams coverage source fingerprint matches coverage-final.json.'
        : 'Runtime seams coverage source fingerprint does not match coverage-final.json.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-source-coverage-meta-fingerprint',
      coverageMetaSource?.fingerprint === coverageFacts.metaArtifact?.fingerprint,
      coverageMetaSource?.fingerprint === coverageFacts.metaArtifact?.fingerprint
        ? 'Runtime seams coverage-meta fingerprint matches coverage-meta.json.'
        : 'Runtime seams coverage-meta fingerprint does not match coverage-meta.json.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-source-bench-fingerprint',
      benchSource?.fingerprint === benchFacts.artifact.fingerprint,
      benchSource?.fingerprint === benchFacts.artifact.fingerprint
        ? 'Runtime seams bench source fingerprint matches directive-gate.json.'
        : 'Runtime seams bench source fingerprint does not match directive-gate.json.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-source-startup-reality-fingerprint',
      startupRealitySource?.fingerprint === startupRealityFacts.artifact.fingerprint,
      startupRealitySource?.fingerprint === startupRealityFacts.artifact.fingerprint
        ? 'Runtime seams startup reality source fingerprint matches startup-reality.json.'
        : 'Runtime seams startup reality source fingerprint does not match startup-reality.json.',
    ),
  );

  const reportGeneratedAt = Date.parse(report.generatedAt);
  const coverageMtime = Date.parse(coverageFacts.artifact.mtime);
  const benchMtime = Date.parse(benchFacts.artifact.mtime);
  const startupRealityMtime = Date.parse(startupRealityFacts.artifact.mtime);
  checks.push(
    buildCheck(
      'runtime-seams-source-fingerprint',
      report.sourceFingerprint === currentContext.sourceFingerprint,
      report.sourceFingerprint === currentContext.sourceFingerprint
        ? 'Runtime seams source fingerprint matches the current source tree.'
        : 'Runtime seams source fingerprint does not match the current source tree.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-environment-fingerprint',
      report.environmentFingerprint === currentContext.environmentFingerprint,
      report.environmentFingerprint === currentContext.environmentFingerprint
        ? 'Runtime seams environment fingerprint matches the current environment profile.'
        : 'Runtime seams environment fingerprint does not match the current environment profile.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-expected-counts',
      compareJson(report.expectedCounts ?? null, currentContext.expectedCounts),
      compareJson(report.expectedCounts ?? null, currentContext.expectedCounts)
        ? 'Runtime seams expected suite counts match the current repo layout.'
        : 'Runtime seams expected suite counts do not match the current repo layout.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-run-coherence',
      report.gauntletRunId === coverageFacts.meta?.gauntletRunId &&
        report.gauntletRunId === benchFacts.bench.gauntletRunId &&
        report.gauntletRunId === startupRealityFacts.startupReality.gauntletRunId,
      report.gauntletRunId === coverageFacts.meta?.gauntletRunId &&
        report.gauntletRunId === benchFacts.bench.gauntletRunId &&
        report.gauntletRunId === startupRealityFacts.startupReality.gauntletRunId
        ? 'Runtime seams, coverage-meta, bench, and startup reality artifacts share the same gauntlet run id.'
        : 'Runtime seams, coverage-meta, bench, and startup reality artifacts do not share the same gauntlet run id.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-ordering',
      Number.isFinite(reportGeneratedAt) &&
        reportGeneratedAt >= coverageMtime &&
        reportGeneratedAt >= benchMtime &&
        reportGeneratedAt >= startupRealityMtime,
      Number.isFinite(reportGeneratedAt) &&
        reportGeneratedAt >= coverageMtime &&
        reportGeneratedAt >= benchMtime &&
        reportGeneratedAt >= startupRealityMtime
        ? 'Runtime seams was generated after the current coverage, bench, and startup reality artifacts.'
        : 'Runtime seams predates one of its upstream artifacts or has an invalid generatedAt timestamp.',
    ),
  );

  checks.push(
    buildCheck(
      'runtime-seams-hard-gates',
      compareJson(report.hardGates?.pairs ?? [], benchFacts.hardGates) &&
        report.hardGates?.passed === benchFacts.bench.summary.passed &&
        compareJson(report.hardGates?.failed ?? [], benchFacts.bench.summary.failedHardGates),
      compareJson(report.hardGates?.pairs ?? [], benchFacts.hardGates) &&
        report.hardGates?.passed === benchFacts.bench.summary.passed &&
        compareJson(report.hardGates?.failed ?? [], benchFacts.bench.summary.failedHardGates)
        ? 'Runtime seams hard-gate summary matches the bench artifact.'
        : 'Runtime seams hard-gate summary does not match the bench artifact.',
    ),
  );

  checks.push(
    buildCheck(
      'runtime-seams-hotspots',
      compareJson(projectCoverageHotspots(report.coverage?.topBranchHotspots), coverageFacts.topBranchHotspots),
      compareJson(projectCoverageHotspots(report.coverage?.topBranchHotspots), coverageFacts.topBranchHotspots)
        ? 'Runtime seams hotspot list matches merged coverage.'
        : 'Runtime seams hotspot list does not match merged coverage.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-zero-covered',
      compareJson(report.coverage?.zeroCoveredFiles ?? [], coverageFacts.zeroCoverageFiles),
      compareJson(report.coverage?.zeroCoveredFiles ?? [], coverageFacts.zeroCoverageFiles)
        ? 'Runtime seams zero-covered file list matches merged coverage.'
        : 'Runtime seams zero-covered file list does not match merged coverage.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-missing-runtime-files',
      compareJson(report.coverage?.missingRuntimeFiles ?? [], coverageFacts.missingRuntimeFiles),
      compareJson(report.coverage?.missingRuntimeFiles ?? [], coverageFacts.missingRuntimeFiles)
        ? 'Runtime seams missing-runtime file list matches merged coverage.'
        : 'Runtime seams missing-runtime file list does not match merged coverage.',
    ),
  );
  const expectedPairedTruth = buildExpectedPairedTruth(report, startupRealityFacts.startupReality, benchFacts);
  checks.push(
    buildCheck(
      'runtime-seams-paired-truth',
      compareJson(report.pairedTruth ?? [], expectedPairedTruth),
      compareJson(report.pairedTruth ?? [], expectedPairedTruth)
        ? 'Runtime seams paired-truth metrics match the proxy diagnostics and browser startup reality.'
        : 'Runtime seams paired-truth metrics do not match the proxy diagnostics or browser startup reality.',
    ),
  );
  for (const entry of report.pairedTruth ?? []) {
    checks.push(
      buildCheck(
        `runtime-seams-${entry.id}-status`,
        entry.status !== 'invalid-measurement' && entry.status !== 'gate-fail',
        entry.status !== 'invalid-measurement' && entry.status !== 'gate-fail'
          ? `${entry.label} paired-truth status is ${entry.status}.`
          : `${entry.label} paired-truth status is ${entry.status}.`,
      ),
    );
  }
  checks.push(
    buildCheck(
      'runtime-seams-paired-truth-fidelity',
      (report.pairedTruth ?? []).every(
        (entry) =>
          entry.fidelity !== undefined &&
          Array.isArray(entry.fidelity.modeledStages) &&
          Array.isArray(entry.fidelity.missingStages) &&
          Array.isArray(entry.fidelity.supportRawSamples) &&
          entry.fidelity.eventBoundaryParity !== undefined &&
          entry.fidelity.supportBaselineKind === 'node-parity',
      ),
      (report.pairedTruth ?? []).every(
        (entry) =>
          entry.fidelity !== undefined &&
          Array.isArray(entry.fidelity.modeledStages) &&
          Array.isArray(entry.fidelity.missingStages) &&
          Array.isArray(entry.fidelity.supportRawSamples) &&
          entry.fidelity.eventBoundaryParity !== undefined &&
          entry.fidelity.supportBaselineKind === 'node-parity',
      )
        ? 'Runtime seams paired-truth fidelity metadata is present and uses node-parity support baselines.'
        : 'Runtime seams paired-truth fidelity metadata is missing, incomplete, or still uses a non-parity support baseline.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-classification',
      compareJson(report.metricClassification?.pairedTruth ?? [], (report.pairedTruth ?? []).map((entry) => entry.id)) &&
        compareJson(report.metricClassification?.singleLaneHardGate ?? [], benchFacts.hardGates.map((pair) => pair.label)) &&
        compareJson(
          report.metricClassification?.singleLaneDiagnostic ?? [],
          (report.diagnostics ?? []).map((entry) => entry.label),
        ) &&
        compareJson(
          report.metricClassification?.transportNote ?? [],
          (report.transportDiagnostics ?? []).map((entry) => entry.label),
        ) &&
        compareJson(report.metricClassification?.seamNote ?? [], ['worker-runtime-startup-seam']),
      compareJson(report.metricClassification?.pairedTruth ?? [], (report.pairedTruth ?? []).map((entry) => entry.id)) &&
        compareJson(report.metricClassification?.singleLaneHardGate ?? [], benchFacts.hardGates.map((pair) => pair.label)) &&
        compareJson(
          report.metricClassification?.singleLaneDiagnostic ?? [],
          (report.diagnostics ?? []).map((entry) => entry.label),
        ) &&
        compareJson(
          report.metricClassification?.transportNote ?? [],
          (report.transportDiagnostics ?? []).map((entry) => entry.label),
        ) &&
        compareJson(report.metricClassification?.seamNote ?? [], ['worker-runtime-startup-seam'])
        ? 'Runtime seams metric classification matches the current report structure.'
        : 'Runtime seams metric classification does not match the current report structure.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-worker-startup-split',
      compareJson(
        projectWorkerStartupSplit(report.workerStartupSplit),
        projectWorkerStartupSplit(benchFacts.bench.workerStartupSplit ?? report.workerStartupSplit ?? null),
      ),
      compareJson(
        projectWorkerStartupSplit(report.workerStartupSplit),
        projectWorkerStartupSplit(benchFacts.bench.workerStartupSplit ?? report.workerStartupSplit ?? null),
      )
        ? 'Runtime seams worker-startup split matches the bench artifact.'
        : 'Runtime seams worker-startup split does not match the bench artifact.',
    ),
  );
  const browserWorkerStartupMedianMs =
    startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs &&
    'median' in startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs
      ? Number(startupRealityFacts.startupReality.browser.worker.summary.totalStartupMs.median)
      : null;
  const expectedWorkerSeamToBrowserPct =
    browserWorkerStartupMedianMs === null || browserWorkerStartupMedianMs <= 0 || report.workerStartupSplit?.seam?.absoluteMeanNs === undefined
      ? null
      : Number(((report.workerStartupSplit.seam.absoluteMeanNs / (browserWorkerStartupMedianMs * 1e6)) * 100).toFixed(2));
  checks.push(
    buildCheck(
      'runtime-seams-worker-startup-seam-browser-ratio',
      (report.workerStartupSplit?.seam?.toBrowserStartupMedianPct ?? null) === expectedWorkerSeamToBrowserPct,
      (report.workerStartupSplit?.seam?.toBrowserStartupMedianPct ?? null) === expectedWorkerSeamToBrowserPct
        ? 'Runtime seams worker-startup seam to browser-startup ratio matches startup reality.'
        : 'Runtime seams worker-startup seam to browser-startup ratio does not match startup reality.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-llm-runtime-steady-signals',
      compareJson(
        projectLLMRuntimeSteadySignals(report.llmRuntimeSteadySignals),
        projectLLMRuntimeSteadySignals(benchFacts.bench.llmRuntimeSteadySignals ?? report.llmRuntimeSteadySignals ?? null),
      ),
      compareJson(
        projectLLMRuntimeSteadySignals(report.llmRuntimeSteadySignals),
        projectLLMRuntimeSteadySignals(benchFacts.bench.llmRuntimeSteadySignals ?? report.llmRuntimeSteadySignals ?? null),
      )
        ? 'Runtime seams LLM steady-state signals match the bench artifact.'
        : 'Runtime seams LLM steady-state signals do not match the bench artifact.',
    ),
  );
  const expectedBenchStability = buildExpectedBenchStability(benchFacts.bench);
  checks.push(
    buildCheck(
      'runtime-seams-bench-stability',
      compareJson(report.benchStability ?? [], expectedBenchStability),
      compareJson(report.benchStability ?? [], expectedBenchStability)
        ? 'Runtime seams bench-stability summary matches the bench artifact.'
        : 'Runtime seams bench-stability summary does not match the bench artifact.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-bench-stability-trust',
      (report.benchStability ?? []).every(
        (entry) =>
          (entry.trustGrade === 'stable' || entry.trustGrade === 'watch' || entry.trustGrade === 'noisy') &&
          typeof entry.trustReason === 'string' &&
          entry.trustReason.length > 0 &&
          Array.isArray(entry.replicateCanaryContext),
      ),
      (report.benchStability ?? []).every(
        (entry) =>
          (entry.trustGrade === 'stable' || entry.trustGrade === 'watch' || entry.trustGrade === 'noisy') &&
          typeof entry.trustReason === 'string' &&
          entry.trustReason.length > 0 &&
          Array.isArray(entry.replicateCanaryContext),
      )
        ? 'Runtime seams bench-stability trust metadata is present.'
        : 'Runtime seams bench-stability trust metadata is missing or malformed.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-bench-stability-canary-context',
      (report.benchStability ?? []).every((entry) =>
        Array.isArray(entry.replicateCanaryContext) &&
        entry.replicateCanaryContext.every(
          (context) =>
            typeof context.replicate === 'number' &&
            Array.isArray(context.tasks) &&
            context.tasks.every(
              (task) =>
                typeof task.name === 'string' &&
                'beforeMeanNs' in task &&
                'afterMeanNs' in task &&
                'deltaNs' in task &&
                'deltaPct' in task,
            ),
        ),
      ),
      (report.benchStability ?? []).every((entry) =>
        Array.isArray(entry.replicateCanaryContext) &&
        entry.replicateCanaryContext.every(
          (context) =>
            typeof context.replicate === 'number' &&
            Array.isArray(context.tasks) &&
            context.tasks.every(
              (task) =>
                typeof task.name === 'string' &&
                'beforeMeanNs' in task &&
                'afterMeanNs' in task &&
                'deltaNs' in task &&
                'deltaPct' in task,
            ),
        ),
      )
        ? 'Runtime seams bench-stability includes replicate-level canary context.'
        : 'Runtime seams bench-stability is missing replicate-level canary context.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-startup-breakdown-modeled',
      (report.startupBreakdown ?? []).every((entry) => typeof entry.modeled === 'boolean'),
      (report.startupBreakdown ?? []).every((entry) => typeof entry.modeled === 'boolean')
        ? 'Runtime seams startup breakdown includes modeled-stage accounting.'
        : 'Runtime seams startup breakdown is missing modeled-stage accounting.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-startup-breakdown-accounting',
      (report.startupBreakdown ?? []).every((entry) =>
        entry.modeled
          ? entry.meanNs > 0 || (entry.p95Ns ?? 0) > 0 || (entry.p99Ns ?? 0) > 0
          : entry.meanNs === 0 && (entry.p75Ns ?? 0) === 0 && (entry.p95Ns ?? 0) === 0 && (entry.p99Ns ?? 0) === 0,
      ),
      (report.startupBreakdown ?? []).every((entry) =>
        entry.modeled
          ? entry.meanNs > 0 || (entry.p95Ns ?? 0) > 0 || (entry.p99Ns ?? 0) > 0
          : entry.meanNs === 0 && (entry.p75Ns ?? 0) === 0 && (entry.p95Ns ?? 0) === 0 && (entry.p99Ns ?? 0) === 0,
      )
        ? 'Runtime seams startup breakdown modeled-stage accounting is internally consistent.'
        : 'Runtime seams startup breakdown mixes missing stages with measured timings or modeled stages with zero-only samples.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-startup-breakdown-complete',
      (report.startupBreakdown ?? []).length > 0 && (report.startupBreakdown ?? []).every((entry) => entry.modeled === true),
      (report.startupBreakdown ?? []).length > 0 && (report.startupBreakdown ?? []).every((entry) => entry.modeled === true)
        ? 'Runtime seams startup breakdown models every worker startup stage.'
        : 'Runtime seams startup breakdown still contains missing worker startup stages.',
    ),
  );
  checks.push(
    buildCheck(
      'runtime-seams-worker-startup-audit',
      compareJson(
        report.workerStartupAudit ?? null,
        benchFacts.bench.workerStartupAudit ?? report.workerStartupAudit ?? null,
      ),
      compareJson(
        report.workerStartupAudit ?? null,
        benchFacts.bench.workerStartupAudit ?? report.workerStartupAudit ?? null,
      )
        ? 'Runtime seams worker-startup audit matches the bench artifact.'
        : 'Runtime seams worker-startup audit does not match the bench artifact.',
    ),
  );

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export function verifyFeedbackArtifacts(root = repoRoot): FeedbackVerification {
  const runtimeSeamsPath = resolve(root, 'reports', 'runtime-seams.json');
  if (!existsSync(runtimeSeamsPath)) {
    throw new Error(`Missing runtime seams artifact at ${normalizePath(runtimeSeamsPath)}.`);
  }

  const runtimeSeams = readJson<RuntimeSeamsReportArtifact>(runtimeSeamsPath);
  const runtimeSeamsVerification = verifyRuntimeSeamsReport(runtimeSeams, root);
  const auditChecks: RuntimeSeamsIntegrityCheck[] = [];
  const satelliteScanChecks: RuntimeSeamsIntegrityCheck[] = [];

  const auditPath = resolve(root, 'reports', 'codebase-audit.json');
  if (existsSync(auditPath)) {
    const audit = readJson<CodebaseAuditArtifactEnvelope>(auditPath);
    const auditGeneratedAt = Date.parse(audit.generatedAt ?? '');
    const runtimeSeamsGeneratedAt = Date.parse(runtimeSeams.generatedAt);
    const auditIsCurrent =
      audit.gauntletRunId === runtimeSeams.gauntletRunId &&
      (!Number.isFinite(runtimeSeamsGeneratedAt) || !Number.isFinite(auditGeneratedAt) || auditGeneratedAt >= runtimeSeamsGeneratedAt);
    if (auditIsCurrent) {
      const currentContext = buildCurrentArtifactContext(root);
      const runtimeSeamsStatus = getCodebaseAuditRuntimeSeamsStatus(audit);
      const auditMatches =
        runtimeSeamsVerification.passed ? runtimeSeamsStatus === 'present' : runtimeSeamsStatus === 'failed';
      auditChecks.push(
        buildCheck(
          'audit-schema-version',
          hasCurrentCodebaseAuditSchema(audit),
          hasCurrentCodebaseAuditSchema(audit)
            ? `Audit schema version ${CODEBASE_AUDIT_SCHEMA_VERSION} is current.`
            : 'Audit schema version is missing or unsupported.',
        ),
      );
      auditChecks.push(
        buildCheck(
          'audit-counts',
          hasCodebaseAuditCounts(audit),
          hasCodebaseAuditCounts(audit)
            ? 'Audit counts block is present.'
            : 'Audit counts block is missing or malformed.',
        ),
      );
      auditChecks.push(
        buildCheck(
          'audit-source-fingerprint',
          audit.sourceFingerprint === currentContext.sourceFingerprint,
          audit.sourceFingerprint === currentContext.sourceFingerprint
            ? 'Audit source fingerprint matches the current source tree.'
            : 'Audit source fingerprint does not match the current source tree.',
        ),
      );
      auditChecks.push(
        buildCheck(
          'audit-environment-fingerprint',
          audit.environmentFingerprint === currentContext.environmentFingerprint,
          audit.environmentFingerprint === currentContext.environmentFingerprint
            ? 'Audit environment fingerprint matches the current environment profile.'
            : 'Audit environment fingerprint does not match the current environment profile.',
        ),
      );
      auditChecks.push(
        buildCheck(
          'audit-expected-counts',
          compareJson(audit.expectedCounts ?? null, currentContext.expectedCounts),
          compareJson(audit.expectedCounts ?? null, currentContext.expectedCounts)
            ? 'Audit expected suite counts match the current repo layout.'
            : 'Audit expected suite counts do not match the current repo layout.',
        ),
      );
      auditChecks.push(
        buildCheck(
          'audit-run-coherence',
          audit.gauntletRunId === runtimeSeams.gauntletRunId,
          audit.gauntletRunId === runtimeSeams.gauntletRunId
            ? 'Audit and runtime seams share the same gauntlet run id.'
            : 'Audit and runtime seams do not share the same gauntlet run id.',
        ),
      );
      auditChecks.push(
        buildCheck(
          'audit-runtime-seams-status',
          hasCodebaseAuditRuntimeSeamsStatus(audit) && auditMatches,
          hasCodebaseAuditRuntimeSeamsStatus(audit) && auditMatches
            ? 'Audit runtime-seams status is consistent with runtime-seams integrity.'
            : hasCodebaseAuditRuntimeSeamsStatus(audit)
              ? 'Audit runtime-seams status says present when runtime-seams integrity is failed, or vice versa.'
              : 'Audit runtime-seams support status is missing or malformed.',
        ),
      );
    }
  }

  const satelliteScanPath = resolve(root, 'reports', 'satellite-scan.json');
  if (!existsSync(satelliteScanPath)) {
    satelliteScanChecks.push(
      buildCheck(
        'satellite-scan-present',
        false,
        'Satellite scan artifact is missing. Run pnpm run report:satellite-scan after audit before feedback:verify.',
      ),
    );
  } else {
    const satelliteScan = readJson<SatelliteScanReport>(satelliteScanPath);
    const verification = verifySatelliteScanReport(satelliteScan, root);
    satelliteScanChecks.push(...verification.checks);
  }

  const checks = [...runtimeSeamsVerification.checks, ...auditChecks, ...satelliteScanChecks];
  return {
    passed: checks.every((check) => check.passed),
    runtimeSeams: runtimeSeamsVerification,
    auditChecks,
    satelliteScanChecks,
    checks,
  };
}
