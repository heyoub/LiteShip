[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [worker/src](../../README.md) / SPSCRing

# SPSCRing

SPSC ring buffer namespace.

Lock-free single-producer single-consumer ring buffer backed by
`SharedArrayBuffer`. Designed for real-time compositor state streaming
between a Worker (producer) and the main thread (consumer) without
blocking either side. Uses only `Atomics.load`/`Atomics.store` --
fully non-blocking.

## Example

```ts
import { SPSCRing } from '@czap/worker';

// Main thread: create pair and send buffer to Worker
const { buffer, producer, consumer } = SPSCRing.createPair(128, 8);
worker.postMessage({ buffer, slotCount: 128, slotSize: 8 });

// In Worker: attach as producer
// const producer = SPSCRing.attachProducer(buffer, 128, 8);
// producer.push(new Float64Array(8));

// Main thread: consume in animation loop
const out = new Float64Array(8);
function frame() {
  while (consumer.pop(out)) { /* process out */ }
  requestAnimationFrame(frame);
}
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
