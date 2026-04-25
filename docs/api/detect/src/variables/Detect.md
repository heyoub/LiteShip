[**czap**](../../../README.md)

***

[czap](../../../README.md) / [detect/src](../README.md) / Detect

# Variable: Detect

> `const` **Detect**: `object`

Defined in: [detect/src/detect.ts:589](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L589)

Device capability detection namespace.

Probes browser APIs for GPU tier, CPU cores, memory, input modality,
user preferences, and network info. Maps detected capabilities to
[CapLevel](#), [CapSet](#), [DesignTier](../type-aliases/DesignTier.md), and [MotionTier](../../../quantizer/src/type-aliases/MotionTier.md).
Supports live watching for preference and viewport changes.

## Type Declaration

### detect

> **detect**: () => `Effect`\<[`ExtendedDetectionResult`](../interfaces/ExtendedDetectionResult.md)\>

Run a full device capability detection sweep.
All probes are synchronous with internal error handling -- gracefully
falls back to conservative defaults when APIs are unavailable.

#### Returns

`Effect`\<[`ExtendedDetectionResult`](../interfaces/ExtendedDetectionResult.md)\>

An Effect yielding an [ExtendedDetectionResult](../interfaces/ExtendedDetectionResult.md)

#### Example

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

### detectGPUTier

> **detectGPUTier**: () => `Effect`\<[`GPUTier`](../type-aliases/GPUTier.md)\>

Detect GPU tier from WebGL renderer string heuristics.
Falls back to tier 1 (integrated) when WebGL is unavailable.

#### Returns

`Effect`\<[`GPUTier`](../type-aliases/GPUTier.md)\>

An Effect yielding a [GPUTier](../type-aliases/GPUTier.md) (0-3)

#### Example

```ts
import { Detect } from '@czap/detect';
import { Effect } from 'effect';

const tier = Effect.runSync(Detect.detectGPUTier());
// tier => 0 (software) | 1 (integrated) | 2 (mid) | 3 (high-end)
```

### watchCapabilities

> **watchCapabilities**: (`onChange`) => `Effect`\<`void`, `never`, `Scope`\>

Watch for capability changes via matchMedia listeners and resize observer.
Emits a fresh DetectionResult whenever viewport, color scheme, or
reduced motion preferences change.

The stream is scoped -- listeners are cleaned up when the scope finalizes.

#### Parameters

##### onChange

(`result`) => `void`

Callback invoked with fresh detection results on change

#### Returns

`Effect`\<`void`, `never`, `Scope`\>

An Effect (scoped) that sets up listeners

#### Example

```ts
import { Detect } from '@czap/detect';
import { Effect } from 'effect';

const program = Effect.scoped(
  Detect.watchCapabilities((result) => {
    console.log('Capabilities changed:', result.tier);
  }),
);
```

## Example

```ts
import { Detect } from '@czap/detect';
import { Effect } from 'effect';

const result = Effect.runSync(Detect.detect());
console.log(result.capabilities.prefersColorScheme); // 'light' | 'dark'
console.log(result.motionTier); // 'none' | 'transitions' | 'animations' | ...

// Watch for changes
const watch = Effect.scoped(
  Detect.watchCapabilities((r) => console.log('tier:', r.tier)),
);
```
