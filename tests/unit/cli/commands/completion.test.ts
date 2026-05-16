/**
 * Unit tests for `czap completion`. Catches drift between the verb
 * list in dispatch.ts and the static list shipped to shells.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  completion,
  SUBCOMMANDS,
  TOP_LEVEL_VERBS,
} from '../../../../packages/cli/src/commands/completion.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('completion command', () => {
  it('emits a bash script with every top-level verb listed', async () => {
    const { exit, stdout } = await captureCli(async () => completion('bash'));
    expect(exit).toBe(0);
    for (const v of TOP_LEVEL_VERBS) {
      expect(stdout).toContain(v);
    }
    expect(stdout).toContain('_czap_completion');
  });

  it('emits a zsh script with `compdef _czap czap`', async () => {
    const { exit, stdout } = await captureCli(async () => completion('zsh'));
    expect(exit).toBe(0);
    expect(stdout).toContain('compdef _czap czap');
    for (const v of TOP_LEVEL_VERBS) {
      expect(stdout).toContain(v);
    }
  });

  it('emits a fish script with one complete line per verb and per subcommand', async () => {
    const { exit, stdout } = await captureCli(async () => completion('fish'));
    expect(exit).toBe(0);
    for (const v of TOP_LEVEL_VERBS) {
      expect(stdout).toContain(`__fish_use_subcommand' -a '${v}'`);
    }
    for (const [verb, subs] of Object.entries(SUBCOMMANDS)) {
      for (const s of subs) {
        expect(stdout).toContain(`__fish_seen_subcommand_from ${verb}' -a '${s}'`);
      }
    }
  });

  it('rejects unknown shells with exit 1', async () => {
    const { exit, stderr } = await captureCli(async () => completion('powershell'));
    expect(exit).toBe(1);
    expect(stderr).toContain('expected shell');
  });

  it('rejects missing shell with exit 1', async () => {
    const { exit, stderr } = await captureCli(async () => completion(undefined));
    expect(exit).toBe(1);
    expect(stderr).toContain('expected shell');
  });

  // Drift guard: every verb routed by dispatch.ts must appear in
  // TOP_LEVEL_VERBS so the completion script stays current. Source-parses
  // dispatch.ts the same way describe-auto-sync does.
  it('drift: every dispatch case is in TOP_LEVEL_VERBS', () => {
    const dispatchPath = resolve(__dirname, '../../../../packages/cli/src/dispatch.ts');
    const source = readFileSync(dispatchPath, 'utf8');
    const matches = source.matchAll(/^\s{4}case '([a-z][a-z-]*)':/gm);
    const dispatchVerbs = [...matches].map((m) => m[1]!);
    for (const v of dispatchVerbs) {
      expect(TOP_LEVEL_VERBS, `dispatch verb '${v}' missing from TOP_LEVEL_VERBS`).toContain(v);
    }
  });
});
