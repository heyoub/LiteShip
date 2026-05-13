[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / workspaceManifestAddress

# Function: workspaceManifestAddress()

> **workspaceManifestAddress**(`input`): `Effect`\<`AddressedDigest`, `Error`\>

Defined in: [core/src/ship-manifest.ts:150](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ship-manifest.ts#L150)

Address a workspace's set of package.json files. Hashes each file with
sha256, builds a `{relative_path, sha256}` list sorted lex by
`relative_path`, and addresses the CBOR of that list.

## Parameters

### input

readonly `object`[]

## Returns

`Effect`\<`AddressedDigest`, `Error`\>
