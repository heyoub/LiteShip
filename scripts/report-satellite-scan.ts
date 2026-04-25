import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../vitest.shared.js';
import { buildCurrentArtifactContext, ensureArtifactContext } from './artifact-context.js';
import {
  CODEBASE_AUDIT_SCHEMA_VERSION,
  getCodebaseAuditRuntimeSeamsStatus,
  hasCodebaseAuditCounts,
  hasCurrentCodebaseAuditSchema,
  type CodebaseAuditArtifactEnvelope,
} from './audit/artifact-contract.js';
import {
  fingerprintFile,
  verifyRuntimeSeamsReport,
  type RuntimeSeamsReportArtifact,
  type StartupRealityArtifact,
} from './artifact-integrity.js';
import { isDirectExecution, writeTextFile } from './audit/shared.js';
import { fidelityMissesTarget, type PairedTruthEntry } from './paired-truth.js';

interface StrikeBoardEntry {
  readonly id: string;
  readonly title: string;
  readonly priority: 'critical' | 'high' | 'medium';
  readonly score: number;
  readonly rationale: string;
  readonly evidence: readonly string[];
}

interface SatelliteScanIntegrityCheck {
  readonly code: string;
  readonly passed: boolean;
  readonly severity: 'error';
  readonly summary: string;
}

interface SatelliteScanVerification {
  readonly passed: boolean;
  readonly checks: readonly SatelliteScanIntegrityCheck[];
}

