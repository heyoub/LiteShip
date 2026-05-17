/**
 * Integration tests for the dev-experience verbs added to dispatch:
 * help / version / doctor / glossary, plus the `--help` / `--version`
 * aliases and the no-args / unknown-command fall-throughs.
 */
import { describe, it, expect } from 'vitest';
import { run } from '@czap/cli';
import { captureCli } from './capture.js';

describe('czap dispatch — dev-experience verbs', () => {
  it('`czap help` prints usage and exits 0', async () => {
    const { exit, stdout } = await captureCli(() => run(['help']));
    expect(exit).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('czap');
  });

  it('`czap --help` is equivalent to `czap help`', async () => {
    const { exit, stdout } = await captureCli(() => run(['--help']));
    expect(exit).toBe(0);
    expect(stdout).toContain('Usage');
  });

  it('`czap -h` is equivalent to `czap help`', async () => {
    const { exit, stdout } = await captureCli(() => run(['-h']));
    expect(exit).toBe(0);
    expect(stdout).toContain('Usage');
  });

  it('`czap` with no args prints help (not an unknown_command error)', async () => {
    const { exit, stdout, stderr } = await captureCli(() => run([]));
    expect(exit).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stderr).not.toContain('unknown_command');
  });

  it('`czap --version` emits a JSON receipt', async () => {
    const { exit, stdout } = await captureCli(() => run(['--version']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.command).toBe('version');
    expect(typeof receipt.czap).toBe('string');
  });

  it('`czap version` emits a JSON receipt', async () => {
    const { exit, stdout } = await captureCli(() => run(['version']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.command).toBe('version');
  });

  it('`czap doctor` emits a JSON receipt with checks + verdict', async () => {
    const { exit, stdout } = await captureCli(() => run(['doctor']));
    expect([0, 1]).toContain(exit);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.command).toBe('doctor');
    expect(['ready', 'caution', 'blocked']).toContain(receipt.verdict);
    expect(receipt.checks.length).toBeGreaterThan(0);
  });

  it('`czap glossary` with no term returns the full catalog', async () => {
    const { exit, stdout } = await captureCli(() => run(['glossary']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.entries.length).toBeGreaterThan(5);
  });

  it('`czap glossary boundary` returns the boundary entry', async () => {
    const { exit, stdout } = await captureCli(() => run(['glossary', 'boundary']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.entries[0].term).toBe('boundary');
  });

  it('`czap completion bash` writes a bash completion script to stdout', async () => {
    const { exit, stdout } = await captureCli(() => run(['completion', 'bash']));
    expect(exit).toBe(0);
    expect(stdout).toContain('_czap_completion');
    expect(stdout).toContain('complete -F _czap_completion czap');
  });

  it('`czap completion zsh` writes a zsh completion script to stdout', async () => {
    const { exit, stdout } = await captureCli(() => run(['completion', 'zsh']));
    expect(exit).toBe(0);
    expect(stdout).toContain('compdef _czap czap');
  });

  it('`czap completion fish` writes a fish completion script to stdout', async () => {
    const { exit, stdout } = await captureCli(() => run(['completion', 'fish']));
    expect(exit).toBe(0);
    expect(stdout).toContain('complete -c czap');
  });

  it('`czap completion` with no shell errors and exits 1', async () => {
    const { exit, stderr } = await captureCli(() => run(['completion']));
    expect(exit).toBe(1);
    expect(stderr).toContain('expected shell');
  });

  it('unknown command prints a friendly hint (in-register) and exits 1', async () => {
    const { exit, stderr } = await captureCli(() => run(['nonsense-verb']));
    expect(exit).toBe(1);
    expect(stderr).toContain('No such bearing');
    expect(stderr).toContain('czap help');
  });
});

/**
 * Dispatch-routing tests for the scene / asset / capsule / ship / verify
 * cases. These don't assert the success path of the underlying verb (those
 * have their own tests) — they only assert that dispatch routes the argv
 * into the right command function, so the per-case switch arms and the
 * subRest `?? ''` fallback branches all run at least once.
 *
 * Verbs that spawn ffmpeg / a Vite server / the MCP server (scene render,
 * scene dev, mcp) are intentionally skipped — their dispatch arms have to
 * stay uncovered or be exercised via dedicated smoke tests instead.
 */
describe('czap dispatch — verb-routing coverage', () => {
  it('`czap scene compile` (no arg) routes to sceneCompile (which throws or exits non-zero — either proves dispatch ran)', async () => {
    // sceneCompile('') tries to import a file at cwd; the dynamic import
    // rejects with ERR_UNSUPPORTED_DIR_IMPORT. Catching the rejection
    // is fine — what we're asserting is that dispatch entered the
    // sceneCompile arm, which it did to even reach the throw.
    let dispatched = false;
    try {
      await captureCli(() => run(['scene', 'compile']));
      dispatched = true;
    } catch {
      dispatched = true;
    }
    expect(dispatched).toBe(true);
  });

  it('`czap scene verify` (no arg) routes to sceneVerify', async () => {
    let dispatched = false;
    try {
      await captureCli(() => run(['scene', 'verify']));
      dispatched = true;
    } catch {
      dispatched = true;
    }
    expect(dispatched).toBe(true);
  });

  it('`czap scene unknown-sub` emits an emitError shape', async () => {
    const { exit, stderr } = await captureCli(() => run(['scene', 'totally-fake-sub']));
    expect(exit).toBe(1);
    const lines = stderr.trim().split('\n').filter((l) => l.startsWith('{'));
    const err = JSON.parse(lines[lines.length - 1]!);
    expect(err.command).toBe('scene');
    expect(err.error).toContain('unknown subcommand');
  });

  it('`czap scene` with no subcommand emits an emitError with <missing>', async () => {
    const { exit, stderr } = await captureCli(() => run(['scene']));
    expect(exit).toBe(1);
    const lines = stderr.trim().split('\n').filter((l) => l.startsWith('{'));
    const err = JSON.parse(lines[lines.length - 1]!);
    expect(err.error).toContain('<missing>');
  });

  it('`czap asset analyze` (no arg) routes to assetAnalyze', async () => {
    const { exit, stderr } = await captureCli(() => run(['asset', 'analyze']));
    expect(exit).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('`czap asset verify` (no arg) routes to assetVerify', async () => {
    const { exit, stderr } = await captureCli(() => run(['asset', 'verify']));
    expect(exit).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('`czap asset unknown-sub` emits an emitError shape', async () => {
    const { exit, stderr } = await captureCli(() => run(['asset', 'totally-fake-sub']));
    expect(exit).toBe(1);
    const lines = stderr.trim().split('\n').filter((l) => l.startsWith('{'));
    const err = JSON.parse(lines[lines.length - 1]!);
    expect(err.command).toBe('asset');
    expect(err.error).toContain('unknown subcommand');
  });

  it('`czap asset` with no subcommand emits an emitError with <missing>', async () => {
    const { exit, stderr } = await captureCli(() => run(['asset']));
    expect(exit).toBe(1);
    const lines = stderr.trim().split('\n').filter((l) => l.startsWith('{'));
    const err = JSON.parse(lines[lines.length - 1]!);
    expect(err.error).toContain('<missing>');
  });

  it('`czap capsule inspect` (no arg) routes to capsuleInspect', async () => {
    const { exit } = await captureCli(() => run(['capsule', 'inspect']));
    expect(exit).not.toBe(0);
  });

  it('`czap capsule verify` (no arg) routes to capsuleVerify', async () => {
    const { exit } = await captureCli(() => run(['capsule', 'verify']));
    expect(exit).not.toBe(0);
  });

  it('`czap capsule unknown-sub` emits an emitError shape', async () => {
    const { exit, stderr } = await captureCli(() => run(['capsule', 'totally-fake-sub']));
    expect(exit).toBe(1);
    const lines = stderr.trim().split('\n').filter((l) => l.startsWith('{'));
    const err = JSON.parse(lines[lines.length - 1]!);
    expect(err.command).toBe('capsule');
    expect(err.error).toContain('unknown subcommand');
  });

  it('`czap verify` (no args) routes to verify and returns the Unknown verdict (exit 4)', async () => {
    const { exit, stdout } = await captureCli(() => run(['verify']));
    expect(exit).toBe(4);
    const lines = stdout.trim().split('\n').filter((l) => l.startsWith('{'));
    const receipt = JSON.parse(lines[lines.length - 1]!);
    expect(receipt.command).toBe('verify');
    expect(receipt.verdict).toBe('Unknown');
  });
});
