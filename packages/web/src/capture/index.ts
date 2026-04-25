/**
 * `@czap/web` capture -- video capture pipeline.
 *
 * Re-exports WebCodecs capture, canvas rendering, and pipeline orchestration.
 *
 * @module
 */

export { WebCodecsCapture } from './webcodecs.js';
export type { WebCodecsCaptureOptions } from './webcodecs.js';

export { renderToCanvas } from './render.js';
export type { RenderFn } from './render.js';

export { captureVideo } from './pipeline.js';
