/**
 * Track helpers — typed constructors for scene tracks.
 * Each helper returns a Track union member. The scene compiler
 * walks these at declare time to produce ECS entity seeds.
 *
 * Identifiers are phantom-kinded (TrackId<K>) so cross-kind references
 * — e.g. passing a video TrackId to syncTo.beat — fail at compile time.
 * Use the per-kind minters (Track.videoId, Track.audioId, etc.) when you
 * need a typed id without building a full track.
 *
 * @module
 */

import type { VideoTrack, AudioTrack, TransitionTrack, EffectTrack, TrackId } from './contract.js';

/** Mint a video TrackId — the one sanctioned cast site for the 'video' brand. */
const videoId = (id: string): TrackId<'video'> => id as TrackId<'video'>;
/** Mint an audio TrackId — the one sanctioned cast site for the 'audio' brand. */
const audioId = (id: string): TrackId<'audio'> => id as TrackId<'audio'>;
/** Mint a transition TrackId — the one sanctioned cast site for the 'transition' brand. */
const transitionId = (id: string): TrackId<'transition'> => id as TrackId<'transition'>;
/** Mint an effect TrackId — the one sanctioned cast site for the 'effect' brand. */
const effectId = (id: string): TrackId<'effect'> => id as TrackId<'effect'>;

/** Build a VideoTrack referencing a quantizer source, with optional layer. */
const video = (id: string, opts: { from: number; to: number; source: unknown; layer?: number }): VideoTrack => ({
  kind: 'video',
  id: videoId(id),
  from: opts.from,
  to: opts.to,
  source: opts.source,
  layer: opts.layer ?? 0,
});

/** Build an AudioTrack referencing an asset id, with default mix { volume: 0, pan: 0 }. */
const audio = (id: string, opts: { from: number; to: number; source: string; mix?: AudioTrack['mix'] }): AudioTrack => {
  const mix: AudioTrack['mix'] = {
    volume: opts.mix?.volume ?? 0,
    pan: opts.mix?.pan ?? 0,
    ...(opts.mix?.sync !== undefined ? { sync: opts.mix.sync } : {}),
  };
  return { kind: 'audio', id: audioId(id), from: opts.from, to: opts.to, source: opts.source, mix };
};

/** Build a TransitionTrack blending two target tracks over a frame window. */
const transition = (
  id: string,
  opts: {
    from: number;
    to: number;
    kind: TransitionTrack['transitionKind'];
    between: readonly [TrackId<'video'>, TrackId<'video'>];
  },
): TransitionTrack => ({
  kind: 'transition',
  id: transitionId(id),
  from: opts.from,
  to: opts.to,
  transitionKind: opts.kind,
  between: opts.between,
});

/** Build an EffectTrack applying an intensity curve to a target video, optionally synced to audio. */
const effect = (
  id: string,
  opts: {
    from: number;
    to: number;
    kind: EffectTrack['effectKind'];
    target: TrackId<'video'>;
    syncTo?: EffectTrack['syncTo'];
  },
): EffectTrack => ({
  kind: 'effect',
  id: effectId(id),
  from: opts.from,
  to: opts.to,
  effectKind: opts.kind,
  target: opts.target,
  syncTo: opts.syncTo,
});

/**
 * Track namespace — typed constructors for the four track kinds plus
 * per-kind id minters (Track.videoId, Track.audioId, Track.transitionId,
 * Track.effectId) for use in cross-track references.
 */
export const Track = {
  video,
  audio,
  transition,
  effect,
  videoId,
  audioId,
  transitionId,
  effectId,
} as const;

/** Structural companion namespace (type handles for each helper's return shape). */
export declare namespace Track {
  /** Video helper return. */
  export type Video = VideoTrack;
  /** Audio helper return. */
  export type Audio = AudioTrack;
  /** Transition helper return. */
  export type Transition = TransitionTrack;
  /** Effect helper return. */
  export type Effect = EffectTrack;
  /** Union of all concrete track shapes returned by Track.{video,audio,transition,effect}. */
  export type Any = VideoTrack | AudioTrack | TransitionTrack | EffectTrack;
}
