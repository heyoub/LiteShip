[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / CzapValidationError

# Class: CzapValidationError

Defined in: [core/src/validation-error.ts:18](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/validation-error.ts#L18)

Structured validation error thrown by czap factory/constructor functions.

Carries a `module` identifier (e.g. `'Boundary.make'`) and a human-readable
`detail` message. Synchronous factories throw this directly so callers can
`catch` and branch via [isValidationError](../functions/isValidationError.md) without Effect plumbing.

## Extends

- `Error`

## Constructors

### Constructor

> **new CzapValidationError**(`module`, `detail`): `CzapValidationError`

Defined in: [core/src/validation-error.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/validation-error.ts#L23)

#### Parameters

##### module

`string`

##### detail

`string`

#### Returns

`CzapValidationError`

#### Overrides

`Error.constructor`

## Properties

### \_tag

> `readonly` **\_tag**: `"CzapValidationError"`

Defined in: [core/src/validation-error.ts:19](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/validation-error.ts#L19)

***

### detail

> `readonly` **detail**: `string`

Defined in: [core/src/validation-error.ts:21](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/validation-error.ts#L21)

***

### module

> `readonly` **module**: `string`

Defined in: [core/src/validation-error.ts:20](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/validation-error.ts#L20)
