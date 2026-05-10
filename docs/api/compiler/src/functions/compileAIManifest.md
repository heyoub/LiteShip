[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / compileAIManifest

# Function: compileAIManifest()

> **compileAIManifest**(`input`): [`AIManifestCompileResult`](../interfaces/AIManifestCompileResult.md) \| \{ `tools`: readonly [`McpCommandDescriptor`](../interfaces/McpCommandDescriptor.md)[]; \}

Defined in: compiler/src/ai-manifest.ts:657

Compile an AI manifest or MCP tool list from a high-level descriptor.

- `target === 'mcp'` → returns `{ tools: McpCommandDescriptor[] }`
- `target === 'json'` (default) → delegates to [AIManifestCompiler.compile](../variables/AIManifestCompiler.md#compile)
  with an empty manifest and returns the [AIManifestCompileResult](../interfaces/AIManifestCompileResult.md)

## Parameters

### input

[`CompileAIManifestInput`](../interfaces/CompileAIManifestInput.md)

## Returns

[`AIManifestCompileResult`](../interfaces/AIManifestCompileResult.md) \| \{ `tools`: readonly [`McpCommandDescriptor`](../interfaces/McpCommandDescriptor.md)[]; \}

## Example

```ts
import { compileAIManifest } from '@czap/compiler';

const out = compileAIManifest({
  target: 'mcp',
  capsules: [],
  commands: [{ name: 'scene.render', description: 'Render to mp4', inputSchema: { type: 'object' } }],
});
// out => { tools: [{ name: 'scene.render', description: 'Render to mp4', inputSchema: { type: 'object' } }] }
```
