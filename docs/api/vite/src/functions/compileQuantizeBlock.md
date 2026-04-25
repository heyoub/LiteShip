[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / compileQuantizeBlock

# Function: compileQuantizeBlock()

> **compileQuantizeBlock**(`block`, `boundary`): `string`

Defined in: [vite/src/css-quantize.ts:289](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L289)

Compile a parsed [QuantizeBlock](../interfaces/QuantizeBlock.md) plus its resolved
[Boundary.Shape](#) into CSS `@container` query rules. Delegates
to the canonical `CSSCompiler` to avoid duplicating threshold-to-query
logic.

## Parameters

### block

[`QuantizeBlock`](../interfaces/QuantizeBlock.md)

### boundary

[`Shape`](#)

## Returns

`string`
