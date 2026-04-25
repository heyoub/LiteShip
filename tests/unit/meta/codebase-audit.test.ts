import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, test } from 'vitest';
import { ensureArtifactContext } from '../../../scripts/artifact-context.js';
import { buildCoverageFacts, buildCoverageMetaArtifact } from '../../../scripts/artifact-integrity.js';
import { buildDirectiveBenchConfig } from '../../../scripts/bench/directive-suite.js';
import { buildAuditArtifactBundle, buildCodebaseAuditReport, renderCodebaseAuditMarkdown } from '../../../scripts/audit/report.js';
import { runIntegrityAudit } from '../../../scripts/audit/integrity.js';
import { runStructureAudit } from '../../../scripts/audit/structure.js';
import { runSurfaceAudit } from '../../../scripts/audit/surface.js';
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
  const root = mkdtempSync(join(os.tmpdir(), 'czap-audit-'));
  tempRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  return root;
}

function astroPackageJson(): string {
  return JSON.stringify(
    {
      name: '@czap/astro',
      type: 'module',
      exports: {
        '.': { development: './src/index.ts' },
        './client-directives/satellite': { development: './src/client-directives/satellite.ts' },
        './client-directives/stream': { development: './src/client-directives/stream.ts' },
        './client-directives/llm': { development: './src/client-directives/llm.ts' },
        './client-directives/worker': { development: './src/client-directives/worker.ts' },
        './client-directives/gpu': { development: './src/client-directives/gpu.ts' },
        './client-directives/wasm': { development: './src/client-directives/wasm.ts' },
        './middleware': { development: './src/middleware.ts' },
        './runtime': { development: './src/runtime/index.ts' },
      },
    },
    null,
    2,
  );
}

function baseRepoFiles(): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: 'czap-audit-fixture',
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
          './*': { development: './src/*.ts' },
        },
      },
      null,
      2,
    ),
    'packages/core/src/index.ts': 'export { helper } from "./helper.js";\nexport const coreReady = true;\n',
    'packages/core/src/helper.ts': 'export const helper = () => 1;\n',
    'packages/vite/package.json': JSON.stringify(
      {
        name: '@czap/vite',
        type: 'module',
        exports: {
          '.': { development: './src/index.ts' },
        },
      },
      null,
      2,
    ),
    'packages/vite/src/index.ts': 'export { loadVirtualModule } from "./virtual-modules.js";\n',
    'packages/vite/src/virtual-modules.ts': `
export const ids = [
  'virtual:czap/tokens',
  'virtual:czap/tokens.css',
  'virtual:czap/boundaries',
  'virtual:czap/themes',
  'virtual:czap/hmr-client',
  'virtual:czap/wasm-url',
] as const;

export function loadVirtualModule(id: string): string | undefined {
  return ids.includes(id as never) ? '{}' : undefined;
}
`.trim(),
    'packages/astro/package.json': astroPackageJson(),
    'packages/astro/src/index.ts': 'export const astroReady = true;\n',
    'packages/astro/src/middleware.ts': 'export const onRequest = () => null;\n',
    'packages/astro/src/runtime/index.ts': 'export { bootstrapSlots } from "./slots.js";\nexport { loadWasmRuntime } from "./wasm.js";\n',
    'packages/astro/src/runtime/satellite.ts': 'export const satelliteRuntime = true;\n',
    'packages/astro/src/runtime/stream.ts': 'export const streamRuntime = true;\n',
    'packages/astro/src/runtime/llm.ts': 'export const llmRuntime = true;\n',
    'packages/astro/src/runtime/worker.ts': 'export const workerRuntime = true;\n',
    'packages/astro/src/runtime/gpu.ts': 'export const initGPUDirective = () => null;\n',
    'packages/astro/src/runtime/wasm.ts': 'export const wasmRuntime = true;\n',
    'packages/astro/src/runtime/boundary.ts': 'export const boundaryRuntime = true;\n',
    'packages/astro/src/runtime/slots.ts': 'export const bootstrapSlots = () => true;\n',
    'packages/astro/src/client-directives/satellite.ts':
      'import { initSatelliteDirective } from "../runtime/satellite.js";\nexport default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {\n  initSatelliteDirective(load, el);\n};\n',
    'packages/astro/src/client-directives/stream.ts':
      'import { initStreamDirective } from "../runtime/stream.js";\nexport default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {\n  initStreamDirective(load, el);\n};\n',
    'packages/astro/src/client-directives/llm.ts':
      'import { initLLMDirective } from "../runtime/llm.js";\nexport default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {\n  initLLMDirective(load, el);\n};\n',
    'packages/astro/src/client-directives/worker.ts':
      'import { initWorkerDirective } from "../runtime/worker.js";\nexport default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {\n  initWorkerDirective(load, el);\n};\n',
    'packages/astro/src/client-directives/gpu.ts':
      'import { initGPUDirective } from "../runtime/gpu.js";\nexport default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {\n  initGPUDirective(load, el);\n};\n',
    'packages/astro/src/client-directives/wasm.ts':
      'import { loadWasmRuntime } from "../runtime/wasm.js";\nexport default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {\n  void loadWasmRuntime(el);\n  load();\n};\n',
  };
}

