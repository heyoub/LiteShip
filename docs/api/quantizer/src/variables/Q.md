[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / Q

# Variable: Q

> `const` **Q**: `object`

Defined in: [quantizer/src/quantizer.ts:501](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L501)

Quantizer builder namespace.

`Q.from(boundary)` starts a fluent builder that produces a content-addressed
[QuantizerConfig](../interfaces/QuantizerConfig.md). Calling `config.create()` within an Effect scope
yields a reactive [LiveQuantizer](../interfaces/LiveQuantizer.md) that evaluates numeric input values
against boundary thresholds, dispatches state transitions, and routes
per-state outputs (CSS, GLSL, WGSL, ARIA, AI) gated by MotionTier.

## Type Declaration

### from

> `readonly` **from**: \<`B`\>(`boundary`, `options?`) => [`QuantizerBuilder`](../interfaces/QuantizerBuilder.md)\<`B`\> = `fromBoundary`

Create a quantizer builder from a boundary definition.

Starts a fluent chain: `Q.from(boundary).outputs({...})` produces a
content-addressed `QuantizerConfig` whose `.create()` method yields a
reactive `LiveQuantizer` inside an Effect scope.

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### boundary

`B`

The boundary definition to quantize against

##### options?

[`QuantizerFromOptions`](../interfaces/QuantizerFromOptions.md)

Optional motion tier and spring configuration

#### Returns

[`QuantizerBuilder`](../interfaces/QuantizerBuilder.md)\<`B`\>

A [QuantizerBuilder](../interfaces/QuantizerBuilder.md) for chaining `.outputs()` and `.force()`

#### Example

```ts
import { Boundary } from '@czap/core';
import { Q } from '@czap/quantizer';
import { Effect } from 'effect';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'md', 'lg'] as const,
  thresholds: [0, 640, 1024],
});
const config = Q.from(boundary).outputs({
  css: { sm: { fontSize: '14px' }, md: { fontSize: '16px' }, lg: { fontSize: '18px' } },
});
const state = Effect.scoped(
  Effect.gen(function* () {
    const live = yield* config.create();
    return live.evaluate(800); // 'md'
  }),
);
const result = Effect.runSync(state);
```

## Example

```ts
import { Boundary } from '@czap/core';
import { Q } from '@czap/quantizer';
import { Effect } from 'effect';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const,
  thresholds: [0, 768],
});
const config = Q.from(boundary).outputs({
  css: { sm: { display: 'block' }, lg: { display: 'grid' } },
});
const result = Effect.runSync(Effect.scoped(
  Effect.gen(function* () {
    const live = yield* config.create();
    live.evaluate(1024);
    return yield* live.currentOutputs;
  }),
));
// result.css => { display: 'grid' }
```
