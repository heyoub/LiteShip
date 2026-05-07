[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Config](../README.md) / Shape

# Interface: Shape

Defined in: [core/src/config.ts:142](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L142)

Frozen, content-addressed result of [Config.make](../../../variables/Config.md#make).

## Properties

### \_tag

> `readonly` **\_tag**: `"ConfigDef"`

Defined in: [core/src/config.ts:143](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L143)

***

### astro?

> `readonly` `optional` **astro?**: `Partial`\<[`CoreAstroConfig`](../../../interfaces/CoreAstroConfig.md)\>

Defined in: [core/src/config.ts:150](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L150)

***

### boundaries

> `readonly` **boundaries**: `Record`\<`string`, [`Shape`](../../Boundary/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:145](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L145)

***

### id

> `readonly` **id**: `ContentAddress`

Defined in: [core/src/config.ts:144](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L144)

***

### styles

> `readonly` **styles**: `Record`\<`string`, [`Shape`](../../Style/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:148](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L148)

***

### themes

> `readonly` **themes**: `Record`\<`string`, [`Shape`](../../Theme/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:147](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L147)

***

### tokens

> `readonly` **tokens**: `Record`\<`string`, [`Shape`](../../Token/type-aliases/Shape.md)\>

Defined in: [core/src/config.ts:146](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L146)

***

### vite?

> `readonly` `optional` **vite?**: `Partial`\<[`CorePluginConfig`](../../../interfaces/CorePluginConfig.md)\>

Defined in: [core/src/config.ts:149](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L149)
