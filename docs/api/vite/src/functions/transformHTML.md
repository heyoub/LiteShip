[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / transformHTML

# Function: transformHTML()

> **transformHTML**(`source`, `fromFile`, `projectRoot`): `Promise`\<`string`\>

Defined in: vite/src/html-transform.ts:25

Transform HTML source, replacing `data-czap="name"` with resolved boundary JSON.

## Parameters

### source

`string`

The HTML/Astro source string

### fromFile

`string`

The file path of the source (for resolution context)

### projectRoot

`string`

The project root directory

## Returns

`Promise`\<`string`\>

The transformed source, or the original if no transforms needed
