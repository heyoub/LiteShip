/**
 * doctor — preflight rig-check. Casts environment signals (Node, pnpm,
 * workspace state, build artifacts, git hooks, Playwright browsers) into
 * three named bearings — `ok` / `warn` / `fail` — and resolves to one
 * verdict — `ready` / `caution` / `blocked`. Emits a JSON receipt to
 * stdout; pretty TTY summary to stderr when attached to a terminal.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnArgvCapture } from '../lib/spawn.js';
import { emit } from '../receipts.js';

/** Bearing for a single probe — quantized from a continuous "is it set up?" signal. */
export type DoctorBearing = 'ok' | 'warn' | 'fail';

/** Overall sailing readiness. Aggregates the per-check bearings. */
export type DoctorVerdict = 'ready' | 'caution' | 'blocked';

/** One probe outcome. */
export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: DoctorBearing;
  readonly detail: string;
  readonly hint?: string;
}

/** Receipt shape emitted by `czap doctor`. */
export interface DoctorReceipt {
  readonly status: 'ok' | 'failed';
  readonly command: 'doctor';
  readonly timestamp: string;
  readonly verdict: DoctorVerdict;
  readonly checks: readonly DoctorCheck[];
}

const MIN_NODE_MAJOR = 22;
const MIN_PNPM_MAJOR = 10;

/** Parse `vMAJOR.MINOR.PATCH` (or `MAJOR.MINOR.PATCH`) into a major-version number. */
function parseMajor(version: string): number | null {
  const cleaned = version.trim().replace(/^v/, '');
  const [maj] = cleaned.split('.');
  const n = Number(maj);
  return Number.isFinite(n) ? n : null;
}

function probeNode(): DoctorCheck {
  const version = process.versions.node;
  const major = parseMajor(version);
  if (major === null) {
    return {
      id: 'node.version',
      label: 'Node.js',
      status: 'fail',
      detail: `unrecognized version string: ${version}`,
      hint: `Install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org`,
    };
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      id: 'node.version',
      label: 'Node.js',
      status: 'fail',
      detail: `${version} (need >= ${MIN_NODE_MAJOR})`,
      hint: `Install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org`,
    };
  }
  return { id: 'node.version', label: 'Node.js', status: 'ok', detail: version };
}

async function probePnpm(): Promise<DoctorCheck> {
  const r = await spawnArgvCapture('pnpm', ['--version']).catch(() => null);
  if (!r || r.exitCode !== 0) {
    return {
      id: 'pnpm.version',
      label: 'pnpm',
      status: 'fail',
      detail: 'pnpm not on PATH',
      hint: `Install pnpm ${MIN_PNPM_MAJOR}+: corepack enable && corepack prepare pnpm@latest --activate`,
    };
  }
  const version = r.stdout.trim();
  const major = parseMajor(version);
  if (major === null) {
    return {
      id: 'pnpm.version',
      label: 'pnpm',
      status: 'warn',
      detail: `unrecognized version: ${version}`,
    };
  }
  if (major < MIN_PNPM_MAJOR) {
    return {
      id: 'pnpm.version',
      label: 'pnpm',
      status: 'fail',
      detail: `${version} (need >= ${MIN_PNPM_MAJOR})`,
      hint: 'Upgrade pnpm: corepack prepare pnpm@latest --activate',
    };
  }
  return { id: 'pnpm.version', label: 'pnpm', status: 'ok', detail: version };
}

function probeWorkspaceInstalled(cwd: string): DoctorCheck {
  const modulesYaml = resolve(cwd, 'node_modules/.modules.yaml');
  if (!existsSync(modulesYaml)) {
    return {
      id: 'workspace.installed',
      label: 'workspace install',
      status: 'fail',
      detail: 'node_modules missing or stale',
      hint: 'Run: pnpm install',
    };
  }
  return { id: 'workspace.installed', label: 'workspace install', status: 'ok', detail: 'node_modules present' };
}

function probeBuilt(cwd: string, pkg: string, label: string): DoctorCheck {
  const dist = resolve(cwd, `packages/${pkg}/dist/index.js`);
  if (!existsSync(dist)) {
    return {
      id: `${pkg}.built`,
      label,
      status: 'warn',
      detail: 'dist/ not built',
      hint: 'Run: pnpm run build',
    };
  }
  return { id: `${pkg}.built`, label, status: 'ok', detail: 'dist/ present' };
}

