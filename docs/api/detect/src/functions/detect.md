[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / detect

# Function: detect()

> **detect**(): `Effect`\<[`ExtendedDetectionResult`](../interfaces/ExtendedDetectionResult.md)\>

Defined in: [detect/src/detect.ts:551](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L551)

Run a full device capability detection sweep.
All probes are synchronous with internal error handling -- gracefully
falls back to conservative defaults when APIs are unavailable.

## Returns

`Effect`\<[`ExtendedDetectionResult`](../interfaces/ExtendedDetectionResult.md)\>

An Effect yielding an [ExtendedDetectionResult](../interfaces/ExtendedDetectionResult.md)

## Example

```ts
import { Detect } from '@czap/detect';
import { Effect } from 'effect';

const result = Effect.runSync(Detect.detect());
console.log(result.capabilities.gpu);       // 0-3
console.log(result.tier);                   // 'low' | 'mid' | 'high'
console.log(result.designTier);             // 'basic' | 'standard' | 'rich'
console.log(result.motionTier);             // 'none' | 'transitions' | ...
console.log(result.confidence);             // 0.5 - 1.0
```
