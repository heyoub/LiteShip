import { describe, it, expect } from 'vitest';
import { quoteWindowsArg, spawnArgv, withSpawned } from '../../../scripts/lib/spawn.js';

describe('quoteWindowsArg', () => {
  it('quotes empty string as ""', () => {
    expect(quoteWindowsArg('')).toBe('""');
  });

  it('passes plain identifiers through unchanged', () => {
    expect(quoteWindowsArg('plain')).toBe('plain');
    expect(quoteWindowsArg('path/with/slashes.ts')).toBe('path/with/slashes.ts');
  });

  it('double-quotes args with whitespace', () => {
    expect(quoteWindowsArg('with space')).toBe('"with space"');
  });

  it('escapes interior double quotes', () => {
    expect(quoteWindowsArg('with"quote')).toBe('"with\\"quote"');
  });

  it('quotes shell metacharacters so cmd.exe treats them literally', () => {
    expect(quoteWindowsArg('a;b')).toBe('"a;b"');
    expect(quoteWindowsArg('a|b')).toBe('"a|b"');
    expect(quoteWindowsArg('a&b')).toBe('"a&b"');
    expect(quoteWindowsArg('a<b')).toBe('"a<b"');
    expect(quoteWindowsArg('a>b')).toBe('"a>b"');
    expect(quoteWindowsArg('a^b')).toBe('"a^b"');
    expect(quoteWindowsArg('a(b')).toBe('"a(b"');
  });
});

describe('spawnArgv', () => {
  it('returns exitCode 0 for a successful echo via node -e', async () => {
    const result = await spawnArgv('node', ['-e', 'process.exit(0)']);
    expect(result.exitCode).toBe(0);
  });

  it('captures nonzero exitCode without throwing', async () => {
    const result = await spawnArgv('node', ['-e', 'process.exit(7)']);
    expect(result.exitCode).toBe(7);
  });

  it('captures stderrTail when child writes to stderr', async () => {
    const result = await spawnArgv('node', ['-e', 'process.stderr.write("err-marker"); process.exit(1)']);
    expect(result.stderrTail).toContain('err-marker');
    expect(result.exitCode).toBe(1);
  });

  it('truncates stderrTail at the configured cap', async () => {
    // Generate ~100 KiB of stderr, cap at 1024.
    const result = await spawnArgv(
      'node',
      ['-e', 'for (let i = 0; i < 5000; i++) process.stderr.write("X".repeat(20)); process.exit(0)'],
      { stderrCapBytes: 1024 },
    );
    expect(result.stderrTail.length).toBeLessThanOrEqual(2048); // last chunk may push past cap by one chunk-size
  });
});

describe('withSpawned lifecycle', () => {
  it('disposes the child after the callback returns', async () => {
    const result = await withSpawned(
      'node',
      ['-e', 'setInterval(() => {}, 1000)'],  // hangs forever
      async (handle) => {
        expect(handle.pid).toBeGreaterThan(0);
        return 'callback-value';
      },
    );
    expect(result).toBe('callback-value');
  });

  it('disposes the child even when the callback throws', async () => {
    await expect(
      withSpawned(
        'node',
        ['-e', 'setInterval(() => {}, 1000)'],
        async () => {
          throw new Error('callback-failed');
        },
      ),
    ).rejects.toThrow('callback-failed');
  });

  it('dispose is idempotent if the child has already exited', async () => {
    await withSpawned(
      'node',
      ['-e', 'process.exit(0)'],
      async (handle) => {
        await new Promise<void>((r) => setTimeout(r, 100));
        // No error when callback returns and dispose runs against a dead child.
        expect(handle.pid).toBeGreaterThan(0);
      },
    );
  });
});
