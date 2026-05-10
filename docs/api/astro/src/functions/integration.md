[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / integration

# Function: integration()

> **integration**(`config?`): `AstroIntegration`

Defined in: [astro/src/integration.ts:174](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/integration.ts#L174)

Build the czap `AstroIntegration`.

Plug the returned object into `astro.config.mjs`'s `integrations`
array. The integration wires Astro's `astro:config:setup`,
`astro:config:done`, `astro:server:setup`, and `astro:build:done`
hooks.

## Parameters

### config?

[`IntegrationConfig`](../interfaces/IntegrationConfig.md)

## Returns

`AstroIntegration`

## Example

```ts
// astro.config.mjs
import { integration as czap } from '@czap/astro';

const config = defineConfig({
  integrations: [czap({ detect: true, workers: { enabled: true } })],
});
```
