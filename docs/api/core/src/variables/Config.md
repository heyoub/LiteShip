[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Config

# Variable: Config

> `const` **Config**: `object`

Defined in: [core/src/config.ts:49](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/config.ts#L49)

Config namespace — the single hub that every czap adapter (Vite, Astro, test
runners, edge runtime) projects from. [Config.make](#make) produces a frozen,
FNV-1a content-addressed [Config.Shape](../namespaces/Config/interfaces/Shape.md); every projection function
(`toViteConfig`, `toAstroConfig`, `toTestAliases`) is pure.

## Type Declaration

### make()

> **make**(`input`): [`Shape`](../namespaces/Config/interfaces/Shape.md)

Build a frozen, content-addressed [Config.Shape](../namespaces/Config/interfaces/Shape.md) from raw input.

#### Parameters

##### input

[`Input`](../namespaces/Config/interfaces/Input.md)

#### Returns

[`Shape`](../namespaces/Config/interfaces/Shape.md)

### toAstroConfig()

> **toAstroConfig**(`cfg`): [`CoreAstroConfig`](../interfaces/CoreAstroConfig.md)

Project the Astro-integration slice of a config for `@czap/astro`.

#### Parameters

##### cfg

[`Shape`](../namespaces/Config/interfaces/Shape.md)

#### Returns

[`CoreAstroConfig`](../interfaces/CoreAstroConfig.md)

### toTestAliases()

> **toTestAliases**(`cfg`, `repoRoot`): `Record`\<`string`, `string`\>

Materialize the `@czap/*` → source-path alias map used by the vitest runner.

#### Parameters

##### cfg

[`Shape`](../namespaces/Config/interfaces/Shape.md)

##### repoRoot

`string`

#### Returns

`Record`\<`string`, `string`\>

### toViteConfig()

> **toViteConfig**(`cfg`): [`CorePluginConfig`](../interfaces/CorePluginConfig.md)

Project the Vite-plugin slice of a config for `@czap/vite`.

#### Parameters

##### cfg

[`Shape`](../namespaces/Config/interfaces/Shape.md)

#### Returns

[`CorePluginConfig`](../interfaces/CorePluginConfig.md)
