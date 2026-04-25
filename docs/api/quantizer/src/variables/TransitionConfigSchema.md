[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / TransitionConfigSchema

# Variable: TransitionConfigSchema

> `const` **TransitionConfigSchema**: `Struct`\<\{ `delay`: `optionalKey`\<`Number`\>; `duration`: `Number`; `easing`: `optionalKey`\<`Any`\>; \}\>

Defined in: [quantizer/src/schemas.ts:19](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/schemas.ts#L19)

Runtime schema for [TransitionConfig](../interfaces/TransitionConfig.md).

Validates numeric `duration` and optional `easing`/`delay`. The branded
`Millis` type is not enforced here; wrap decoded durations with `Millis()`
at the consumer site for type safety.
