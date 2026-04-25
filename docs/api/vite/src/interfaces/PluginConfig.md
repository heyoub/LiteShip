[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / PluginConfig

# Interface: PluginConfig

Defined in: [vite/src/plugin.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/plugin.ts#L34)

Configuration options for the [plugin](../functions/plugin.md) factory. Every field
is optional; omitted values use convention-based defaults.

## Properties

### dirs?

> `readonly` `optional` **dirs?**: `Partial`\<`Record`\<`"style"` \| `"boundary"` \| `"token"` \| `"theme"`, `string`\>\>

Defined in: [vite/src/plugin.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/plugin.ts#L36)

Override source directories for each primitive kind.

***

### environments?

> `readonly` `optional` **environments?**: readonly (`"browser"` \| `"server"` \| `"shader"`)[]

Defined in: [vite/src/plugin.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/plugin.ts#L40)

Named Vite environments to configure (browser / server / shader).

***

### hmr?

> `readonly` `optional` **hmr?**: `boolean`

Defined in: [vite/src/plugin.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/plugin.ts#L38)

Toggle surgical HMR emission (default `true`).

***

### wasm?

> `readonly` `optional` **wasm?**: `object`

Defined in: [vite/src/plugin.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/plugin.ts#L42)

Opt-in WASM runtime configuration.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`

#### path?

> `readonly` `optional` **path?**: `string`
