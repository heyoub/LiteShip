/**
 * Component test: AnimatedQuantizer.
 *
 * Tests animated transitions between discrete states,
 * interpolation, and transition resolution.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Scope} from 'effect';
import { Effect, Stream, SubscriptionRef, Queue, Fiber, Ref } from 'effect';
import { Boundary, Millis } from '@czap/core';
import type { Quantizer, BoundaryCrossing } from '@czap/core';
import { AnimatedQuantizer, Transition } from '@czap/quantizer';
import type { TransitionMap } from '@czap/quantizer';
import { runScopedAsync as runScoped } from '../helpers/effect-test.js';

/**
 * Build a mock Quantizer with controllable boundary crossings.
 */
function makeMockQuantizer(
  boundary: Boundary.Shape,
  initialState: string,
): Effect.Effect<
  Quantizer & { pushCrossing: (c: BoundaryCrossing<string>) => Effect.Effect<void>; shutdown: Effect.Effect<void> },
  never,
  Scope.Scope
> {
  return Effect.gen(function* () {
    const stateRef = yield* Ref.make(initialState);
    const crossingQueue = yield* Queue.unbounded<BoundaryCrossing<string>>();

    const changes: Stream.Stream<BoundaryCrossing<string>> = Stream.fromQueue(crossingQueue);

    return {
      boundary,
      state: Ref.get(stateRef) as Effect.Effect<string>,
      changes: changes as any,
      evaluate(value: number): string {
        const result = Boundary.evaluate(boundary, value) as string;
        Effect.runSync(Ref.set(stateRef, result));
        return result;
      },
      pushCrossing: (c: BoundaryCrossing<string>) => Queue.offer(crossingQueue, c),
      shutdown: Queue.shutdown(crossingQueue),
    };
  });
}

const widthBoundary = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1024, 'desktop'],
  ] as const,
});

function crossing(from: string, to: string, value: number): BoundaryCrossing<string> {
  return {
    from: from as any,
    to: to as any,
    timestamp: { wall_ms: Date.now(), counter: 0, node_id: 'test' },
    value,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimatedQuantizer', () => {
  test('make() creates an animated quantizer with expected shape', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const transitions: TransitionMap<string> = {
          '*': { duration: Millis(300) },
        };

        const animated = yield* AnimatedQuantizer.make(q, transitions);

        expect(animated.boundary).toBe(widthBoundary);
        expect(animated.transition).toBeDefined();
        expect(animated.interpolated).toBeDefined();
        expect(animated.evaluate).toBeDefined();

        const state = yield* animated.state;
        expect(state).toBe('mobile');

        return true;
      }),
    );

    expect(result).toBe(true);
  });

  test('evaluate delegates to underlying quantizer', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const animated = yield* AnimatedQuantizer.make(q, { '*': { duration: Millis(0) } });

        const result = animated.evaluate(800);
        expect(result).toBe('tablet');
      }),
    );
  });

  test('transition resolver picks exact match over wildcard', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const transitions: TransitionMap<string> = {
          '*': { duration: Millis(1000) },
          'mobile->tablet': { duration: Millis(50) },
        };

        const animated = yield* AnimatedQuantizer.make(q, transitions);

        const config = animated.transition.getTransition('mobile' as any, 'tablet' as any);
        expect(config.duration).toBe(50);
      }),
    );
  });

  test('transition resolver falls back to wildcard', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const transitions: TransitionMap<string> = {
          '*': { duration: Millis(500) },
        };

        const animated = yield* AnimatedQuantizer.make(q, transitions);

        const config = animated.transition.getTransition('mobile' as any, 'desktop' as any);
        expect(config.duration).toBe(500);
      }),
    );
  });

  test('transition resolver falls back to instant (duration 0) when no match', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const transitions: TransitionMap<string> = {
          'mobile->tablet': { duration: Millis(100) },
        };

        const animated = yield* AnimatedQuantizer.make(q, transitions);

        // No match for tablet->desktop, and no wildcard
        const config = animated.transition.getTransition('tablet' as any, 'desktop' as any);
        expect(config.duration).toBe(0);
      }),
    );
  });

  test('boundary is preserved from underlying quantizer', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const animated = yield* AnimatedQuantizer.make(q, {});

        expect(animated.boundary).toBe(widthBoundary);
        expect(animated.boundary.states).toEqual(['mobile', 'tablet', 'desktop']);
      }),
    );
  });

  test('outputs parameter is optional', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const animated = yield* AnimatedQuantizer.make(q, { '*': { duration: Millis(100) } });
        // Should not throw
        expect(animated).toBeDefined();
      }),
    );
  });

  test('evaluate returns correct state for different values', async () => {
    await runScoped(
      Effect.gen(function* () {
        const q = yield* makeMockQuantizer(widthBoundary, 'mobile');
        const animated = yield* AnimatedQuantizer.make(q, {});

        expect(animated.evaluate(0)).toBe('mobile');
        expect(animated.evaluate(500)).toBe('mobile');
        expect(animated.evaluate(768)).toBe('tablet');
        expect(animated.evaluate(900)).toBe('tablet');
        expect(animated.evaluate(1024)).toBe('desktop');
        expect(animated.evaluate(2000)).toBe('desktop');
      }),
    );
  });
});
