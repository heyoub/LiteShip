/**
 * SPSCRing -- lock-free single-producer single-consumer ring buffer tests.
 */

import { describe, test, expect } from 'vitest';
import { SPSCRing } from '@czap/worker';

describe('SPSCRing', () => {
  test('createPair returns buffer, producer, and consumer', () => {
    const { buffer, producer, consumer } = SPSCRing.createPair(4, 2);
    expect(buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(producer.capacity).toBe(4);
    expect(consumer.capacity).toBe(4);
  });

  test('empty buffer has count 0', () => {
    const { consumer } = SPSCRing.createPair(4, 2);
    expect(consumer.count).toBe(0);
  });

  test('push increments count', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 2);
    const data = new Float64Array([1.0, 2.0]);
    expect(producer.push(data)).toBe(true);
    expect(consumer.count).toBe(1);
  });

  test('push then pop round-trips data', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 3);
    const input = new Float64Array([10, 20, 30]);
    producer.push(input);

    const output = new Float64Array(3);
    expect(consumer.pop(output)).toBe(true);
    expect(output[0]).toBe(10);
    expect(output[1]).toBe(20);
    expect(output[2]).toBe(30);
  });

  test('pop returns false when buffer is empty', () => {
    const { consumer } = SPSCRing.createPair(4, 2);
    const output = new Float64Array(2);
    expect(consumer.pop(output)).toBe(false);
  });

  test('push returns false when buffer is full', () => {
    const { producer } = SPSCRing.createPair(2, 1);
    const data = new Float64Array([1]);
    expect(producer.push(data)).toBe(true);
    expect(producer.push(data)).toBe(true);
    expect(producer.push(data)).toBe(false); // full
  });

  test('FIFO ordering is preserved', () => {
    const { producer, consumer } = SPSCRing.createPair(4, 1);
    producer.push(new Float64Array([100]));
    producer.push(new Float64Array([200]));
    producer.push(new Float64Array([300]));

    const out = new Float64Array(1);
    consumer.pop(out);
    expect(out[0]).toBe(100);
    consumer.pop(out);
    expect(out[0]).toBe(200);
    consumer.pop(out);
    expect(out[0]).toBe(300);
  });

  test('slots recycle after pop', () => {
    const { producer, consumer } = SPSCRing.createPair(2, 1);
    const data = new Float64Array([1]);
    const out = new Float64Array(1);

    // Fill
    producer.push(data);
    producer.push(data);
    expect(producer.push(data)).toBe(false);

    // Drain one
    consumer.pop(out);

    // Now we can push again
    expect(producer.push(new Float64Array([42]))).toBe(true);

    // Pop both remaining
    consumer.pop(out);
    expect(out[0]).toBe(1);
    consumer.pop(out);
    expect(out[0]).toBe(42);
  });

  test('consumer cannot push', () => {
    const { consumer } = SPSCRing.createPair(4, 1);
    expect(() => consumer.push(new Float64Array([1]))).toThrow('only the producer may push');
  });

  test('producer cannot pop', () => {
    const { producer } = SPSCRing.createPair(4, 1);
    expect(() => producer.pop(new Float64Array(1))).toThrow('only the consumer may pop');
  });

  test('wrong slot size throws on push', () => {
    const { producer } = SPSCRing.createPair(4, 3);
    expect(() => producer.push(new Float64Array(2))).toThrow('expected slot size 3');
  });

  test('wrong slot size throws on pop', () => {
    const { consumer } = SPSCRing.createPair(4, 3);
    expect(() => consumer.pop(new Float64Array(2))).toThrow('expected slot size 3');
  });

  test('invalid slotCount throws', () => {
    expect(() => SPSCRing.createPair(0, 1)).toThrow();
    expect(() => SPSCRing.createPair(-1, 1)).toThrow();
    expect(() => SPSCRing.createPair(1.5, 1)).toThrow();
  });

  test('invalid slotSize throws', () => {
    expect(() => SPSCRing.createPair(4, 0)).toThrow();
    expect(() => SPSCRing.createPair(4, -2)).toThrow();
  });

  test('attachProducer creates producer from existing SAB', () => {
    const { buffer } = SPSCRing.createPair(4, 2);
    const producer = SPSCRing.attachProducer(buffer, 4, 2);
    expect(producer.capacity).toBe(4);
    expect(producer.push(new Float64Array([1, 2]))).toBe(true);
  });

  test('attachConsumer creates consumer from existing SAB', () => {
    const { buffer, producer } = SPSCRing.createPair(4, 2);
    producer.push(new Float64Array([10, 20]));

    const consumer = SPSCRing.attachConsumer(buffer, 4, 2);
    const out = new Float64Array(2);
    expect(consumer.pop(out)).toBe(true);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
  });

  test('attachProducer throws RangeError for invalid slotCount', () => {
    const sab = new SharedArrayBuffer(64);
    expect(() => SPSCRing.attachProducer(sab, 0, 2)).toThrow(RangeError);
    expect(() => SPSCRing.attachProducer(sab, -1, 2)).toThrow(RangeError);
    expect(() => SPSCRing.attachProducer(sab, 1.5, 2)).toThrow(RangeError);
  });

  test('attachConsumer throws RangeError for invalid slotSize', () => {
    const sab = new SharedArrayBuffer(64);
    expect(() => SPSCRing.attachConsumer(sab, 4, 0)).toThrow(RangeError);
    expect(() => SPSCRing.attachConsumer(sab, 4, -1)).toThrow(RangeError);
    expect(() => SPSCRing.attachConsumer(sab, 4, 1.5)).toThrow(RangeError);
  });
});
