/**
 * AudioWorklet bootstrap factory. Excluded from coverage because
 * `AudioWorkletProcessor` + `AudioWorkletNode` exist only inside an
 * AudioWorklet realm — jsdom can't load them, and Vitest browser tests
 * don't reach this surface in a deterministic way. Exercised live by
 * the browser stream-stress E2E (`tests/e2e/stream.e2e.ts`).
 *
 * The inline worklet source string lives here to keep `processor.ts`'s
 * surface API (the `AudioProcessor` interface) in coverage.
 *
 * @module
 */

import type { AVBridge } from '@czap/core';
import type { AudioProcessor } from './processor.js';

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

/**
 * Register the inline AV-sync worklet module against `context` and mint
 * a connected {@link AudioProcessor}. Resolves once the worklet module
 * is installed; the caller is responsible for connecting `node.node`
 * into the audio graph.
 *
 * @param context - The target `AudioContext`.
 * @param bridge - Shared AV bridge the worklet will mutate 128 samples
 *   at a time.
 */
export async function createAudioProcessor(context: AudioContext, bridge: AVBridge.Shape): Promise<AudioProcessor> {
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
