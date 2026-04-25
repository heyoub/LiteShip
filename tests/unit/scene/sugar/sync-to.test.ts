import { describe, it, expect } from 'vitest';
import { Track, syncTo } from '@czap/scene';

describe('syncTo', () => {
  const bed = Track.audioId('bed');

  it('syncTo.beat builds a beat-mode SyncAnchor', () => {
    expect(syncTo.beat(bed)).toEqual({ anchor: 'bed', mode: 'beat' });
  });
  it('syncTo.onset builds an onset-mode SyncAnchor', () => {
    expect(syncTo.onset(bed)).toEqual({ anchor: 'bed', mode: 'onset' });
  });
  it('syncTo.peak builds a peak-mode SyncAnchor', () => {
    expect(syncTo.peak(bed)).toEqual({ anchor: 'bed', mode: 'peak' });
  });
});
