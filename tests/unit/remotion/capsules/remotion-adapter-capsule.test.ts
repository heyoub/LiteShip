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

  it('frame-count-matches-totalFrames invariant validates contiguous frame indices', () => {
    const inv = remotionAdapterCapsule.invariants.find(
      (i) => i.name === 'frame-count-matches-totalFrames',
    );
    expect(inv).toBeDefined();
    // Contiguous: ok.
    expect(
      inv!.check(undefined, [
        { frame: 0 }, { frame: 1 }, { frame: 2 },
      ]),
    ).toBe(true);
    // Non-contiguous: fail.
    expect(
      inv!.check(undefined, [
        { frame: 0 }, { frame: 2 }, { frame: 1 },
      ]),
    ).toBe(false);
    // Non-array: fail.
    expect(inv!.check(undefined, { not: 'an array' })).toBe(false);
    // Empty array is trivially contiguous.
    expect(inv!.check(undefined, [])).toBe(true);
  });
});
