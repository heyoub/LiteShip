/**
 * Canonical cross-platform subprocess helper. Owns:
 *   - Windows cmd.exe wrapper for resolving .cmd/.bat shims (pnpm, tsx, etc.)
 *     without enabling shell metacharacter interpretation.
 *   - Bounded stderr ring buffer.
 *   - Idempotent dispose (SIGINT → 2s grace → SIGKILL).
 *   - withSpawned try/finally lifecycle for tests.
 *
 * The helper deliberately does not pass an `env` field to `child_process.spawn`,
 * so children inherit `process.env` — including `NODE_V8_COVERAGE` set by
 * coverage:node:tracked. This is what makes subprocess coverage capture
 * automatic. A drift-guard test (tests/unit/meta/spawn-coverage-inheritance.test.ts)
 * fails CI if any future commit adds an env override.
 *
 * Lives in @czap/cli because it imports `node:child_process` and must be part
 * of the cli's tsc --build (rootDir) tree. `scripts/lib/spawn.ts` is a thin
 * re-export so existing scripts/tests keep their import paths.
 *
 * @module
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';

/** Result of a one-shot spawnArgv invocation. */
export interface SpawnResult {
  readonly exitCode: number;
  readonly stderrTail: string;
}

/** Options for spawnArgv / withSpawned. */
export interface SpawnArgvOpts {
  /** Maximum stderr bytes retained in the returned tail. Defaults to 16 KiB. */
  readonly stderrCapBytes?: number;
  /** Override stdio. Defaults to ['ignore', 'inherit', 'pipe']. */
  readonly stdio?: 'inherit' | 'pipe' | readonly ('ignore' | 'inherit' | 'pipe')[];
}

/** Live handle on a running spawn — used by withSpawned. */
export interface SpawnHandle {
  readonly pid: number;
  readonly child: ChildProcess;
  /** Read stdout as a string stream. Only present when stdio[1] is 'pipe'. */
  readline(): AsyncIterableIterator<string>;
  /** Drain any retained stderr bytes accumulated so far. */
  readonly stderrTail: () => string;
  /** Idempotent disposal. SIGINT → 2s grace → SIGKILL. No-op if already dead. */
  dispose(): Promise<void>;
}

/**
 * Quote a single argv token for safe inclusion in a Windows cmd.exe command
 * line. Tokens with no special characters round-trip as-is; everything else
 * is double-quoted with internal quotes backslash-escaped. Keeps shell
 * metacharacters (`;`, `&`, `|`, `<`, `>`, `^`, `(`, `)`) inside a quoted
 * string so cmd.exe treats them as literal bytes.
 *
 * Re-exported by packages/cli/src/spawn-helpers.ts and
 * scripts/support/pnpm-process.ts; tests/unit/spawn-quoting-drift.test.ts
 * enforces byte-equivalence across all three call sites.
 */
export function quoteWindowsArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[\s"&|<>^();]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Resolve a (command, args) pair into a launcher invocation that does NOT
 * enable shell interpretation but still finds .cmd / .bat shims on Windows.
 * On POSIX this is identity.
 */
function resolveLauncher(
  command: string,
  args: readonly string[],
): { command: string; args: readonly string[] } {
  if (process.platform !== 'win32') {
    return { command, args };
  }
  const commandLine = [command, ...args].map(quoteWindowsArg).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
}

/**
 * Run a subprocess with an argv array (`shell: false`). stderr is captured
 * with a bounded ring buffer; stdout inherits the parent. Resolves once the
 * subprocess exits — never throws on nonzero exit (callers branch on
 * `exitCode`).
 */
export function spawnArgv(
  command: string,
  args: readonly string[],
  opts: SpawnArgvOpts = {},
): Promise<SpawnResult> {
  const cap = opts.stderrCapBytes ?? 16_384;
  const launcher = resolveLauncher(command, args);
  return new Promise((resolvePromise, rejectPromise) => {
    const stdio = (opts.stdio ?? ['ignore', 'inherit', 'pipe']) as ('ignore' | 'inherit' | 'pipe')[];
    const proc = spawn(launcher.command, launcher.args as string[], {
      stdio,
      shell: false,
      // On Windows the cmd.exe launcher needs verbatim args so Node doesn't
      // re-escape the command tail and break exit-code propagation.
      windowsVerbatimArguments: process.platform === 'win32',
      // CRITICAL: do not set `env` — children must inherit NODE_V8_COVERAGE.
    });
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > cap && stderrChunks.length > 1) {
        const head = stderrChunks.shift();
        if (head) stderrBytes -= head.length;
      }
    });
    proc.on('error', rejectPromise);
    proc.on('close', (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stderrTail: Buffer.concat(stderrChunks as unknown as Uint8Array[]).toString('utf8'),
      });
    });
  });
}

