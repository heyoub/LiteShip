import { describe, it, expect } from 'vitest';
import { run } from '@czap/cli';

const ASSEMBLY_KINDS = [
  'pureTransform', 'receiptedMutation', 'stateMachine',
  'siteAdapter', 'policyGate', 'cachedProjection', 'sceneComposition',
] as const;

function capture<T>(fn: () => Promise<T>): Promise<{ exit: T; stdout: string; stderr: string }> {
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
  return Promise.resolve(fn())
    .then((exit) => ({ exit, stdout, stderr }))
    .finally(() => {
      (process.stdout as unknown as { write: typeof origOut }).write = origOut;
      (process.stderr as unknown as { write: typeof origErr }).write = origErr;
    });
}

describe('czap describe', () => {
  it('emits JSON schema with assemblyKinds + commands', async () => {
    const { exit, stdout } = await capture(() => run(['describe']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.assemblyKinds).toEqual(expect.arrayContaining([...ASSEMBLY_KINDS]));
    expect(Array.isArray(receipt.commands)).toBe(true);
    expect(receipt.commands.length).toBeGreaterThan(0);
  });

  it('--format=mcp emits MCP tool descriptors', async () => {
    const { exit, stdout } = await capture(() => run(['describe', '--format=mcp']));
    expect(exit).toBe(0);
    const manifest = JSON.parse(stdout.trim());
    expect(Array.isArray(manifest.tools)).toBe(true);
    for (const tool of manifest.tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.inputSchema).toBe('object');
    }
  });

  it('returns exit code 1 on unknown command', async () => {
    const { exit } = await capture(() => run(['nonsense']));
    expect(exit).toBe(1);
  });
});
