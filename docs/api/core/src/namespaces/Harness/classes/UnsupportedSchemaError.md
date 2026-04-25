[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / UnsupportedSchemaError

# Class: UnsupportedSchemaError

Defined in: [core/src/harness/arbitrary-from-schema.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/arbitrary-from-schema.ts#L27)

Error thrown when an AST node has no supported arbitrary mapping.

## Extends

- `Error`

## Constructors

### Constructor

> **new UnsupportedSchemaError**(`nodeTag`, `hint?`): `UnsupportedSchemaError`

Defined in: [core/src/harness/arbitrary-from-schema.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/arbitrary-from-schema.ts#L30)

#### Parameters

##### nodeTag

`string`

##### hint?

`string`

#### Returns

`UnsupportedSchemaError`

#### Overrides

`Error.constructor`

## Properties

### \_tag

> `readonly` **\_tag**: `"UnsupportedSchemaError"` = `'UnsupportedSchemaError'`

Defined in: [core/src/harness/arbitrary-from-schema.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/arbitrary-from-schema.ts#L28)

***

### nodeTag

> `readonly` **nodeTag**: `string`

Defined in: [core/src/harness/arbitrary-from-schema.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/arbitrary-from-schema.ts#L29)
