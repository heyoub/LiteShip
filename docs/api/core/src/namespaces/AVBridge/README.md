[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / AVBridge

# AVBridge

AVBridge -- SharedArrayBuffer-based timeline bridge for audio/video convergence.
Provides atomic sample counting shared between AudioWorklet and visual compositor.

## Example

```ts
const bridge = AVBridge.make({ sampleRate: 44100, fps: 30 });
bridge.setRunning(true);
bridge.advanceSamples(1470); // advance by one video frame worth of samples
bridge.getCurrentFrame(); // 1
bridge.sampleToTime(44100); // 1.0 (seconds)
bridge.timeToSample(0.5);   // 22050
```

## Type Aliases

- [Config](type-aliases/Config.md)
- [Shape](type-aliases/Shape.md)
