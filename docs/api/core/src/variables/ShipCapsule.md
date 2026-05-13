[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / ShipCapsule

# Variable: ShipCapsule

> `const` **ShipCapsule**: `object`

Defined in: [core/src/ship-capsule.ts:184](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ship-capsule.ts#L184)

## Type Declaration

### canonicalize

> **canonicalize**: (`capsule`) => `Uint8Array`

#### Parameters

##### capsule

`ShipCapsuleShape`

#### Returns

`Uint8Array`

### computeId

> **computeId**: (`capsuleWithoutIdentity`) => `Effect`\<`AddressedDigest`, `Error`\>

#### Parameters

##### capsuleWithoutIdentity

`ShipCapsuleInput`

#### Returns

`Effect`\<`AddressedDigest`, `Error`\>

### decode

> **decode**: (`bytes`) => `Effect`\<`ShipCapsuleShape`, `ShipCapsuleDecodeError`\>

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`Effect`\<`ShipCapsuleShape`, `ShipCapsuleDecodeError`\>

### make

> **make**: (`input`) => `Effect`\<`ShipCapsuleShape`, `Error`\>

#### Parameters

##### input

`ShipCapsuleInput`

#### Returns

`Effect`\<`ShipCapsuleShape`, `Error`\>
