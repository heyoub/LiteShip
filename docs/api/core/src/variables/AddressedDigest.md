[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / AddressedDigest

# Variable: AddressedDigest

> **AddressedDigest**: `object`

Defined in: [core/src/addressed-digest.ts:13](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/addressed-digest.ts#L13)

## Type Declaration

### of

> **of**: (`bytes`, `algo`) => `Effect`\<`AddressedDigest`, `Error`\> = `AddressedDigestOf`

Derive an AddressedDigest from raw bytes. v0.1.0 implements `sha256` only.

#### Parameters

##### bytes

`Uint8Array`

##### algo?

`"sha256"` \| `"blake3"`

#### Returns

`Effect`\<`AddressedDigest`, `Error`\>
