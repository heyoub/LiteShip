/**
 * Task 10 — Scoped SceneContext (BPM/fps inheritance).
 *
 * Spec §5.4 promised that child scenes inherit BPM/fps from parents
 * when authored as inclusions. This test pins down the inheritance
 * surface introduced for that gap:
 *
 *   - `inheritContext(parent, overrides?)` merges explicit overrides
 *     over inherited parent fields, treating `undefined` as no-op.
 *   - `Scene.subscene(parent, partial)` fills missing `bpm` / `fps`
 *     on a partial sub-scene from the parent contract; explicit
 *     fields on the partial win.
 */

import { describe, it, expect } from 'vitest';
import { Scene, inheritContext } from '@czap/scene';
import type { SceneContext, SceneSubscenePartial } from '@czap/scene';

describe('SceneContext inheritance', () => {
  const parent: SceneContext = { bpm: 120, fps: 60, rootTimeMs: 0 };

  it('inheritContext returns parent fields when no overrides are given', () => {
    expect(inheritContext(parent)).toEqual({ bpm: 120, fps: 60, rootTimeMs: 0 });
  });

  it('inheritContext takes explicit bpm override and inherits the rest', () => {
    expect(inheritContext(parent, { bpm: 140 })).toEqual({
      bpm: 140,
      fps: 60,
      rootTimeMs: 0,
    });
  });

  it('inheritContext takes explicit fps override and inherits the rest', () => {
    expect(inheritContext(parent, { fps: 30 })).toEqual({
      bpm: 120,
      fps: 30,
      rootTimeMs: 0,
    });
  });

  it('inheritContext takes explicit rootTimeMs override and inherits the rest', () => {
    expect(inheritContext(parent, { rootTimeMs: 1000 })).toEqual({
      bpm: 120,
      fps: 60,
      rootTimeMs: 1000,
    });
  });

  it('inheritContext treats explicit undefined as "no override"', () => {
    expect(
      inheritContext(parent, { bpm: undefined, fps: undefined, rootTimeMs: undefined }),
    ).toEqual({ bpm: 120, fps: 60, rootTimeMs: 0 });
  });
});

describe('Scene.subscene', () => {
  const parentContract = { bpm: 128, fps: 60 } as const;

  const partialBase: SceneSubscenePartial = {
    name: 'sub',
    duration: 30,
    tracks: [],
    invariants: [],
    budgets: { p95FrameMs: 16 },
    site: ['node'],
  };

  it('fills missing bpm and fps from parent', () => {
    const child = Scene.subscene(parentContract, partialBase);
    expect(child.bpm).toBe(128);
    expect(child.fps).toBe(60);
    expect(child.name).toBe('sub');
  });

  it('respects explicit bpm override on the partial', () => {
    const child = Scene.subscene(parentContract, { ...partialBase, bpm: 90 });
    expect(child.bpm).toBe(90); // explicit override wins
    expect(child.fps).toBe(60); // inherited
  });

  it('respects explicit fps override on the partial', () => {
    const child = Scene.subscene(parentContract, { ...partialBase, fps: 24 });
    expect(child.bpm).toBe(128); // inherited
    expect(child.fps).toBe(24); // explicit override wins
  });

  it('preserves all non-bpm/fps partial fields verbatim', () => {
    const partial: SceneSubscenePartial = {
      ...partialBase,
      duration: 45,
      budgets: { p95FrameMs: 8, memoryMb: 256 },
      site: ['browser'],
    };
    const child = Scene.subscene(parentContract, partial);
    expect(child.duration).toBe(45);
    expect(child.budgets).toEqual({ p95FrameMs: 8, memoryMb: 256 });
    expect(child.site).toEqual(['browser']);
  });
});
