import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ensureArtifactContext } from '../../../scripts/artifact-context.js';
import {
  buildBenchFacts,
  buildCoverageFacts,
  buildCoverageMetaArtifact,
  verifyFeedbackArtifacts,
  verifyRuntimeSeamsReport,
  type BenchArtifact,
  type RuntimeSeamsReportArtifact,
} from '../../../scripts/artifact-integrity.js';
import { buildCodebaseAuditReport } from '../../../scripts/audit/report.js';
import { buildDirectiveBenchConfig } from '../../../scripts/bench/directive-suite.js';
import { buildStartupRealityArtifact } from '../../../scripts/bench-reality.js';
import { buildRuntimeSeamsReport, renderRuntimeSeamsMarkdown } from '../../../scripts/report-runtime-seams.js';
import { buildSatelliteScanReport, renderSatelliteScanMarkdown } from '../../../scripts/report-satellite-scan.js';

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function createRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(os.tmpdir(), 'czap-feedback-'));
  tempRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  return root;
}

function baseRepoFiles(): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: 'czap-feedback-fixture',
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.32.1',
        devDependencies: {
          effect: '4.0.0-beta.32',
          playwright: '^1.58.2',
          tinybench: '^6.0.0',
          typescript: '^5.9.3',
          vite: '^8.0.0',
          vitest: '^4.1.2',
        },
      },
      null,
      2,
    ),
    'packages/core/package.json': JSON.stringify(
      {
        name: '@czap/core',
        type: 'module',
        exports: {
          '.': { development: './src/index.ts' },
        },
      },
      null,
      2,
    ),
    'packages/core/src/index.ts': 'export { runtimeHelper } from "./runtime-helper.js";\n',
    'packages/core/src/runtime-helper.ts': 'export const runtimeHelper = true;\n',
    'packages/web/package.json': JSON.stringify(
      {
        name: '@czap/web',
        type: 'module',
        exports: {
          '.': { development: './src/index.ts' },
        },
      },
      null,
      2,
    ),
    'packages/web/src/index.ts': 'export const webReady = true;\n',
    'tests/unit/example.test.ts': 'export const testFile = true;\n',
  };
}

function writeCoverageArtifacts(root: string, generatedAt = '2026-03-28T05:30:00.000Z'): void {
  mkdirSync(join(root, 'coverage'), { recursive: true });
  const coverageJson = {
    'packages/core/src/runtime-helper.ts': {
      path: 'packages/core/src/runtime-helper.ts',
      statementMap: {
        0: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 35 },
        },
      },
      fnMap: {},
      branchMap: {},
      s: { 0: 1 },
      f: {},
      b: {},
    },
  };

  writeFileSync(join(root, 'coverage/coverage-final.json'), JSON.stringify(coverageJson, null, 2));
  const facts = buildCoverageFacts(root);
  const context = ensureArtifactContext(root);
  const meta = buildCoverageMetaArtifact(facts, generatedAt, context);
  writeFileSync(join(root, 'coverage/coverage-meta.json'), JSON.stringify(meta, null, 2));
}

