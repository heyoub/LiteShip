[**czap**](../../../README.md)

***

[czap](../../../README.md) / [astro/src](../README.md) / IntegrationConfig

# Interface: IntegrationConfig

Defined in: [astro/src/integration.ts:35](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L35)

Options passed to [integration](../functions/integration.md) from `astro.config.mjs`. Every
field is optional; omitted features fall back to conservative
defaults (detect enabled, stream/llm/gpu enabled, workers/wasm/server
islands opt-in).

## Properties

### detect?

> `readonly` `optional` **detect?**: `boolean`

Defined in: [astro/src/integration.ts:39](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L39)

Enable the inline detect script (default `true`).

***

### gpu?

> `readonly` `optional` **gpu?**: `object`

Defined in: [astro/src/integration.ts:45](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L45)

GPU runtime configuration.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`

#### preferWebGPU?

> `readonly` `optional` **preferWebGPU?**: `boolean`

***

### llm?

> `readonly` `optional` **llm?**: `object`

Defined in: [astro/src/integration.ts:51](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L51)

LLM streaming runtime configuration.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`

***

### security?

> `readonly` `optional` **security?**: `object`

Defined in: [astro/src/integration.ts:53](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L53)

Security policies applied to runtime fetch/HTML boundaries.

#### endpointPolicy?

> `readonly` `optional` **endpointPolicy?**: `RuntimeEndpointPolicy`

#### htmlPolicy?

> `readonly` `optional` **htmlPolicy?**: `RuntimeHtmlPolicy`

***

### serverIslands?

> `readonly` `optional` **serverIslands?**: `boolean`

Defined in: [astro/src/integration.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L41)

Turn on Astro's experimental server-islands flag (default `false`).

***

### stream?

> `readonly` `optional` **stream?**: `object`

Defined in: [astro/src/integration.ts:49](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L49)

SSE streaming runtime configuration.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`

***

### vite?

> `readonly` `optional` **vite?**: `PluginConfig`

Defined in: [astro/src/integration.ts:37](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L37)

Overrides passed through to `@czap/vite`'s plugin.

***

### wasm?

> `readonly` `optional` **wasm?**: `object`

Defined in: [astro/src/integration.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L43)

WASM runtime configuration.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`

#### path?

> `readonly` `optional` **path?**: `string`

***

### workers?

> `readonly` `optional` **workers?**: `object`

Defined in: [astro/src/integration.ts:47](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L47)

Off-thread worker runtime configuration.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`
