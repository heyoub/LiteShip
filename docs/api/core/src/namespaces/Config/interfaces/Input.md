[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Config](../README.md) / Input

# Interface: Input

Defined in: [core/src/config.ts:124](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L124)

Raw user-facing input to [Config.make](../../../variables/Config.md#make) — every field is optional.

## Properties

### astro?

> `readonly` `optional` **astro?**: `Partial`\<[`CoreAstroConfig`](../../../interfaces/CoreAstroConfig.md)\>

Defined in: [core/src/config.ts:130](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L130)

***

### boundaries?

> `readonly` `optional` **boundaries?**: `Record`\<`string`, [`Shape`](../../Boundary/type-aliases/Shape.md)\<`string`, readonly \[`string`, `string`\]\>\>

Defined in: [core/src/config.ts:125](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L125)

***

### styles?

> `readonly` `optional` **styles?**: `Record`\<`string`, [`Shape`](../../Style/type-aliases/Shape.md)\<[`Shape`](../../Boundary/type-aliases/Shape.md)\<`string`, readonly \[`string`, `string`\]\>\>\>

Defined in: [core/src/config.ts:128](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L128)

***

### themes?

> `readonly` `optional` **themes?**: `Record`\<`string`, [`Shape`](../../Theme/type-aliases/Shape.md)\<readonly `string`[]\>\>

Defined in: [core/src/config.ts:127](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L127)

***

### tokens?

> `readonly` `optional` **tokens?**: `Record`\<`string`, [`Shape`](../../Token/type-aliases/Shape.md)\<`string`, readonly `string`[]\>\>

Defined in: [core/src/config.ts:126](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L126)

***

### vite?

> `readonly` `optional` **vite?**: `Partial`\<[`CorePluginConfig`](../../../interfaces/CorePluginConfig.md)\>

Defined in: [core/src/config.ts:129](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L129)
