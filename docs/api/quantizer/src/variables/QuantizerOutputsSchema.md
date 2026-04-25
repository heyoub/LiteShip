[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / QuantizerOutputsSchema

# Variable: QuantizerOutputsSchema

> `const` **QuantizerOutputsSchema**: `Struct`\<\{ `ai`: `optionalKey`\<`$Record`\<`String`, `Unknown`\>\>; `aria`: `optionalKey`\<`$Record`\<`String`, `Unknown`\>\>; `css`: `optionalKey`\<`$Record`\<`String`, `Unknown`\>\>; `glsl`: `optionalKey`\<`$Record`\<`String`, `Unknown`\>\>; `wgsl`: `optionalKey`\<`$Record`\<`String`, `Unknown`\>\>; \}\>

Defined in: [quantizer/src/schemas.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/schemas.ts#L44)

Runtime schema for [QuantizerOutputs](../interfaces/QuantizerOutputs.md).

Each target is an optional record whose values are unchecked at the
schema level; target-specific value constraints live in the TypeScript
types on [QuantizerOutputs](../interfaces/QuantizerOutputs.md).
