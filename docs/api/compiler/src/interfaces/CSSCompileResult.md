[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / CSSCompileResult

# Interface: CSSCompileResult

Defined in: [compiler/src/css.ts:52](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L52)

Output of [CSSCompiler.compile](../variables/CSSCompiler.md#compile).

`raw` is the serialized form of `containerRules`, pre-joined so most
consumers can inject it directly into a `<style>` element without a
separate serialize call.

## Properties

### containerRules

> `readonly` **containerRules**: readonly [`CSSContainerRule`](CSSContainerRule.md)[]

Defined in: [compiler/src/css.ts:54](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L54)

Structured container rules, one per non-empty state.

***

### raw

> `readonly` **raw**: `string`

Defined in: [compiler/src/css.ts:56](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L56)

Pre-serialized CSS text ready for injection.
