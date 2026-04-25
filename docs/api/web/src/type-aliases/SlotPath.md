[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / SlotPath

# Type Alias: SlotPath

> **SlotPath** = (`value`) => `SlotPath`

Defined in: [web/src/types.ts:21](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/types.ts#L21)

Brand an already-validated slot path string.

Sanctioned single-site cast for `SlotPath`. Callers that have externally
validated the shape (e.g. via `SlotAddressing.isValid`, attribute provenance,
or a literal `/...` template) should use this helper instead of inline-casting.

## Parameters

### value

`string`

## Returns

`SlotPath`
