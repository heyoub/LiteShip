import { afterEach, describe, expect, test, vi } from 'vitest';
import { Effect } from 'effect';
import { Boundary, Millis, Scheduler, Timeline } from '@czap/core';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

const makeBoundary = () =>
  Boundary.make({
    input: 'time.elapsed',
    at: [
      [0, 'idle'],
      [100, 'active'],
      [200, 'done'],
    ] as const,
  });

describe('Timeline runtime behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('loops forward and backward with a fixed-step scheduler', async () => {
    const scheduler = Scheduler.fixedStep(10);

    const result = await runScoped(
      Effect.gen(function* () {
        const timeline = yield* Timeline.from(makeBoundary(), {
          duration: Millis(200),
          loop: true,
          scheduler,
        });

        yield* timeline.play();
        yield* Effect.sync(() => {
          scheduler.step();
          scheduler.step();
        });

        yield* timeline.reverse();
        yield* Effect.sync(() => {
          scheduler.step();
          scheduler.step();
        });

        yield* timeline.reverse();
        yield* timeline.pause();

        return {
          elapsed: yield* timeline.elapsed,
          progress: yield* timeline.progress,
          state: yield* timeline.state,
        };
      }),
    );

    expect(result).toEqual({ elapsed: 100, progress: 0.5, state: 'active' });
  });

  test('uses provided duration and browser raf scheduling when no custom scheduler is passed', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      }),
    );
    const cancelAnimationFrameSpy = vi.fn((id: number) => {
      callbacks.delete(id);
    });
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

    const result = await runScoped(
      Effect.gen(function* () {
        const timeline = yield* Timeline.from(makeBoundary(), { duration: Millis(250) });

        yield* Effect.sync(() => {
          callbacks.get(1)?.(0);
        });
        yield* timeline.play();
        yield* Effect.sync(() => {
          callbacks.get(2)?.(125);
        });

        return {
          progress: yield* timeline.progress,
          state: yield* timeline.state,
        };
      }),
    );

    expect(result).toEqual({ progress: 0.5, state: 'active' });
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(3);
  });

  test('falls back to noop scheduling and a 1000ms duration for degenerate boundaries', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined as never);
    vi.stubGlobal('cancelAnimationFrame', undefined as never);

    const boundary = {
      _tag: 'BoundaryDef',
      id: 'fnv1a:degenerate',
      input: 'time.empty',
      thresholds: [],
      states: ['idle'],
    } as unknown as ReturnType<typeof makeBoundary>;

    const result = await runScoped(
      Effect.gen(function* () {
        const timeline = yield* Timeline.from(boundary);

        yield* timeline.seek(Millis(1_500));
        yield* timeline.scrub(2);

        return {
          elapsed: yield* timeline.elapsed,
          progress: yield* timeline.progress,
          state: yield* timeline.state,
        };
      }),
    );

    expect(result).toEqual({ elapsed: 1_000, progress: 1, state: 'idle' });
  });

  test('derives the default duration from the final threshold when none is provided', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const timeline = yield* Timeline.from(makeBoundary());

        yield* timeline.seek(Millis(400));

        return {
          elapsed: yield* timeline.elapsed,
          progress: yield* timeline.progress,
          state: yield* timeline.state,
        };
      }),
    );

    expect(result).toEqual({ elapsed: 240, progress: 1, state: 'done' });
  });

  test('clamps seek and scrub operations while only updating state when it changes', async () => {
    const scheduler = Scheduler.fixedStep(60);

    const result = await runScoped(
      Effect.gen(function* () {
        const timeline = yield* Timeline.from(makeBoundary(), {
          duration: Millis(200),
          scheduler,
        });

        yield* timeline.seek(Millis(50));
        yield* timeline.seek(Millis(150));
        yield* timeline.scrub(-1);
        yield* timeline.scrub(2);

        return {
          elapsed: yield* timeline.elapsed,
          progress: yield* timeline.progress,
          state: yield* timeline.state,
        };
      }),
    );

    expect(result).toEqual({ elapsed: 200, progress: 1, state: 'done' });
  });
});
