/**
 * `@czap/worker` -- off-main-thread compositor and render workers.
 *
 * This package ships:
 *
 * - {@link SPSCRing}: lock-free single-producer/single-consumer ring
 *   backed by `SharedArrayBuffer`, used for real-time state streaming
 *   from a worker to the main thread.
 * - {@link CompositorWorker}: a factory that spins up a worker which
 *   evaluates quantizer boundaries and emits `CompositeState`.
 * - {@link RenderWorker}: a factory for a worker that renders
 *   `VideoFrameOutput` into an `OffscreenCanvas`.
 * - {@link WorkerHost}: a thin lifecycle wrapper around `Worker` with
 *   typed message helpers.
 *
 * ## SharedArrayBuffer requirements
 *
 * The SPSC ring buffer uses `SharedArrayBuffer`, which requires the page
 * to be served with the following HTTP headers:
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * Workers created by this package use inline Blob URLs and do not require
 * separate worker entry files or bundler configuration.
 *
 * @module
 */

// Messages
export { Messages } from './messages.js';
export type { ToWorkerMessage, FromWorkerMessage, WorkerConfig } from './messages.js';

// SPSC Ring Buffer
export { SPSCRing } from './spsc-ring.js';
export type { SPSCRingBufferShape } from './spsc-ring.js';

// Compositor Worker
export { CompositorWorker } from './compositor-worker.js';
export type { CompositorWorkerShape, CompositorWorkerState } from './compositor-types.js';

// Render Worker
export { RenderWorker } from './render-worker.js';
export type { RenderWorkerShape } from './render-worker.js';

// Host
export { WorkerHost } from './host.js';
export type { WorkerHostShape } from './host.js';
