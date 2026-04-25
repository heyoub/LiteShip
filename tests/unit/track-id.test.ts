/**
 * Phantom-kinded TrackId — compile-time cross-kind reference checks.
 *
 * The runtime values are bare strings (the brand is type-only). This
 * suite asserts:
 *   1. The runtime helpers still produce the expected string id.
 *   2. The narrowed signatures reject cross-kind ids at compile time
 *      (verified via @ts-expect-error directives).
 */

import { describe, it, expect } from 'vitest';
import { Track, syncTo } from '@czap/scene';

describe('TrackId phantom-kind branding', () => {
  it('Track.audioId mints a typed audio id (runtime: bare string)', () => {
    const id = Track.audioId('bed');
    expect(id).toBe('bed');
  });

  it('syncTo.beat accepts an audio TrackId', () => {
    const audioId = Track.audioId('bed');
    const anchor = syncTo.beat(audioId);
    expect(anchor).toEqual({ anchor: 'bed', mode: 'beat' });
  });

  it('syncTo.onset accepts an audio TrackId', () => {
    const audioId = Track.audioId('bed');
    const anchor = syncTo.onset(audioId);
    expect(anchor).toEqual({ anchor: 'bed', mode: 'onset' });
  });

  it('syncTo.peak accepts an audio TrackId', () => {
    const audioId = Track.audioId('bed');
    const anchor = syncTo.peak(audioId);
    expect(anchor).toEqual({ anchor: 'bed', mode: 'peak' });
  });

  it('rejects a video TrackId in syncTo.beat at compile time', () => {
    const videoId = Track.videoId('hero');
    // @ts-expect-error — TrackId<'video'> is not assignable to TrackId<'audio'>
    const anchor = syncTo.beat(videoId);
    // Runtime still works (brand is type-only), but the type check fails above.
    expect(anchor).toEqual({ anchor: 'hero', mode: 'beat' });
  });

  it('rejects a transition TrackId in syncTo.onset at compile time', () => {
    const transId = Track.transitionId('fade');
    // @ts-expect-error — TrackId<'transition'> is not assignable to TrackId<'audio'>
    const anchor = syncTo.onset(transId);
    expect(anchor).toEqual({ anchor: 'fade', mode: 'onset' });
  });

  it('rejects an effect TrackId in syncTo.peak at compile time', () => {
    const fxId = Track.effectId('pulse');
    // @ts-expect-error — TrackId<'effect'> is not assignable to TrackId<'audio'>
    const anchor = syncTo.peak(fxId);
    expect(anchor).toEqual({ anchor: 'pulse', mode: 'peak' });
  });

  it('rejects a bare string in syncTo.beat at compile time', () => {
    // @ts-expect-error — bare string is not assignable to TrackId<'audio'>
    const anchor = syncTo.beat('bed');
    expect(anchor).toEqual({ anchor: 'bed', mode: 'beat' });
  });

  it('rejects an audio id in Track.transition.between at compile time', () => {
    const hero = Track.videoId('hero');
    const bed = Track.audioId('bed');
    const t = Track.transition('fade', {
      from: 0,
      to: 1,
      kind: 'crossfade',
      // @ts-expect-error — between requires [TrackId<'video'>, TrackId<'video'>]
      between: [hero, bed],
    });
    expect(t.transitionKind).toBe('crossfade');
  });

  it('rejects an audio id in Track.effect.target at compile time', () => {
    const bed = Track.audioId('bed');
    const t = Track.effect('pulse', {
      from: 0,
      to: 60,
      kind: 'pulse',
      // @ts-expect-error — target requires TrackId<'video'>
      target: bed,
    });
    expect(t.target).toBe('bed');
  });
});