function probeGitHooks(cwd: string): DoctorCheck {
  const gitDir = resolve(cwd, '.git');
  if (!existsSync(gitDir)) {
    return { id: 'git.hooks', label: 'git hooks', status: 'ok', detail: 'no .git (not a worktree)' };
  }
  const hook = resolve(cwd, '.git/hooks/pre-commit');
  if (!existsSync(hook)) {
    return {
      id: 'git.hooks',
      label: 'git hooks',
      status: 'warn',
      detail: 'pre-commit hook not linked',
      hint: 'Run: pnpm exec tsx scripts/link-pre-commit.ts',
    };
  }
  return { id: 'git.hooks', label: 'git hooks', status: 'ok', detail: 'pre-commit linked' };
}

function probePlaywright(cwd: string): DoctorCheck {
  // Playwright stashes browser binaries under ms-playwright/. We probe the
  // package.json + node_modules path rather than running playwright itself
  // to avoid a slow subprocess on every doctor call.
  const pwPkg = resolve(cwd, 'node_modules/@playwright/test/package.json');
  if (!existsSync(pwPkg)) {
    return {
      id: 'playwright.installed',
      label: 'Playwright',
      status: 'warn',
      detail: '@playwright/test not in node_modules (e2e tests will not run)',
      hint: 'Run: pnpm install && pnpm exec playwright install',
    };
  }
  return { id: 'playwright.installed', label: 'Playwright', status: 'ok', detail: 'package present' };
}

function aggregate(checks: readonly DoctorCheck[]): DoctorVerdict {
  if (checks.some((c) => c.status === 'fail')) return 'blocked';
  if (checks.some((c) => c.status === 'warn')) return 'caution';
  return 'ready';
}

const BEARING_GLYPH: Record<DoctorBearing, string> = {
  ok: 'OK  ',
  warn: 'WARN',
  fail: 'FAIL',
};

const VERDICT_SENTENCE: Record<DoctorVerdict, string> = {
  ready: 'Hull check: ready to sail.',
  caution: 'Hull check: caution — non-blocking warnings.',
  blocked: 'Hull check: blocked — fix the failures before sailing.',
};

function prettySummary(checks: readonly DoctorCheck[], verdict: DoctorVerdict): string {
  const lines: string[] = [];
  lines.push('czap doctor — preflight rig check');
  lines.push('');
  const widest = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const pad = c.label.padEnd(widest, ' ');
    lines.push(`  [${BEARING_GLYPH[c.status]}] ${pad}  ${c.detail}`);
    if (c.hint && c.status !== 'ok') {
      lines.push(`            ${' '.repeat(widest)}  -> ${c.hint}`);
    }
  }
  lines.push('');
  lines.push(VERDICT_SENTENCE[verdict]);
  return lines.join('\n') + '\n';
}

/**
 * Run all probes, emit a JSON receipt, optionally print a TTY summary.
 *
 * @param opts.pretty - when true, also write a human-readable summary to
 *   stderr. When omitted, pretty output is enabled whenever stderr is a
 *   TTY.
 * @returns process exit code: 0 unless verdict is `blocked`.
 */
export async function doctor(opts: { pretty?: boolean; cwd?: string } = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const checks: readonly DoctorCheck[] = [
    probeNode(),
    await probePnpm(),
    probeWorkspaceInstalled(cwd),
    probeBuilt(cwd, 'core', '@czap/core build'),
    probeBuilt(cwd, 'cli', '@czap/cli build'),
    probeGitHooks(cwd),
    probePlaywright(cwd),
  ];
  const verdict = aggregate(checks);
  const status: 'ok' | 'failed' = verdict === 'blocked' ? 'failed' : 'ok';

  const receipt: DoctorReceipt = {
    status,
    command: 'doctor',
    timestamp: new Date().toISOString(),
    verdict,
    checks,
  };
  emit(receipt);

  const wantPretty = opts.pretty ?? Boolean(process.stderr.isTTY);
  if (wantPretty) {
    process.stderr.write(prettySummary(checks, verdict));
  }

  return verdict === 'blocked' ? 1 : 0;
}

/** Read the @czap/cli package version off disk. Used by `czap version`. */
export function readCliVersion(cwd: string = process.cwd()): string {
  const candidates = [resolve(cwd, 'packages/cli/package.json'), resolve(cwd, 'package.json')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { name?: string; version?: string };
    if (pkg.name === '@czap/cli' && typeof pkg.version === 'string') return pkg.version;
  }
  return '0.0.0-unknown';
}
