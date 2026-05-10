[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / BoundarySpec

# Interface: BoundarySpec

Defined in: core/src/boundary.ts:314

BoundarySpec: optional filter that gates whether a boundary is active.
Enables A/B testing, time-bounded experiments, and device targeting
without external wrapping logic.

**Phase 2**: Spec evaluation is implemented and tested but not yet wired
into the Compositor evaluation loop. Call `BoundarySpec.isActive()` or
`Boundary.isActive()` manually to check activation in the interim.

## Properties

### deviceFilter?

> `readonly` `optional` **deviceFilter?**: (`capabilities`) => `boolean`

Defined in: core/src/boundary.ts:316

Only evaluate this boundary when the device filter returns true.

#### Parameters

##### capabilities

`Record`\<`string`, `unknown`\>

#### Returns

`boolean`

***

### experimentId?

> `readonly` `optional` **experimentId?**: `string`

Defined in: core/src/boundary.ts:320

Only evaluate this boundary for participants in this experiment.

***

### timeRange?

> `readonly` `optional` **timeRange?**: `object`

Defined in: core/src/boundary.ts:318

Only evaluate this boundary within this time range (epoch ms).

#### from?

> `readonly` `optional` **from?**: `number`

#### until?

> `readonly` `optional` **until?**: `number`
