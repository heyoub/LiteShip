/**
 * TokenBuffer -- push/drain/occupancy/rate estimation/stall detection.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { TokenBuffer } from '@czap/core';

describe('TokenBuffer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('make creates empty buffer with default capacity', () => {
    const buf = TokenBuffer.make();
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(256);
    expect(buf.occupancy).toBe(0);
  });

  test('make creates buffer with custom capacity', () => {
    const buf = TokenBuffer.make({ capacity: 16 });
    expect(buf.capacity).toBe(16);
  });

  test('push adds tokens', () => {
    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('hello');
    buf.push('world');
    expect(buf.length).toBe(2);
  });

  test('drain returns pushed tokens in order', () => {
    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('a');
    buf.push('b');
    buf.push('c');
    const tokens = buf.drain();
    expect(tokens).toEqual(['a', 'b', 'c']);
    expect(buf.length).toBe(0);
  });

  test('drain with maxCount limits returned tokens', () => {
    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('a');
    buf.push('b');
    buf.push('c');
    const tokens = buf.drain(2);
    expect(tokens).toEqual(['a', 'b']);
    expect(buf.length).toBe(1);
  });

  test('drain on empty buffer returns empty array', () => {
    const buf = TokenBuffer.make({ capacity: 8 });
    const tokens = buf.drain();
    expect(tokens).toEqual([]);
  });

  test('occupancy tracks buffer fullness', () => {
    const buf = TokenBuffer.make({ capacity: 4 });
    expect(buf.occupancy).toBe(0);
    buf.push('a');
    expect(buf.occupancy).toBe(0.25);
    buf.push('b');
    expect(buf.occupancy).toBe(0.5);
    buf.push('c');
    buf.push('d');
    expect(buf.occupancy).toBe(1);
  });

  test('overflow overwrites oldest tokens', () => {
    const buf = TokenBuffer.make({ capacity: 3 });
    buf.push('a');
    buf.push('b');
    buf.push('c');
    buf.push('d'); // Overwrites 'a'
    expect(buf.length).toBe(3);
    const tokens = buf.drain();
    expect(tokens).toEqual(['b', 'c', 'd']);
  });

  test('generationRate is initially 0', () => {
    const buf = TokenBuffer.make();
    expect(buf.generationRate).toBe(0);
  });

  test('consumptionRate is initially 0', () => {
    const buf = TokenBuffer.make();
    expect(buf.consumptionRate).toBe(0);
  });

  test('isStalled is false when buffer has tokens', () => {
    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('a');
    expect(buf.isStalled).toBe(false);
  });

  test('works with non-string types', () => {
    const buf = TokenBuffer.make<number>({ capacity: 4 });
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.drain()).toEqual([1, 2, 3]);
  });

  test('interleaved push and drain works correctly', () => {
    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('a');
    buf.push('b');
    expect(buf.drain(1)).toEqual(['a']);
    buf.push('c');
    expect(buf.drain()).toEqual(['b', 'c']);
    expect(buf.length).toBe(0);
  });

  test('falls back to Date.now when performance is unavailable', () => {
    const originalPerformance = globalThis.performance;
    vi.stubGlobal('performance', undefined);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100);

    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('a');

    expect(nowSpy).toHaveBeenCalled();
    globalThis.performance = originalPerformance;
  });

  test('ignores non-positive elapsed time when estimating rates', () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(200);

    const buf = TokenBuffer.make({ capacity: 8 });
    buf.push('a');
    buf.push('b');
    expect(buf.generationRate).toBe(0);

    expect(buf.drain(1)).toEqual(['a']);
    expect(buf.drain(1)).toEqual(['b']);
    expect(buf.consumptionRate).toBe(0);
  });
});
