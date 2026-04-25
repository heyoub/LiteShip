[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / AIManifestCompileResult

# Interface: AIManifestCompileResult

Defined in: [compiler/src/ai-manifest.ts:142](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L142)

Output of [AIManifestCompiler.compile](../variables/AIManifestCompiler.md#compile).

Bundles the source manifest together with the three derived artifacts
(tools, schema, prompt) so consumers can wire all three into an LLM
session in a single step.

## Properties

### jsonSchema

> `readonly` **jsonSchema**: `Record`\<`string`, `unknown`\>

Defined in: [compiler/src/ai-manifest.ts:148](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L148)

JSON Schema for validating LLM output.

***

### manifest

> `readonly` **manifest**: [`AIManifest`](AIManifest.md)

Defined in: [compiler/src/ai-manifest.ts:144](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L144)

The source manifest.

***

### systemPrompt

> `readonly` **systemPrompt**: `string`

Defined in: [compiler/src/ai-manifest.ts:150](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L150)

System prompt describing dimensions, slots, actions, and constraints.

***

### toolDefinitions

> `readonly` **toolDefinitions**: readonly [`AIToolDefinition`](AIToolDefinition.md)[]

Defined in: [compiler/src/ai-manifest.ts:146](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L146)

Tool definitions for function calling.
