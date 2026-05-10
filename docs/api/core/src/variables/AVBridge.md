[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / AVBridge

# Variable: AVBridge

> `const` **AVBridge**: `object`

Defined in: core/src/av-bridge.ts:154

AVBridge -- SharedArrayBuffer-based timeline bridge for audio/video convergence.
Provides atomic sample counting shared between AudioWorklet and visual compositor.

## Type Declaration

### make

> **make**: (`config`) => `AVBridgeShape` = `_make`

Creates an AVBridge backed by a SharedArrayBuffer for lock-free
audio/video timeline synchronization between threads.

#### Parameters

##### config

`AVBridgeConfig`

#### Returns

`AVBridgeShape`

#### Example

```ts
const bridge = AVBridge.make({ sampleRate: 48000, fps: 60 });
bridge.setRunning(true);
bridge.advanceSamples(800); // AudioWorklet advances by 800 samples
const frame = bridge.getCurrentFrame(); // current video frame number
const drift = bridge.drift(); // fractional frame offset
bridge.reset(); // zero out counters
```

## Example

```ts
const bridge = AVBridge.make({ sampleRate: 44100, fps: 30 });
bridge.setRunning(true);
bridge.advanceSamples(1470); // advance by one video frame worth of samples
bridge.getCurrentFrame(); // 1
bridge.sampleToTime(44100); // 1.0 (seconds)
bridge.timeToSample(0.5);   // 22050
```
