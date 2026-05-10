[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / czapMiddleware

# Function: czapMiddleware()

> **czapMiddleware**(`config?`): (`context`, `next`) => `Promise`\<`Response`\>

Defined in: [astro/src/middleware.ts:80](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/middleware.ts#L80)

Create the czap edge middleware.

Parses Client Hints from request headers, computes tier detection,
injects results into `context.locals.czap`, and sets Client Hints
response headers (`Accept-CH`, `Critical-CH`).

## Parameters

### config?

[`CzapMiddlewareConfig`](../interfaces/CzapMiddlewareConfig.md)

## Returns

(`context`, `next`) => `Promise`\<`Response`\>

## Example

```ts
// Astro middleware (src/middleware.ts)
import { czapMiddleware } from '@czap/astro';
export const onRequest = czapMiddleware();
```
