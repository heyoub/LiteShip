[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Priority

# Type Alias: Priority

> **Priority** = `"critical"` \| `"high"` \| `"low"` \| `"idle"`

Defined in: [core/src/frame-budget.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/frame-budget.ts#L23)

Frame-budget priority lane in descending urgency. `critical` always runs;
`high` / `low` / `idle` gate based on the milliseconds remaining in the
current frame.
