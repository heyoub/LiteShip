/**
 * Unit tests for the `describe` command. Covers JSON, MCP no-cache, and
 * MCP cached-manifest branches.
 */
import { describe as describeTest, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe } from '../../../../packages/cli/src/commands/describe.js';

const MANIFEST_PATH = '.czap/generated/mcp-manifest.json';
let preexisting: string | undefined;

describeTest('describe command', () => {
  beforeAll(() => {
    if (existsSync(MANIFEST_PATH)) {
      preexisting = readFileSync(MANIFEST_PATH, 'utf8');
    }
  });
  afterAll(() => {
    if (preexisting !== undefined) {
      writeFileSync(MANIFEST_PATH, preexisting, 'utf8');
    } else if (existsSync(MANIFEST_PATH)) {
      rmSync(MANIFEST_PATH);
    }
  });

  it('default JSON mode emits assembly kinds + command list', () => {
    const r = describe({}) as { assemblyKinds: readonly string[]; commands: readonly unknown[] };
    expect(r.assemblyKinds.length).toBeGreaterThan(5);
    expect(r.commands.length).toBeGreaterThan(5);
  });

  it('explicit JSON mode behaves the same as default', () => {
    const r = describe({ format: 'json' }) as { assemblyKinds: readonly string[] };
    expect(r.assemblyKinds.length).toBeGreaterThan(0);
  });

  it('MCP mode without cache emits tools derived from COMMANDS', () => {
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
    const r = describe({ format: 'mcp' }) as { tools: ReadonlyArray<{ name: string; description: string; inputSchema: object }> };
    expect(Array.isArray(r.tools)).toBe(true);
    expect(r.tools.length).toBeGreaterThan(5);
    expect(r.tools[0]!.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('MCP mode with cached manifest returns the cached tool list (covers L58 readFileSync branch)', () => {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    const cached = {
      tools: [
        { name: 'cached.tool.x', description: 'cached', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
      ],
    };
    writeFileSync(MANIFEST_PATH, JSON.stringify(cached), 'utf8');
    const r = describe({ format: 'mcp' }) as { tools: ReadonlyArray<{ name: string }> };
    expect(r.tools).toHaveLength(1);
    expect(r.tools[0]!.name).toBe('cached.tool.x');
    if (preexisting === undefined) rmSync(MANIFEST_PATH);
  });
});