function writeBenchArtifact(root: string, generatedAt = '2026-03-28T05:31:00.000Z'): BenchArtifact {
  mkdirSync(join(root, 'benchmarks'), { recursive: true });
  const context = ensureArtifactContext(root);
  const bench: BenchArtifact = {
    schemaVersion: 8,
    generatedAt,
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    expectedCounts: context.expectedCounts,
    benchConfig: buildDirectiveBenchConfig(),
    summary: {
      passed: true,
      failedHardGates: [],
      hardGateCount: 3,
      diagnosticCount: 1,
    },
    canaries: [],
    pairs: [
      {
        label: 'satellite',
        gate: true,
        pass: true,
        runtimeClass: 'hot-path',
        medianOverhead: 0.05,
        threshold: 0.1,
      },
      {
        label: 'worker-runtime-startup',
        gate: false,
        pass: true,
        runtimeClass: 'startup',
        medianOverhead: 20.1,
        threshold: 0.25,
        warning: true,
        watch: true,
      },
      {
        label: 'llm-startup-shared',
        gate: true,
        pass: true,
        runtimeClass: 'startup',
        medianOverhead: 4.63,
        threshold: 0.25,
      },
      {
        label: 'llm-promoted-startup-shared',
        gate: true,
        pass: true,
        runtimeClass: 'startup',
        medianOverhead: 6.1,
        threshold: 0.25,
      },
    ],
    workerStartupSplit: {
      visibleFirstPaintMeanNs: 1200,
      workerTakeoverMeanNs: 4200,
      shared: {
        label: 'worker-runtime-startup-shared',
        supportMeanNs: 5200,
        parityMeanNs: 4700,
        residualMeanNs: 500,
        overheadPct: 10.64,
        thresholdPct: 25,
        conclusion: 'fixture shared parity is healthy.',
      },
      seam: {
        label: 'worker-runtime-startup-seam',
        absoluteMeanNs: 2100,
        derivedPct: 8.2,
        dominantStage: 'state-delivery:message-receipt',
        messageReceiptResidualNs: 1400,
        dispatchSendResidualNs: 300,
        messageReceiptSharePct: 66.67,
        dispatchSendSharePct: 14.29,
        sharedResidualSharePct: 19.04,
        toBrowserStartupMedianPct: null,
        tailRatioP99ToMedian: 1.35,
        conclusion: 'fixture seam is dominated by off-thread handoff pressure.',
        components: [
          {
            stage: 'state-delivery:message-receipt',
            label: 'worker message receipt latency',
            kind: 'worker-only',
            residualMeanNs: 1400,
          },
        ],
      },
    },
    llmRuntimeSteadySignals: {
      label: 'llm-runtime-steady',
      replicateExceedanceRate: 0.2,
      directiveP99ToBaselineP99: 1.18,
      directiveP75ToBaselineP75: 1.09,
      longSessionSlopeNsPerChunk: 140,
      mixedChunkSlopeNsPerChunk: 155,
      conclusion: 'fixture llm steady-state remains bounded.',
    },
    replicates: [
      {
        replicate: 0,
        startupBreakdown: [
          {
            stage: 'claim-or-create',
            label: 'worker claim or create',
            modeled: true,
            meanNs: 6000,
            p75Ns: 6200,
            p95Ns: 6350,
            p99Ns: 6500,
          },
          {
            stage: 'coordinator-reset-or-create',
            label: 'coordinator reset or create',
            modeled: true,
            meanNs: 4200,
            p75Ns: 4300,
            p95Ns: 4400,
            p99Ns: 4500,
          },
          {
            stage: 'listener-bind',
            label: 'worker listener binding',
            modeled: true,
            meanNs: 1800,
            p75Ns: 1900,
            p95Ns: 2000,
            p99Ns: 2100,
          },
          {
            stage: 'quantizer-bootstrap',
            label: 'startup quantizer bootstrap',
            modeled: true,
            meanNs: 2600,
            p75Ns: 2700,
            p95Ns: 2800,
            p99Ns: 2900,
          },
          {
            stage: 'request-compute',
            label: 'compute request dispatch',
            modeled: true,
            meanNs: 3200,
            p75Ns: 3300,
            p95Ns: 3400,
            p99Ns: 3500,
          },
          {
            stage: 'state-delivery',
            label: 'first state delivery',
            modeled: true,
            meanNs: 2800,
            p75Ns: 2900,
            p95Ns: 3000,
            p99Ns: 3100,
          },
          {
            stage: 'dispose',
            label: 'host disposal',
            modeled: true,
            meanNs: 1400,
            p75Ns: 1500,
            p95Ns: 1600,
            p99Ns: 1700,
          },
        ],
        results: [
          {
            name: '[DIAGNOSTIC] worker-runtime-startup -- host bootstrap + first compute',
            opsPerSec: 200000,
            meanNs: 5000,
            p75Ns: 5200,
            p99Ns: 5400,
            latencyTier: 'moderate',
          },
          {
            name: '[GATE] llm-startup-shared -- first token boundary',
            opsPerSec: 250000,
            meanNs: 3000,
            p75Ns: 3200,
            p99Ns: 3400,
            latencyTier: 'moderate',
          },
          {
            name: '[GATE] llm-promoted-startup-shared -- second token boundary',
            opsPerSec: 200000,
            meanNs: 4500,
            p75Ns: 4700,
            p99Ns: 4900,
            latencyTier: 'moderate',
          },
        ],
        pairs: [],
      },
    ],
  };

  writeFileSync(join(root, 'benchmarks/directive-gate.json'), JSON.stringify(bench, null, 2));
  return bench;
}

