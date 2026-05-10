[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIToolDefinition

# Interface: AIToolDefinition

Defined in: compiler/src/ai-manifest.ts:124

Tool definition in the function-calling format emitted by
[AIManifestCompiler.generateToolDefinitions](../variables/AIManifestCompiler.md#generatetooldefinitions).

Directly consumable by the Anthropic, OpenAI, and Google tool-calling
APIs — fields are a superset of their intersecting requirements.

## Properties

### description

> `readonly` **description**: `string`

Defined in: compiler/src/ai-manifest.ts:128

Action description (becomes the tool description).

***

### name

> `readonly` **name**: `string`

Defined in: compiler/src/ai-manifest.ts:126

Action name.

***

### parameters

> `readonly` **parameters**: `Record`\<`string`, `unknown`\>

Defined in: compiler/src/ai-manifest.ts:130

JSON Schema for parameters.

***

### returns

> `readonly` **returns**: `Record`\<`string`, `unknown`\>

Defined in: compiler/src/ai-manifest.ts:132

JSON Schema for the return shape.
