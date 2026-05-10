[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AISlot

# Interface: AISlot

Defined in: compiler/src/ai-manifest.ts:39

Named content slot that accepts a constrained set of content kinds.

Slots parameterize a layout — the manifest declares which content kinds
(`'image' | 'video' | ...`) each slot will accept.

## Properties

### accepts

> `readonly` **accepts**: readonly `string`[]

Defined in: compiler/src/ai-manifest.ts:41

Content kinds the slot accepts.

***

### description

> `readonly` **description**: `string`

Defined in: compiler/src/ai-manifest.ts:43

Human-readable description surfaced to the LLM.
