[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / CzapMiddlewareConfig

# Interface: CzapMiddlewareConfig

Defined in: [astro/src/middleware.ts:48](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/middleware.ts#L48)

Options accepted by [czapMiddleware](../functions/czapMiddleware.md).

Omit `edge` to run in pure Client-Hints mode. Pass `edge` when you
have an `@czap/edge` host adapter (KV cache, theme compilation).

## Properties

### detect?

> `readonly` `optional` **detect?**: `boolean`

Defined in: [astro/src/middleware.ts:52](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/middleware.ts#L52)

Whether to include the Client Hints request headers (default `true`).

***

### edge?

> `readonly` `optional` **edge?**: `EdgeHostAdapterConfig`

Defined in: [astro/src/middleware.ts:50](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/middleware.ts#L50)

Edge host adapter configuration (KV cache, theme compilation).

***

### workers?

> `readonly` `optional` **workers?**: `object`

Defined in: [astro/src/middleware.ts:54](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/middleware.ts#L54)

Whether to emit COOP/COEP headers for worker features.

#### enabled?

> `readonly` `optional` **enabled?**: `boolean`
