[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / schemaToArbitrary

# Variable: schemaToArbitrary

> `const` **schemaToArbitrary**: \<`T`\>(`schema`) => `Arbitrary`\<`T`\> = `_schemaToArbitrary`

Defined in: [core/src/harness/arbitrary-from-schema.ts:167](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/arbitrary-from-schema.ts#L167)

Convenience top-level export — most call sites use this directly.

Walk a `Schema` AST and return a `fc.Arbitrary` that produces values
structurally conforming to the schema. Throws
[UnsupportedSchemaError](../classes/UnsupportedSchemaError.md) on AST nodes with no supported mapping.

Accepts any `Schema.Schema<T>` (or `Codec`) — only `.ast` is read.

## Type Parameters

### T

`T`

## Parameters

### schema

`Schema`\<`T`\>

## Returns

`Arbitrary`\<`T`\>
