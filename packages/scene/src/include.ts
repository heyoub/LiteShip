/**
 * Scene.include — compose one scene inside another. The sub-scene's
 * tracks get a time offset and an id prefix so parent + child can
 * coexist in the same ECS world without id collisions.
 *
 * @module
 */

import type { SceneContract, Track, TrackId, TrackKind } from './contract.js';
import { SceneRuntime } from './runtime.js';

/**
 * Partial sub-scene declaration — the parent supplies the missing
 * `bpm` / `fps` defaults via {@link Scene.subscene}. Any explicit
 * `bpm` / `fps` on the partial wins over the inherited parent value.
 */
export type SceneSubscenePartial = Omit<SceneContract, 'bpm' | 'fps'> & {
  readonly bpm?: number;
  readonly fps?: number;
};

/** Scene composition helpers. */
export const Scene = {
  /** Include a sub-scene's tracks with the given offset and id prefix. */
  include(sub: SceneContract, opts: { offset: number }): readonly Track[] {
    return sub.tracks.map((t) => shift(t, sub.name, opts.offset));
  },
  /**
   * Author a sub-scene that inherits `bpm` / `fps` from its parent.
   *
   * Spec §5.4 promised compositional inheritance: when authoring a
   * child scene that's included into a parent, the BPM/fps should
   * default to the parent's so authors don't have to repeat them
   * (and risk drift). This helper fills the missing fields from the
   * parent contract; explicit fields on `partial` win.
   *
   * Lightweight — no Effect Context.Tag is introduced. If/when more
   * threaded state appears, the merged shape is the seam to promote.
   */
  subscene(parent: { readonly bpm: number; readonly fps: number }, partial: SceneSubscenePartial): SceneContract {
    return {
      ...partial,
      bpm: partial.bpm ?? parent.bpm,
      fps: partial.fps ?? parent.fps,
    };
  },
  /**
   * Build a live, tickable runtime handle from a compiled scene.
   * Sugar over {@link SceneRuntime.build} — see `./runtime.ts`.
   */
  runtime: SceneRuntime.build,
} as const;

/** Re-prefix a phantom-kinded TrackId. The brand is preserved across the cast. */
const prefixed = <K extends TrackKind>(prefix: string, id: TrackId<K>): TrackId<K> => `${prefix}/${id}` as TrackId<K>;

function shift(t: Track, prefix: string, offset: number): Track {
  if (t.kind === 'transition') {
    return {
      ...t,
      id: prefixed(prefix, t.id),
      from: t.from + offset,
      to: t.to + offset,
      between: [prefixed(prefix, t.between[0]), prefixed(prefix, t.between[1])] as const,
    };
  }
  if (t.kind === 'effect') {
    return {
      ...t,
      id: prefixed(prefix, t.id),
      from: t.from + offset,
      to: t.to + offset,
      target: prefixed(prefix, t.target),
      syncTo: t.syncTo !== undefined ? { ...t.syncTo, anchor: prefixed(prefix, t.syncTo.anchor) } : undefined,
    };
  }
  if (t.kind === 'audio') {
    return { ...t, id: prefixed(prefix, t.id), from: t.from + offset, to: t.to + offset };
  }
  return { ...t, id: prefixed(prefix, t.id), from: t.from + offset, to: t.to + offset };
}
