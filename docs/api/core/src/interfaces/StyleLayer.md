[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / StyleLayer

# Interface: StyleLayer

Defined in: [core/src/style.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/style.ts#L30)

One layer of a [Style](../variables/Style.md): a flat property bag plus optional pseudo
selectors (`:hover`, `::before`, …) and structured `box-shadow` layers.

## Properties

### boxShadow?

> `readonly` `optional` **boxShadow?**: readonly [`ShadowLayer`](ShadowLayer.md)[]

Defined in: [core/src/style.ts:33](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/style.ts#L33)

***

### properties

> `readonly` **properties**: `Record`\<`string`, `string`\>

Defined in: [core/src/style.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/style.ts#L31)

***

### pseudo?

> `readonly` `optional` **pseudo?**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [core/src/style.ts:32](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/style.ts#L32)