function writeStartupRealityArtifact(root: string, generatedAt = '2026-03-28T05:32:00.000Z'): void {
  const context = ensureArtifactContext(root);
  const benchFacts = buildBenchFacts(root);
  const artifact = buildStartupRealityArtifact(
    context,
    benchFacts,
    {
      worker: {
        iterations: 30,
        frameBudgetMs: 16,
        exceededFrameBudgetCount: 0,
        summary: {
          totalStartupMs: { min: 0.5, median: 0.6, p75: 0.62, p95: 0.64, p99: 0.65, max: 0.65, mean: 0.6 },
          stages: {
            'claim-or-create': { min: 0.1, median: 0.12, p75: 0.13, p95: 0.14, p99: 0.15, max: 0.15, mean: 0.12 },
            'coordinator-reset-or-create': { min: 0.14, median: 0.16, p75: 0.17, p95: 0.18, p99: 0.19, max: 0.19, mean: 0.16 },
            'listener-bind': { min: 0.02, median: 0.03, p75: 0.03, p95: 0.04, p99: 0.04, max: 0.04, mean: 0.03 },
            'quantizer-bootstrap': { min: 0.03, median: 0.05, p75: 0.05, p95: 0.06, p99: 0.06, max: 0.06, mean: 0.05 },
            'request-compute': { min: 0.04, median: 0.06, p75: 0.07, p95: 0.08, p99: 0.08, max: 0.08, mean: 0.06 },
            'state-delivery': { min: 0.1, median: 0.12, p75: 0.13, p95: 0.14, p99: 0.15, max: 0.15, mean: 0.12 },
            'dispose': { min: 0.03, median: 0.04, p75: 0.05, p95: 0.05, p99: 0.06, max: 0.06, mean: 0.04 },
          },
        },
      },
      llm: {
        iterations: 30,
        simple: {
          initToFirstTokenMs: { min: 0.2, median: 0.3, p75: 0.32, p95: 0.34, p99: 0.35, max: 0.35, mean: 0.3 },
          openToFirstTokenMs: { min: 0.1, median: 0.15, p75: 0.16, p95: 0.17, p99: 0.18, max: 0.18, mean: 0.15 },
          chunkToFirstTokenMs: { min: 0.05, median: 0.08, p75: 0.09, p95: 0.1, p99: 0.11, max: 0.11, mean: 0.08 },
        },
        promoted: {
          initToFirstTokenMs: { min: 0.5, median: 0.7, p75: 0.72, p95: 0.74, p99: 0.75, max: 0.75, mean: 0.7 },
          openToFirstTokenMs: { min: 0.2, median: 0.25, p75: 0.26, p95: 0.27, p99: 0.28, max: 0.28, mean: 0.25 },
          chunkToFirstTokenMs: { min: 0.1, median: 0.12, p75: 0.13, p95: 0.14, p99: 0.15, max: 0.15, mean: 0.12 },
        },
      },
    },
    generatedAt,
  );

  writeFileSync(join(root, 'benchmarks/startup-reality.json'), JSON.stringify(artifact, null, 2));
}

function writeRuntimeSeamsArtifacts(
  root: string,
  mutate?: (report: RuntimeSeamsReportArtifact) => RuntimeSeamsReportArtifact,
): RuntimeSeamsReportArtifact {
  mkdirSync(join(root, 'reports'), { recursive: true });
  const report = buildRuntimeSeamsReport(root, '2099-01-01T00:00:00.000Z');
  const next = mutate ? mutate(report) : report;
  writeFileSync(join(root, 'reports/runtime-seams.json'), JSON.stringify(next, null, 2));
  writeFileSync(join(root, 'reports/runtime-seams.md'), renderRuntimeSeamsMarkdown(next as never));
  return next;
}

