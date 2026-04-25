/**
 * Beat() — typed beat-count handle that a scene compiler resolves to
 * a frame index using the scene's BPM + fps. Authors write
 * `from: Beat(4)` and never touch millisecond arithmetic.
 *
 * @module
 */

/** Beat handle produced by `Beat(count)`. */
export interface BeatHandle {
  /** Discriminant tag. */
  readonly _t: 'beat';
  /** Number of beats (may be fractional). */
  readonly count: number;
}

/** Build a beat handle with the given count (may be fractional). */
export function Beat(count: number): BeatHandle {
  return { _t: 'beat', count };
}

/** Resolve a BeatHandle to a frame index using scene BPM and fps. */
export function resolveBeat(handle: BeatHandle, ctx: { bpm: number; fps: number }): number {
  const seconds = (handle.count * 60) / ctx.bpm;
  return seconds * ctx.fps;
}
