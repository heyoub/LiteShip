/**
 * TokenBuffer -- ring buffer that absorbs bursty LLM token arrival
 * and emits at smooth cadence.
 *
 * Backed by pre-allocated array (zero-alloc push/drain).
 * EMA (exponential moving average) for rate estimation.
 * Stall detection: buffer empty + `gen < consume`.
 *
 * @module
 */

interface TokenBufferShape<T = string> {
  push(token: T): void;
  drain(maxCount?: number): T[];
  reset(): void;
  readonly occupancy: number;
  readonly generationRate: number;
  readonly consumptionRate: number;
  readonly isStalled: boolean;
  readonly length: number;
  readonly capacity: number;
}

interface TokenBufferConfig {
  readonly capacity?: number;
  readonly emaAlpha?: number;
}

function _make<T = string>(config?: TokenBufferConfig): TokenBufferShape<T> {
  const capacity = config?.capacity ?? 256;
  const alpha = config?.emaAlpha ?? 0.1;

  // Ring buffer backing store
  const buffer: (T | undefined)[] = new Array(capacity);
  let head = 0; // next write position
  let tail = 0; // next read position
  let count = 0;

  // Rate estimation
  let genRate = 0; // tokens/sec EMA
  let consumeRate = 0;
  let lastPushTime = 0;
  let lastDrainTime = 0;

  function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  return {
    push(token: T): void {
      const t = now();
      if (lastPushTime > 0) {
        const dt = (t - lastPushTime) / 1000;
        if (dt > 0) {
          const instantRate = 1 / dt;
          genRate = genRate === 0 ? instantRate : genRate * (1 - alpha) + instantRate * alpha;
        }
      }
      lastPushTime = t;

      if (count < capacity) {
        buffer[head] = token;
        head = (head + 1) % capacity;
        count++;
      } else {
        // Overflow: overwrite oldest (drop tail)
        buffer[head] = token;
        head = (head + 1) % capacity;
        tail = (tail + 1) % capacity;
      }
    },

    drain(maxCount?: number): T[] {
      const max = maxCount ?? count;
      const drainSize = Math.min(max, count);
      if (drainSize === 0) return [];

      const t = now();
      if (lastDrainTime > 0) {
        const dt = (t - lastDrainTime) / 1000;
        if (dt > 0) {
          const instantRate = drainSize / dt;
          consumeRate = consumeRate === 0 ? instantRate : consumeRate * (1 - alpha) + instantRate * alpha;
        }
      }
      lastDrainTime = t;

      const result: T[] = [];
      for (let i = 0; i < drainSize; i++) {
        result.push(buffer[tail]!);
        buffer[tail] = undefined;
        tail = (tail + 1) % capacity;
        count--;
      }

      return result;
    },

    reset(): void {
      head = 0;
      tail = 0;
      count = 0;
      genRate = 0;
      consumeRate = 0;
      lastPushTime = 0;
      lastDrainTime = 0;
      buffer.fill(undefined);
    },

    get occupancy(): number {
      return count / capacity;
    },

    get generationRate(): number {
      return genRate;
    },

    get consumptionRate(): number {
      return consumeRate;
    },

    get isStalled(): boolean {
      return count === 0 && genRate > 0 && genRate < consumeRate;
    },

    get length(): number {
      return count;
    },

    get capacity(): number {
      return capacity;
    },
  };
}

/**
 * TokenBuffer — zero-alloc ring buffer that absorbs bursty LLM token arrival
 * and hands tokens out at a smooth cadence. Reports stall via `isStalled`
 * and rate via an internal EMA.
 */
export const TokenBuffer = {
  /** Build a new buffer — pass capacity or reuse defaults. */
  make: _make,
};

export declare namespace TokenBuffer {
  /** Structural shape of a token buffer: `push`, `drain`, `reset`, stall/rate accessors. */
  export type Shape<T = string> = TokenBufferShape<T>;
  /** Configuration accepted by {@link TokenBuffer.make}. */
  export type Config = TokenBufferConfig;
}
