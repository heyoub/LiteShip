[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Config](../README.md) / Shape

# Interface: Shape

Defined in: [core/src/config.ts:134](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L134)

Frozen, content-addressed result of [Config.make](../../../variables/Config.md#make).

## Properties

### \_tag

> `readonly` **\_tag**: `"ConfigDef"`

Defined in: [core/src/config.ts:135](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L135)

***

### astro?

> `readonly` `optional` **astro?**: `Partial`\<[`CoreAstroConfig`](../../../interfaces/CoreAstroConfig.md)\>

Defined in: [core/src/config.ts:142](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L142)

***

### boundaries

> `readonly` **boundaries**: `Record`\<`string`, [`Shape`](../../Boundary/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:137](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L137)

***

### id

> `readonly` **id**: `ContentAddress`

Defined in: [core/src/config.ts:136](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L136)

***

### styles

> `readonly` **styles**: `Record`\<`string`, [`Shape`](../../Style/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:140](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L140)

***

### themes

> `readonly` **themes**: `Record`\<`string`, [`Shape`](../../Theme/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:139](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L139)

***

### tokens

> `readonly` **tokens**: `Record`\<`string`, [`Shape`](../../Token/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:138](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L138)

***

### vite?

> `readonly` `optional` **vite?**: `Partial`\<[`CorePluginConfig`](../../../interfaces/CorePluginConfig.md)\>

Defined in: [core/src/config.ts:141](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L141)
