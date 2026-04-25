/**
 * Scene contract — typed declaration shape for a sceneComposition capsule.
 * Track helpers in `track.ts` produce values of these shapes.
 *
 * @module
 */

import type { Site } from '@czap/core';
import type { TrackId as _TrackId, TrackKind as _TrackKind } from '@czap/_spine';
import type { BeatBinding } from './capsules/beat-binding.js';

/** Closed set of track kinds. */
export type TrackKind = _TrackKind;

/**
 * Phantom-kinded track identifier — `K` discriminates between video,
 * audio, transition, and effect. Cross-kind assignment fails at compile
 * time, so e.g. `syncTo.beat(videoId)` is a type error.
 */
export type TrackId<K extends TrackKind> = _TrackId<K>;

/** Video track — renders a quantizer-driven source for its frame range. */
export interface VideoTrack {
  readonly kind: 'video';
  readonly id: TrackId<'video'>;
  readonly from: number;
  readonly to: number;
  readonly source: unknown;
  readonly layer?: number;
}

/** Audio track — plays an asset with optional mix metadata. */
export interface AudioTrack {
  readonly kind: 'audio';
  readonly id: TrackId<'audio'>;
  readonly from: number;
  readonly to: number;
  readonly source: string;
  readonly mix?: {
    readonly volume?: number;
    readonly pan?: number;
    readonly sync?: { readonly bpm?: number };
  };
}

/** Transition track — blends two video tracks across a frame window. */
export interface TransitionTrack {
  readonly kind: 'transition';
  readonly id: TrackId<'transition'>;
  readonly from: number;
  readonly to: number;
  readonly transitionKind: 'crossfade' | 'swipe.left' | 'swipe.right' | 'zoom.in' | 'zoom.out' | 'cut';
  readonly between: readonly [TrackId<'video'>, TrackId<'video'>];
}

/** Effect track — applies an intensity curve to a target video track, optionally synced to audio. */
export interface EffectTrack {
  readonly kind: 'effect';
  readonly id: TrackId<'effect'>;
  readonly from: number;
  readonly to: number;
  readonly effectKind: 'pulse' | 'glow' | 'shake' | 'zoom' | 'desaturate';
  readonly target: TrackId<'video'>;
  readonly syncTo?: { readonly anchor: TrackId<'audio'>; readonly mode: 'beat' | 'onset' | 'peak' };
}

/** Track union — closed set of four helper-produced shapes. */
export type Track = VideoTrack | AudioTrack | TransitionTrack | EffectTrack;

/** Scene invariant — evaluated against the contract at compile time. */
export interface SceneInvariant {
  readonly name: string;
  readonly check: (scene: SceneContract) => boolean;
  readonly message: string;
}

/**
 * Pre-resolved beat marker on a {@link SceneContract}. Aliased to
 * `BeatBinding.Component` from `./capsules/beat-binding.ts` — single
 * source of truth so adding a field (e.g. `pitch`) doesn't require
 * keeping two structurally-identical declarations in sync.
 */
export type SceneBeat = BeatBinding.Component;

/** Top-level scene contract — typed declaration shape for an entire composition. */
export interface SceneContract {
  readonly name: string;
  readonly duration: number;
  readonly fps: number;
  readonly bpm: number;
  readonly tracks: readonly Track[];
  readonly invariants: readonly SceneInvariant[];
  readonly budgets: { readonly p95FrameMs: number; readonly memoryMb?: number };
  readonly site: readonly Site[];
  /**
   * Optional pre-resolved beat markers. When present, the scene
   * compiler propagates them onto the {@link CompiledScene} and the
   * runtime spawns one Beat entity per marker before systems are
   * registered. SyncSystem queries the world for `Beat` components
   * each tick to compute beat-decay intensity.
   */
  readonly beats?: readonly SceneBeat[];
}
