import { describe, it, expect } from 'vitest';
import { remotionAdapterCapsule } from '@czap/remotion';

describe('remotionAdapterCapsule', () => {
  it('declares a siteAdapter bridging Remotion composition API to czap VideoFrameOutput', () => {
    expect(remotionAdapterCapsule._kind).toBe('siteAdapter');
    expect(remotionAdapterCapsule.name).toBe('remotion.video-frame-output');
  });

  it('declares node + browser sites', () => {
    expect(remotionAdapterCapsule.site).toEqual(['node', 'browser']);
  });

  it('records attribution for Remotion license boundary', () => {
    expect(remotionAdapterCapsule.attribution?.license).toBe('Remotion-Company-License');
  });

  it('has at least one invariant', () => {
    expect(remotionAdapterCapsule.invariants.length).toBeGreaterThan(0);
  });
});
