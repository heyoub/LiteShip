[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / ArbitraryFromSchema

# Variable: ArbitraryFromSchema

> `const` **ArbitraryFromSchema**: `object`

Defined in: [core/src/harness/arbitrary-from-schema.ts:286](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/arbitrary-from-schema.ts#L286)

Public namespace for the arbitrary-from-schema walker.

## Type Declaration

### fromSchema

> `readonly` **fromSchema**: \<`T`\>(`schema`) => `Arbitrary`\<`T`\> = `_schemaToArbitrary`

Walk a `Schema` AST and return a `fc.Arbitrary` that produces values
structurally conforming to the schema. Throws
[UnsupportedSchemaError](../classes/UnsupportedSchemaError.md) on AST nodes with no supported mapping.

Accepts any `Schema.Schema<T>` (or `Codec`) — only `.ast` is read.

#### Type Parameters

##### T

`T`

#### Parameters

##### schema

`Schema`\<`T`\>

#### Returns

`Arbitrary`\<`T`\>
