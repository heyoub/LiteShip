[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / CzapLocals

# Interface: CzapLocals

Defined in: astro/src/middleware.ts:24

Shape of `context.locals.czap` injected by [czapMiddleware](../functions/czapMiddleware.md).
Astro components (and downstream middleware) read this to drive
adaptive rendering decisions.

## Properties

### capabilities

> `readonly` **capabilities**: [`ExtendedDeviceCapabilities`](#)

Defined in: astro/src/middleware.ts:32

Parsed device capabilities.

***

### edge?

> `readonly` `optional` **edge?**: `object`

Defined in: astro/src/middleware.ts:34

Edge-host resolution result, present when an edge adapter is configured.

#### cacheStatus

> `readonly` **cacheStatus**: `"disabled"` \| `"hit"` \| `"miss"`

#### compiledOutputs?

> `readonly` `optional` **compiledOutputs?**: `CompiledOutputs`

#### htmlAttributes

> `readonly` **htmlAttributes**: `string`

#### theme?

> `readonly` `optional` **theme?**: `ThemeCompileResult`

***

### tier

> `readonly` **tier**: `object`

Defined in: astro/src/middleware.ts:26

Resolved tiers (capability, motion, design).

#### cap

> `readonly` **cap**: `string`

#### design

> `readonly` **design**: `string`

#### motion

> `readonly` **motion**: `string`
