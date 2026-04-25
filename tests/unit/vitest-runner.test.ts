/**
 * Tests for the cli.vitest-runner capsule (no-shell test execution).
 *
 * Two contracts under test:
 *  1. Argv-form: paths are passed as discrete argv elements, never
 *     interpolated into a shell string. Verified by feeding a path
 *     containing shell metacharacters and confirming nothing
 *     downstream of the spawn ever shell-parsed it.
 *  2. Exit-code propagation: nonzero subprocess exit becomes nonzero
 *     in the typed Output.
 *
 * These tests spawn `pnpm exec vitest run` for real — they are slow
 * (each invocation ~5-15s) but they exercise the full kernel.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { VitestRunner, vitestRunnerCapsule } from '../../packages/cli/src/capsules/vitest-runner.js';

describe('VitestRunner', () => {
  it('returns nonzero exit when no tests match', { timeout: 60_000 }, async () => {
    const result = await VitestRunner.run({
      testFiles: ['tests/__nonexistent_for_runner_test__.test.ts'],
    });
    // vitest exits non-zero when it can't find test files
    expect(result.exitCode).not.toBe(0);
    expect(result.testFiles).toEqual(['tests/__nonexistent_for_runner_test__.test.ts']);
  });

  it('does not interpret shell metacharacters in paths (argv form)', { timeout: 60_000 }, async () => {
    // Path containing shell metacharacters. If VitestRunner were using
    // shell interpolation (e.g. `execSync('vitest run ' + path)`), the
    // sentinel sequence `; echo should-not-execute` would fork a second
    // command. With shell:false + argv form, the metacharacters round-
    // trip as literal bytes — they end up inside vitest's own filter
    // diagnostic, not in a separate command's stdout.
    //
    // The proof: vitest's "No test files found" diagnostic prints the
    // filter list it received. The sentinel string appears there
    // (because vitest received it as filter input), but never as the
    // result of `echo` running as a forked shell command. We assert the
    // diagnostic shape — "No test files found" — to confirm vitest got
    // the metacharacter sequence as an argv token rather than the
    // metacharacter terminating vitest's command line.
    const danger = 'tests/__nonexistent__; echo should-not-execute';
    const result = await VitestRunner.run({ testFiles: [danger] });
    expect(result.exitCode).not.toBe(0);
    // Vitest's "no test files found" path proves vitest itself ran and
    // received the literal filter — i.e. the shell did NOT split on `;`
    // and run `echo` as an independent process.
    expect(result.stderrTail).toMatch(/no test files found/i);
  });

  it('exposes the capsule declaration at cli.vitest-runner', () => {
    // The declaration is what the type-directed detector picks up for
    // reports/capsule-manifest.json. Smoke-check the surface so a name
    // rename or kind drift fails this test before it desynchronizes
    // the manifest.
    expect(vitestRunnerCapsule._kind).toBe('receiptedMutation');
    expect(vitestRunnerCapsule.name).toBe('cli.vitest-runner');
    expect(vitestRunnerCapsule.site).toEqual(['node']);
    expect(vitestRunnerCapsule.invariants.map((i) => i.name)).toContain('shell-disabled');
    expect(vitestRunnerCapsule.invariants.map((i) => i.name)).toContain('exit-code-propagated');
  });

  it('vitestRunnerCapsule invariants validate canonical input/output and reject malformed', () => {
    const inv = new Map(vitestRunnerCapsule.invariants.map((i) => [i.name, i]));
    const goodInput = { testFiles: ['a.ts', 'b.ts'] };
    const goodOutput = { exitCode: 0, testFiles: ['a.ts', 'b.ts'], stderrTail: '' };

    // shell-disabled is structurally true.
    expect(inv.get('shell-disabled')!.check(goodInput, goodOutput)).toBe(true);

    // exit-code-propagated: number → ok, string → fail.
    expect(inv.get('exit-code-propagated')!.check(goodInput, goodOutput)).toBe(true);
    expect(
      inv.get('exit-code-propagated')!.check(goodInput, { ...goodOutput, exitCode: 'oops' as unknown as number }),
    ).toBe(false);

    // test-files-echoed: same files in same order → ok; reordered → fail; trimmed → fail.
    expect(inv.get('test-files-echoed')!.check(goodInput, goodOutput)).toBe(true);
    expect(
      inv.get('test-files-echoed')!.check(goodInput, { ...goodOutput, testFiles: ['b.ts', 'a.ts'] }),
    ).toBe(false);
    expect(
      inv.get('test-files-echoed')!.check(goodInput, { ...goodOutput, testFiles: ['a.ts'] }),
    ).toBe(false);
  });
});
