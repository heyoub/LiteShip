[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / tupleMap

# Function: tupleMap()

> **tupleMap**\<`T`, `U`\>(`tuple`, `fn`): \{ readonly \[K in string \| number \| symbol\]: U \}

Defined in: [core/src/tuple.ts:15](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/tuple.ts#L15)

Map each element of a readonly tuple, preserving tuple arity and ordering.

TypeScript's Array.prototype.map returns U[], erasing tuple structure.
This helper reintroduces the mapped tuple type via one narrow cast,
provably safe: the map is total over the input and the output element
type is uniform.

## Type Parameters

### T

`T` *extends* readonly `unknown`[]

### U

`U`

## Parameters

### tuple

`T`

### fn

(`element`, `index`) => `U`

## Returns

\{ readonly \[K in string \| number \| symbol\]: U \}

## Example

```ts
const types = tupleMap([1, 'two', true] as const, (el) => typeof el);
// types: readonly ['number', 'string', 'boolean']
```
