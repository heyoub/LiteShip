[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / ARIAStates

# Interface: ARIAStates

Defined in: [compiler/src/dispatch.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/dispatch.ts#L36)

ARIA compile input — per-state attribute map plus the currently-active state.

The compiler emits the attributes for `currentState` (not all states) to
avoid flooding the DOM with unused `aria-*` values.

## Properties

### currentState

> `readonly` **currentState**: `string`

Defined in: [compiler/src/dispatch.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/dispatch.ts#L40)

Name of the state whose ARIA attributes should be emitted.

***

### states

> `readonly` **states**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [compiler/src/dispatch.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/dispatch.ts#L38)

Per-state ARIA attribute maps keyed by state name.
