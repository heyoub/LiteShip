/**
 * SPSCRing -- lock-free single-producer single-consumer ring buffer
 * backed by SharedArrayBuffer.
 *
 * Designed for real-time compositor state streaming between a Worker
 * (producer) and the main thread (consumer) without blocking either side.
 *
 * ## SharedArrayBuffer requirements
 *
 * SharedArrayBuffer requires the page to be served with the following
 * HTTP headers (COOP/COEP):
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * Without these headers, `new SharedArrayBuffer(...)` will throw.
 *
 * ## Memory layout
 *
 * ```
 * Int32Array view (control region):
 *   [0]: write cursor  (atomically incremented by producer)
 *   [1]: read cursor   (atomically incremented by consumer)
 *
 * Float64Array view (data region):
 *   Offset = 8 bytes (aligned after two Int32 control slots)
 *   [0 .. slotCount * slotSize - 1]: ring buffer data slots
 * ```
 *
 * The producer writes at `writeCursor % slotCount`, the consumer reads
 * at `readCursor % slotCount`. The buffer is full when
 * `write - read === slotCount`, empty when `write === read`.
 *
 * Only `Atomics.load` and `Atomics.store` are used -- no `Atomics.wait`
 * or `Atomics.notify` -- keeping this fully lock-free and non-blocking.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Byte offset where the Int32 control slots live. */
const WRITE_CURSOR_INDEX = 0;
const READ_CURSOR_INDEX = 1;

/**
 * Byte size of the control region: two Int32 values (8 bytes),
 * padded to 8-byte alignment for the Float64 data region.
 */
const CONTROL_BYTES = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Producer- or consumer-side handle to a single-producer/single-consumer
 * ring buffer backed by `SharedArrayBuffer`. Created by
 * {@link SPSCRing.attachProducer} or {@link SPSCRing.attachConsumer}.
 */
export interface SPSCRingBufferShape {
  /**
   * Push a data slot into the ring buffer.
   * Returns `false` if the buffer is full (non-blocking).
   */
  push(data: Float64Array): boolean;

  /**
   * Pop a data slot from the ring buffer into the provided output array.
   * Returns `false` if the buffer is empty (non-blocking).
   */
  pop(out: Float64Array): boolean;

  /** Number of slots in the ring buffer. */
  readonly capacity: number;

