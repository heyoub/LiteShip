[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / detectGPUTier

# Function: detectGPUTier()

> **detectGPUTier**(): `Effect`\<[`GPUTier`](../type-aliases/GPUTier.md)\>

Defined in: [detect/src/detect.ts:524](https://github.com/heyoub/LiteShip/blob/main/packages/detect/src/detect.ts#L524)

Detect GPU tier from WebGL renderer string heuristics.
Falls back to tier 1 (integrated) when WebGL is unavailable.

## Returns

`Effect`\<[`GPUTier`](../type-aliases/GPUTier.md)\>

An Effect yielding a [GPUTier](../type-aliases/GPUTier.md) (0-3)

## Example

```ts
import { Detect } from '@czap/detect';
import { Effect } from 'effect';

const tier = Effect.runSync(Detect.detectGPUTier());
// tier => 0 (software) | 1 (integrated) | 2 (mid) | 3 (high-end)
```
