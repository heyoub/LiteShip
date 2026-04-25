/**
 * Layout — helpers that arrange video tracks spatially by assigning
 * ECS `TrackLayer` component values. Callers pass pre-built tracks
 * and receive the same tracks with `layer` set.
 *
 * @module
 */

import type { VideoTrack } from '../contract.js';

/** Assign ascending layer values — first track on layer 0, next on 1, etc. */
const stack = (tracks: readonly VideoTrack[]): readonly VideoTrack[] =>
  tracks.map((t, i) => ({ ...t, layer: i }));

/** Assign layer values based on column count — tracks in the same row share a layer. */
const grid = (cols: number, tracks: readonly VideoTrack[]): readonly VideoTrack[] =>
  tracks.map((t, i) => ({ ...t, layer: Math.floor(i / cols) }));

/** Layout helpers for multi-track arrangement. */
export const Layout = { stack, grid } as const;