function readAstroDirectiveWrapper(relativePath: string): ts.SourceFile {
  const absolutePath = join(process.cwd(), relativePath);
  return ts.createSourceFile(absolutePath, readFileSync(absolutePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function writeSupportArtifacts(root: string): void {
  mkdirSync(join(root, 'coverage'), { recursive: true });
  mkdirSync(join(root, 'benchmarks'), { recursive: true });
  mkdirSync(join(root, 'reports'), { recursive: true });
  const context = ensureArtifactContext(root);

  const coverageJson = {
    'packages/core/src/index.ts': {
      path: 'packages/core/src/index.ts',
      statementMap: {
        0: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 24 },
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
  const coverageFacts = buildCoverageFacts(root);
  const coverageMeta = buildCoverageMetaArtifact(coverageFacts, '2026-03-27T00:00:00.000Z', context);
  writeFileSync(join(root, 'coverage/coverage-meta.json'), JSON.stringify(coverageMeta, null, 2));
  writeFileSync(
    join(root, 'benchmarks/directive-gate.json'),
    JSON.stringify(
      {
        schemaVersion: 8,
        generatedAt: '2026-03-27T00:00:00.000Z',
        gauntletRunId: context.gauntletRunId,
        sourceFingerprint: context.sourceFingerprint,
        environmentFingerprint: context.environmentFingerprint,
        expectedCounts: context.expectedCounts,
        benchConfig: buildDirectiveBenchConfig(),
        summary: {
          passed: true,
          failedHardGates: [],
          hardGateCount: 3,
          diagnosticCount: 2,
        },
        canaries: [],
        replicates: [
          {
            replicate: 0,
            startupBreakdown: [
              { stage: 'claim-or-create', label: 'worker claim or create', modeled: true, meanNs: 6000, p75Ns: 6200, p95Ns: 6300, p99Ns: 6400 },
              { stage: 'coordinator-reset-or-create', label: 'runtime coordinator reset or create', modeled: true, meanNs: 4200, p75Ns: 4300, p95Ns: 4400, p99Ns: 4500 },
              { stage: 'listener-bind', label: 'worker listener binding', modeled: true, meanNs: 1800, p75Ns: 1900, p95Ns: 2000, p99Ns: 2100 },
              { stage: 'quantizer-bootstrap', label: 'startup quantizer bootstrap', modeled: true, meanNs: 2500, p75Ns: 2600, p95Ns: 2700, p99Ns: 2800 },
              { stage: 'request-compute', label: 'compute request dispatch', modeled: true, meanNs: 3400, p75Ns: 3500, p95Ns: 3600, p99Ns: 3700 },
              { stage: 'state-delivery', label: 'first state delivery', modeled: true, meanNs: 2900, p75Ns: 3000, p95Ns: 3100, p99Ns: 3200 },
              { stage: 'dispose', label: 'host disposal', modeled: true, meanNs: 1400, p75Ns: 1500, p95Ns: 1600, p99Ns: 1700 },
            ],
            results: [
              { name: '[DIAGNOSTIC] worker-runtime-startup -- host bootstrap + first compute', meanNs: 5000, p75Ns: 5200, p99Ns: 5400 },
              { name: '[GATE] llm-startup-shared -- first token boundary', meanNs: 3000, p75Ns: 3200, p99Ns: 3400 },
              { name: '[GATE] llm-promoted-startup-shared -- second token boundary', meanNs: 4500, p75Ns: 4700, p99Ns: 4900 },
            ],
            pairs: [
              { label: 'satellite', overhead: 0.05 },
              { label: 'llm-startup-shared', overhead: 1.205 },
              { label: 'llm-promoted-startup-shared', overhead: 1.55 },
              { label: 'worker-runtime-startup', overhead: 2.01 },
              { label: 'worker-envelope', overhead: 420.9665 },
            ],
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
            label: 'llm-startup-shared',
            gate: true,
            pass: true,
            runtimeClass: 'startup',
            medianOverhead: 1.205,
            threshold: 0.25,
          },
          {
            label: 'llm-promoted-startup-shared',
            gate: true,
            pass: true,
            runtimeClass: 'startup',
            medianOverhead: 1.55,
            threshold: 0.25,
          },
          {
            label: 'worker-runtime-startup',
            gate: false,
            pass: true,
            runtimeClass: 'startup',
            medianOverhead: 2.01,
            threshold: 0.25,
            warning: true,
          },
          {
            label: 'worker-envelope',
            gate: false,
            pass: true,
            runtimeClass: 'transport',
            medianOverhead: 420.9665,
            threshold: 0.25,
            warning: true,
          },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, 'benchmarks/startup-reality.json'),
    JSON.stringify(
      {
        schemaVersion: 4,
        generatedAt: '2026-03-27T00:00:00.000Z',
        gauntletRunId: context.gauntletRunId,
        sourceFingerprint: context.sourceFingerprint,
        environmentFingerprint: context.environmentFingerprint,
        expectedCounts: context.expectedCounts,
        sourceArtifacts: {
          bench: {
            path: 'benchmarks/directive-gate.json',
            fingerprint: 'sha256:fixture-bench',
            generatedAt: '2026-03-27T00:00:00.000Z',
          },
        },
        nodeProxy: {
          workerRuntimeStartupMeanNs: 5000,
          llmRuntimeStartupMeanNs: 3000,
          llmRuntimePromotedStartupMeanNs: 4500,
        },
        browser: {
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
                dispose: { min: 0.03, median: 0.04, p75: 0.05, p95: 0.05, p99: 0.06, max: 0.06, mean: 0.04 },
              },
            },
          },
          llm: {
            iterations: 30,
            simple: {
              initToFirstTokenMs: { min: 0.2, median: 0.3, p75: 0.32, p95: 0.34, p99: 0.35, max: 0.35, mean: 0.3 },
              openToFirstTokenMs: { min: 0.1, median: 0.15, p75: 0.16, p95: 0.17, p99: 0.18, max: 0.18, mean: 0.15 },
              chunkToFirstTokenMs: { min: 0.05, median: 0.08, p75: 0.09, p95: 0.1, p99: 0.11, max: 0.11, mean: 0.08 },
              resolution: { timerResolutionFloorMs: 0.125, timerFloorLimited: true },
            },
            promoted: {
              initToFirstTokenMs: { min: 0.4, median: 0.5, p75: 0.52, p95: 0.54, p99: 0.55, max: 0.55, mean: 0.5 },
              openToFirstTokenMs: { min: 0.2, median: 0.22, p75: 0.23, p95: 0.24, p99: 0.25, max: 0.25, mean: 0.22 },
              chunkToFirstTokenMs: { min: 0.08, median: 0.1, p75: 0.11, p95: 0.12, p99: 0.13, max: 0.13, mean: 0.1 },
              resolution: { timerResolutionFloorMs: 0.125, timerFloorLimited: true },
            },
          },
        },
        divergence: {
          workerRuntimeStartupPct: 355,
          llmRuntimeStartupPct: 9900,
          llmRuntimePromotedStartupPct: 495.5,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, 'reports/runtime-seams.json'),
    JSON.stringify(buildRuntimeSeamsReport(root, '2099-01-01T00:00:00.000Z'), null, 2),
  );
}

describe('codebase audit loop', () => {
  test('structure audit flags package topology violations', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/web/package.json': JSON.stringify(
        {
          name: '@czap/web',
          type: 'module',
          exports: { '.': { development: './src/index.ts' } },
        },
        null,
        2,
      ),
      'packages/web/src/index.ts': 'import { remotionReady } from "@czap/remotion";\nexport const webReady = remotionReady;\n',
      'packages/remotion/package.json': JSON.stringify(
        {
          name: '@czap/remotion',
          type: 'module',
          exports: { '.': { development: './src/index.ts' } },
        },
        null,
        2,
      ),
      'packages/remotion/src/index.ts': 'export const remotionReady = true;\n',
    });

    const result = runStructureAudit(root);
    expect(result.findings.some((finding) => finding.rule === 'package-topology')).toBe(true);
  });

  test('structure audit flags orphaned exports and suppresses Astro directive default exports', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/core/src/orphan.ts': 'export const orphanValue = 1;\n',
    });

    const result = runStructureAudit(root);
    expect(result.findings.some((finding) => finding.rule === 'orphan-export-candidate' && finding.location?.file === 'packages/core/src/orphan.ts')).toBe(true);
    expect(result.suppressed.some((entry) => entry.rule === 'default-export')).toBe(true);
  });

  test('structure audit only suppresses explicit Astro wrapper files', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/astro/src/client-directives/experimental.ts': 'export default () => null;\n',
    });

    const result = runStructureAudit(root);
    expect(
      result.findings.some(
        (finding) =>
          finding.rule === 'default-export' &&
          finding.location?.file === 'packages/astro/src/client-directives/experimental.ts',
      ),
    ).toBe(true);
    expect(result.suppressed.filter((entry) => entry.rule === 'default-export')).toHaveLength(6);
  });

  test('real Astro directive wrappers stay import-and-export shells', () => {
    const wrappers = [
      ['packages/astro/src/client-directives/satellite.ts', '../runtime/satellite.js'],
      ['packages/astro/src/client-directives/stream.ts', '../runtime/stream.js'],
      ['packages/astro/src/client-directives/llm.ts', '../runtime/llm.js'],
      ['packages/astro/src/client-directives/worker.ts', '../runtime/worker.js'],
      ['packages/astro/src/client-directives/gpu.ts', '../runtime/gpu.js'],
      ['packages/astro/src/client-directives/wasm.ts', '../runtime/wasm.js'],
    ] as const;

    for (const [relativePath, runtimeSpecifier] of wrappers) {
      const sourceFile = readAstroDirectiveWrapper(relativePath);
      expect(sourceFile.statements).toHaveLength(2);
      expect(ts.isImportDeclaration(sourceFile.statements[0]!)).toBe(true);
      expect(((sourceFile.statements[0] as ts.ImportDeclaration).moduleSpecifier as ts.StringLiteral).text).toBe(runtimeSpecifier);
      expect(ts.isExportAssignment(sourceFile.statements[1]!)).toBe(true);
    }
  });

  test('integrity audit flags runtime stubs', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/core/src/stub.ts': 'export function later(): never { throw new Error("not implemented"); }\n',
    });

    const result = runIntegrityAudit(root);
    expect(result.findings.some((finding) => finding.rule === 'stub-marker')).toBe(true);
  });

  test('integrity audit still flags simple catch-return fallbacks', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/core/src/fallback.ts':
        'export function fallback(): boolean { try { throw new Error("boom"); } catch { return false; } }\n',
    });

    const result = runIntegrityAudit(root);
    expect(result.findings.some((finding) => finding.rule === 'fallback-laundering')).toBe(true);
  });

  test('surface audit flags missing virtual module surface entries', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/vite/src/virtual-modules.ts': `
export const ids = [
  'virtual:czap/tokens',
  'virtual:czap/tokens.css',
  'virtual:czap/boundaries',
  'virtual:czap/themes',
  'virtual:czap/hmr-client',
] as const;
`.trim(),
    });

    const result = runSurfaceAudit(root);
    expect(result.findings.some((finding) => finding.rule === 'virtual-module-surface')).toBe(true);
  });

  test('report aggregation clearly reports missing supporting artifacts', () => {
    const root = createRepo(baseRepoFiles());
    const report = buildCodebaseAuditReport({
      root,
      generatedAt: '2026-03-27T12:00:00.000Z',
    });

    expect(report.supportingArtifacts.coverage.status).toBe('missing');
    expect(report.supportingArtifacts.benchmarks.status).toBe('missing');
    expect(report.supportingArtifacts.runtimeSeams.status).toBe('missing');
    expect(report.findings.some((finding) => finding.rule === 'artifact-missing')).toBe(true);
  });

  test('audit marks runtime seams as failed when provenance is contradictory', () => {
    const root = createRepo(baseRepoFiles());
    writeSupportArtifacts(root);

    const runtimeSeamsPath = join(root, 'reports/runtime-seams.json');
    const runtimeSeams = JSON.parse(readFileSync(runtimeSeamsPath, 'utf8')) as {
      sourceArtifacts?: {
        coverage?: {
          fingerprint?: string;
        };
      };
    };
    writeFileSync(
      runtimeSeamsPath,
      JSON.stringify(
        {
          ...runtimeSeams,
          sourceArtifacts: {
            ...runtimeSeams.sourceArtifacts,
            coverage: {
              ...(runtimeSeams.sourceArtifacts?.coverage ?? {}),
              fingerprint: 'sha256:stale',
            },
          },
        },
        null,
        2,
      ),
    );

    const report = buildCodebaseAuditReport({
      root,
      generatedAt: '2026-03-27T12:00:00.000Z',
    });

    expect(report.supportingArtifacts.runtimeSeams.status).toBe('failed');
    expect(report.findings.some((finding) => finding.rule === 'artifact-failed')).toBe(true);
  });

  test('report JSON and markdown stay stable', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/core/src/orphan.ts': 'export const orphanValue = 1;\n',
    });
    writeSupportArtifacts(root);

    const report = buildCodebaseAuditReport({
      root,
      generatedAt: '2026-03-27T12:00:00.000Z',
    });

    const stableJsonView = {
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      gauntletRunId: '<run>',
      sourceFingerprint: '<hash>',
      environmentFingerprint: '<hash>',
      inventoryCount: report.inventoryCount,
      aggregateScore: report.aggregateScore,
      expectedCounts: report.expectedCounts,
      advisory: report.advisory,
      root: report.root,
      counts: report.counts,
      sectionScores: report.sections.map((section) => ({
        id: section.id,
        score: section.score,
        fileCount: section.files.length,
      })),
      coreFiles: report.sections
        .find((section) => section.id === '@czap/core')
        ?.files.map((file) => ({
          path: file.path,
          score: file.score,
          namedOffenses: file.namedOffenses,
          forbiddenRemedies: file.forbiddenRemedies,
        })),
      structure: {
        summary: report.structure.summary,
        findingRules: report.structure.findings.map((finding) => ({
          rule: finding.rule,
          file: finding.location?.file ?? null,
        })),
        suppressed: report.structure.suppressed.map((entry) => ({
          rule: entry.rule,
          file: entry.finding.location?.file ?? null,
        })),
      },
      integrity: {
        summary: report.integrity.summary,
      },
      surface: {
        summary: report.surface.summary,
      },
      supportingArtifacts: {
        invariants: {
          path: report.supportingArtifacts.invariants.path,
          status: report.supportingArtifacts.invariants.status,
          summary: report.supportingArtifacts.invariants.summary,
        },
        coverage: {
          path: report.supportingArtifacts.coverage.path,
          status: report.supportingArtifacts.coverage.status,
          summary: report.supportingArtifacts.coverage.summary,
        },
        benchmarks: {
          path: report.supportingArtifacts.benchmarks.path,
          status: report.supportingArtifacts.benchmarks.status,
          summary: report.supportingArtifacts.benchmarks.summary,
        },
        runtimeSeams: {
          path: report.supportingArtifacts.runtimeSeams.path,
          status: report.supportingArtifacts.runtimeSeams.status,
          summary: report.supportingArtifacts.runtimeSeams.summary,
        },
      },
      fullTreeAccounting: report.fullTreeAccounting,
      protocolGap: report.protocolGap,
      frameworkBlueprintDelta: report.frameworkBlueprintDelta,
      strikeBoard: report.strikeBoard,
      findings: report.findings.map((finding) => ({
        rule: finding.rule,
        severity: finding.severity,
        file: finding.location?.file ?? null,
      })),
    };

    expect(stableJsonView.schemaVersion).toBe(2);
    expect(stableJsonView.inventoryCount).toBe(26);
    expect(stableJsonView.aggregateScore).toBeCloseTo(85.91, 2);
    expect(stableJsonView.sectionScores.map((section) => section.id)).toEqual([
      '@czap/core',
      '@czap/quantizer',
      '@czap/compiler',
      '@czap/detect',
      '@czap/web',
      '@czap/edge',
      '@czap/worker',
      '@czap/vite',
      '@czap/astro',
      '@czap/remotion',
      'czap-compute',
      'packages/_spine',
      'tests',
      'scripts',
      'docs',
      'examples',
      'repo/system/devops',
    ]);
    expect(stableJsonView.coreFiles).toEqual([
      {
        path: 'packages/core/package.json',
        score: 72.5,
        namedOffenses: [],
        forbiddenRemedies: [],
      },
      {
        path: 'packages/core/src/helper.ts',
        score: 87.5,
        namedOffenses: [],
        forbiddenRemedies: [],
      },
      {
        path: 'packages/core/src/index.ts',
        score: 100,
        namedOffenses: [],
        forbiddenRemedies: [],
      },
      {
        path: 'packages/core/src/orphan.ts',
        score: 59,
        namedOffenses: ['Island Syndrome'],
        forbiddenRemedies: [],
      },
    ]);
    expect(stableJsonView.fullTreeAccounting.totalFiles).toBeGreaterThanOrEqual(stableJsonView.inventoryCount);
    expect(stableJsonView.fullTreeAccounting.scoredFiles).toBe(stableJsonView.inventoryCount);
    expect(stableJsonView.protocolGap.partial).toBeGreaterThanOrEqual(1);
    expect(stableJsonView.frameworkBlueprintDelta.present).toBeGreaterThanOrEqual(1);
    expect(stableJsonView.strikeBoard.totalItems).toBeGreaterThanOrEqual(1);
    expect(stableJsonView.findings).toEqual([
      { rule: 'runtime-seam-transport-note', severity: 'info', file: null },
      { rule: 'orphan-export-candidate', severity: 'info', file: 'packages/core/src/orphan.ts' },
    ]);

    const markdown = renderCodebaseAuditMarkdown(report);
    expect(markdown).toContain('# Full-Repo HICP Audit');
    expect(markdown).toContain('## @czap/core');
    expect(markdown).toContain('## repo/system/devops');
    expect(markdown).toContain('| packages/core/src/orphan.ts |');
    expect(markdown).toContain('| path | file class | applicable control families | score | manual review | blocking signals | road to 100 | named offenses | forbidden remedies | notes |');
    expect(markdown.trim().split('\n').at(-1)).toBe(report.aggregateScore.toFixed(2));
  });

  test('artifact bundle includes full-tree, protocol, framework, and strike-board reports', () => {
    const root = createRepo({
      ...baseRepoFiles(),
      'packages/core/src/orphan.ts': 'export const orphanValue = 1;\n',
    });
    writeSupportArtifacts(root);

    const bundle = buildAuditArtifactBundle({
      root,
      generatedAt: '2026-03-27T12:00:00.000Z',
    });

    expect(bundle.fullTreeAccounting.summary.totalFiles).toBeGreaterThanOrEqual(bundle.codebase.inventoryCount);
    expect(bundle.fullTreeAccounting.summary.scoredFiles).toBe(bundle.codebase.inventoryCount);
    expect(bundle.protocolGap.areas).toHaveLength(5);
    expect(bundle.frameworkBlueprintDelta.capabilities.some((capability) => capability.status === 'absent')).toBe(true);
    expect(bundle.strikeBoard.items.some((item) => item.kind === 'file')).toBe(true);
    expect(bundle.strikeBoard.items.some((item) => item.kind === 'architecture')).toBe(true);
  });
});
