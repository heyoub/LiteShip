import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ensureArtifactContext } from '../../../scripts/artifact-context.js';
import {
  buildBenchFacts,
  buildCoverageFacts,
  buildCoverageMetaArtifact,
  type BenchArtifact,
} from '../../../scripts/artifact-integrity.js';
import { buildCodebaseAuditReport } from '../../../scripts/audit/report.js';
import { buildDirectiveBenchConfig } from '../../../scripts/bench/directive-suite.js';
import { buildStartupRealityArtifact } from '../../../scripts/bench-reality.js';
import {
  buildSatelliteScanReport,
  renderSatelliteScanMarkdown,
  verifySatelliteScanReport,
} from '../../../scripts/report-satellite-scan.js';
import { buildRuntimeSeamsReport } from '../../../scripts/report-runtime-seams.js';

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
  const root = mkdtempSync(join(os.tmpdir(), 'czap-scan-'));
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
        name: 'czap-scan-fixture',
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
  writeFileSync(
    join(root, 'coverage/coverage-final.json'),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
  );
  const context = ensureArtifactContext(root);
  const coverageFacts = buildCoverageFacts(root);
  const coverageMeta = buildCoverageMetaArtifact(coverageFacts, generatedAt, context);
  writeFileSync(join(root, 'coverage/coverage-meta.json'), JSON.stringify(coverageMeta, null, 2));
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
    canaries: [
      {
        name: '[CANARY] bench -- integer accumulator',
        medianMeanNs: 120,
        medianP75Ns: 122,
        medianP99Ns: 130,
        spreadMeanNs: 6,
      },
    ],
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
      visibleFirstPaintMeanNs: 1100,
      workerTakeoverMeanNs: 4100,
      shared: {
        label: 'worker-runtime-startup-shared',
        supportMeanNs: 5000,
        parityMeanNs: 4600,
        residualMeanNs: 400,
        overheadPct: 8.7,
        thresholdPct: 25,
        conclusion: 'fixture shared parity is healthy.',
      },
      seam: {
        label: 'worker-runtime-startup-seam',
        absoluteMeanNs: 2000,
        derivedPct: 7.4,
        dominantStage: 'state-delivery:message-receipt',
        messageReceiptResidualNs: 1300,
        dispatchSendResidualNs: 250,
        messageReceiptSharePct: 65,
        dispatchSendSharePct: 12.5,
        sharedResidualSharePct: 22.5,
        toBrowserStartupMedianPct: null,
        tailRatioP99ToMedian: 1.3,
        conclusion: 'fixture seam is dominated by off-thread handoff pressure.',
        components: [
          {
            stage: 'state-delivery:message-receipt',
            label: 'worker message receipt latency',
            kind: 'worker-only',
            residualMeanNs: 1300,
          },
        ],
      },
    },
    llmRuntimeSteadySignals: {
      label: 'llm-runtime-steady',
      replicateExceedanceRate: 0.2,
      directiveP99ToBaselineP99: 1.15,
      directiveP75ToBaselineP75: 1.08,
      longSessionSlopeNsPerChunk: 135,
      mixedChunkSlopeNsPerChunk: 150,
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
            meanNs: 4000,
            p75Ns: 4100,
            p95Ns: 4200,
            p99Ns: 4300,
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
            meanNs: 2400,
            p75Ns: 2500,
            p95Ns: 2600,
            p99Ns: 2700,
          },
          {
            stage: 'request-compute',
            label: 'compute request dispatch',
            modeled: true,
            meanNs: 3000,
            p75Ns: 3100,
            p95Ns: 3200,
            p99Ns: 3300,
          },
          {
            stage: 'state-delivery',
            label: 'first state delivery',
            modeled: true,
            meanNs: 2600,
            p75Ns: 2700,
            p95Ns: 2800,
            p99Ns: 2900,
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
            opsPerSec: 180000,
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

function writeStartupRealityArtifact(root: string): void {
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
            'claim-or-create': { min: 0.1, median: 0.2, p75: 0.22, p95: 0.24, p99: 0.25, max: 0.25, mean: 0.2 },
            'coordinator-reset-or-create': { min: 0.12, median: 0.16, p75: 0.17, p95: 0.18, p99: 0.19, max: 0.19, mean: 0.16 },
            'listener-bind': { min: 0.02, median: 0.03, p75: 0.03, p95: 0.04, p99: 0.04, max: 0.04, mean: 0.03 },
            'quantizer-bootstrap': { min: 0.03, median: 0.05, p75: 0.05, p95: 0.06, p99: 0.06, max: 0.06, mean: 0.05 },
            'request-compute': { min: 0.03, median: 0.04, p75: 0.05, p95: 0.06, p99: 0.06, max: 0.06, mean: 0.04 },
            'state-delivery': { min: 0.08, median: 0.1, p75: 0.11, p95: 0.12, p99: 0.13, max: 0.13, mean: 0.1 },
            'dispose': { min: 0.04, median: 0.06, p75: 0.07, p95: 0.08, p99: 0.08, max: 0.08, mean: 0.06 },
          },
        },
      },
      llm: {
        iterations: 30,
        simple: {
          initToFirstTokenMs: { min: 0.2, median: 0.3, p75: 0.32, p95: 0.34, p99: 0.35, max: 0.35, mean: 0.3 },
          openToFirstTokenMs: { min: 0.1, median: 0.15, p75: 0.16, p95: 0.17, p99: 0.17, max: 0.17, mean: 0.15 },
          chunkToFirstTokenMs: { min: 0.05, median: 0.08, p75: 0.09, p95: 0.1, p99: 0.1, max: 0.1, mean: 0.08 },
        },
        promoted: {
          initToFirstTokenMs: { min: 0.5, median: 0.7, p75: 0.72, p95: 0.74, p99: 0.75, max: 0.75, mean: 0.7 },
          openToFirstTokenMs: { min: 0.2, median: 0.24, p75: 0.25, p95: 0.26, p99: 0.27, max: 0.27, mean: 0.24 },
          chunkToFirstTokenMs: { min: 0.1, median: 0.12, p75: 0.13, p95: 0.14, p99: 0.15, max: 0.15, mean: 0.12 },
        },
      },
    },
    '2026-03-28T05:32:00.000Z',
  );

  writeFileSync(join(root, 'benchmarks/startup-reality.json'), JSON.stringify(artifact, null, 2));
}

