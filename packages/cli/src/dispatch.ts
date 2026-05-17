/**
 * CLI dispatch entry — accepts argv, emits a JSON receipt to stdout,
 * returns a process exit code.
 *
 * @module
 */

import { completion } from './commands/completion.js';
import { describe as describeCmd } from './commands/describe.js';
import { doctor } from './commands/doctor.js';
import { glossary } from './commands/glossary.js';
import { help } from './commands/help.js';
import { color, colorEnabled } from './lib/ansi.js';
import { sceneCompile } from './commands/scene-compile.js';
import { sceneDev } from './commands/scene-dev.js';
import { sceneRender } from './commands/scene-render.js';
import { sceneVerify } from './commands/scene-verify.js';
import { assetAnalyze } from './commands/asset-analyze.js';
import { assetVerify } from './commands/asset-verify.js';
import { capsuleInspect, capsuleList, capsuleVerify } from './commands/capsule.js';
import { gauntlet } from './commands/gauntlet.js';
import { ship } from './commands/ship.js';
import { verify } from './commands/ship-verify.js';
import { version } from './commands/version.js';
import { emitError } from './receipts.js';

/** Run the CLI with the given argv slice. Returns a process exit code. */
export async function run(argv: readonly string[]): Promise<number> {
  const [rawCmd, ...rest] = argv;
  const cmd = normalizeTopLevel(rawCmd);

  switch (cmd) {
    case 'help':
      return help();
    case 'version':
      return version();
    case 'doctor':
      return doctor({ fix: rest.includes('--fix'), ci: rest.includes('--ci') });
    case 'glossary': {
      const term = rest[0] && !rest[0].startsWith('-') ? rest[0] : null;
      return glossary(term);
    }
    case 'completion': {
      return completion(rest[0]);
    }
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
        const outputDirect = outputIdx >= 0 ? (subRest[outputIdx + 1] ?? '') : undefined;
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
        if (!projection) {
          emitError('asset.analyze', 'missing --projection');
          return 1;
        }
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
    case 'ship': {
      return ship(rest);
    }
    case 'verify': {
      return verify(rest);
    }
    case 'mcp': {
      const { start } = await import('@czap/mcp-server');
      const httpFlag = parseFlag(rest, '--http');
      await start(httpFlag !== undefined ? { http: httpFlag } : {});
      return 0;
    }
    default: {
      // No command + no flags: friendly help on stdout, exit 0.
      if (rawCmd === undefined) return help();
      // Friendly text first; structured JSON envelope last so machine
      // consumers can read it as the trailing line of stderr.
      const on = colorEnabled();
      process.stderr.write(
        `${color('red', 'No such bearing:', on)} \`${rawCmd}\`.\nTry \`${color('cyan', 'czap help', on)}\` for the chart.\n`,
      );
      process.stderr.write(JSON.stringify({ error: 'unknown_command', command: rawCmd }) + '\n');
      return 1;
    }
  }
}

/**
 * Normalize top-level argv[0]. Standard help/version flags fold into
 * their verb counterparts so `czap --help` and `czap -h` behave like
 * `czap help`. Returns the input unchanged otherwise.
 */
function normalizeTopLevel(raw: string | undefined): string | undefined {
  if (raw === '--help' || raw === '-h') return 'help';
  if (raw === '--version' || raw === '-V' || raw === '-v') return 'version';
  return raw;
}

/** Parse a `--flag=value` style option out of the argv tail. Returns undefined if absent. */
function parseFlag(argv: readonly string[], flag: string): string | undefined {
  for (const a of argv) {
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return undefined;
}
