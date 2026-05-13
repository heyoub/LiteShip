[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / CompileAIManifestInput

# Interface: CompileAIManifestInput

Defined in: [compiler/src/ai-manifest.ts:629](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L629)

Input to [compileAIManifest](../functions/compileAIManifest.md).

When `target === 'mcp'`, only `commands` is used — the `capsules` field is
reserved for future catalog emission and is accepted but currently ignored.
When `target === 'json'` (default), delegates to [AIManifestCompiler.compile](../variables/AIManifestCompiler.md#compile)
with an empty manifest and returns the compile result.

## Properties

### capsules

> `readonly` **capsules**: readonly `unknown`[]

Defined in: [compiler/src/ai-manifest.ts:633](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L633)

Capsule catalog — reserved for future use.

***

### commands?

> `readonly` `optional` **commands?**: readonly [`McpCommandDescriptor`](McpCommandDescriptor.md)[]

Defined in: [compiler/src/ai-manifest.ts:635](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L635)

MCP tool descriptors used when `target === 'mcp'`.

***

### target?

> `readonly` `optional` **target?**: `"mcp"` \| `"json"`

Defined in: [compiler/src/ai-manifest.ts:631](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L631)

Output target: `'mcp'` emits `{ tools: [...] }`; `'json'` returns the compile result object.
