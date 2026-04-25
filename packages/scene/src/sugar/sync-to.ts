/**
 * syncTo — typed constructors for SyncAnchor components attached to
 * effect tracks. Three modes: beat (downbeats), onset (note attacks),
 * peak (loudness peaks). Each resolves at scene-compile time to a
 * derived BeatMarker/Onset/Waveform cachedProjection asset.
 *
 * The anchor parameter is narrowed to TrackId<'audio'> so cross-kind
 * references (e.g. syncTo.beat(videoTrackId)) fail at compile time.
 *
 * @module
 */

import type { EffectTrack, TrackId } from '../contract.js';

/** SyncAnchor shape extracted from EffectTrack. */
type SyncAnchor = NonNullable<EffectTrack['syncTo']>;

/** Typed SyncAnchor constructors for the three supported modes. */
export const syncTo = {
  /** Sync to downbeats (BeatMarkerProjection). */
  beat: (anchor: TrackId<'audio'>): SyncAnchor => ({ anchor, mode: 'beat' }),
  /** Sync to note attacks (OnsetProjection). */
  onset: (anchor: TrackId<'audio'>): SyncAnchor => ({ anchor, mode: 'onset' }),
  /** Sync to loudness peaks (WaveformProjection + peak-pick). */
  peak: (anchor: TrackId<'audio'>): SyncAnchor => ({ anchor, mode: 'peak' }),
} as const;
