/**
 * doctor — preflight rig-check. Casts environment signals (Node, pnpm,
 * workspace state, build artifacts, git hooks, Playwright browsers) into
 * three named bearings — `ok` / `warn` / `fail` — and resolves to one
 * verdict — `ready` / `caution` / `blocked`. Emits a JSON receipt to
 * stdout; pretty TTY summary to stderr when attached to a terminal.
 *
 * `doctor({ fix: true })` attempts the cheap, local fixes (link git
 * hooks; rebuild stale dist) and re-probes afterwards. The receipt
 * records which fixes ran via the `fixed` array.
 *
 * @module
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { arrow, bearingGlyph, color, colorEnabled, header } from '../lib/ansi.js';
import { spawnArgv, spawnArgvCapture } from '../lib/spawn.js';
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
  /** Whether `doctor --fix` knows how to remediate this check. */
  readonly fixable?: boolean;
}

/** One applied fix, recorded in the receipt. */
export interface DoctorFix {
  readonly id: string;
  readonly action: string;
  readonly status: 'applied' | 'failed';
  readonly detail?: string;
}

/** Receipt shape emitted by `czap doctor`. */
export interface DoctorReceipt {
  readonly status: 'ok' | 'failed';
  readonly command: 'doctor';
  readonly timestamp: string;
  readonly verdict: DoctorVerdict;
  readonly checks: readonly DoctorCheck[];
  readonly fixed?: readonly DoctorFix[];
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
      hint: `Lay in Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org`,
    };
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      id: 'node.version',
      label: 'Node.js',
      status: 'fail',
      detail: `${version} (need >= ${MIN_NODE_MAJOR})`,
      hint: `Lay in Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org`,
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
      hint: `Lay in pnpm ${MIN_PNPM_MAJOR}+: corepack enable && corepack prepare pnpm@latest --activate`,
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
      hint: 'Re-rig pnpm: corepack prepare pnpm@latest --activate',
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
      hint: 'Cast off: pnpm install',
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
      detail: 'dist/ not laid',
      hint: 'Lay the keel with: pnpm run build',
      fixable: true,
    };
  }
  return { id: `${pkg}.built`, label, status: 'ok', detail: 'dist/ laid' };
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
      detail: 'pre-commit hook not rigged',
      hint: 'Rig it: pnpm exec tsx scripts/link-pre-commit.ts',
      fixable: true,
    };
  }
  return { id: 'git.hooks', label: 'git hooks', status: 'ok', detail: 'pre-commit rigged' };
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
      hint: 'Stow the browsers: pnpm install && pnpm exec playwright install',
    };
  }
  return { id: 'playwright.installed', label: 'Playwright', status: 'ok', detail: 'package present' };
}

async function runAllProbes(cwd: string): Promise<readonly DoctorCheck[]> {
  return [
    probeNode(),
    await probePnpm(),
    probeWorkspaceInstalled(cwd),
    probeBuilt(cwd, 'core', '@czap/core build'),
    probeBuilt(cwd, 'cli', '@czap/cli build'),
    probeGitHooks(cwd),
    probePlaywright(cwd),
  ];
}

function aggregate(checks: readonly DoctorCheck[]): DoctorVerdict {
  if (checks.some((c) => c.status === 'fail')) return 'blocked';
  if (checks.some((c) => c.status === 'warn')) return 'caution';
  return 'ready';
}

const VERDICT_SENTENCE: Record<DoctorVerdict, string> = {
  ready: 'Hull check: ready to sail.',
  caution: 'Hull check: caution — non-blocking warnings, but you can cast off.',
  blocked: 'Hull check: blocked — fix the failures before sailing.',
};

const VERDICT_COLOR: Record<DoctorVerdict, 'green' | 'yellow' | 'red'> = {
  ready: 'green',
  caution: 'yellow',
  blocked: 'red',
};

