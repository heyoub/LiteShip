/**
 * Signal -- live data feeds from the browser environment.
 *
 * (viewport, scroll, pointer, time, media queries, custom).
 *
 * @module
 */

import type { Stream, Scope } from 'effect';
import { Effect, SubscriptionRef, Ref } from 'effect';
import type { AVBridge } from './av-bridge.js';

/** Tag of a {@link SignalSource} — the family of live data feed a signal binds to. */
export type SignalSourceType = 'viewport' | 'time' | 'pointer' | 'scroll' | 'media' | 'custom' | 'audio';

/**
 * Configuration describing what a {@link Signal} reads from: viewport axis,
 * time mode, pointer axis, scroll axis, media query, custom push source,
 * or audio sample/normalized mode.
 */
export type SignalSource =
  | { readonly type: 'viewport'; readonly axis: 'width' | 'height' }
  | { readonly type: 'time'; readonly mode: 'elapsed' | 'absolute' | 'scheduled' }
  | { readonly type: 'pointer'; readonly axis: 'x' | 'y' | 'pressure' }
  | { readonly type: 'scroll'; readonly axis: 'x' | 'y' | 'progress' }
  | { readonly type: 'media'; readonly query: string }
  | { readonly type: 'custom'; readonly id: string }
  | { readonly type: 'audio'; readonly mode: 'sample' | 'normalized' };

interface SignalShape<T> {
  readonly source: SignalSource;
  readonly current: Effect.Effect<T>;
  readonly changes: Stream.Stream<T>;
}

interface ControllableSignalShape<T> extends SignalShape<T> {
  seek(to: T): Effect.Effect<void>;
  pause(): Effect.Effect<void>;
  resume(): Effect.Effect<void>;
}

function initialValueForSource(source: SignalSource): number {
  switch (source.type) {
    case 'viewport':
      return typeof globalThis.window !== 'undefined'
        ? source.axis === 'width'
          ? window.innerWidth
          : window.innerHeight
        : 0;
    case 'scroll':
      if (typeof globalThis.window === 'undefined') return 0;
      if (source.axis === 'x') return window.scrollX;
      if (source.axis === 'y') return window.scrollY;
      {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return max > 0 ? window.scrollY / max : 0;
      }
    case 'pointer':
      return 0;
    case 'time':
      return source.mode === 'absolute' ? Date.now() : 0;
    case 'media':
      return typeof globalThis.window !== 'undefined' && window.matchMedia(source.query).matches ? 1 : 0;
    case 'custom':
      return 0;
    case 'audio':
      return 0;
  }
}

/**
 * Create a reactive signal from a browser environment source.
 *
 * Returns a scoped Effect that sets up event listeners (resize, scroll,
 * pointermove, etc.) and cleans them up when the scope closes. The signal
 * exposes `.current` (latest value) and `.changes` (stream of updates).
 *
 * @example
 * ```ts
 * import { Effect, Scope } from 'effect';
 * import { Signal } from '@czap/core';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const sig = yield* Signal.make({ type: 'viewport', axis: 'width' });
 *   const width = yield* sig.current;
 *   // width === current window.innerWidth
 * }));
 * ```
 */
function _make(source: SignalSource): Effect.Effect<SignalShape<number>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const initial = initialValueForSource(source);
    const ref = yield* SubscriptionRef.make(initial);

    const setupListener = Effect.gen(function* () {
      switch (source.type) {
        case 'viewport': {
          if (typeof globalThis.window === 'undefined') return;
          const handler = () => {
            const val = source.axis === 'width' ? window.innerWidth : window.innerHeight;
            Effect.runSync(SubscriptionRef.set(ref, val));
          };
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              window.addEventListener('resize', handler);
            }),
            () =>
              Effect.sync(() => {
                window.removeEventListener('resize', handler);
              }),
          );
          break;
        }
        case 'scroll': {
          if (typeof globalThis.window === 'undefined') return;
          const handler = () => {
            let val: number;
            if (source.axis === 'x') val = window.scrollX;
            else if (source.axis === 'y') val = window.scrollY;
            else {
              const max = document.documentElement.scrollHeight - window.innerHeight;
              val = max > 0 ? window.scrollY / max : 0;
            }
            Effect.runSync(SubscriptionRef.set(ref, val));
          };
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              window.addEventListener('scroll', handler, { passive: true });
            }),
            () =>
              Effect.sync(() => {
                window.removeEventListener('scroll', handler);
              }),
          );
          break;
        }
        case 'pointer': {
          if (typeof globalThis.window === 'undefined') return;
          const handler = (e: PointerEvent) => {
            const val = source.axis === 'x' ? e.clientX : source.axis === 'y' ? e.clientY : e.pressure;
            Effect.runSync(SubscriptionRef.set(ref, val));
          };
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              window.addEventListener('pointermove', handler);
            }),
            () =>
              Effect.sync(() => {
                window.removeEventListener('pointermove', handler);
              }),
          );
          break;
        }
        case 'time': {
          if (source.mode === 'elapsed') {
            if (typeof requestAnimationFrame === 'undefined') return;
            const start = Date.now();
            const id = { current: 0 };
            const tick = () => {
              Effect.runSync(SubscriptionRef.set(ref, Date.now() - start));
              id.current = requestAnimationFrame(tick);
            };
            id.current = requestAnimationFrame(tick);
            yield* Effect.addFinalizer(() => Effect.sync(() => cancelAnimationFrame(id.current)));
          } else if (source.mode === 'absolute') {
            const id = setInterval(() => {
              Effect.runSync(SubscriptionRef.set(ref, Date.now()));
            }, 1000);
            yield* Effect.addFinalizer(() => Effect.sync(() => clearInterval(id)));
          } else {
            // Scheduled mode: no automatic ticking.
            // External code drives this signal via SubscriptionRef.set(ref, value).
            // The ref is already created -- caller controls it via ControllableSignal.
          }
          break;
        }
        case 'media': {
          if (typeof globalThis.window === 'undefined') return;
          const mql = window.matchMedia(source.query);
          const handler = (e: MediaQueryListEvent) => {
            Effect.runSync(SubscriptionRef.set(ref, e.matches ? 1 : 0));
          };
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              mql.addEventListener('change', handler);
            }),
            () =>
              Effect.sync(() => {
                mql.removeEventListener('change', handler);
              }),
          );
          break;
        }
        case 'custom':
          // Custom signals are driven externally via Signal.custom() push API.
          // No browser listener needed — the caller pushes values directly.
          break;
        case 'audio':
          // Audio signals are driven externally via Signal.audio() / AVBridge.
          // No browser listener needed — audio analysis pushes values on its own cadence.
          break;
      }
    });

    yield* Effect.forkScoped(setupListener);

    return {
      source,
      current: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
    };
  });
}

