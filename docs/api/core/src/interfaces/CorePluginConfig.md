[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / CorePluginConfig

# Interface: CorePluginConfig

Defined in: [core/src/config.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L26)

Vite-plugin slice of a czap [Config.Shape](../namespaces/Config/interfaces/Shape.md): source directories per
primitive kind, HMR opt-in, environment targeting, and optional WASM hints.

## Properties

### dirs?

> `readonly` `optional` **dirs?**: `Partial`\<`Record`\<[`PrimitiveKind`](../type-aliases/PrimitiveKind.md), `string`\>\>

Defined in: [core/src/config.ts:27](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L27)

***

### environments?

> `readonly` `optional` **environments?**: readonly (`"browser"` \| `"server"` \| `"shader"`)[]

Defined in: [core/src/config.ts:29](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L29)

***

### hmr?

> `readonly` `optional` **hmr?**: `boolean`

Defined in: [core/src/config.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L28)

***

### wasm?

> `readonly` `optional` **wasm?**: `object`

Defined in: [core/src/config.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/config.ts#L30)

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`

#### path?

> `readonly` `optional` **path?**: `string`