function prettySummary(checks: readonly DoctorCheck[], verdict: DoctorVerdict, fixes?: readonly DoctorFix[]): string {
  const on = colorEnabled();
  const lines: string[] = [];
  lines.push(header('czap doctor — preflight rig check', on));
  lines.push('');
  const widest = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const glyph = bearingGlyph(c.status, on);
    const pad = c.label.padEnd(widest, ' ');
    const detail = c.status === 'ok' ? color('dim', c.detail, on) : c.detail;
    lines.push(`  ${glyph}  ${pad}  ${detail}`);
    if (c.hint && c.status !== 'ok') {
      lines.push(`      ${' '.repeat(widest)}  ${arrow(on)} ${color('dim', c.hint, on)}`);
    }
  }
  if (fixes && fixes.length > 0) {
    lines.push('');
    lines.push(color('cyan', `Applied ${fixes.length} fix(es):`, on));
    for (const f of fixes) {
      const glyph = bearingGlyph(f.status === 'applied' ? 'ok' : 'fail', on);
      lines.push(`  ${glyph}  ${f.id}: ${f.action}${f.detail ? color('dim', `  (${f.detail})`, on) : ''}`);
    }
  }
  lines.push('');
  lines.push(color(VERDICT_COLOR[verdict], VERDICT_SENTENCE[verdict], on));
  return lines.join('\n') + '\n';
}

/** Attempt the cheap, local fixes for whatever checks are fixable. */
async function applyFixes(checks: readonly DoctorCheck[], cwd: string): Promise<readonly DoctorFix[]> {
  const fixes: DoctorFix[] = [];

  // Rebuild stale dist/ — covers both core.built and cli.built in one shot.
  // tsc --build trusts tsbuildinfo more than the filesystem, so invalidate
  // the per-package tsbuildinfo first; otherwise tsc no-ops when dist/ is
  // missing-but-tsbuildinfo-claims-up-to-date.
  const needsBuild = checks.some((c) => (c.id === 'core.built' || c.id === 'cli.built') && c.status === 'warn');
  if (needsBuild) {
    for (const pkg of [
      'core',
      'quantizer',
      'compiler',
      'web',
      'detect',
      'edge',
      'worker',
      'vite',
      'astro',
      'remotion',
      'scene',
      'assets',
      'cli',
      'mcp-server',
    ]) {
      const info = resolve(cwd, `packages/${pkg}/tsconfig.tsbuildinfo`);
      if (existsSync(info)) rmSync(info);
    }
    const r = await spawnArgv('pnpm', ['run', 'build'], { stdio: 'inherit', cwd }).catch(() => ({
      exitCode: 1,
      stderrTail: 'spawn failed',
    }));
    fixes.push({
      id: 'build',
      action: 'pnpm run build (after invalidating tsbuildinfo)',
      status: r.exitCode === 0 ? 'applied' : 'failed',
      detail: r.exitCode === 0 ? undefined : `exit ${r.exitCode}`,
    });
  }

  // Link the pre-commit hook.
  const needsHook = checks.some((c) => c.id === 'git.hooks' && c.status === 'warn');
  if (needsHook) {
    const r = await spawnArgv('pnpm', ['exec', 'tsx', 'scripts/link-pre-commit.ts'], {
      stdio: 'inherit',
      cwd,
    }).catch(() => ({ exitCode: 1, stderrTail: 'spawn failed' }));
    fixes.push({
      id: 'git.hooks',
      action: 'link pre-commit',
      status: r.exitCode === 0 ? 'applied' : 'failed',
      detail: r.exitCode === 0 ? undefined : `exit ${r.exitCode}`,
    });
  }

  return fixes;
}

/**
 * Run all probes, emit a JSON receipt, optionally print a TTY summary.
 *
 * @param opts.pretty - when true, also write a human-readable summary to
 *   stderr. When omitted, pretty output is enabled whenever stderr is a
 *   TTY.
 * @param opts.fix - when true, attempt cheap local remediation (rebuild
 *   stale dist, link missing git hook) and re-probe after.
 * @returns process exit code: 0 unless verdict is `blocked`.
 */
export async function doctor(opts: { pretty?: boolean; fix?: boolean; cwd?: string } = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  let checks = await runAllProbes(cwd);

  let fixes: readonly DoctorFix[] | undefined;
  if (opts.fix) {
    fixes = await applyFixes(checks, cwd);
    if (fixes.length > 0) checks = await runAllProbes(cwd);
  }

  const verdict = aggregate(checks);
  const status: 'ok' | 'failed' = verdict === 'blocked' ? 'failed' : 'ok';

  const receipt: DoctorReceipt = {
    status,
    command: 'doctor',
    timestamp: new Date().toISOString(),
    verdict,
    checks,
    ...(fixes && fixes.length > 0 ? { fixed: fixes } : {}),
  };
  emit(receipt);

  const wantPretty = opts.pretty ?? Boolean(process.stderr.isTTY);
  if (wantPretty) {
    process.stderr.write(prettySummary(checks, verdict, fixes));
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
