[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIAction

# Interface: AIAction

Defined in: [compiler/src/ai-manifest.ts:52](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L52)

Named action the LLM may invoke via tool calling.

`effects` is a free-form list of effect tags the host uses to route the
action's side effects (repaint, persist, etc.).

## Properties

### description

> `readonly` **description**: `string`

Defined in: [compiler/src/ai-manifest.ts:58](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L58)

Human-readable description surfaced to the LLM.

***

### effects

> `readonly` **effects**: readonly `string`[]

Defined in: [compiler/src/ai-manifest.ts:56](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L56)

Effect tags produced when this action runs.

***

### params

> `readonly` **params**: `Record`\<`string`, [`AIParamSchema`](AIParamSchema.md)\>

Defined in: [compiler/src/ai-manifest.ts:54](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L54)

Parameter schemas keyed by parameter name.
