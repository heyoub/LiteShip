[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / watchCapabilities

# Function: watchCapabilities()

> **watchCapabilities**(`onChange`): `Effect`\<`void`, `never`, [`Scope`](#)\>

Defined in: [detect/src/detect.ts:617](https://github.com/heyoub/LiteShip/blob/main/packages/detect/src/detect.ts#L617)

Watch for capability changes via matchMedia listeners and resize observer.
Emits a fresh DetectionResult whenever viewport, color scheme, or
reduced motion preferences change.

The stream is scoped -- listeners are cleaned up when the scope finalizes.

## Parameters

### onChange

(`result`) => `void`

Callback invoked with fresh detection results on change

## Returns

`Effect`\<`void`, `never`, [`Scope`](#)\>

An Effect (scoped) that sets up listeners

## Example

```ts
import { Detect } from '@czap/detect';
import { Effect } from 'effect';

const program = Effect.scoped(
  Detect.watchCapabilities((result) => {
    console.log('Capabilities changed:', result.tier);
  }),
);
```
