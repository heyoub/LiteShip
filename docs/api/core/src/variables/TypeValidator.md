[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / TypeValidator

# Variable: TypeValidator

> `const` **TypeValidator**: `object`

Defined in: [core/src/capsule.ts:86](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L86)

Runtime validator that verifies values against _spine-derived schemas.
Used by capsule dispatchers to check inputs before invoking handlers.

## Type Declaration

### validate()

> `readonly` **validate**\<`T`\>(`schema`, `value`): `Effect`\<`T`, `SchemaError`\>

#### Type Parameters

##### T

`T`

#### Parameters

##### schema

`Codec`\<`T`, `T`, `never`\>

##### value

`unknown`

#### Returns

`Effect`\<`T`, `SchemaError`\>
