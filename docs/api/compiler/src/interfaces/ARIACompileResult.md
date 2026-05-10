[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / ARIACompileResult

# Interface: ARIACompileResult\<S\>

Defined in: [compiler/src/aria.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/aria.ts#L26)

Output of [ARIACompiler.compile](../variables/ARIACompiler.md#compile).

`stateAttributes` is the full lookup keyed by state, ready for direct
spreading when the boundary transitions. `currentAttributes` is a
convenience pre-resolved for the active state so SSR can emit it
immediately without duplicating the lookup.

## Type Parameters

### S

`S` *extends* `string` = `string`

## Properties

### currentAttributes

> `readonly` **currentAttributes**: `Record`\<`string`, `string`\>

Defined in: [compiler/src/aria.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/aria.ts#L30)

Attributes for the active state at compile time.

***

### stateAttributes

> `readonly` **stateAttributes**: `Record`\<`S`, `Record`\<`string`, `string`\>\>

Defined in: [compiler/src/aria.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/aria.ts#L28)

Validated per-state ARIA attribute maps.
