import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.transition', () => {
  const a = Track.videoId('a');
  const b = Track.videoId('b');

  it('builds a TransitionTrack', () => {
    const t = Track.transition('fade', { from: 0, to: 10, kind: 'crossfade', between: [a, b] });
    expect(t.kind).toBe('transition');
    expect(t.transitionKind).toBe('crossfade');
    expect(t.between).toEqual(['a', 'b']);
  });

  it('accepts each preset kind', () => {
    for (const kind of ['crossfade', 'swipe.left', 'swipe.right', 'zoom.in', 'zoom.out', 'cut'] as const) {
      const t = Track.transition(kind, { from: 0, to: 1, kind, between: [a, b] });
      expect(t.transitionKind).toBe(kind);
    }
  });
});
