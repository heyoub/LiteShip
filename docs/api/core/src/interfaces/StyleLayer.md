[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / StyleLayer

# Interface: StyleLayer

Defined in: [core/src/style.ts:31](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/style.ts#L31)

One layer of a [Style](../variables/Style.md): a flat property bag plus optional pseudo
selectors (`:hover`, `::before`, …) and structured `box-shadow` layers.

## Properties

### boxShadow?

> `readonly` `optional` **boxShadow?**: readonly [`ShadowLayer`](ShadowLayer.md)[]

Defined in: [core/src/style.ts:34](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/style.ts#L34)

***

### properties

> `readonly` **properties**: `Record`\<`string`, `string`\>

Defined in: [core/src/style.ts:32](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/style.ts#L32)

***

### pseudo?

> `readonly` `optional` **pseudo?**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [core/src/style.ts:33](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/style.ts#L33)
