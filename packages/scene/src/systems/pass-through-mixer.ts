/**
 * PassThroughMixer — czap's only shipped mixer. Forwards each audio
 * entity's Volume/Pan components verbatim to a receipt sink. Proves
 * the mix vocabulary + system-contract wiring end-to-end without
 * performing any signal processing. Real DSP is user-provided.
 *
 * @module
 */

import { Effect } from 'effect';
import type { System } from '@czap/core';

/** Mix receipt shape emitted by PassThroughMixer per entity per tick. */
export interface MixReceipt {
  readonly frame: number;
  readonly entity: string;
  readonly volume: number;
  readonly pan: number;
}

/** Build a PassThroughMixer keyed to a frame index + receipt sink. */
export function PassThroughMixer(
  frameIndex: number,
  sink: (receipt: MixReceipt) => void,
): System {
  return {
    name: 'PassThroughMixer',
    query: ['AudioSource', 'Volume', 'Pan'],
    execute: (entities) =>
      Effect.gen(function* () {
        for (const e of entities) {
          sink({
            frame: frameIndex,
            entity: e.id,
            volume: e.components.get('Volume') as number,
            pan: e.components.get('Pan') as number,
          });
        }
      }),
  };
}
