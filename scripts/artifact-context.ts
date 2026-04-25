import { randomUUID, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import fg from 'fast-glob';
import { repoRoot, nodeTestInclude } from '../vitest.shared.js';
import { writeTextFile } from './audit/shared.js';
import { DIRECTIVE_BENCH_PAIRS, DIRECTIVE_BENCH_TASKS } from './bench/directive-suite.js';

export interface ArtifactExpectedCounts {
  readonly nodeTestFileCount: number;
  readonly browserTestFileCount: number;
  readonly e2eSpecCount: number;
  readonly benchTaskCount: number;
  readonly benchPairCount: number;
  readonly hardGateCount: number;
  readonly diagnosticCount: number;
}

export interface ArtifactContext {
  readonly schemaVersion: 1;
  readonly gauntletRunId: string;
  readonly generatedAt: string;
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly expectedCounts: ArtifactExpectedCounts;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function hashText(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value));
}

function readPackageJson(root = repoRoot): {
  readonly packageManager?: string;
  readonly devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    readonly packageManager?: string;
    readonly devDependencies?: Record<string, string>;
  };
}

export function buildExpectedCounts(root = repoRoot): ArtifactExpectedCounts {
  const nodeTestFileCount = fg.sync(nodeTestInclude as readonly string[], {
    cwd: root,
    onlyFiles: true,
  }).length;
  const browserTestFileCount = fg.sync(['tests/browser/**/*.test.ts'], {
    cwd: root,
    onlyFiles: true,
  }).length;
  const e2eSpecCount = fg.sync(['tests/e2e/*.e2e.ts'], {
    cwd: root,
    onlyFiles: true,
  }).length;
  const hardGateCount = DIRECTIVE_BENCH_PAIRS.filter((pair) => pair.gate).length;

  return {
    nodeTestFileCount,
    browserTestFileCount,
    e2eSpecCount,
    benchTaskCount: DIRECTIVE_BENCH_TASKS.length,
    benchPairCount: DIRECTIVE_BENCH_PAIRS.length,
    hardGateCount,
    diagnosticCount: DIRECTIVE_BENCH_PAIRS.length - hardGateCount,
  };
}

export function buildSourceFingerprint(root = repoRoot): string {
  const files = fg
    .sync(
      [
        'package.json',
        'pnpm-lock.yaml',
        'vitest.shared.ts',
        'vitest.config.ts',
        'vitest.browser.config.ts',
        'tests/e2e/playwright.config.ts',
        'packages/*/src/**/*.ts',
        'scripts/**/*.ts',
        'tests/**/*.ts',
      ],
      {
        cwd: root,
        absolute: true,
        onlyFiles: true,
        ignore: ['**/*.d.ts', '**/*.js', '**/*.js.map', '**/*.d.ts.map', 'coverage/**', 'reports/**', 'benchmarks/**'],
      },
    )
    .map(normalizePath)
    .sort((left, right) => left.localeCompare(right));

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(normalizePath(relative(root, file)));
    hash.update('\n');
    hash.update(readFileSync(file));
    hash.update('\n');
  }

  return `sha256:${hash.digest('hex')}`;
}

export function buildEnvironmentFingerprint(root = repoRoot): string {
  const packageJson = readPackageJson(root);
  return hashJson({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    packageManager: packageJson.packageManager ?? null,
    dependencies: {
      effect: packageJson.devDependencies?.['effect'] ?? null,
      playwright: packageJson.devDependencies?.['playwright'] ?? null,
      tinybench: packageJson.devDependencies?.['tinybench'] ?? null,
      typescript: packageJson.devDependencies?.['typescript'] ?? null,
      vite: packageJson.devDependencies?.['vite'] ?? null,
      vitest: packageJson.devDependencies?.['vitest'] ?? null,
    },
  });
}

export function buildCurrentArtifactContext(root = repoRoot): Omit<ArtifactContext, 'gauntletRunId' | 'generatedAt'> {
  return {
    schemaVersion: 1,
    sourceFingerprint: buildSourceFingerprint(root),
    environmentFingerprint: buildEnvironmentFingerprint(root),
    expectedCounts: buildExpectedCounts(root),
  };
}

export function readArtifactContext(root = repoRoot): ArtifactContext | null {
  const filePath = resolve(root, 'reports', 'gauntlet-context.json');
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, 'utf8')) as ArtifactContext;
}

export function ensureArtifactContext(
  root = repoRoot,
  options: {
    readonly refresh?: boolean;
  } = {},
): ArtifactContext {
  const current = buildCurrentArtifactContext(root);
  const existing = readArtifactContext(root);
  if (
    !options.refresh &&
    existing &&
    existing.sourceFingerprint === current.sourceFingerprint &&
    existing.environmentFingerprint === current.environmentFingerprint &&
    JSON.stringify(existing.expectedCounts) === JSON.stringify(current.expectedCounts)
  ) {
    return existing;
  }

  const next: ArtifactContext = {
    schemaVersion: 1,
    gauntletRunId: randomUUID(),
    generatedAt: new Date().toISOString(),
    ...current,
  };

  writeTextFile(resolve(root, 'reports', 'gauntlet-context.json'), JSON.stringify(next, null, 2));
  return next;
}
