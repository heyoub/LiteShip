[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / lockfileAddress

# Function: lockfileAddress()

> **lockfileAddress**(`lockfileBytes`): `Effect`\<`AddressedDigest`, `Error`\>

Defined in: [core/src/ship-manifest.ts:142](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ship-manifest.ts#L142)

Address a pnpm-lock.yaml (or equivalent) by its raw file bytes. YAML is its own normalization.

## Parameters

### lockfileBytes

`Uint8Array`

## Returns

`Effect`\<`AddressedDigest`, `Error`\>
