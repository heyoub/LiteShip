[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / OpType

# Type Alias: OpType

> **OpType** = \{ `fn?`: `string`; `type`: `"pure"`; \} \| \{ `fn?`: `string`; `type`: `"effect"`; \} \| \{ `key`: `string`; `spec`: `Record`\<`string`, `unknown`\>; `type`: `"spawn"`; \} \| \{ `domain`: `string`; `op`: `string`; `type`: `"domain"`; \} \| \{ `condition`: `unknown`; `type`: `"choice"`; \} \| \{ `type`: `"noop"`; \}

Defined in: [core/src/plan.ts:15](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/plan.ts#L15)

Discriminated union describing the kind of work a `PlanStep` performs.

`pure` and `effect` name an executable function; `spawn` references a child
fiber/worker keyed by `key`; `domain` dispatches to an external domain's
named operation; `choice` marks a branch point; `noop` is an explicit
placeholder.
