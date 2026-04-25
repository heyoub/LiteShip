/** Fixture: exports a sceneComposition capsule + contract + a compile
 * function that returns an Effect. Exercises scene-compile's
 * `Effect.isEffect` branch. */
import { Effect, Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { SceneContract } from '@czap/scene';

export const fx = defineCapsule({
  _kind: 'sceneComposition',
  name: 'fixture.effect',
  input: Schema.Unknown,
  output: Schema.Unknown,
  capabilities: { reads: [], writes: [] },
  invariants: [],
  budgets: { p95Ms: 1 },
  site: ['node'],
});

export const contract: SceneContract = {
  name: 'effect-fixture',
  duration: 100,
  fps: 60,
  bpm: 120,
  tracks: [],
  invariants: [],
  budgets: { p95FrameMs: 16 },
  site: ['node'],
};

export function compileEffect(): Effect.Effect<number, never, never> {
  return Effect.succeed(42);
}
