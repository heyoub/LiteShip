[**LiteShip**](../../../../../README.md)

***

[LiteShip](../../../../../modules.md) / [core/src](../../../README.md) / [Config](../README.md) / Input

# Interface: Input

Defined in: [core/src/config.ts:131](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L131)

Raw user-facing input to [Config.make](../../../variables/Config.md#make) — every field is optional.

## Properties

### astro?

> `readonly` `optional` **astro?**: `Partial`\<[`CoreAstroConfig`](../../../interfaces/CoreAstroConfig.md)\>

Defined in: [core/src/config.ts:137](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L137)

***

### boundaries?

> `readonly` `optional` **boundaries?**: `Record`\<`string`, [`Shape`](../../Boundary/type-aliases/Shape.md)\<`string`, readonly \[`string`, `string`\]\>\>

Defined in: [core/src/config.ts:132](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L132)

***

### styles?

> `readonly` `optional` **styles?**: `Record`\<`string`, [`Shape`](../../Style/type-aliases/Shape.md)\<[`Shape`](../../Boundary/type-aliases/Shape.md)\<`string`, readonly \[`string`, `string`\]\>\>\>

Defined in: [core/src/config.ts:135](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L135)

***

### themes?

> `readonly` `optional` **themes?**: `Record`\<`string`, [`Shape`](../../Theme/type-aliases/Shape.md)\<readonly `string`[]\>\>

Defined in: [core/src/config.ts:134](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L134)

***

### tokens?

> `readonly` `optional` **tokens?**: `Record`\<`string`, [`Shape`](../../Token/type-aliases/Shape.md)\<`string`, readonly `string`[]\>\>

Defined in: [core/src/config.ts:133](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L133)

***

### vite?

> `readonly` `optional` **vite?**: `Partial`\<[`CorePluginConfig`](../../../interfaces/CorePluginConfig.md)\>

Defined in: [core/src/config.ts:136](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L136)
