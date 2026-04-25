import { describe, expect, test, vi } from 'vitest';
import { Effect, Stream } from 'effect';
import { Boundary, Millis } from '@czap/core';
import type { BoundaryCrossing, Quantizer } from '@czap/core';
import { AnimatedQuantizer } from '@czap/quantizer';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

function makeBoundary() {
  return Boundary.make({
    input: 'viewport.width',
    at: [
      [0, 'compact'],
      [768, 'expanded'],
    ] as const,
  });
}

describe('AnimatedQuantizer.make', () => {
  test('emits a completed frame immediately for zero-duration transitions', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 800,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    const frames = await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(
          quantizer,
          {
            'compact->expanded': { duration: Millis(0), delay: Millis(1) },
          },
          {
            compact: { opacity: 0, label: 'compact' },
            expanded: { opacity: 1, label: 'expanded' },
          },
        );

        return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 1)));
      }),
    );

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      state: 'expanded',
      progress: 1,
      outputs: { opacity: 1, label: 'expanded' },
    });
  });

  test('wraps the base quantizer state and delegates evaluate()', async () => {
    const boundary = makeBoundary();
    let evaluated = 0;
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.empty,
      evaluate: (value: number) => {
        evaluated = value;
        return 'expanded' as const;
      },
    } satisfies Quantizer<typeof boundary>;

    const result = await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(
          quantizer,
          {
            'compact->expanded': { duration: Millis(20) },
          },
          {
            compact: { opacity: 0, label: 'compact' },
            expanded: { opacity: 1, label: 'expanded' },
          },
        );

        return {
          tag: animated._tag,
          state: yield* animated.state,
          transition: animated.transition.getTransition('compact', 'expanded'),
          evaluated: animated.evaluate(800),
        };
      }),
    );

    expect(result.tag).toBe('Quantizer');
    expect(result.state).toBe('compact');
    expect(result.transition.duration).toBe(20);
    expect(result.evaluated).toBe('expanded');
    expect(evaluated).toBe(800);
  });

  test('forwards stateSync when the wrapped quantizer exposes one', async () => {
    const boundary = makeBoundary();
    let syncCalls = 0;
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      stateSync: () => {
        syncCalls++;
        return 'compact' as const;
      },
      changes: Stream.empty,
      evaluate: () => 'compact' as const,
    } satisfies Quantizer<typeof boundary>;

    const state = await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(
          quantizer,
          { 'compact->expanded': { duration: Millis(0) } },
          { compact: { opacity: 0 }, expanded: { opacity: 1 } },
        );

        expect(typeof animated.stateSync).toBe('function');
        return animated.stateSync!();
      }),
    );

    expect(state).toBe('compact');
    expect(syncCalls).toBe(1);
  });

  test('emits interpolated frames for positive-duration transitions and snaps string outputs at halfway', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 900,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    vi.useFakeTimers();
    try {
      const framesPromise = runScoped(
        Effect.gen(function* () {
          const animated = yield* AnimatedQuantizer.make(
            quantizer,
            {
              '*': { duration: Millis(50) },
            },
            {
              compact: { opacity: 0, label: 'compact' },
              expanded: { opacity: 1, label: 'expanded' },
            },
          );

          return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 3)));
        }),
      );

      await vi.advanceTimersByTimeAsync(120);
      const frames = await framesPromise;

      expect(frames.length).toBeGreaterThanOrEqual(2);
      expect(frames[0]!.progress).toBeGreaterThanOrEqual(0);
      expect(Number(frames[0]!.outputs.opacity)).toBeGreaterThanOrEqual(0);
      expect(Number(frames[0]!.outputs.opacity)).toBeLessThanOrEqual(1);
      expect(['compact', 'expanded']).toContain(frames[0]!.outputs.label);
      const last = frames.at(-1)!;
      expect(last.state).toBe('expanded');
      expect(last.progress).toBeGreaterThan(0.5);
      expect(Number(last.outputs.opacity)).toBeGreaterThan(0.5);
      expect(last.outputs.label).toBe('expanded');
    } finally {
      vi.useRealTimers();
    }
  });

  test('falls back to an instant transition when no exact or wildcard rule exists', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.empty,
      evaluate: () => 'compact' as const,
    } satisfies Quantizer<typeof boundary>;

    const transition = await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(quantizer, {});
        return animated.transition.getTransition('compact', 'expanded');
      }),
    );

    expect(transition.duration).toBe(0);
    expect(transition.delay).toBeUndefined();
  });

  test('honors delayed transitions and still settles on the latest output values', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 900,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    vi.useFakeTimers();
    try {
      const framesPromise = runScoped(
        Effect.gen(function* () {
          const animated = yield* AnimatedQuantizer.make(
            quantizer,
            {
              '*': { duration: Millis(30), delay: Millis(20) },
            },
            {
              compact: { opacity: 0, label: 'compact' },
              expanded: { opacity: 1, label: 'expanded' },
            },
          );

          return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 3)));
        }),
      );

      await vi.advanceTimersByTimeAsync(100);
      const frames = await framesPromise;

      expect(frames[0]!.state).toBe('expanded');
      expect(frames.at(-1)!.progress).toBeGreaterThan(0.5);
      expect(frames.at(-1)!.outputs.label).toBe('expanded');
      expect(Number(frames.at(-1)!.outputs.opacity)).toBeGreaterThan(0.5);
    } finally {
      vi.useRealTimers();
    }
  });

  test('interrupts an in-flight animation when a second crossing arrives', async () => {
    const boundary = makeBoundary();
    const crossings: BoundaryCrossing<'compact' | 'expanded'>[] = [
      {
        from: 'compact',
        to: 'expanded',
        timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
        value: 900,
      },
      {
        from: 'expanded',
        to: 'compact',
        timestamp: { wall_ms: 50, counter: 1, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
        value: 100,
      },
    ];

    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.fromIterable(crossings),
      evaluate: () => 'compact' as const,
    } satisfies Quantizer<typeof boundary>;

    vi.useFakeTimers();
    try {
      const framesPromise = runScoped(
        Effect.gen(function* () {
          const animated = yield* AnimatedQuantizer.make(
            quantizer,
            { '*': { duration: Millis(200) } },
            {
              compact: { opacity: 0 },
              expanded: { opacity: 1 },
            },
          );

          return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 4)));
        }),
      );

      await vi.advanceTimersByTimeAsync(500);
      const frames = await framesPromise;

      // The second crossing should have interrupted the first.
      // The last frame should target 'compact' (the second crossing destination).
      const last = frames.at(-1)!;
      expect(last.state).toBe('compact');
    } finally {
      vi.useRealTimers();
    }
  });

  test('lerps outputs with keys present in only one side', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 900,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    const frames = await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(
          quantizer,
          { '*': { duration: Millis(0) } },
          {
            compact: { alpha: 0 },
            expanded: { beta: 1, label: 'end' },
          },
        );

        return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 1)));
      }),
    );

    expect(frames).toHaveLength(1);
    // Keys from only the target side should snap to their target values
    expect(frames[0]!.outputs.beta).toBe(1);
    expect(frames[0]!.outputs.label).toBe('end');
  });

  test('works without explicit output maps (undefined outputs)', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 900,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    const frames = await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(
          quantizer,
          { '*': { duration: Millis(0) } },
        );

        return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 1)));
      }),
    );

    expect(frames).toHaveLength(1);
    expect(frames[0]!.state).toBe('expanded');
    expect(frames[0]!.outputs).toEqual({});
  });

  test('falls back to Date.now timing when performance is unavailable and preserves one-sided outputs', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 900,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    vi.useFakeTimers();
    vi.stubGlobal('performance', undefined as unknown as Performance);
    try {
      const framesPromise = runScoped(
        Effect.gen(function* () {
          const animated = yield* AnimatedQuantizer.make(
            quantizer,
            { '*': { duration: Millis(20) } },
            {
              compact: { fromOnly: 'compact-label' },
              expanded: { toOnly: 'expanded-label' },
            },
          );

          return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 2)));
        }),
      );

      await vi.advanceTimersByTimeAsync(80);
      const frames = await framesPromise;

      expect(frames).toHaveLength(2);
      expect(frames[0]!.outputs.fromOnly).toBe('compact-label');
      expect(frames[0]!.outputs.toOnly).toBe('expanded-label');
      expect(frames.at(-1)!.state).toBe('expanded');
      expect(frames.at(-1)!.outputs.fromOnly).toBe('compact-label');
      expect(frames.at(-1)!.outputs.toOnly).toBe('expanded-label');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test('completes cleanly without joining a final fiber when the source stream never crosses', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.empty,
      evaluate: () => 'compact',
    } satisfies Quantizer<typeof boundary>;

    await runScoped(
      Effect.gen(function* () {
        const animated = yield* AnimatedQuantizer.make(quantizer, { '*': { duration: Millis(20) } });
        yield* Effect.forkScoped(Stream.runDrain(Stream.take(animated.interpolated, 1)));
      }),
    );
  });

  test('snaps non-numeric outputs to the target value at eased halfway progress', async () => {
    const boundary = makeBoundary();
    const quantizer = {
      boundary,
      state: Effect.succeed<'compact' | 'expanded'>('compact'),
      changes: Stream.fromIterable([
        {
          from: 'compact',
          to: 'expanded',
          timestamp: { wall_ms: 0, counter: 0, node_id: 'test' } as BoundaryCrossing<'compact' | 'expanded'>['timestamp'],
          value: 900,
        },
      ]),
      evaluate: () => 'expanded',
    } satisfies Quantizer<typeof boundary>;

    vi.useFakeTimers();
    try {
      const framesPromise = runScoped(
        Effect.gen(function* () {
          const animated = yield* AnimatedQuantizer.make(
            quantizer,
            { '*': { duration: Millis(20), easing: () => 0.5 } },
            {
              compact: { label: 'compact' },
              expanded: { label: 'expanded' },
            },
          );

          return Array.from(yield* Stream.runCollect(Stream.take(animated.interpolated, 1)));
        }),
      );

      await vi.advanceTimersByTimeAsync(40);
      const frames = await framesPromise;

      expect(frames).toHaveLength(1);
      expect(frames[0]!.outputs.label).toBe('expanded');
    } finally {
      vi.useRealTimers();
    }
  });

});
