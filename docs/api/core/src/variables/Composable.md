[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Composable

# Variable: Composable

> `const` **Composable**: `ComposableFactory`

Defined in: [core/src/composable.ts:302](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/composable.ts#L302)

Composable — content-addressed entity algebra over czap primitives.

Build entities from a bag of components (boundaries, tokens, styles, …),
merge them associatively via `Composable.compose` / `Composable.merge`, and
rely on the content address to deduplicate structurally-equal entities.