export interface SatelliteScanReport {
  readonly schemaVersion: 6;
  readonly generatedAt: string;
  readonly gauntletRunId: string;
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly expectedCounts: Record<string, number>;
  readonly sourceArtifacts: {
    readonly runtimeSeams: {
      readonly path: string;
      readonly fingerprint: string;
      readonly generatedAt: string;
    };
    readonly audit: {
      readonly path: string;
      readonly fingerprint: string;
      readonly generatedAt: string;
    };
    readonly startupReality: {
      readonly path: string;
      readonly fingerprint: string;
      readonly generatedAt: string;
    };
  };
  readonly truthModel: 'paired-truth';
  readonly summary: {
    readonly runtimeWarnings: readonly string[];
    readonly branchHotspots: readonly string[];
    readonly blindSpots: readonly string[];
  };
  readonly pairedTruth: readonly PairedTruthEntry[];
  readonly strikeBoard: readonly StrikeBoardEntry[];
  readonly integrity: {
    readonly passed: boolean;
    readonly checks: readonly SatelliteScanIntegrityCheck[];
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function compareJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildCheck(code: string, passed: boolean, summary: string): SatelliteScanIntegrityCheck {
  return { code, passed, severity: 'error', summary };
}

function buildRuntimeWarnings(runtimeSeams: RuntimeSeamsReportArtifact): readonly string[] {
  return (runtimeSeams.pairedTruth ?? [])
    .filter((entry) => entry.status === 'gate-fail')
    .map(
      (entry) =>
        `${entry.id}: primary ${entry.primaryLane.label} p99 ${entry.primaryLane.summary?.p99?.toFixed(4) ?? 'n/a'} / max ${entry.primaryLane.summary?.max?.toFixed(4) ?? 'n/a'}`,
    );
}

function buildBranchHotspots(runtimeSeams: RuntimeSeamsReportArtifact): readonly string[] {
  return (runtimeSeams.coverage?.topBranchHotspots ?? [])
    .slice(0, 5)
    .map((entry) => `${entry.file}:${entry.branchPct.toFixed(2)}%`);
}

function buildBlindSpots(
  startupReality: StartupRealityArtifact,
  audit: CodebaseAuditArtifactEnvelope,
  runtimeSeams: RuntimeSeamsReportArtifact,
): readonly string[] {
  const paired = runtimeSeams.pairedTruth ?? [];
  const driftEntries = paired
    .filter((entry) => entry.status === 'seam-drift')
    .map((entry) => `${entry.id} support seam drift ${entry.divergence.pct?.toFixed(2) ?? 'n/a'}% (${entry.divergence.class})`);
  const invalidEntries = paired
    .filter((entry) => entry.status === 'invalid-measurement')
    .map((entry) => `${entry.id} invalid measurement`);

  return [
    ...driftEntries,
    ...invalidEntries,
    ...paired
      .filter((entry) => fidelityMissesTarget(entry))
      .map((entry) => `${entry.id} misses fidelity target ${entry.fidelity.driftTargetPct}%`),
    startupReality.browser.worker.exceededFrameBudgetCount > 0
      ? `worker browser frame-budget exceedances ${startupReality.browser.worker.exceededFrameBudgetCount}/${startupReality.browser.worker.iterations}`
      : `worker browser startup tail-watch p99 ${startupReality.browser.worker.summary.totalStartupMs.p99.toFixed(4)}ms stays within ${startupReality.browser.worker.frameBudgetMs.toFixed(0)}ms frame budget`,
    `worker browser top outlier ${startupReality.browser.worker.topOutliers?.[0]?.valueMs?.toFixed?.(4) ?? 'n/a'}ms`,
    `llm simple top outlier ${startupReality.browser.llm.simple.topOutliers?.[0]?.valueMs?.toFixed?.(4) ?? 'n/a'}ms`,
    `llm promoted top outlier ${startupReality.browser.llm.promoted?.topOutliers?.[0]?.valueMs?.toFixed?.(4) ?? 'n/a'}ms`,
    ...(runtimeSeams.workerStartupAudit?.dominantStage
      ? [
          `worker startup audit ${runtimeSeams.workerStartupAudit.posture}: ${runtimeSeams.workerStartupAudit.dominantStage} -- ${runtimeSeams.workerStartupAudit.conclusion}`,
        ]
      : []),
    ...(runtimeSeams.workerStartupSplit
      ? [
          `worker visible first paint ${runtimeSeams.workerStartupSplit.visibleFirstPaintMeanNs?.toFixed?.(2) ?? 'n/a'}ns`,
          `worker takeover seam ${runtimeSeams.workerStartupSplit.workerTakeoverMeanNs?.toFixed?.(2) ?? 'n/a'}ns`,
          `worker startup shared parity ${runtimeSeams.workerStartupSplit.shared.overheadPct?.toFixed(2) ?? 'n/a'}% (${runtimeSeams.workerStartupSplit.shared.conclusion})`,
          `worker startup seam ${runtimeSeams.workerStartupSplit.seam.absoluteMeanNs.toFixed(2)}ns (${runtimeSeams.workerStartupSplit.seam.derivedPct?.toFixed(2) ?? 'n/a'}%) dominated by ${runtimeSeams.workerStartupSplit.seam.dominantStage ?? 'none'}`,
        ]
      : []),
    ...(runtimeSeams.benchStability ?? [])
      .filter((entry) => entry.trustGrade !== 'stable')
      .map(
        (entry) =>
          `${entry.label} hard gate trust is ${entry.trustGrade}: ${entry.trustReason}`,
      ),
    audit.counts!.warning! > 0 ? `${audit.counts!.warning} advisory warning(s) remain active` : 'audit warnings cleared',
  ];
}

function workerBroadResidualIsMostlySeam(runtimeSeams: RuntimeSeamsReportArtifact): boolean {
  const shared = runtimeSeams.workerStartupSplit?.shared;
  const seam = runtimeSeams.workerStartupSplit?.seam;
  const audit = runtimeSeams.workerStartupAudit;
  if (!shared || !seam || !audit) {
    return false;
  }

  const sharedWithinTarget =
    shared.overheadPct !== null && shared.overheadPct <= shared.thresholdPct;
  return sharedWithinTarget && audit.posture === 'accept-honest-residual' && seam.absoluteMeanNs > 0;
}

function buildStrikeBoard(runtimeSeams: RuntimeSeamsReportArtifact): readonly StrikeBoardEntry[] {
  const entries = (runtimeSeams.pairedTruth ?? []).map((entry) => {
    const workerMostlySeam = entry.id === 'worker-startup' && workerBroadResidualIsMostlySeam(runtimeSeams);
    const statusWeight =
      entry.status === 'gate-fail'
        ? 300
        : entry.status === 'invalid-measurement'
          ? 250
          : entry.status === 'seam-drift'
            ? workerMostlySeam
              ? 70
              : 125
            : 25;
    const divergenceWeight = Math.abs(entry.divergence.pct ?? 0);
    const outlierWeight = entry.outliers?.[0]?.valueMs ?? 0;
    const primaryP99 = entry.primaryLane.summary?.p99 ?? 0;
    const fidelityDebtWeight = fidelityMissesTarget(entry) ? Math.abs(entry.divergence.pct ?? 0) - entry.fidelity.driftTargetPct : 0;
    const score = Number(
      (statusWeight + (workerMostlySeam ? divergenceWeight * 0.35 : divergenceWeight) + outlierWeight + primaryP99 + fidelityDebtWeight).toFixed(2),
    );

    return {
      id: entry.id,
      title: `${entry.label} ${entry.status === 'gate-fail' ? 'budget pressure' : entry.status === 'seam-drift' ? 'support seam drift' : entry.status}`,
      priority:
        entry.status === 'gate-fail' || entry.status === 'invalid-measurement'
          ? 'critical'
          : entry.status === 'seam-drift'
            ? workerMostlySeam
              ? 'medium'
              : 'high'
            : 'medium',
      score,
      rationale:
        entry.status === 'gate-fail'
          ? 'Primary browser-budget truth failed, so this metric is now a real release-facing warning.'
          : entry.status === 'seam-drift'
            ? entry.id === 'worker-startup' && runtimeSeams.workerStartupAudit
              ? workerMostlySeam
                ? `Primary browser truth passes, the browser tail still stays within one frame budget, shared worker startup parity is within target, and the remaining residual is dominated by the accepted off-thread seam. ${runtimeSeams.workerStartupSplit?.seam.conclusion ?? runtimeSeams.workerStartupAudit.conclusion}`
                : `Primary browser truth passes, but the worker support seam still diverges enough to require attribution. ${runtimeSeams.workerStartupAudit.conclusion}`
              : 'Primary browser truth passes, but the support seam still diverges enough to indicate measurement or architectural drift.'
            : 'This paired metric currently passes, but it remains on the strike board with supporting evidence.',
      evidence: [
        `primary lane ${entry.primaryLane.label}`,
        `primary p99 ${entry.primaryLane.summary?.p99?.toFixed(4) ?? 'n/a'} ${entry.primaryLane.unit}`,
        `support lane ${entry.supportLane.label}`,
        ...(entry.id === 'worker-startup' ? ['support parity uses canonical startup packet'] : []),
        ...(entry.id === 'worker-startup' && runtimeSeams.workerStartupAudit
          ? [
              `startup audit posture ${runtimeSeams.workerStartupAudit.posture}`,
              `startup audit dominant stage ${runtimeSeams.workerStartupAudit.dominantStage ?? 'none'}`,
            ]
          : []),
        ...(entry.id === 'worker-startup' && runtimeSeams.workerStartupSplit
          ? [
              `shared startup overhead ${runtimeSeams.workerStartupSplit.shared.overheadPct?.toFixed(2) ?? 'n/a'}%`,
              `shared startup threshold ${runtimeSeams.workerStartupSplit.shared.thresholdPct}%`,
              `worker-only seam ${runtimeSeams.workerStartupSplit.seam.absoluteMeanNs.toFixed(2)}ns / ${runtimeSeams.workerStartupSplit.seam.derivedPct?.toFixed(2) ?? 'n/a'}%`,
              `worker-only seam dominant stage ${runtimeSeams.workerStartupSplit.seam.dominantStage ?? 'none'}`,
              `browser tail watch p99 ${entry.primaryLane.summary?.p99?.toFixed(4) ?? 'n/a'}ms within ${entry.primaryLane.frameBudgetMs ?? 16}ms frame budget`,
            ]
          : []),
        ...(entry.id.startsWith('llm-') ? ['support parity uses shared session host adapter'] : []),
        `divergence ${entry.divergence.pct?.toFixed(2) ?? 'n/a'}% (${entry.divergence.class})`,
        `support baseline ${entry.fidelity.supportBaselineKind}`,
        `fidelity target ${entry.fidelity.driftTargetPct}%`,
        `event boundary ${entry.fidelity.eventBoundaryParity}`,
        `modeled stages ${entry.fidelity.modeledStages.join(', ') || 'none'}`,
        `missing stages ${entry.fidelity.missingStages.join(', ') || 'none'}`,
        ...((runtimeSeams.benchStability ?? [])
          .filter((candidate) => candidate.label === entry.id.replace('-startup', '').replace('llm-promoted', 'llm'))
          .map(
            (candidate) =>
              `hard-gate trust ${candidate.trustGrade}: ${candidate.trustReason}; ${candidate.exceedances}/${candidate.validReplicates} over threshold, spread ${candidate.spreadPct?.toFixed(2) ?? 'n/a'}%, canary ${candidate.canarySpreadMeanNs ?? 'n/a'}ns / ${candidate.canarySpreadPct?.toFixed(2) ?? 'n/a'}%`,
          )),
        ...(entry.stages?.map((stage) => `stage ${stage}`) ?? []),
        ...(entry.outliers?.slice(0, 2).map((outlier) => `outlier #${outlier.iteration} ${outlier.valueMs.toFixed(4)}ms${outlier.note ? ` (${outlier.note})` : ''}`) ?? []),
      ],
    } satisfies StrikeBoardEntry;
  });

  return entries.sort((left, right) => right.score - left.score);
}

export function verifySatelliteScanReport(
  report: SatelliteScanReport,
  root = repoRoot,
): SatelliteScanVerification {
  const checks: SatelliteScanIntegrityCheck[] = [];
  const currentContext = buildCurrentArtifactContext(root);
  const runtimeSeamsPath = resolve(root, 'reports', 'runtime-seams.json');
  const auditPath = resolve(root, 'reports', 'codebase-audit.json');
  const startupRealityPath = resolve(root, 'benchmarks', 'startup-reality.json');

  if (!existsSync(runtimeSeamsPath) || !existsSync(auditPath) || !existsSync(startupRealityPath)) {
    return {
      passed: false,
      checks: [
        buildCheck(
          'satellite-scan-inputs',
          false,
          'Satellite scan verification requires runtime seams, audit, and startup reality artifacts to exist.',
        ),
      ],
    };
  }

  const runtimeSeams = readJson<RuntimeSeamsReportArtifact>(runtimeSeamsPath);
  const runtimeSeamsVerification = verifyRuntimeSeamsReport(runtimeSeams, root);
  const audit = readJson<CodebaseAuditArtifactEnvelope>(auditPath);
  const startupReality = readJson<StartupRealityArtifact>(startupRealityPath);
  const runtimeSeamsArtifact = fingerprintFile(runtimeSeamsPath);
  const auditArtifact = fingerprintFile(auditPath);
  const startupRealityArtifact = fingerprintFile(startupRealityPath);
  const auditCountsValid = hasCodebaseAuditCounts(audit);
  const auditRuntimeSeamsStatus = getCodebaseAuditRuntimeSeamsStatus(audit);
  const expectedRuntimeWarnings = buildRuntimeWarnings(runtimeSeams);
  const expectedBranchHotspots = buildBranchHotspots(runtimeSeams);
  const expectedBlindSpots = auditCountsValid ? buildBlindSpots(startupReality, audit, runtimeSeams) : [];
  const expectedStrikeBoard = buildStrikeBoard(runtimeSeams);
  const reportGeneratedAt = Date.parse(report.generatedAt);

  checks.push(buildCheck('satellite-scan-schema-version', report.schemaVersion === 6, report.schemaVersion === 6 ? 'Satellite scan schema version is current.' : 'Satellite scan schema version is missing or unsupported.'));
  checks.push(buildCheck('satellite-scan-runtime-seams-integrity', runtimeSeamsVerification.passed, runtimeSeamsVerification.passed ? 'Runtime seams integrity passed before satellite scan verification.' : 'Runtime seams integrity failed underneath the satellite scan.'));
  checks.push(
    buildCheck(
      'satellite-scan-audit-schema-version',
      hasCurrentCodebaseAuditSchema(audit),
      hasCurrentCodebaseAuditSchema(audit)
        ? `Audit schema version ${CODEBASE_AUDIT_SCHEMA_VERSION} is current beneath the satellite scan.`
        : 'Audit schema version is missing or unsupported beneath the satellite scan.',
    ),
  );
  checks.push(
    buildCheck(
      'satellite-scan-audit-counts',
      auditCountsValid,
      auditCountsValid
        ? 'Audit counts block is present beneath the satellite scan.'
        : 'Audit counts block is missing or malformed beneath the satellite scan.',
    ),
  );
  checks.push(
    buildCheck(
      'satellite-scan-audit-runtime-seams-status',
      auditRuntimeSeamsStatus !== null,
      auditRuntimeSeamsStatus !== null
        ? 'Audit runtime-seams support status is present beneath the satellite scan.'
        : 'Audit runtime-seams support status is missing or malformed beneath the satellite scan.',
    ),
  );
  checks.push(buildCheck('satellite-scan-startup-reality-schema-version', startupReality.schemaVersion === 4, startupReality.schemaVersion === 4 ? 'Startup reality schema version is current beneath the satellite scan.' : 'Startup reality schema version is missing or unsupported beneath the satellite scan.'));
  checks.push(buildCheck('satellite-scan-source-fingerprint', report.sourceFingerprint === currentContext.sourceFingerprint, report.sourceFingerprint === currentContext.sourceFingerprint ? 'Satellite scan source fingerprint matches the current source tree.' : 'Satellite scan source fingerprint does not match the current source tree.'));
  checks.push(buildCheck('satellite-scan-environment-fingerprint', report.environmentFingerprint === currentContext.environmentFingerprint, report.environmentFingerprint === currentContext.environmentFingerprint ? 'Satellite scan environment fingerprint matches the current environment profile.' : 'Satellite scan environment fingerprint does not match the current environment profile.'));
  checks.push(buildCheck('satellite-scan-expected-counts', compareJson(report.expectedCounts, currentContext.expectedCounts), compareJson(report.expectedCounts, currentContext.expectedCounts) ? 'Satellite scan expected suite counts match the current repo layout.' : 'Satellite scan expected suite counts do not match the current repo layout.'));
  checks.push(buildCheck('satellite-scan-run-coherence', report.gauntletRunId === runtimeSeams.gauntletRunId && report.gauntletRunId === audit.gauntletRunId && report.gauntletRunId === startupReality.gauntletRunId, report.gauntletRunId === runtimeSeams.gauntletRunId && report.gauntletRunId === audit.gauntletRunId && report.gauntletRunId === startupReality.gauntletRunId ? 'Satellite scan, runtime seams, audit, and startup reality share the same gauntlet run id.' : 'Satellite scan run id does not match one or more upstream artifacts.'));
  checks.push(buildCheck('satellite-scan-ordering', Number.isFinite(reportGeneratedAt) && reportGeneratedAt >= Date.parse(runtimeSeamsArtifact.mtime) && reportGeneratedAt >= Date.parse(auditArtifact.mtime) && reportGeneratedAt >= Date.parse(startupRealityArtifact.mtime), Number.isFinite(reportGeneratedAt) && reportGeneratedAt >= Date.parse(runtimeSeamsArtifact.mtime) && reportGeneratedAt >= Date.parse(auditArtifact.mtime) && reportGeneratedAt >= Date.parse(startupRealityArtifact.mtime) ? 'Satellite scan was generated after the current runtime seams, audit, and startup reality artifacts.' : 'Satellite scan predates one of its upstream artifacts or has an invalid generatedAt timestamp.'));
  checks.push(buildCheck('satellite-scan-runtime-seams-source', report.sourceArtifacts.runtimeSeams.fingerprint === runtimeSeamsArtifact.fingerprint, report.sourceArtifacts.runtimeSeams.fingerprint === runtimeSeamsArtifact.fingerprint ? 'Satellite scan runtime seams fingerprint matches the current runtime seams report.' : 'Satellite scan runtime seams fingerprint does not match the current runtime seams report.'));
  checks.push(buildCheck('satellite-scan-audit-source', report.sourceArtifacts.audit.fingerprint === auditArtifact.fingerprint, report.sourceArtifacts.audit.fingerprint === auditArtifact.fingerprint ? 'Satellite scan audit fingerprint matches the current audit report.' : 'Satellite scan audit fingerprint does not match the current audit report.'));
  checks.push(buildCheck('satellite-scan-startup-reality-source', report.sourceArtifacts.startupReality.fingerprint === startupRealityArtifact.fingerprint, report.sourceArtifacts.startupReality.fingerprint === startupRealityArtifact.fingerprint ? 'Satellite scan startup reality fingerprint matches the current startup reality artifact.' : 'Satellite scan startup reality fingerprint does not match the current startup reality artifact.'));
  checks.push(buildCheck('satellite-scan-runtime-warnings', compareJson(report.summary.runtimeWarnings, expectedRuntimeWarnings), compareJson(report.summary.runtimeWarnings, expectedRuntimeWarnings) ? 'Satellite scan runtime warning summary matches paired-truth gate failures.' : 'Satellite scan runtime warning summary does not match paired-truth gate failures.'));
  checks.push(buildCheck('satellite-scan-branch-hotspots', compareJson(report.summary.branchHotspots, expectedBranchHotspots), compareJson(report.summary.branchHotspots, expectedBranchHotspots) ? 'Satellite scan branch hotspots match runtime seams.' : 'Satellite scan branch hotspots do not match runtime seams.'));
  checks.push(buildCheck('satellite-scan-blind-spots', auditCountsValid && compareJson(report.summary.blindSpots, expectedBlindSpots), auditCountsValid && compareJson(report.summary.blindSpots, expectedBlindSpots) ? 'Satellite scan blind spots match the current audit, startup reality, and runtime seams inputs.' : auditCountsValid ? 'Satellite scan blind spots do not match the current audit, startup reality, and runtime seams inputs.' : 'Satellite scan blind spots cannot be verified because the audit counts block is missing or malformed.'));
  checks.push(buildCheck('satellite-scan-paired-truth', compareJson(report.pairedTruth, runtimeSeams.pairedTruth ?? []), compareJson(report.pairedTruth, runtimeSeams.pairedTruth ?? []) ? 'Satellite scan paired-truth metrics match runtime seams.' : 'Satellite scan paired-truth metrics do not match runtime seams.'));
  checks.push(buildCheck('satellite-scan-fidelity', (report.pairedTruth ?? []).every((entry) => entry.fidelity !== undefined), (report.pairedTruth ?? []).every((entry) => entry.fidelity !== undefined) ? 'Satellite scan preserves paired-truth fidelity metadata.' : 'Satellite scan is missing paired-truth fidelity metadata.'));
  checks.push(buildCheck('satellite-scan-strike-board', compareJson(report.strikeBoard, expectedStrikeBoard), compareJson(report.strikeBoard, expectedStrikeBoard) ? 'Satellite scan strike board matches the current runtime seams inputs.' : 'Satellite scan strike board does not match the current runtime seams inputs.'));

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export function buildSatelliteScanReport(root = repoRoot, generatedAt = new Date().toISOString()): SatelliteScanReport {
  const context = ensureArtifactContext(root);
  const runtimeSeamsPath = resolve(root, 'reports', 'runtime-seams.json');
  const auditPath = resolve(root, 'reports', 'codebase-audit.json');
  const startupRealityPath = resolve(root, 'benchmarks', 'startup-reality.json');

  if (!existsSync(runtimeSeamsPath)) {
    throw new Error('Missing reports/runtime-seams.json. Run pnpm run report:runtime-seams first.');
  }
  if (!existsSync(auditPath)) {
    throw new Error('Missing reports/codebase-audit.json. Run pnpm run audit first.');
  }
  if (!existsSync(startupRealityPath)) {
    throw new Error('Missing benchmarks/startup-reality.json. Run pnpm run bench:reality first.');
  }

  const runtimeSeams = readJson<RuntimeSeamsReportArtifact>(runtimeSeamsPath);
  const runtimeSeamsIntegrity = verifyRuntimeSeamsReport(runtimeSeams, root);
  if (!runtimeSeamsIntegrity.passed) {
    throw new Error('Runtime seams integrity failed. Refresh coverage, bench, startup-reality, and runtime-seams before building the satellite scan.');
  }

  const audit = readJson<CodebaseAuditArtifactEnvelope>(auditPath);
  const startupReality = readJson<StartupRealityArtifact>(startupRealityPath);
  if (!hasCurrentCodebaseAuditSchema(audit)) {
    throw new Error(
      `Audit schema version is missing or unsupported beneath the satellite scan. Expected ${CODEBASE_AUDIT_SCHEMA_VERSION}.`,
    );
  }
  if (!hasCodebaseAuditCounts(audit)) {
    throw new Error('Audit counts block is missing or malformed beneath the satellite scan.');
  }
  if (getCodebaseAuditRuntimeSeamsStatus(audit) === null) {
    throw new Error('Audit runtime-seams support status is missing or malformed beneath the satellite scan.');
  }
  const draftReport: SatelliteScanReport = {
    schemaVersion: 6,
    generatedAt,
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    expectedCounts: context.expectedCounts,
    sourceArtifacts: {
      runtimeSeams: {
        path: runtimeSeamsPath,
        fingerprint: fingerprintFile(runtimeSeamsPath).fingerprint,
        generatedAt: runtimeSeams.generatedAt,
      },
      audit: {
        path: auditPath,
        fingerprint: fingerprintFile(auditPath).fingerprint,
        generatedAt: audit.generatedAt!,
      },
      startupReality: {
        path: startupRealityPath,
        fingerprint: fingerprintFile(startupRealityPath).fingerprint,
        generatedAt: startupReality.generatedAt,
      },
    },
    truthModel: 'paired-truth',
    summary: {
      runtimeWarnings: buildRuntimeWarnings(runtimeSeams),
      branchHotspots: buildBranchHotspots(runtimeSeams),
      blindSpots: buildBlindSpots(startupReality, audit, runtimeSeams),
    },
    pairedTruth: runtimeSeams.pairedTruth ?? [],
    strikeBoard: buildStrikeBoard(runtimeSeams),
    integrity: {
      passed: true,
      checks: [],
    },
  };

  const integrity = verifySatelliteScanReport(draftReport, root);
  if (!integrity.passed) {
    const summaries = integrity.checks.filter((check) => !check.passed).map((check) => `- ${check.summary}`);
    throw new Error(`Satellite scan integrity failed:\n${summaries.join('\n')}`);
  }

  return {
    ...draftReport,
    integrity,
  };
}

export function renderSatelliteScanMarkdown(report: SatelliteScanReport): string {
  return [
    '# Satellite Scan',
    '',
    `Generated: ${report.generatedAt}`,
    `Run: ${report.gauntletRunId}`,
    `Truth model: ${report.truthModel}`,
    '',
    'Browser-budget truth is the release signal here. Support-lane drift and trust grades are steering context, not release failure on their own.',
    '',
    '## Feedback Integrity',
    '',
    `- Passed: ${report.integrity.passed}`,
    ...report.integrity.checks.map((check) => `- ${check.passed ? 'ok' : 'fail'} ${check.code} -- ${check.summary}`),
    '',
    '## Paired Truth',
    '',
    '| Metric | Status | Primary lane | Support lane | Divergence | Fidelity | Top outlier |',
    '| --- | --- | --- | --- | --- | --- | ---: |',
    ...report.pairedTruth.map(
      (entry) =>
        `| ${entry.label} | ${entry.status} | ${entry.primaryLane.label} | ${entry.supportLane.label} | ${entry.divergence.pct === null ? 'n/a' : `${entry.divergence.pct.toFixed(2)}% (${entry.divergence.class})`} | ${entry.fidelity.supportBaselineKind} / target ${entry.fidelity.driftTargetPct}% / ${entry.fidelity.eventBoundaryParity} | ${entry.outliers?.[0]?.valueMs?.toFixed(4) ?? 'n/a'}ms |`,
    ),
    '',
    '## Runtime Warnings',
    '',
    ...(report.summary.runtimeWarnings.length === 0 ? ['- None. Browser-budget truth currently passes.'] : report.summary.runtimeWarnings.map((entry) => `- ${entry}`)),
    '',
    '## Branch Hotspots',
    '',
    ...report.summary.branchHotspots.map((entry) => `- ${entry}`),
    '',
    '## Blind Spots',
    '',
    ...report.summary.blindSpots.map((entry) => `- ${entry}`),
    '',
    '## Worker Startup Split',
    '',
    `- Shared startup overhead: ${report.pairedTruth.find((entry) => entry.id === 'worker-startup') ? 'see runtime seams' : 'n/a'}`,
    '- This scan treats the broad worker startup metric as continuity telemetry and relies on runtime seams for the shared-startup vs worker-only seam decomposition.',
    '',
    '## Strike Board',
    '',
    '| Priority | Title | Score |',
    '| --- | --- | ---: |',
    ...report.strikeBoard.map((entry) => `| ${entry.priority} | ${entry.title} | ${entry.score.toFixed(2)} |`),
    '',
    ...report.strikeBoard.flatMap((entry) => [
      `### ${entry.title}`,
      '',
      `- Priority: ${entry.priority}`,
      `- Score: ${entry.score.toFixed(2)}`,
      `- Rationale: ${entry.rationale}`,
      ...entry.evidence.map((evidence) => `- Evidence: ${evidence}`),
      '',
    ]),
  ].join('\n');
}

function main(): void {
  const report = buildSatelliteScanReport(repoRoot);
  const reportsDir = resolve(repoRoot, 'reports');
  const jsonPath = resolve(reportsDir, 'satellite-scan.json');
  const mdPath = resolve(reportsDir, 'satellite-scan.md');
  writeTextFile(jsonPath, JSON.stringify(report, null, 2));
  writeTextFile(mdPath, renderSatelliteScanMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

if (isDirectExecution(import.meta.url)) {
  main();
}
