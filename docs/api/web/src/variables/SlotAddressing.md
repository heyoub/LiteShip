[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / SlotAddressing

# Variable: SlotAddressing

> `const` **SlotAddressing**: `object`

Defined in: [web/src/slot/addressing.ts:163](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/slot/addressing.ts#L163)

Consolidated namespace export matching the spine contract.

## Type Declaration

### ancestors

> **ancestors**: (`path`) => readonly [`SlotPath`](../type-aliases/SlotPath.md)[]

Get all ancestor paths of a slot.

#### Parameters

##### path

[`SlotPath`](../type-aliases/SlotPath.md)

#### Returns

readonly [`SlotPath`](../type-aliases/SlotPath.md)[]

### basename

> **basename**: (`path`) => `string`

Get the last segment of a path.

#### Parameters

##### path

[`SlotPath`](../type-aliases/SlotPath.md)

#### Returns

`string`

### brand

> `readonly` **brand**: (`value`) => [`SlotPath`](../type-aliases/SlotPath.md) = `SlotPath`

Brand an already-validated slot path string.

Sanctioned single-site cast for `SlotPath`. Callers that have externally
validated the shape (e.g. via `SlotAddressing.isValid`, attribute provenance,
or a literal `/...` template) should use this helper instead of inline-casting.

#### Parameters

##### value

`string`

#### Returns

[`SlotPath`](../type-aliases/SlotPath.md)

### isDescendant

> **isDescendant**: (`path`, `ancestor`) => `boolean`

Check if a path is a descendant of another.

#### Parameters

##### path

[`SlotPath`](../type-aliases/SlotPath.md)

##### ancestor

[`SlotPath`](../type-aliases/SlotPath.md)

#### Returns

`boolean`

### isValid

> **isValid**: (`path`) => `path is SlotPath`

Check if a string is a valid slot path.

#### Parameters

##### path

`string`

#### Returns

`path is SlotPath`

### join

> **join**: (`base`, ...`segments`) => [`SlotPath`](../type-aliases/SlotPath.md)

Join path segments into a SlotPath.

#### Parameters

##### base

[`SlotPath`](../type-aliases/SlotPath.md)

##### segments

...`string`[]

#### Returns

[`SlotPath`](../type-aliases/SlotPath.md)

### parent

> **parent**: (`path`) => [`SlotPath`](../type-aliases/SlotPath.md) \| `null`

Get the parent path of a slot.

#### Parameters

##### path

[`SlotPath`](../type-aliases/SlotPath.md)

#### Returns

[`SlotPath`](../type-aliases/SlotPath.md) \| `null`

### parse

> **parse**: (`path`) => [`SlotPath`](../type-aliases/SlotPath.md)

Parse a string into a validated SlotPath.
Throws if the path is invalid.

#### Parameters

##### path

`string`

#### Returns

[`SlotPath`](../type-aliases/SlotPath.md)

### toSelector

> **toSelector**: (`path`) => `string`

Convert a SlotPath to a CSS selector.

#### Parameters

##### path

[`SlotPath`](../type-aliases/SlotPath.md)

#### Returns

`string`
