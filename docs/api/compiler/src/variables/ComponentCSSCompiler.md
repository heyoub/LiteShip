[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / ComponentCSSCompiler

# Variable: ComponentCSSCompiler

> `const` **ComponentCSSCompiler**: `object`

Defined in: [compiler/src/component-css.ts:60](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/component-css.ts#L60)

Component CSS compiler namespace.

Wraps [StyleCSSCompiler](StyleCSSCompiler.md) with component-scoped conventions: children
inside `[data-czap-slot]` use `display: contents` so slotted content
inherits layout from the surrounding parent, and elements tagged
`[data-czap-satellite="<name>"]` get `container-type: inline-size` so
satellite-mounted instances participate in container queries.

## Type Declaration

### compile

> **compile**: (`component`) => [`StyleCSSResult`](../interfaces/StyleCSSResult.md)

Compile a component definition into scoped CSS with slot + satellite markers.

Compile a [Component.Shape](#) into scoped CSS with slot and satellite
markers appended inside the component's `@layer` block.

#### Parameters

##### component

[`Shape`](#)

#### Returns

[`StyleCSSResult`](../interfaces/StyleCSSResult.md)
