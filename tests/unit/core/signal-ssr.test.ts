// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { Effect } from 'effect';
import { Signal } from '@czap/core';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

describe('Signal.make in server environments', () => {
  test('falls back to inert values when window-specific sources are unavailable', async () => {
    const values = await runScoped(
      Effect.gen(function* () {
        const viewport = yield* Signal.make({ type: 'viewport', axis: 'height' });
        const scroll = yield* Signal.make({ type: 'scroll', axis: 'progress' });
        const media = yield* Signal.make({ type: 'media', query: '(prefers-reduced-motion: reduce)' });

        return {
          viewport: yield* viewport.current,
          scroll: yield* scroll.current,
          media: yield* media.current,
        };
      }),
    );

    expect(values).toEqual({ viewport: 0, scroll: 0, media: 0 });
  });

  test('time-elapsed signal exits cleanly when requestAnimationFrame is unavailable', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'time', mode: 'elapsed' });
        return yield* signal.current;
      }),
    );

    expect(value).toBe(0);
  });
});
