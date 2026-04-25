/**
 * Shared stdout/stderr capture helper for CLI integration tests.
 *
 * @module
 */

/** Capture stdout + stderr + exit code around an async CLI run. */
export async function captureCli<T>(fn: () => Promise<T>): Promise<{ exit: T; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: unknown }).write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  });
  (process.stderr as unknown as { write: unknown }).write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  });
  try {
    const exit = await fn();
    return { exit, stdout, stderr };
  } finally {
    (process.stdout as unknown as { write: typeof origOut }).write = origOut;
    (process.stderr as unknown as { write: typeof origErr }).write = origErr;
  }
}
