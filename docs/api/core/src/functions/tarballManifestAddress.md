[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / tarballManifestAddress

# Function: tarballManifestAddress()

> **tarballManifestAddress**(`tarballBytes`): `Effect`\<`AddressedDigest`, `Error`\>

Defined in: [core/src/ship-manifest.ts:123](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ship-manifest.ts#L123)

Address a tarball by its sorted uncompressed file manifest.
Decompresses gzip, parses USTAR entries, builds a `{path, size, sha256}` list
sorted lex by `path`, encodes via CanonicalCbor, and hashes those bytes.
Raw `.tgz` bytes are non-deterministic across publish runs (gzip mtime); the
manifest is.

## Parameters

### tarballBytes

`Uint8Array`

## Returns

`Effect`\<`AddressedDigest`, `Error`\>
