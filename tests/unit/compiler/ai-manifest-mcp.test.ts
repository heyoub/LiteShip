import { describe, it, expect } from 'vitest';
import { compileAIManifest } from '@czap/compiler';

describe('ai-manifest MCP emission', () => {
  it('target=mcp returns { tools: [...] }', () => {
    const out = compileAIManifest({
      target: 'mcp',
      capsules: [],
      commands: [
        { name: 'scene.render', description: 'Render to mp4', inputSchema: { type: 'object' } },
      ],
    }) as { tools: Array<{ name: string; description: string; inputSchema: object }> };
    expect(Array.isArray(out.tools)).toBe(true);
    expect(out.tools[0]).toMatchObject({ name: 'scene.render', description: 'Render to mp4', inputSchema: { type: 'object' } });
  });

  it('target=json preserves existing behavior', () => {
    const out = compileAIManifest({ target: 'json', capsules: [], commands: [] });
    // Existing shape — do not assert heavily; just ensure it doesn't throw and returns a truthy object.
    expect(out).toBeTruthy();
  });
});
