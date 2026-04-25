import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SPSCRing } from '../../packages/worker/src/spsc-ring.js';

const canUseSAB = typeof SharedArrayBuffer !== 'undefined';

describe.skipIf(!canUseSAB)('browser SPSCRing with real SharedArrayBuffer and Atomics', () => {
  beforeEach(() => {
    // SharedArrayBuffer requires crossOriginIsolated (COOP/COEP headers).
    // Skip this entire suite if the browser context does not provide it.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('createPair returns a SharedArrayBuffer and producer/consumer handles', () => {
    const { buffer, producer, consumer } = SPSCRing.createPair(4, 2);

    expect(buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(producer.capacity).toBe(4);
    expect(consumer.capacity).toBe(4);
    expect(producer.count).toBe(0);
    expect(consumer.count).toBe(0);
  });

  test('push and pop transfer Float64 data correctly through the ring', () => {
    const { producer, consumer } = SPSCRing.createPair(8, 4);

    const input = new Float64Array([1.5, 2.5, 3.5, 4.5]);
    const ok = producer.push(input);
    expect(ok).toBe(true);
    expect(producer.count).toBe(1);

    const out = new Float64Array(4);
    const popped = consumer.pop(out);
    expect(popped).toBe(true);
    expect(out[0]).toBe(1.5);
    expect(out[1]).toBe(2.5);
    expect(out[2]).toBe(3.5);
    expect(out[3]).toBe(4.5);
    expect(consumer.count).toBe(0);
  });

  test('pop returns false when buffer is empty', () => {
    const { consumer } = SPSCRing.createPair(4, 2);
    const out = new Float64Array(2);
    const popped = consumer.pop(out);
    expect(popped).toBe(false);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });

  test('push returns false when buffer is full', () => {
    const { producer } = SPSCRing.createPair(2, 1);

    expect(producer.push(new Float64Array([10]))).toBe(true);
    expect(producer.push(new Float64Array([20]))).toBe(true);
    // Buffer is full (capacity 2, 2 items pushed)
    expect(producer.push(new Float64Array([30]))).toBe(false);
    expect(producer.count).toBe(2);
  });

  test('buffer wraps around correctly after full drain and refill', () => {
    const { producer, consumer } = SPSCRing.createPair(2, 1);
    const out = new Float64Array(1);

    // Fill
    producer.push(new Float64Array([1.0]));
    producer.push(new Float64Array([2.0]));

    // Drain
    consumer.pop(out);
    expect(out[0]).toBe(1.0);
    consumer.pop(out);
    expect(out[0]).toBe(2.0);

    // Refill (wrap-around)
    producer.push(new Float64Array([3.0]));
    producer.push(new Float64Array([4.0]));

    consumer.pop(out);
    expect(out[0]).toBe(3.0);
    consumer.pop(out);
    expect(out[0]).toBe(4.0);

    expect(consumer.count).toBe(0);
  });

  test('multiple sequential push/pop cycles maintain correct FIFO order', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 2);
    const out = new Float64Array(2);
    const collected: number[][] = [];

    for (let i = 0; i < 10; i++) {
      producer.push(new Float64Array([i, i * 10]));
      if (consumer.pop(out)) {
        collected.push([out[0]!, out[1]!]);
      }
    }

    // Drain remaining
    while (consumer.pop(out)) {
      collected.push([out[0]!, out[1]!]);
    }

    expect(collected).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(collected[i]).toEqual([i, i * 10]);
    }
  });

  test('count property reflects the number of occupied slots accurately', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 1);
    const out = new Float64Array(1);

    expect(producer.count).toBe(0);

    producer.push(new Float64Array([1]));
    expect(producer.count).toBe(1);

    producer.push(new Float64Array([2]));
    producer.push(new Float64Array([3]));
    expect(producer.count).toBe(3);

    consumer.pop(out);
    expect(consumer.count).toBe(2);

    consumer.pop(out);
    consumer.pop(out);
    expect(consumer.count).toBe(0);
  });

  test('producer throws when consumer attempts to push, and vice versa', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 2);
    const data = new Float64Array(2);

    expect(() => consumer.push(data)).toThrow('only the producer may push');
    expect(() => producer.pop(data)).toThrow('only the consumer may pop');
  });

  test('push and pop throw RangeError when slot size does not match', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 3);

    expect(() => producer.push(new Float64Array(2))).toThrow(RangeError);
    expect(() => producer.push(new Float64Array(4))).toThrow(RangeError);
    expect(() => consumer.pop(new Float64Array(1))).toThrow(RangeError);
  });

  test('createPair throws on invalid slotCount or slotSize', () => {
    expect(() => SPSCRing.createPair(0, 1)).toThrow(RangeError);
    expect(() => SPSCRing.createPair(-1, 1)).toThrow(RangeError);
    expect(() => SPSCRing.createPair(1.5, 1)).toThrow(RangeError);
    expect(() => SPSCRing.createPair(4, 0)).toThrow(RangeError);
    expect(() => SPSCRing.createPair(4, -2)).toThrow(RangeError);
  });

  test('attachProducer and attachConsumer share the same SharedArrayBuffer', () => {
    const { buffer } = SPSCRing.createPair(8, 2);

    // Simulate the worker side: attach a new producer to the same buffer
    const workerProducer = SPSCRing.attachProducer(buffer, 8, 2);
    const mainConsumer = SPSCRing.attachConsumer(buffer, 8, 2);

    workerProducer.push(new Float64Array([42.0, 84.0]));

    const out = new Float64Array(2);
    const ok = mainConsumer.pop(out);
    expect(ok).toBe(true);
    expect(out[0]).toBe(42.0);
    expect(out[1]).toBe(84.0);
  });

  test('Atomics operations are visible across attached handles to the same buffer', () => {
    const { buffer } = SPSCRing.createPair(4, 1);

    const producerA = SPSCRing.attachProducer(buffer, 4, 1);
    const consumerA = SPSCRing.attachConsumer(buffer, 4, 1);

    producerA.push(new Float64Array([100]));
    producerA.push(new Float64Array([200]));

    // A second consumer view on the same buffer sees the same count
    const consumerB = SPSCRing.attachConsumer(buffer, 4, 1);
    expect(consumerB.count).toBe(2);

    const out = new Float64Array(1);
    consumerA.pop(out);
    expect(out[0]).toBe(100);

    // consumerB now sees count decremented by consumerA's pop
    expect(consumerB.count).toBe(1);
  });

  test('large slot size preserves all Float64 values through the ring', () => {
    const slotSize = 64;
    const { producer, consumer } = SPSCRing.createPair(4, slotSize);

    const input = new Float64Array(slotSize);
    for (let i = 0; i < slotSize; i++) {
      input[i] = Math.PI * (i + 1);
    }

    producer.push(input);

    const out = new Float64Array(slotSize);
    consumer.pop(out);

    for (let i = 0; i < slotSize; i++) {
      expect(out[i]).toBe(Math.PI * (i + 1));
    }
  });

  test('SharedArrayBuffer byte length accounts for control region and data slots', () => {
    const slotCount = 16;
    const slotSize = 8;
    const { buffer } = SPSCRing.createPair(slotCount, slotSize);

    // Control region: 8 bytes (2 x Int32)
    // Data region: slotCount * slotSize * 8 bytes (Float64)
    const expectedBytes = 8 + slotCount * slotSize * 8;
    expect(buffer.byteLength).toBe(expectedBytes);
  });
});
