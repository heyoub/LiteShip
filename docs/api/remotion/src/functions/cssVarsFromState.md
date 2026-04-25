[**czap**](../../../README.md)

***

[czap](../../../README.md) / [remotion/src](../README.md) / cssVarsFromState

# Function: cssVarsFromState()

> **cssVarsFromState**(`state`): `Record`\<`string`, `string`\>

Defined in: [remotion/src/hooks.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/remotion/src/hooks.ts#L30)

Convert `CompositeState.outputs.css` into a flat CSS custom property map.

The returned record is suitable for use directly as a React `style` prop
or a Remotion `style` prop -- every key is a CSS variable name (e.g.
`--czap-color-fg`) and every value is coerced to a string.

## Parameters

### state

`CompositeState`

A composite state produced by a `VideoRenderer` frame.

## Returns

`Record`\<`string`, `string`\>

A flat `{ [cssVar]: string }` map.

## Example

```tsx
const vars = cssVarsFromState(state);
return <div style={vars}>...</div>;
```
