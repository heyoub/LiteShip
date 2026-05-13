[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / normalizeDryRunOutput

# Function: normalizeDryRunOutput()

> **normalizeDryRunOutput**(`rawStdout`, `normalizationContext`): `string`

Defined in: [core/src/ship-manifest.ts:174](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ship-manifest.ts#L174)

Strip platform-specific noise from `pnpm publish --dry-run` stdout so two
clean publishes produce byte-identical normalized text. Trims per-line
trailing whitespace, normalizes line endings, redacts the repo root prefix,
and replaces ISO-8601 timestamps with a fixed token.

## Parameters

### rawStdout

`string`

### normalizationContext

#### repo_root_absolute_path

`string`

## Returns

`string`
