[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / UIFrame

# Interface: UIFrame

Defined in: [core/src/gen-frame.ts:39](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L39)

A single frame emitted by the [GenFrame](../variables/GenFrame.md) scheduler — the unit of work
the DOM runtime consumes. Carries the drained tokens, its classification,
the quality tier that produced it, and a content-addressed receipt for
disconnect-resilient replay.

## Properties

### bufferPosition

> `readonly` **bufferPosition**: `number`

Defined in: [core/src/gen-frame.ts:46](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L46)

***

### morphStrategy

> `readonly` **morphStrategy**: [`MorphStrategy`](../type-aliases/MorphStrategy.md)

Defined in: [core/src/gen-frame.ts:43](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L43)

***

### qualityTier

> `readonly` **qualityTier**: [`UIQualityTier`](../type-aliases/UIQualityTier.md)

Defined in: [core/src/gen-frame.ts:42](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L42)

***

### receiptId

> `readonly` **receiptId**: `ContentAddress`

Defined in: [core/src/gen-frame.ts:45](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L45)

***

### timestamp

> `readonly` **timestamp**: `number`

Defined in: [core/src/gen-frame.ts:44](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L44)

***

### tokens

> `readonly` **tokens**: readonly `string`[]

Defined in: [core/src/gen-frame.ts:41](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L41)

***

### type

> `readonly` **type**: [`FrameType`](../type-aliases/FrameType.md)

Defined in: [core/src/gen-frame.ts:40](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L40)