function writeAuditArtifact(root: string): void {
  mkdirSync(join(root, 'reports'), { recursive: true });
  const audit = buildCodebaseAuditReport({
    root,
    generatedAt: '2099-01-01T00:01:00.000Z',
  });
  writeFileSync(join(root, 'reports/codebase-audit.json'), JSON.stringify(audit, null, 2));
}

function writeRuntimeSeamsArtifact(root: string): void {
  mkdirSync(join(root, 'reports'), { recursive: true });
  const report = buildRuntimeSeamsReport(root, '2099-01-01T00:00:00.000Z');
  writeFileSync(join(root, 'reports/runtime-seams.json'), JSON.stringify(report, null, 2));
}

describe('satellite scan', () => {
  test('startup reality artifact captures node proxy medians and browser divergence', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);

    const artifact = JSON.parse(readFileSync(join(root, 'benchmarks/startup-reality.json'), 'utf8')) as ReturnType<
      typeof buildStartupRealityArtifact
    >;

    expect(artifact.nodeProxy.workerRuntimeStartupMeanNs).toBe(5000);
    expect(artifact.nodeProxy.llmRuntimeStartupMeanNs).toBe(3000);
    expect(artifact.nodeProxy.llmRuntimePromotedStartupMeanNs).toBe(4500);
    expect(artifact.divergence.workerRuntimeStartupPct).toBe(435);
    expect(artifact.divergence.llmRuntimeStartupPct).toBe(77);
    expect(artifact.divergence.llmRuntimePromotedStartupPct).toBeCloseTo(115.5, 1);
  });

  test('builds an integrity-checked satellite scan from verified artifacts', () => {
    const root = createRepo(baseRepoFiles());
    const context = ensureArtifactContext(root);
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifact(root);
    writeAuditArtifact(root);

    const report = buildSatelliteScanReport(root, '2099-01-01T00:02:00.000Z');

    expect(report.integrity.passed).toBe(true);
    expect(report.gauntletRunId).toBe(context.gauntletRunId);
    expect(report.sourceFingerprint).toBe(context.sourceFingerprint);
    expect(report.strikeBoard.length).toBeGreaterThan(0);
    expect(report.summary.runtimeWarnings).toEqual([]);
    expect(report.pairedTruth.find((entry) => entry.id === 'worker-startup')?.primaryLane.summary?.p99).toBe(0.54);
    expect(report.pairedTruth.find((entry) => entry.id === 'llm-promoted-startup')?.primaryLane.summary?.p99).toBe(0.15);
    expect(renderSatelliteScanMarkdown(report)).toContain('## Feedback Integrity');
  });

  test('verification catches satellite scan contradictions', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifact(root);
    writeAuditArtifact(root);

    const report = buildSatelliteScanReport(root, '2099-01-01T00:02:00.000Z');
    const verification = verifySatelliteScanReport(
      {
        ...report,
        summary: {
          ...report.summary,
          runtimeWarnings: ['bogus'],
        },
      },
      root,
    );

    expect(verification.passed).toBe(false);
    expect(verification.checks.find((check) => check.code === 'satellite-scan-runtime-warnings')?.passed).toBe(false);
  });

  test('build rejects malformed audit evidence beneath the satellite scan', () => {
    const root = createRepo(baseRepoFiles());
    writeCoverageArtifacts(root);
    writeBenchArtifact(root);
    writeStartupRealityArtifact(root);
    writeRuntimeSeamsArtifact(root);
    writeAuditArtifact(root);

    writeFileSync(
      join(root, 'reports/codebase-audit.json'),
      JSON.stringify(
        {
          ...JSON.parse(readFileSync(join(root, 'reports/codebase-audit.json'), 'utf8')),
          counts: undefined,
        },
        null,
        2,
      ),
    );

    expect(() => buildSatelliteScanReport(root, '2099-01-01T00:02:00.000Z')).toThrow(
      'Audit counts block is missing or malformed beneath the satellite scan.',
    );
  });
});
