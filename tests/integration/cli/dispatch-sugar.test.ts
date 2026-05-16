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

  it('unknown command prints a friendly hint and exits 1', async () => {
    const { exit, stderr } = await captureCli(() => run(['nonsense-verb']));
    expect(exit).toBe(1);
    expect(stderr).toContain('Unknown command');
    expect(stderr).toContain('czap help');
  });
});
