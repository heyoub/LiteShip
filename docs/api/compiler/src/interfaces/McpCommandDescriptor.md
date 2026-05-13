[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / McpCommandDescriptor

# Interface: McpCommandDescriptor

Defined in: [compiler/src/ai-manifest.ts:612](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L612)

A command descriptor used when `target === 'mcp'` to build the MCP tools
array. Distinct from [AIAction](AIAction.md) — it accepts pre-built JSON Schema
input schemas rather than the czap param-schema DSL.

## Properties

### description

> `readonly` **description**: `string`

Defined in: [compiler/src/ai-manifest.ts:616](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L616)

Human-readable description surfaced to the LLM.

***

### inputSchema

> `readonly` **inputSchema**: `object`

Defined in: [compiler/src/ai-manifest.ts:618](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L618)

Full JSON Schema object for the tool's input.

***

### name

> `readonly` **name**: `string`

Defined in: [compiler/src/ai-manifest.ts:614](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L614)

MCP tool name (dot-separated, e.g. `scene.render`).
