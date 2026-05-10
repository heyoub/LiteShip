[**LiteShip**](../../README.md)

***

[LiteShip](../../modules.md) / astro/src

# astro/src

`@czap/astro` — **LiteShip** on Astro 6: constraint-shaped adaptive
projection hosted as islands and directives.

Provides the Astro `Integration` that registers `@czap/vite`,
injects client tier detection, **rigs** the `client:satellite` directive,
and exposes `Satellite` for shells with server-resolved bearings.

## Example

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { integration as czap } from '@czap/astro';

const config = defineConfig({
  integrations: [czap({ themes: ['./themes/default.ts'] })],
});
```

## Interfaces

- [CzapLocals](interfaces/CzapLocals.md)
- [CzapMiddlewareConfig](interfaces/CzapMiddlewareConfig.md)
- [IntegrationConfig](interfaces/IntegrationConfig.md)
- [QuantizeProps](interfaces/QuantizeProps.md)
- [SatelliteProps](interfaces/SatelliteProps.md)
- [ServerIslandContext](interfaces/ServerIslandContext.md)

## Functions

- [czapMiddleware](functions/czapMiddleware.md)
- [integration](functions/integration.md)
- [resolveInitialState](functions/resolveInitialState.md)
- [resolveInitialStateFallback](functions/resolveInitialStateFallback.md)
- [satelliteAttrs](functions/satelliteAttrs.md)
