/**
 * Pnpm-specific re-export shim.
 *
 * Historically held its own copy of quoteWindowsArg + spawn helpers; that
 * implementation now lives at scripts/lib/spawn.ts. This file keeps
 * `runPnpm` / `spawnPnpm` for callers that pre-pend the `pnpm` command, and
 * re-exports `quoteWindowsArg` for the drift-guard test.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import { quoteWindowsArg } from '../lib/spawn.js';

export { quoteWindowsArg };

export interface PnpmRunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PnpmRunOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

function getPnpmCommand(args: readonly string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command: 'pnpm', args: [...args] };
  }
  const commandLine = ['pnpm', ...args].map(quoteWindowsArg).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
}

export function runPnpm(args: readonly string[], options: PnpmRunOptions): Promise<PnpmRunResult> {
  const { command, args: commandArgs } = getPnpmCommand(args);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function spawnPnpm(
  args: readonly string[],
  options: PnpmRunOptions & { readonly stdio?: 'inherit' | 'pipe' },
) {
  const { command, args: commandArgs } = getPnpmCommand(args);
  return spawn(command, commandArgs, {
    cwd: options.cwd,
    shell: false,
    stdio: options.stdio ?? 'inherit',
    env: { ...process.env, ...options.env },
  });
}
