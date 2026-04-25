[**czap**](../../README.md)

***

[czap](../../README.md) / astro/src

# astro/src

`@czap/astro` -- Astro 6 integration for constraint-based adaptive
rendering.

Provides the Astro `Integration` that registers the `@czap/vite`
plugin, injects the client-side tier-detection script, wires the
`client:satellite` directive, and exposes the `Satellite` component
for server islands with client-side state resolution.

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
