/**
 * Drift guard: every command routed by `dispatch.ts` must appear in
 * `describe`'s emitted command list.
 *
 * The bug this regression-tests:
 *   describe.ts's COMMANDS array was hand-maintained and forgot `mcp`,
 *   even though dispatch.ts routes `mcp`. Adding a new top-level case
 *   to dispatch without registering it in describe breaks this test.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '@czap/cli';
import { captureCli } from './cli/capture.js';

/**
 * Source-parse dispatch.ts to extract the top-level `case '<verb>':`
 * entries. This is the single source of truth — anything dispatch
 * routes to must be describable.
 */
function extractDispatchCommands(): readonly string[] {
  const dispatchPath = resolve(__dirname, '../../packages/cli/src/dispatch.ts');
  const source = readFileSync(dispatchPath, 'utf8');
  // Match top-level `case 'verb':` lines inside the run() switch.
  // Excludes nested subcommand `if (sub === '...')` branches.
  const matches = source.matchAll(/^\s{4}case '([a-z][a-z-]*)':/gm);
  return [...matches].map((m) => m[1]!);
}

/**
 * Map a dispatch top-level verb to the prefix(es) we expect to see
 * in describe's command names. Multi-subcommand verbs map to a prefix.
 */
function expectedDescribeNamesFor(verb: string): readonly string[] {
  switch (verb) {
    case 'scene':   return ['scene.compile', 'scene.render', 'scene.verify', 'scene.dev'];
    case 'asset':   return ['asset.analyze', 'asset.verify'];
    case 'capsule': return ['capsule.inspect', 'capsule.verify', 'capsule.list'];
    default:        return [verb]; // describe, gauntlet, mcp — single command
  }
}

describe('cli describe — auto-sync with dispatch', () => {
  it('every dispatch case is described', async () => {
    const { exit, stdout } = await captureCli(() => run(['describe']));
    expect(exit).toBe(0);

    const lastLine = stdout.trim().split('\n').pop()!;
    const receipt = JSON.parse(lastLine) as { commands: ReadonlyArray<{ name: string }> };
    const describedNames = new Set(receipt.commands.map((c) => c.name));

    const verbs = extractDispatchCommands();
    expect(verbs.length).toBeGreaterThan(0); // sanity: parser found something

    for (const verb of verbs) {
      const expected = expectedDescribeNamesFor(verb);
      for (const name of expected) {
        expect(describedNames, `dispatch verb '${verb}' expects describe entry '${name}'`)
          .toSatisfy(() => describedNames.has(name));
      }
    }
  });

  it('regression: mcp is described (was missing)', async () => {
    const { exit, stdout } = await captureCli(() => run(['describe']));
    expect(exit).toBe(0);
    const lastLine = stdout.trim().split('\n').pop()!;
    const receipt = JSON.parse(lastLine) as { commands: ReadonlyArray<{ name: string }> };
    expect(receipt.commands.map((c) => c.name)).toContain('mcp');
  });

  it('regression: mcp appears in --format=mcp tool list', async () => {
    const { exit, stdout } = await captureCli(() => run(['describe', '--format=mcp']));
    expect(exit).toBe(0);
    const manifest = JSON.parse(stdout.trim()) as { tools: ReadonlyArray<{ name: string }> };
    expect(manifest.tools.map((t) => t.name)).toContain('mcp');
  });
});