/**
 * Create a controllable time signal for video rendering / scrubbing.
 *
 * External code drives the signal value via seek(); no automatic ticking.
 * Supports pause/resume to temporarily ignore seek updates.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Signal } from '@czap/core';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const ctrl = yield* Signal.controllable();
 *   yield* ctrl.seek(1500);
 *   const t = yield* ctrl.current;
 *   // t === 1500
 *   yield* ctrl.pause();
 *   yield* ctrl.seek(2000); // ignored while paused
 * }));
 * ```
 */
function _controllable(): Effect.Effect<ControllableSignalShape<number>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(0);
    const pausedRef = yield* Ref.make(false);

    return {
      source: { type: 'time' as const, mode: 'scheduled' as const },
      current: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      seek: (to: number) =>
        Effect.gen(function* () {
          const paused = yield* Ref.get(pausedRef);
          if (!paused) {
            yield* SubscriptionRef.set(ref, to);
          }
        }),
      pause: () => Ref.set(pausedRef, true),
      resume: () => Ref.set(pausedRef, false),
    };
  });
}

// ---------------------------------------------------------------------------
// Audio signal
// ---------------------------------------------------------------------------

interface AudioSignalShape extends SignalShape<number> {
  poll(): Effect.Effect<number>;
}

/**
 * Create an audio signal backed by an AVBridge.
 *
 * In 'sample' mode, returns the raw sample index. In 'normalized' mode,
 * returns a 0..1 progress value based on totalDurationSec. Call `.poll()`
 * to read the latest sample from the bridge and update the signal.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Signal } from '@czap/core';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const audioSig = yield* Signal.audio(bridge, 'normalized', 120);
 *   const progress = yield* audioSig.poll();
 *   // progress is a number between 0 and 1
 * }));
 * ```
 */
function _audio(
  bridge: AVBridge.Shape,
  mode: 'sample' | 'normalized' = 'sample',
  totalDurationSec?: number,
): Effect.Effect<AudioSignalShape, never, Scope.Scope> {
  return Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(0);

    const poll = () =>
      Effect.gen(function* () {
        const sample = bridge.getCurrentSample();
        let value: number;
        if (mode === 'normalized' && totalDurationSec !== undefined && totalDurationSec > 0) {
          const totalSamples = totalDurationSec * bridge.sampleRate;
          value = Math.min(sample / totalSamples, 1);
        } else {
          value = sample;
        }
        yield* SubscriptionRef.set(ref, value);
        return value;
      });

    return {
      source: { type: 'audio' as const, mode } as const,
      current: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      poll: () => poll(),
    };
  });
}

/**
 * Signal namespace -- live data feeds from the browser environment.
 *
 * Create reactive signals from viewport, scroll, pointer, time, media query,
 * audio, or custom sources. Each signal provides `.current` and `.changes`
 * backed by Effect's SubscriptionRef. Scoped for automatic listener cleanup.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Signal } from '@czap/core';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const viewport = yield* Signal.make({ type: 'viewport', axis: 'width' });
 *   const width = yield* viewport.current;
 *   const ctrl = yield* Signal.controllable();
 *   yield* ctrl.seek(500);
 * }));
 * ```
 */
export const Signal = { make: _make, controllable: _controllable, audio: _audio };

export declare namespace Signal {
  /** Structural shape of a passive {@link Signal}: `source` + `current` + `changes`. */
  export type Shape<T> = SignalShape<T>;
  /** Structural shape of a seekable, pausable signal — e.g. driven by Remotion or a scrub UI. */
  export type Controllable<T> = ControllableSignalShape<T>;
  /** Structural shape of an audio-sourced signal backed by an {@link AVBridge}. */
  export type Audio = AudioSignalShape;
}