  /** Current number of occupied slots. */
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function _createBuffer(slotCount: number, slotSize: number): SharedArrayBuffer {
  const dataBytes = slotCount * slotSize * Float64Array.BYTES_PER_ELEMENT;
  return new SharedArrayBuffer(CONTROL_BYTES + dataBytes);
}

function _makeRing(
  sab: SharedArrayBuffer,
  slotCount: number,
  slotSize: number,
  role: 'producer' | 'consumer',
): SPSCRingBufferShape {
  if (slotCount <= 0 || !Number.isInteger(slotCount)) {
    throw new RangeError(`SPSCRingBuffer: slotCount must be a positive integer, got ${slotCount}`);
  }
  if (slotSize <= 0 || !Number.isInteger(slotSize)) {
    throw new RangeError(`SPSCRingBuffer: slotSize must be a positive integer, got ${slotSize}`);
  }
  const control = new Int32Array(sab, 0, 2);
  const data = new Float64Array(sab, CONTROL_BYTES);

  return {
    push(input: Float64Array): boolean {
      if (role !== 'producer') {
        throw new Error('SPSCRingBuffer: only the producer may push');
      }
      if (input.length !== slotSize) {
        throw new RangeError(`SPSCRingBuffer: expected slot size ${slotSize}, got ${input.length}`);
      }

      const write = Atomics.load(control, WRITE_CURSOR_INDEX);
      const read = Atomics.load(control, READ_CURSOR_INDEX);

      // Full when write - read === slotCount
      if (write - read >= slotCount) {
        return false;
      }

      const slotIndex = (write % slotCount) * slotSize;
      for (let i = 0; i < slotSize; i++) {
        data[slotIndex + i] = input[i]!;
      }

      // Store with release semantics: the data write must be visible
      // before the cursor advances. Atomics.store on Int32Array provides
      // a sequentially consistent store which is stronger than needed
      // but correct.
      Atomics.store(control, WRITE_CURSOR_INDEX, write + 1);
      return true;
    },

    pop(out: Float64Array): boolean {
      if (role !== 'consumer') {
        throw new Error('SPSCRingBuffer: only the consumer may pop');
      }
      if (out.length !== slotSize) {
        throw new RangeError(`SPSCRingBuffer: expected slot size ${slotSize}, got ${out.length}`);
      }

      const write = Atomics.load(control, WRITE_CURSOR_INDEX);
      const read = Atomics.load(control, READ_CURSOR_INDEX);

      // Empty when write === read
      if (write === read) {
        return false;
      }

      const slotIndex = (read % slotCount) * slotSize;
      for (let i = 0; i < slotSize; i++) {
        out[i] = data[slotIndex + i]!;
      }

      Atomics.store(control, READ_CURSOR_INDEX, read + 1);
      return true;
    },

    get capacity(): number {
      return slotCount;
    },

    get count(): number {
      const write = Atomics.load(control, WRITE_CURSOR_INDEX);
      const read = Atomics.load(control, READ_CURSOR_INDEX);
      return write - read;
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a matched producer/consumer pair sharing the same SharedArrayBuffer.
 *
 * Typically called on the main thread; the `buffer` (SharedArrayBuffer) is
 * then transferred to the Worker via `postMessage`, and the Worker calls
 * `SPSCRing.attachProducer` to get its side of the ring.
 *
 * @example
 * ```ts
 * import { SPSCRing } from '@czap/worker';
 *
 * const { buffer, producer, consumer } = SPSCRing.createPair(64, 4);
 * // producer.push(new Float64Array([1, 2, 3, 4])); // true
 * // consumer.pop(new Float64Array(4));              // true
 * // Transfer buffer to a Worker via postMessage
 * worker.postMessage({ buffer, slotCount: 64, slotSize: 4 });
 * ```
 *
 * @param slotCount - Number of slots in the ring (power of 2 recommended)
 * @param slotSize  - Number of Float64 values per slot
 * @returns An object with the shared buffer and producer/consumer ring handles
 */
function _createPair(
  slotCount: number,
  slotSize: number,
): {
  buffer: SharedArrayBuffer;
  producer: SPSCRingBufferShape;
  consumer: SPSCRingBufferShape;
} {
  const buffer = _createBuffer(slotCount, slotSize);
  return {
    buffer,
    producer: _makeRing(buffer, slotCount, slotSize, 'producer'),
    consumer: _makeRing(buffer, slotCount, slotSize, 'consumer'),
  };
}

/**
 * Attach as producer to an existing SharedArrayBuffer.
 * Call this inside the Worker that produces data.
 *
 * @example
 * ```ts
 * import { SPSCRing } from '@czap/worker';
 *
 * // Inside a Worker's message handler:
 * self.onmessage = (e) => {
 *   const { buffer, slotCount, slotSize } = e.data;
 *   const producer = SPSCRing.attachProducer(buffer, slotCount, slotSize);
 *   const data = new Float64Array([1.0, 2.0, 3.0, 4.0]);
 *   producer.push(data); // true if buffer not full
 * };
 * ```
 *
 * @param sab       - The SharedArrayBuffer from the main thread
 * @param slotCount - Number of slots (must match createPair)
 * @param slotSize  - Float64 values per slot (must match createPair)
 * @returns A producer-side {@link SPSCRingBufferShape}
 */
function _attachProducer(sab: SharedArrayBuffer, slotCount: number, slotSize: number): SPSCRingBufferShape {
  return _makeRing(sab, slotCount, slotSize, 'producer');
}

/**
 * Attach as consumer to an existing SharedArrayBuffer.
 * Call this on the main thread that consumes data.
 *
 * @example
 * ```ts
 * import { SPSCRing } from '@czap/worker';
 *
 * // On the main thread after receiving buffer from Worker:
 * const consumer = SPSCRing.attachConsumer(sharedBuffer, 64, 4);
 * const out = new Float64Array(4);
 * if (consumer.pop(out)) {
 *   console.log('Received:', out); // Float64Array [1.0, 2.0, 3.0, 4.0]
 * }
 * ```
 *
 * @param sab       - The SharedArrayBuffer shared with the producer
 * @param slotCount - Number of slots (must match createPair)
 * @param slotSize  - Float64 values per slot (must match createPair)
 * @returns A consumer-side {@link SPSCRingBufferShape}
 */
function _attachConsumer(sab: SharedArrayBuffer, slotCount: number, slotSize: number): SPSCRingBufferShape {
  return _makeRing(sab, slotCount, slotSize, 'consumer');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * SPSC ring buffer namespace.
 *
 * Lock-free single-producer single-consumer ring buffer backed by
 * `SharedArrayBuffer`. Designed for real-time compositor state streaming
 * between a Worker (producer) and the main thread (consumer) without
 * blocking either side. Uses only `Atomics.load`/`Atomics.store` --
 * fully non-blocking.
 *
 * @example
 * ```ts
 * import { SPSCRing } from '@czap/worker';
 *
 * // Main thread: create pair and send buffer to Worker
 * const { buffer, producer, consumer } = SPSCRing.createPair(128, 8);
 * worker.postMessage({ buffer, slotCount: 128, slotSize: 8 });
 *
 * // In Worker: attach as producer
 * // const producer = SPSCRing.attachProducer(buffer, 128, 8);
 * // producer.push(new Float64Array(8));
 *
 * // Main thread: consume in animation loop
 * const out = new Float64Array(8);
 * function frame() {
 *   while (consumer.pop(out)) { /* process out *\/ }
 *   requestAnimationFrame(frame);
 * }
 * ```
 */
export const SPSCRing = {
  createPair: _createPair,
  attachProducer: _attachProducer,
  attachConsumer: _attachConsumer,
} as const;

export declare namespace SPSCRing {
  /** Producer- or consumer-facing view of a SPSC ring buffer. */
  export type Shape = SPSCRingBufferShape;
}
