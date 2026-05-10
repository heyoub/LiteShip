[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / SPSCRing

# Variable: SPSCRing

> `const` **SPSCRing**: `object`

Defined in: [worker/src/spsc-ring.ts:300](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/worker/src/spsc-ring.ts#L300)

SPSC ring buffer namespace.

Lock-free single-producer single-consumer ring buffer backed by
`SharedArrayBuffer`. Designed for real-time compositor state streaming
between a Worker (producer) and the main thread (consumer) without
blocking either side. Uses only `Atomics.load`/`Atomics.store` --
fully non-blocking.

## Type Declaration

### attachConsumer

> `readonly` **attachConsumer**: (`sab`, `slotCount`, `slotSize`) => [`SPSCRingBufferShape`](../interfaces/SPSCRingBufferShape.md) = `_attachConsumer`

Attach as consumer to an existing SharedArrayBuffer.
Call this on the main thread that consumes data.

#### Parameters

##### sab

`SharedArrayBuffer`

The SharedArrayBuffer shared with the producer

##### slotCount

`number`

Number of slots (must match createPair)

##### slotSize

`number`

Float64 values per slot (must match createPair)

#### Returns

[`SPSCRingBufferShape`](../interfaces/SPSCRingBufferShape.md)

A consumer-side [SPSCRingBufferShape](../interfaces/SPSCRingBufferShape.md)

#### Example

```ts
import { SPSCRing } from '@czap/worker';

// On the main thread after receiving buffer from Worker:
const consumer = SPSCRing.attachConsumer(sharedBuffer, 64, 4);
const out = new Float64Array(4);
if (consumer.pop(out)) {
  console.log('Received:', out); // Float64Array [1.0, 2.0, 3.0, 4.0]
}
```

### attachProducer

> `readonly` **attachProducer**: (`sab`, `slotCount`, `slotSize`) => [`SPSCRingBufferShape`](../interfaces/SPSCRingBufferShape.md) = `_attachProducer`

Attach as producer to an existing SharedArrayBuffer.
Call this inside the Worker that produces data.

#### Parameters

##### sab

`SharedArrayBuffer`

The SharedArrayBuffer from the main thread

##### slotCount

`number`

Number of slots (must match createPair)

##### slotSize

`number`

Float64 values per slot (must match createPair)

#### Returns

[`SPSCRingBufferShape`](../interfaces/SPSCRingBufferShape.md)

A producer-side [SPSCRingBufferShape](../interfaces/SPSCRingBufferShape.md)

#### Example

```ts
import { SPSCRing } from '@czap/worker';

// Inside a Worker's message handler:
self.onmessage = (e) => {
  const { buffer, slotCount, slotSize } = e.data;
  const producer = SPSCRing.attachProducer(buffer, slotCount, slotSize);
  const data = new Float64Array([1.0, 2.0, 3.0, 4.0]);
  producer.push(data); // true if buffer not full
};
```

### createPair

> `readonly` **createPair**: (`slotCount`, `slotSize`) => `object` = `_createPair`

Create a matched producer/consumer pair sharing the same SharedArrayBuffer.

Typically called on the main thread; the `buffer` (SharedArrayBuffer) is
then transferred to the Worker via `postMessage`, and the Worker calls
`SPSCRing.attachProducer` to get its side of the ring.

#### Parameters

##### slotCount

`number`

Number of slots in the ring (power of 2 recommended)

##### slotSize

`number`

Number of Float64 values per slot

#### Returns

`object`

An object with the shared buffer and producer/consumer ring handles

##### buffer

> **buffer**: `SharedArrayBuffer`

##### consumer

> **consumer**: [`SPSCRingBufferShape`](../interfaces/SPSCRingBufferShape.md)

##### producer

> **producer**: [`SPSCRingBufferShape`](../interfaces/SPSCRingBufferShape.md)

#### Example

```ts
import { SPSCRing } from '@czap/worker';

const { buffer, producer, consumer } = SPSCRing.createPair(64, 4);
// producer.push(new Float64Array([1, 2, 3, 4])); // true
// consumer.pop(new Float64Array(4));              // true
// Transfer buffer to a Worker via postMessage
worker.postMessage({ buffer, slotCount: 64, slotSize: 4 });
```

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
