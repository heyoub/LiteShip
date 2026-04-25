import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { PassThroughMixer } from '@czap/scene';

describe('PassThroughMixer', () => {
  it('emits a receipt entry per audio entity per tick', async () => {
    const receipts: unknown[] = [];
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      const e = yield* world.spawn({ AudioSource: 'bed', Volume: -6, Pan: 0.2 });
      yield* world.addSystem(PassThroughMixer(30, (r) => { receipts.push(r); }));
      yield* world.tick();
      expect(receipts.length).toBe(1);
      expect(receipts[0]).toMatchObject({ frame: 30, entity: e, volume: -6, pan: 0.2 });
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('forwards Volume/Pan verbatim without DSP', async () => {
    let receipt: { volume: number; pan: number } | undefined;
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({ AudioSource: 'x', Volume: -12, Pan: -1 });
      yield* world.addSystem(PassThroughMixer(0, (r) => { receipt = r as { volume: number; pan: number }; }));
      yield* world.tick();
    });
    await Effect.runPromise(Effect.scoped(program));
    expect(receipt?.volume).toBe(-12);
    expect(receipt?.pan).toBe(-1);
  });
});
