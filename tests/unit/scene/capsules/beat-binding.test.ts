/**
 * Unit test for the `scene.beat-binding` sceneComposition capsule.
 *
 * Exercises:
 *   - `bindBeats(beats)` — pure transform, defensive copy semantics, order
 *     preservation, count match.
 *   - `beatBindingCapsule.invariants` — every named invariant against
 *     positive + negative inputs.
 *
 * Direct in-process tests because the harness emits `it.skip` for
 * sceneComposition arms (no auto-property-test path yet).
 */
import { describe, it, expect } from 'vitest';
import {
  bindBeats,
  beatBindingCapsule,
  BeatBinding,
  type BeatComponent,
} from '../../../../packages/scene/src/capsules/beat-binding.js';

const sample: readonly BeatComponent[] = [
  { kind: 'beat', timeMs: 0, strength: 1 },
  { kind: 'beat', timeMs: 500, strength: 0.7, anchorTrackId: 'intro-bed' },
  { kind: 'beat', timeMs: 1000, strength: 0.9 },
];

describe('bindBeats — pure beat → spawn transform', () => {
  it('emits one spawn descriptor per input beat', () => {
    const out = bindBeats(sample);
    expect(out).toHaveLength(sample.length);
  });

  it('returns a defensive copy (mutation-resistant)', () => {
    const out = bindBeats(sample);
    expect(out[0]!.components).not.toBe(sample[0]);
    expect(out[0]!.components.timeMs).toBe(sample[0]!.timeMs);
  });

  it('preserves input order in output spawns', () => {
    const out = bindBeats(sample);
    for (let i = 0; i < sample.length; i++) {
      expect(out[i]!.components.timeMs).toBe(sample[i]!.timeMs);
      expect(out[i]!.components.strength).toBe(sample[i]!.strength);
    }
  });

  it('handles an empty beat list without throwing', () => {
    expect(bindBeats([])).toHaveLength(0);
  });

  it('preserves anchorTrackId when present', () => {
    const out = bindBeats(sample);
    expect(out[1]!.components.anchorTrackId).toBe('intro-bed');
    expect(out[0]!.components.anchorTrackId).toBeUndefined();
  });

  it('exposes the same shape via the BeatBinding namespace alias', () => {
    expect(BeatBinding.bind).toBe(bindBeats);
  });
});

describe('beatBindingCapsule — invariants', () => {
  const invByName = new Map(beatBindingCapsule.invariants.map((i) => [i.name, i]));

  it('spawn-count-equals-beat-count rejects mismatched counts', () => {
    const inv = invByName.get('spawn-count-equals-beat-count')!;
    const beats = sample;
    expect(
      inv.check({ beats } as unknown, { spawns: bindBeats(beats) } as unknown),
    ).toBe(true);
    expect(
      inv.check({ beats } as unknown, { spawns: [] } as unknown),
    ).toBe(false);
  });

  it('all-spawns-are-beat-components fails when a kind is wrong', () => {
    const inv = invByName.get('all-spawns-are-beat-components')!;
    expect(
      inv.check({}, {
        spawns: [{ components: { kind: 'beat' } }],
      } as unknown),
    ).toBe(true);
    expect(
      inv.check({}, {
        spawns: [{ components: { kind: 'note' } }],
      } as unknown),
    ).toBe(false);
  });

  it('spawns-preserve-beat-order rejects time mismatches', () => {
    const inv = invByName.get('spawns-preserve-beat-order')!;
    const beats = sample;
    const goodOutput = { spawns: bindBeats(beats) };
    expect(
      inv.check({ beats } as unknown, goodOutput as unknown),
    ).toBe(true);
    const badSpawns = bindBeats(beats).slice().reverse();
    expect(
      inv.check({ beats } as unknown, { spawns: badSpawns } as unknown),
    ).toBe(false);
    // Different lengths should also fail (defense-in-depth).
    expect(
      inv.check({ beats } as unknown, { spawns: [] } as unknown),
    ).toBe(false);
  });

  it('the capsule is registered as sceneComposition with the spec name', () => {
    expect(beatBindingCapsule._kind).toBe('sceneComposition');
    expect(beatBindingCapsule.name).toBe('scene.beat-binding');
  });
});