/**
 * Lifecycle-managed spawn for tests. Spawns, runs the callback, disposes the
 * child in `finally` (idempotent: SIGINT → 2s grace → SIGKILL → no-op).
 *
 * Tests never write `try/finally proc.kill()` themselves — a single
 * implementation handles cleanup uniformly on Linux and Windows.
 */
export async function withSpawned<T>(
  command: string,
  args: readonly string[],
  fn: (handle: SpawnHandle) => Promise<T>,
  opts: SpawnArgvOpts = {},
): Promise<T> {
  const handle = startSpawn(command, args, opts);
  try {
    return await fn(handle);
  } finally {
    await handle.dispose();
  }
}

/**
 * Start a long-lived subprocess and return a live handle. Caller owns
 * disposal. Used by `withSpawned` (auto-disposes in finally) and by
 * Vitest browser commands that need to keep the child alive across
 * multiple browser-side calls.
 */
export function startSpawnHandle(
  command: string,
  args: readonly string[],
  opts: SpawnArgvOpts = {},
): SpawnHandle {
  return startSpawn(command, args, opts);
}

function startSpawn(
  command: string,
  args: readonly string[],
  opts: SpawnArgvOpts,
): SpawnHandle {
  const cap = opts.stderrCapBytes ?? 16_384;
  const launcher = resolveLauncher(command, args);
  const stdio = (opts.stdio ?? ['ignore', 'pipe', 'pipe']) as ('ignore' | 'inherit' | 'pipe')[];
  const child = spawn(launcher.command, launcher.args as string[], {
    stdio,
    shell: false,
    // On Windows the cmd.exe launcher needs verbatim args; see spawnArgv.
    windowsVerbatimArguments: process.platform === 'win32',
    // CRITICAL: do not set `env` — see comment in spawnArgv.
  });
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
    stderrBytes += chunk.length;
    while (stderrBytes > cap && stderrChunks.length > 1) {
      const head = stderrChunks.shift();
      if (head) stderrBytes -= head.length;
    }
  });

  let disposed = false;

  return {
    pid: child.pid ?? 0,
    child,
    async *readline() {
      if (!child.stdout) return;
      let buf = '';
      for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
          yield buf.slice(0, nl);
          buf = buf.slice(nl + 1);
        }
      }
      if (buf.length > 0) yield buf;
    },
    stderrTail: () => Buffer.concat(stderrChunks as unknown as Uint8Array[]).toString('utf8'),
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === 'win32') {
        // Windows has no real signals: child.kill() is TerminateProcess on the
        // *immediate* child only. Our immediate child is the cmd.exe launcher,
        // so child.kill() leaves grandchildren (pnpm → tsx → node → vite dev
        // server) running as orphans, holding ports and file handles. Walk
        // the tree with taskkill /T /F — same approach scripts/gauntlet.ts
        // uses for the same reason. /F is acceptable here: the SIGINT-grace
        // path was already a lie on Windows (no signal was ever delivered).
        if (child.pid !== undefined) {
          try {
            execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' });
          } catch {
            /* already dead */
          }
        }
        return;
      }
      // POSIX: SIGINT first (graceful). Wait up to 2s. If still alive, SIGKILL.
      try {
        child.kill('SIGINT');
      } catch {
        return;
      }
      const exited = await Promise.race([
        new Promise<boolean>((r) => child.once('close', () => r(true))),
        new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
      ]);
      if (!exited) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead between check and kill */
        }
      }
    },
  };
}
