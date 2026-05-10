[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / plugin

# Function: plugin()

> **plugin**(`config?`): `Plugin`

Defined in: [vite/src/plugin.ts:67](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/plugin.ts#L67)

Create the czap Vite plugin.

Transforms CSS files containing `@token`, `@theme`, `@style`, and
`@quantize` blocks into native CSS custom properties,
`html[data-theme]` selectors, scoped `@layer` / `@scope` rules, and
`@container` queries respectively. Uses convention-based definition
resolution and provides HMR support for surgical CSS and shader
uniform updates.

## Parameters

### config?

[`PluginConfig`](../interfaces/PluginConfig.md)

## Returns

`Plugin`

## Example

```ts
// vite.config.ts
import { plugin as czap } from '@czap/vite';
const config = { plugins: [czap()] };
```