function writeAuditArtifact(root: string, generatedAt = '2099-01-01T00:01:00.000Z'): void {
  mkdirSync(join(root, 'reports'), { recursive: true });
  const audit = buildCodebaseAuditReport({
    root,
    generatedAt,
  });
  writeFileSync(join(root, 'reports/codebase-audit.json'), JSON.stringify(audit, null, 2));
}

function writeSatelliteScanArtifact(root: string, generatedAt = '2099-01-01T00:02:00.000Z'): void {
  mkdirSync(join(root, 'reports'), { recursive: true });
  const report = buildSatelliteScanReport(root, generatedAt);
  writeFileSync(join(root, 'reports/satellite-scan.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(root, 'reports/satellite-scan.md'), renderSatelliteScanMarkdown(report));
}

describe('feedback integrity', () => {
  test('runtime seams report carries provenance and passes integrity checks', () => {
    const root = createRepo(baseRepoFiles());
    const context = ensureArtifactContext(root);
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);

    const report = buildRuntimeSeamsReport(root, '2099-01-01T00:00:00.000Z');
    const checkCodes = report.integrity.checks.map((check) => check.code);

    expect(report.integrity.passed).toBe(true);
    expect(report.gauntletRunId).toBe(context.gauntletRunId);
    expect(report.sourceFingerprint).toBe(context.sourceFingerprint);
    expect(report.environmentFingerprint).toBe(context.environmentFingerprint);
    expect(report.expectedCounts).toEqual(context.expectedCounts);
    expect(checkCodes).toEqual(
      expect.arrayContaining([
        'coverage-meta-schema-version',
        'bench-schema-version',
        'startup-reality-schema-version',
        'runtime-seams-run-coherence',
      ]),
    );
    expect(renderRuntimeSeamsMarkdown(report)).toContain('## Paired Truth');
  });

  test('feedback verifier fails when the satellite scan is missing', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifacts(root);
    writeAuditArtifact(root);

    const verification = verifyFeedbackArtifacts(root);

    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'satellite-scan-present')?.passed).toBe(false);
  });

  test('feedback verifier catches runtime seams drift, audit lies, and stale scan truth', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifacts(root);
    writeAuditArtifact(root);
    writeSatelliteScanArtifact(root);

    const runtimeSeamsPath = join(root, 'reports/runtime-seams.json');
    const runtimeSeams = JSON.parse(readFileSync(runtimeSeamsPath, 'utf8')) as RuntimeSeamsReportArtifact;
    writeFileSync(
      runtimeSeamsPath,
      JSON.stringify(
        {
          ...runtimeSeams,
          generatedAt: '2000-01-01T00:00:00.000Z',
          sourceArtifacts: {
            ...runtimeSeams.sourceArtifacts,
            coverage: {
              ...runtimeSeams.sourceArtifacts!.coverage!,
              fingerprint: 'sha256:drift',
            },
          },
          hardGates: {
            ...runtimeSeams.hardGates!,
            failed: ['satellite'],
          },
        },
        null,
        2,
      ),
    );

    writeFileSync(
      join(root, 'reports/codebase-audit.json'),
      JSON.stringify(
        {
          schemaVersion: 2,
          generatedAt: '2099-01-01T00:03:00.000Z',
          gauntletRunId: ensureArtifactContext(root).gauntletRunId,
          sourceFingerprint: ensureArtifactContext(root).sourceFingerprint,
          environmentFingerprint: ensureArtifactContext(root).environmentFingerprint,
          expectedCounts: ensureArtifactContext(root).expectedCounts,
          supportingArtifacts: {
            runtimeSeams: {
              status: 'present',
            },
          },
          counts: {
            error: 0,
            warning: 2,
            info: 6,
            suppressed: 6,
          },
          findings: [],
        },
        null,
        2,
      ),
    );

    const verification = verifyFeedbackArtifacts(root);
    const failedCodes = verification.checks.filter((check) => !check.passed).map((check) => check.code);

    expect(verification.passed).toBe(false);
    expect(failedCodes).toEqual(
      expect.arrayContaining([
        'runtime-seams-source-coverage-fingerprint',
        'runtime-seams-ordering',
        'runtime-seams-hard-gates',
        'audit-runtime-seams-status',
        'satellite-scan-runtime-seams-integrity',
        'satellite-scan-runtime-seams-source',
        'satellite-scan-audit-source',
      ]),
    );
  });

  test('feedback verifier catches source fingerprint drift', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifacts(root);
    writeAuditArtifact(root);
    writeSatelliteScanArtifact(root);

    const coverageMetaPath = join(root, 'coverage/coverage-meta.json');
    const coverageMeta = JSON.parse(readFileSync(coverageMetaPath, 'utf8')) as {
      sourceFingerprint: string;
    };
    writeFileSync(
      coverageMetaPath,
      JSON.stringify(
        {
          ...coverageMeta,
          sourceFingerprint: 'sha256:stale-source',
        },
        null,
        2,
      ),
    );

    const verification = verifyFeedbackArtifacts(root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'coverage-meta-source-fingerprint')?.passed).toBe(false);
  });

  test('feedback verifier catches run-id and expected-count drift', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    const bench = writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifacts(root);
    writeAuditArtifact(root);
    writeSatelliteScanArtifact(root);

    writeFileSync(
      join(root, 'benchmarks/directive-gate.json'),
      JSON.stringify(
        {
          ...bench,
          gauntletRunId: 'run-mismatch',
          expectedCounts: {
            ...bench.expectedCounts!,
            nodeTestFileCount: 999,
          },
        },
        null,
        2,
      ),
    );

    const verification = verifyFeedbackArtifacts(root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'bench-expected-counts')?.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'runtime-seams-run-coherence')?.passed).toBe(false);
  });

  test('feedback verifier rejects unsupported audit schema versions', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifacts(root);
    writeAuditArtifact(root);
    writeSatelliteScanArtifact(root);

    writeFileSync(
      join(root, 'reports/codebase-audit.json'),
      JSON.stringify(
        {
          ...JSON.parse(readFileSync(join(root, 'reports/codebase-audit.json'), 'utf8')),
          schemaVersion: 1,
        },
        null,
        2,
      ),
    );

    const verification = verifyFeedbackArtifacts(root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'audit-schema-version')?.passed).toBe(false);
  });

  test('feedback verifier fails closed when startup reality omits llm phase metadata', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifacts(root);
    writeAuditArtifact(root);
    writeSatelliteScanArtifact(root);

    const startupRealityPath = join(root, 'benchmarks/startup-reality.json');
    const startupReality = JSON.parse(readFileSync(startupRealityPath, 'utf8')) as Record<string, unknown>;
    const browser = startupReality.browser as Record<string, unknown>;
    const llm = browser.llm as Record<string, unknown>;
    const simple = llm.simple as Record<string, unknown>;

    writeFileSync(
      startupRealityPath,
      JSON.stringify(
        {
          ...startupReality,
          browser: {
            ...browser,
            llm: {
              ...llm,
              simple: {
                ...simple,
                resolution: undefined,
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const verification = verifyFeedbackArtifacts(root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'startup-reality-llm-phase-shapes')?.passed).toBe(false);
  });

  test('runtime seams verifier catches hotspot contradictions from stale coverage', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    const report = writeRuntimeSeamsArtifacts(root, (current) => ({
      ...current,
      coverage: {
        ...current.coverage!,
        topBranchHotspots: [
          {
            file: 'packages/core/src/runtime-helper.ts',
            package: 'core',
            branchPct: 50,
            previousBranchPct: null,
            deltaBranchPct: null,
            branchCovered: 1,
            branchTotal: 2,
            linePct: 100,
          },
        ],
      },
    }));

    const verification = verifyRuntimeSeamsReport(report, root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'runtime-seams-hotspots')?.passed).toBe(false);
  });

  test('runtime seams verifier fails when paired-truth fidelity metadata is missing', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    const report = writeRuntimeSeamsArtifacts(root);
    const verification = verifyRuntimeSeamsReport(
      {
        ...report,
        pairedTruth: report.pairedTruth?.map((entry, index) =>
          index === 0
            ? ({
                ...entry,
                fidelity: undefined,
              } as unknown as typeof entry)
            : entry,
        ),
      },
      root,
    );
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'runtime-seams-paired-truth-fidelity')?.passed).toBe(false);
  });

  test('runtime seams verifier fails when a missing startup stage reports measured timings', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    const report = writeRuntimeSeamsArtifacts(root, (current) => ({
      ...current,
      startupBreakdown: current.startupBreakdown?.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              modeled: false,
              meanNs: 10,
              p75Ns: 10,
              p95Ns: 10,
              p99Ns: 10,
            }
          : entry,
      ),
    }));

    const verification = verifyRuntimeSeamsReport(report, root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'runtime-seams-startup-breakdown-accounting')?.passed).toBe(false);
  });

  test('runtime seams verifier fails when startup stage coverage is incomplete even with zero timings', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    const report = writeRuntimeSeamsArtifacts(root, (current) => ({
      ...current,
      startupBreakdown: current.startupBreakdown?.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              modeled: false,
              meanNs: 0,
              p75Ns: 0,
              p95Ns: 0,
              p99Ns: 0,
            }
          : entry,
      ),
    }));

    const verification = verifyRuntimeSeamsReport(report, root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'runtime-seams-startup-breakdown-complete')?.passed).toBe(false);
  });

  test('runtime seams verifier fails when bench stability summary contradicts replicate data', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    const report = writeRuntimeSeamsArtifacts(root, (current) => ({
      ...current,
      benchStability: current.benchStability?.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              noisy: !entry.noisy,
            }
          : entry,
      ),
    }));

    const verification = verifyRuntimeSeamsReport(report, root);
    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'runtime-seams-bench-stability')?.passed).toBe(false);
  });

  test('runtime seams treats sub-0.125ms paired startup drift as aligned even when percentage divergence looks large', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);

    const startupRealityPath = join(root, 'benchmarks/startup-reality.json');
    const startupReality = JSON.parse(readFileSync(startupRealityPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      startupRealityPath,
      JSON.stringify(
        {
          ...startupReality,
          nodeProxy: {
            ...(startupReality.nodeProxy as Record<string, number | null>),
            llmRuntimeStartupMeanNs: 70_819.2371937959,
            llmRuntimePromotedStartupMeanNs: 128_157.95206965636,
          },
          browser: {
            ...(startupReality.browser as Record<string, unknown>),
            llm: {
              iterations: 30,
              simple: {
                rawSamples: Array.from({ length: 25 }, () => 0).concat([0.1, 0.1, 0.1, 0.1, 0.1]),
                topOutliers: [{ iteration: 0, valueMs: 0.1 }],
                initToFirstTokenMs: { min: 0, median: 0, p75: 0, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.0167 },
                openToFirstTokenMs: { min: 0, median: 0, p75: 0, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.0133 },
                chunkToFirstTokenMs: { min: 0, median: 0, p75: 0, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.01 },
                resolution: { timerResolutionFloorMs: 0.125, timerFloorLimited: true },
              },
              promoted: {
                rawSamples: [0.1, 0.1, 0.1, 0, 0.4].concat(Array.from({ length: 25 }, () => 0)),
                topOutliers: [{ iteration: 4, valueMs: 0.4 }],
                initToFirstTokenMs: { min: 0, median: 0, p75: 0.1, p95: 0.1, p99: 0.4, max: 0.4, mean: 0.06 },
                openToFirstTokenMs: { min: 0, median: 0, p75: 0.1, p95: 0.1, p99: 0.4, max: 0.4, mean: 0.05 },
                chunkToFirstTokenMs: { min: 0, median: 0, p75: 0.1, p95: 0.1, p99: 0.4, max: 0.4, mean: 0.04 },
                resolution: { timerResolutionFloorMs: 0.125, timerFloorLimited: false },
              },
            },
          },
          divergence: {
            ...(startupReality.divergence as Record<string, number | null>),
            llmRuntimeStartupPct: -54.12,
            llmRuntimePromotedStartupPct: -53.18,
          },
        },
        null,
        2,
      ),
    );

    const report = buildRuntimeSeamsReport(root, '2099-01-01T00:00:00.000Z');
    expect(report.pairedTruth?.find((entry) => entry.id === 'llm-startup')?.status).toBe('pass');
    expect(report.pairedTruth?.find((entry) => entry.id === 'llm-promoted-startup')?.status).toBe('pass');
  });
});
