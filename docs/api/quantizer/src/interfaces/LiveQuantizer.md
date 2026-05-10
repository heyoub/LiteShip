[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / LiveQuantizer

# Interface: LiveQuantizer\<B, O\>

Defined in: quantizer/src/quantizer.ts:202

Runtime-instantiated quantizer with reactive output dispatch.

Extends the core [Quantizer](#) with a reactive outputs table: as
boundary crossings are detected, `currentOutputs` updates and
`outputChanges` streams the new per-target record. Consumers typically
subscribe via `Stream.runForEach(liveQuantizer.outputChanges, …)`.

## Example

```ts
import { Boundary } from '@czap/core';
import { Q } from '@czap/quantizer';
import { Effect, Stream } from 'effect';

const b = Boundary.make({
  input: 'w', states: ['sm', 'lg'] as const, thresholds: [0, 768],
});
const config = Q.from(b).outputs({
  css: { sm: { fontSize: '14px' }, lg: { fontSize: '18px' } },
});
Effect.runSync(Effect.scoped(Effect.gen(function* () {
  const live = yield* config.create();
  live.evaluate(900); // triggers crossing; outputs stream emits CSS
})));
```

## Extends

- [`Quantizer`](#)\<`B`\>

## Type Parameters

### B

`B` *extends* [`Boundary.Shape`](#)

### O

`O` *extends* [`QuantizerOutputs`](QuantizerOutputs.md)\<`B`\> = [`QuantizerOutputs`](QuantizerOutputs.md)\<`B`\>

## Properties

### \_tag

> `readonly` **\_tag**: `"Quantizer"`

Defined in: core/dist/quantizer-types.d.ts:20

#### Inherited from

`Quantizer._tag`

***

### boundary

> `readonly` **boundary**: `B`

Defined in: core/dist/quantizer-types.d.ts:21

#### Inherited from

`Quantizer.boundary`

***

### changes

> `readonly` **changes**: `Stream`\<`BoundaryCrossing`\<`StateUnion`\<`B`\>\>\>

Defined in: core/dist/quantizer-types.d.ts:25

#### Inherited from

`Quantizer.changes`

***

### config

> `readonly` **config**: [`QuantizerConfig`](QuantizerConfig.md)\<`B`, `O`\>

Defined in: quantizer/src/quantizer.ts:207

The config this quantizer was created from.

***

### currentOutputs

> `readonly` **currentOutputs**: `Effect`\<`Partial`\<\{ `ai`: `Record`\<`string`, `unknown`\>; `aria`: `Record`\<`string`, `unknown`\>; `css`: `Record`\<`string`, `unknown`\>; `glsl`: `Record`\<`string`, `unknown`\>; `wgsl`: `Record`\<`string`, `unknown`\>; \}\>\>

Defined in: quantizer/src/quantizer.ts:209

Read the currently-active per-target output record.

***

### outputChanges

> `readonly` **outputChanges**: `Stream`\<`Partial`\<\{ `ai`: `Record`\<`string`, `unknown`\>; `aria`: `Record`\<`string`, `unknown`\>; `css`: `Record`\<`string`, `unknown`\>; `glsl`: `Record`\<`string`, `unknown`\>; `wgsl`: `Record`\<`string`, `unknown`\>; \}\>\>

Defined in: quantizer/src/quantizer.ts:211

Stream of per-target output records emitted on each boundary crossing.

***

### state

> `readonly` **state**: `Effect`\<`StateUnion`\<`B`\>\>

Defined in: core/dist/quantizer-types.d.ts:22

#### Inherited from

`Quantizer.state`

***

### stateSync?

> `readonly` `optional` **stateSync?**: () => `StateUnion`\<`B`\>

Defined in: core/dist/quantizer-types.d.ts:24

Synchronous state accessor for hot paths (avoids Effect overhead).

#### Returns

`StateUnion`\<`B`\>

#### Inherited from

`Quantizer.stateSync`

## Methods

### evaluate()

> **evaluate**(`value`): `StateUnion`\<`B`\>

Defined in: core/dist/quantizer-types.d.ts:26

#### Parameters

##### value

`number`

#### Returns

`StateUnion`\<`B`\>

#### Inherited from

`Quantizer.evaluate`
