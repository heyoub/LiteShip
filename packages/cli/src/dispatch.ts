/**
 * CLI dispatch entry — accepts argv, emits a JSON receipt to stdout,
 * returns a process exit code.
 *
 * @module
 */

import { describe as describeCmd } from './commands/describe.js';
import { sceneCompile } from './commands/scene-compile.js';
import { sceneDev } from './commands/scene-dev.js';
import { sceneRender } from './commands/scene-render.js';
import { sceneVerify } from './commands/scene-verify.js';
import { assetAnalyze } from './commands/asset-analyze.js';
import { assetVerify } from './commands/asset-verify.js';
import { capsuleInspect, capsuleList, capsuleVerify } from './commands/capsule.js';
import { gauntlet } from './commands/gauntlet.js';
import { emitError } from './receipts.js';

/** Run the CLI with the given argv slice. Returns a process exit code. */
export async function run(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'describe': {
      const format = parseFlag(rest, '--format') as 'json' | 'mcp' | undefined;
      process.stdout.write(JSON.stringify(describeCmd({ format })) + '\n');
      return 0;
    }
    case 'scene': {
      const [sub, ...subRest] = rest;
      if (sub === 'compile') return sceneCompile(subRest[0] ?? '');
      if (sub === 'dev') return sceneDev(subRest[0] ?? '');
      if (sub === 'render') {
        const scene = subRest[0] ?? '';
        const outputIdx = subRest.indexOf('-o');
        const outputDirect = outputIdx >= 0 ? subRest[outputIdx + 1] ?? '' : undefined;
        const outputFlag = parseFlag(subRest, '--output');
        const force = subRest.includes('--force');
        return sceneRender(scene, outputDirect ?? outputFlag ?? '', force);
      }
      if (sub === 'verify') return sceneVerify(subRest[0] ?? '');
      emitError('scene', `unknown subcommand: ${sub ?? '<missing>'}`);
      return 1;
    }
    case 'asset': {
      const [sub, ...subRest] = rest;
      if (sub === 'analyze') {
        const id = subRest[0] ?? '';
        const projection = parseFlag(subRest, '--projection') as 'beat' | 'onset' | 'waveform' | undefined;
        if (!projection) { emitError('asset.analyze', 'missing --projection'); return 1; }
        const force = subRest.includes('--force');
        return assetAnalyze(id, projection, force);
      }
      if (sub === 'verify') return assetVerify(subRest[0] ?? '');
      emitError('asset', `unknown subcommand: ${sub ?? '<missing>'}`);
      return 1;
    }
    case 'capsule': {
      const [sub, ...subRest] = rest;
      if (sub === 'inspect') return capsuleInspect(subRest[0] ?? '');
      if (sub === 'verify') return capsuleVerify(subRest[0] ?? '');
      if (sub === 'list') return capsuleList(parseFlag(subRest, '--kind'));
      emitError('capsule', `unknown subcommand: ${sub ?? '<missing>'}`);
      return 1;
    }
    case 'gauntlet': {
      return gauntlet(rest.includes('--dry-run'));
    }
    case 'mcp': {
      const { start } = await import('@czap/mcp-server');
      const httpFlag = parseFlag(rest, '--http');
      await start(httpFlag !== undefined ? { http: httpFlag } : {});
      return 0;
    }
    default:
      process.stderr.write(JSON.stringify({ error: 'unknown_command', command: cmd }) + '\n');
      return 1;
  }
}

/** Parse a `--flag=value` style option out of the argv tail. Returns undefined if absent. */
function parseFlag(argv: readonly string[], flag: string): string | undefined {
  for (const a of argv) {
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return undefined;
}
