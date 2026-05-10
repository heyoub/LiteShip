[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIManifestCompileResult

# Interface: AIManifestCompileResult

Defined in: compiler/src/ai-manifest.ts:142

Output of [AIManifestCompiler.compile](../variables/AIManifestCompiler.md#compile).

Bundles the source manifest together with the three derived artifacts
(tools, schema, prompt) so consumers can wire all three into an LLM
session in a single step.

## Properties

### jsonSchema

> `readonly` **jsonSchema**: `Record`\<`string`, `unknown`\>

Defined in: compiler/src/ai-manifest.ts:148

JSON Schema for validating LLM output.

***

### manifest

> `readonly` **manifest**: [`AIManifest`](AIManifest.md)

Defined in: compiler/src/ai-manifest.ts:144

The source manifest.

***

### systemPrompt

> `readonly` **systemPrompt**: `string`

Defined in: compiler/src/ai-manifest.ts:150

System prompt describing dimensions, slots, actions, and constraints.

***

### toolDefinitions

> `readonly` **toolDefinitions**: readonly [`AIToolDefinition`](AIToolDefinition.md)[]

Defined in: compiler/src/ai-manifest.ts:146

Tool definitions for function calling.
