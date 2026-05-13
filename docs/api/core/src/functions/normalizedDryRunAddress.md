[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / normalizedDryRunAddress

# Function: normalizedDryRunAddress()

> **normalizedDryRunAddress**(`rawStdout`, `normalizationContext`): `Effect`\<`AddressedDigest`, `Error`\>

Defined in: [core/src/ship-manifest.ts:189](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ship-manifest.ts#L189)

Address a normalized `pnpm publish --dry-run` stdout (see [normalizeDryRunOutput](normalizeDryRunOutput.md)).

## Parameters

### rawStdout

`string`

### normalizationContext

#### repo_root_absolute_path

`string`

## Returns

`Effect`\<`AddressedDigest`, `Error`\>
