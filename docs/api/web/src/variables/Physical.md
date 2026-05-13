[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / Physical

# Variable: Physical

> `const` **Physical**: `object`

Defined in: [web/src/index.ts:79](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/index.ts#L79)

Physical DOM-state helpers for save/restore across morphs and hot
reloads. Captures focus, selection, scroll, and IME composition so a
subsequent [Morph.morph](Morph.md#morph) preserves them.

## Type Declaration

### capture

> **capture**: (`root`) => `Effect`\<[`PhysicalState`](../interfaces/PhysicalState.md)\>

Snapshot focus/selection/scroll state on the document.

Capture full physical state of an element and its descendants.

#### Parameters

##### root

`Element`

#### Returns

`Effect`\<[`PhysicalState`](../interfaces/PhysicalState.md)\>

### restore

> **restore**: (`state`, `root`, `remap?`) => `Effect`\<`void`\>

Re-apply a snapshot produced by [Physical.capture](#capture).

Restore full physical state after morphing.

#### Parameters

##### state

[`PhysicalState`](../interfaces/PhysicalState.md)

##### root

`Element`

##### remap?

`Record`\<`string`, `string`\>

#### Returns

`Effect`\<`void`\>
