/**
 * AudioProcessor -- inline AudioWorklet processor for A/V convergence.
 *
 * Uses the Blob URL pattern: the worklet processor script is inlined
 * as a string and instantiated via a Blob URL.
 *
 * The processor advances the AVBridge sample counter by 128 samples
 * (the standard AudioWorklet render quantum) on each `process()` call.
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

// ---------------------------------------------------------------------------
// Inline worklet script
// ---------------------------------------------------------------------------

const PROCESSOR_SOURCE = /* js */ `
class AVSyncProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sab = options.processorOptions.sab;
    this._i32 = new Int32Array(sab);
    this._running = true;

    this.port.onmessage = (e) => {
      if (e.data === 'start') {
        Atomics.store(this._i32, 1, 1);
        this._running = true;
      } else if (e.data === 'stop') {
        Atomics.store(this._i32, 1, 0);
        this._running = false;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (input && output) {
      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input[ch];
        const outCh = output[ch];
        if (inCh && outCh) {
          outCh.set(inCh);
        }
      }
    }

    if (this._running) {
      Atomics.add(this._i32, 0, 128);
    }

    return true;
  }
}

registerProcessor('av-sync-processor', AVSyncProcessor);
`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Register the inline AV-sync worklet module against `context` and mint
 * a connected {@link AudioProcessor}. Resolves once the worklet module
 * is installed; the caller is responsible for connecting `node.node`
 * into the audio graph.
 *
 * @param context - The target `AudioContext`.
 * @param bridge - Shared AV bridge the worklet will mutate 128 samples
 *   at a time.
 *
 * @example
 * ```ts
 * const bridge = AVBridge.create();
 * const proc = await createAudioProcessor(audioCtx, bridge);
 * proc.node.connect(audioCtx.destination);
 * proc.start();
 * ```
 */
export async function createAudioProcessor(context: AudioContext, bridge: AVBridge.Shape): Promise<AudioProcessor> {
  // reason: AudioWorkletProcessor + AudioWorkletNode only exist inside an AudioWorklet realm; jsdom can't load them, so this factory has no in-process test path. Exercised live by the browser stream-stress E2E.
  /* c8 ignore start */
  const blob = new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const node = new AudioWorkletNode(context, 'av-sync-processor', {
    processorOptions: { sab: bridge.buffer },
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  return {
    node,
    bridge,

    start() {
      bridge.setRunning(true);
      node.port.postMessage('start');
    },

    stop() {
      bridge.setRunning(false);
      node.port.postMessage('stop');
    },

    dispose() {
      bridge.setRunning(false);
      node.port.postMessage('stop');
      node.disconnect();
    },
  };
}
/* c8 ignore stop */
