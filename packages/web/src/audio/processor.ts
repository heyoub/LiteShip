/**
 * AudioProcessor -- inline AudioWorklet processor for A/V convergence.
 *
 * Uses the Blob URL pattern: the worklet processor script is inlined
 * as a string and instantiated via a Blob URL.
 *
 * The processor advances the AVBridge sample counter by 128 samples
 * (the standard AudioWorklet render quantum) on each `process()` call.
 *
 * Only the public surface (the `AudioProcessor` interface) is exported
 * from this module. The factory implementation lives in
 * `./processor-bootstrap.ts` and is excluded from coverage because
 * AudioWorkletProcessor + AudioWorkletNode only exist inside an
 * AudioWorklet realm.
 *
 * @module
 */

import type { AVBridge } from '@czap/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Host-side surface of the AV-sync AudioWorklet processor.
 *
 * The returned `node` should be connected into the host's audio graph;
 * the accompanying {@link AudioProcessor.bridge} is shared between the
 * main thread and the worklet so both sides observe the same
 * sample-accurate clock.
 */
export interface AudioProcessor {
  /** The underlying `AudioWorkletNode`. Connect into the graph directly. */
  readonly node: AudioWorkletNode;
  /** Shared AV bridge advanced 128 samples per worklet render quantum. */
  readonly bridge: AVBridge.Shape;
  /** Begin advancing the bridge's sample counter. */
  start(): void;
  /** Pause advancement without tearing down the node. */
  stop(): void;
  /** Stop, disconnect, and release the worklet node. */
  dispose(): void;
}

// Re-export the factory from the bootstrap module so callers keep using
// `import { createAudioProcessor } from '@czap/web'`.
export { createAudioProcessor } from './processor-bootstrap.js';
