/**
 * Scene compiler — translates a {@link SceneContract} into a pure
 * {@link CompiledScene} descriptor: track spawns + per-track component
 * seeds, plus name/duration/fps/bpm carried across so the runtime can
 * derive frame indices.
 *
 * World construction is intentionally deferred to {@link SceneRuntime}
 * (see `./runtime.ts`). Previously this function wrapped a
 * `World.make()` in `Effect.scoped(...)` and returned the world AFTER
 * the scope closed — i.e. a dead world — and attached a
 * `registeredSystems: string[]` metadata field via an `as unknown`
 * cast WITHOUT ever calling `world.addSystem`. That theatre is gone:
 * compileScene is now a pure descriptor producer, and the runtime
 * registers the 6 canonical systems.
 *
 * @module
 */

import type { SceneContract, Track, TrackId, TrackKind } from './contract.js';
import type { BeatBinding } from './capsules/beat-binding.js';

/**
 * One compiled track — the components the runtime should spawn for it.
 * The `trackId` is preserved from the contract so downstream code can
 * cross-reference (e.g. transition `between` refs).
 */
export interface TrackSpawn {
  /** The phantom-kinded id of the source track. */
  readonly trackId: TrackId<TrackKind>;
  /** Component seed map passed to `world.spawn(...)` when {@link SceneRuntime} builds the ECS world. */
  readonly components: Readonly<Record<string, unknown>>;
}

/**
 * The descriptor produced by {@link compileScene}. Pure data —
 * no Effects, no scope, no world. Hand it to {@link SceneRuntime.build}
 * to obtain a live tickable handle.
 */
export interface CompiledScene {
  readonly name: string;
  readonly duration: number;
  readonly fps: number;
  readonly bpm: number;
  readonly trackSpawns: readonly TrackSpawn[];
  /**
   * Pre-computed beat markers (Task 9 wired these via the
   * `scene.beat-binding` sceneComposition capsule). Each entry becomes
   * a `Beat`-tagged ECS entity at runtime build time so SyncSystem can
   * query the world for beats instead of reading closure state.
   *
   * Empty for vanilla compile — scenes that need beat-driven sync
   * declare them via {@link SceneContract.beats} or pull from a
   * referenced BeatMarkerProjection asset.
   */
  readonly beats: readonly BeatBinding.Component[];
}

/**
 * Compile a {@link SceneContract} into a pure {@link CompiledScene}
 * descriptor. No world is constructed here — see {@link SceneRuntime}.
 *
 * If the scene declares a `beats?` field, those beat markers are
 * propagated unchanged onto the compiled descriptor. The runtime
 * spawns one Beat-tagged entity per marker before registering systems
 * (see SceneRuntime.build) so SyncSystem can query them on the first
 * tick. Asset-derived beats (BeatMarkerProjection) are wired by feeding
 * the projection's output into `scene.beats` ahead of compile.
 */
export function compileScene(scene: SceneContract): CompiledScene {
  const trackSpawns: TrackSpawn[] = scene.tracks.map((track) => ({
    trackId: track.id,
    components: componentsFromTrack(track),
  }));

  // Defensive copy: callers may freeze, mutate, or reuse the input
  // beats array; the compiled descriptor owns its own sequence.
  const beats: readonly BeatBinding.Component[] = scene.beats !== undefined ? scene.beats.map((b) => ({ ...b })) : [];

  return {
    name: scene.name,
    duration: scene.duration,
    fps: scene.fps,
    bpm: scene.bpm,
    trackSpawns,
    beats,
  };
}

function componentsFromTrack(track: Track): Record<string, unknown> {
  switch (track.kind) {
    case 'video':
      return {
        VideoSource: track.source,
        FrameRange: { from: track.from, to: track.to },
        TrackLayer: track.layer ?? 0,
      };
    case 'audio':
      return {
        AudioSource: track.source,
        FrameRange: { from: track.from, to: track.to },
        Volume: track.mix?.volume ?? 0,
        Pan: track.mix?.pan ?? 0,
        ...(track.mix?.sync?.bpm !== undefined ? { SyncBeatMarker: { bpm: track.mix.sync.bpm } } : {}),
      };
    case 'transition':
      return {
        TransitionKind: track.transitionKind,
        FrameRange: { from: track.from, to: track.to },
        Between: track.between,
      };
    case 'effect':
      return {
        EffectKind: track.effectKind,
        TargetEntity: track.target,
        FrameRange: { from: track.from, to: track.to },
        ...(track.syncTo !== undefined ? { SyncAnchor: track.syncTo } : {}),
      };
  }
}
