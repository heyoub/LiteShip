import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Effect, Stream } from 'effect';
import { Animation, Millis, Scheduler, Easing } from '@czap/core';
import { interpolate as rawInterpolate } from '../../../packages/core/src/interpolate.js';

async function settleAnimationRegistration(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

async function settleAnimationCompletion(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Animation.run', () => {
  test('emits a single completed frame for zero-duration animations', async () => {
    const frames = Array.from(await Effect.runPromise(Stream.runCollect(Animation.run({ duration: Millis(0) }))));

    expect(frames).toHaveLength(1);
    expect(frames[0]?.progress).toBe(1);
    expect(frames[0]?.elapsed).toBe(0);
    expect(frames[0]?.timestamp).toBe(0);
  });

  test('accepts a custom scheduler configuration without changing zero-duration behavior', async () => {
    const scheduler = Scheduler.fixedStep(4);
    const frames = Array.from(
      await Effect.runPromise(
        Stream.runCollect(
          Animation.run({
            duration: Millis(0),
            easing: (t) => t * t,
            scheduler,
          }),
        ),
      ),
    );

    expect(frames).toHaveLength(1);
    expect(frames[0]?.eased).toBe(1);
  });

  test('runs finite animations with a custom scheduler until completion', async () => {
    const callbacks = new Map<number, (timestamp: number) => void>();
    let nextId = 1;
    const scheduler = {
      _tag: 'FrameScheduler' as const,
      schedule: vi.fn((callback: (timestamp: number) => void) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      }),
      cancel: vi.fn((id: number) => {
        callbacks.delete(id);
      }),
    };

    const collecting = Effect.runPromise(
      Stream.runCollect(
        Animation.run({
          duration: Millis(500),
          easing: (t) => t * t,
          scheduler,
        }),
      ),
    );

    await settleAnimationRegistration();
    callbacks.get(1)?.(0);
    callbacks.get(2)?.(250);
    callbacks.get(3)?.(500);
    await settleAnimationCompletion();

    const frames = Array.from(await collecting);

    expect(frames.map((frame) => frame.progress)).toEqual([0, 0.5, 1]);
    expect(frames[1]?.eased).toBeCloseTo(0.25);
    expect(scheduler.cancel).toHaveBeenCalledWith(3);
  });

  test('defaults to browser requestAnimationFrame scheduling when available', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const cancelAnimationFrameSpy = vi.fn((id: number) => {
      callbacks.delete(id);
    });

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

    const collecting = Effect.runPromise(Stream.runCollect(Animation.run({ duration: Millis(32) })));

    await settleAnimationRegistration();
    callbacks.get(1)?.(0);
    callbacks.get(2)?.(16);
    callbacks.get(3)?.(32);
    await settleAnimationCompletion();

    const frames = Array.from(await collecting);

    expect(frames.map((frame) => frame.timestamp)).toEqual([0, 16, 32]);
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(3);
  });

  test('times out cleanly with the noop scheduler when requestAnimationFrame is unavailable', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined as never);
    vi.stubGlobal('cancelAnimationFrame', undefined as never);

    await expect(
      Effect.runPromise(Stream.runCollect(Animation.run({ duration: Millis(10) })).pipe(Effect.timeout('5 millis'))),
    ).rejects.toMatchObject({ _tag: 'TimeoutError' });
  });
});

describe('Animation.interpolate', () => {
  test('lerps shared keys and fills keys that exist only in the target record', () => {
    expect(Animation.interpolate({ opacity: 0, scale: 0.5 }, { opacity: 1, rotate: 90 }, 0.5)).toEqual({
      opacity: 0.5,
      rotate: 45,
      scale: 0.5,
    });
  });

  test('ignores inherited enumerable target keys when filling missing properties', () => {
    const inheritedTarget = Object.create({ rotate: 90 }) as Record<string, number>;
    inheritedTarget.opacity = 1;

    expect(Animation.interpolate({ opacity: 0 }, inheritedTarget, 0.5)).toEqual({
      opacity: 0.5,
    });
  });

  test('raw interpolate only fills own target keys that are missing from the result', () => {
    const inheritedTarget = Object.create({ rotate: 90 }) as Record<string, number>;
    inheritedTarget.opacity = 1;

    expect(rawInterpolate({ opacity: 0 }, inheritedTarget, 0.5)).toEqual({
      opacity: 0.5,
    });
    expect(rawInterpolate({ opacity: 0 }, { opacity: 1, rotate: 90 }, 0.5)).toEqual({
      opacity: 0.5,
      rotate: 45,
    });
  });

  test('raw interpolate respects explicit defaults for keys that only exist in the target record', () => {
    expect(rawInterpolate({ opacity: 0 }, { opacity: 1, rotate: 90 }, 0.5, { rotate: 10 })).toEqual({
      opacity: 0.5,
      rotate: 50,
    });
  });
});

// ---------------------------------------------------------------------------
// Easing.spring input validation
// ---------------------------------------------------------------------------

describe('Easing.spring input validation', () => {
  test('throws RangeError when stiffness is 0', () => {
    expect(() => Easing.spring({ stiffness: 0, damping: 10 })).toThrow(RangeError);
  });

  test('throws RangeError when stiffness is negative', () => {
    expect(() => Easing.spring({ stiffness: -1, damping: 10 })).toThrow(RangeError);
  });

  test('throws RangeError when mass is 0', () => {
    expect(() => Easing.spring({ stiffness: 200, damping: 10, mass: 0 })).toThrow(RangeError);
  });

  test('throws RangeError when mass is negative', () => {
    expect(() => Easing.spring({ stiffness: 200, damping: 10, mass: -1 })).toThrow(RangeError);
  });

  test('throws RangeError when damping is negative', () => {
    expect(() => Easing.spring({ stiffness: 200, damping: -1 })).toThrow(RangeError);
  });

  test('does not throw when damping is 0 (undamped)', () => {
    expect(() => Easing.spring({ stiffness: 200, damping: 0 })).not.toThrow();
  });

  test('does not throw for valid config without explicit mass', () => {
    expect(() => Easing.spring({ stiffness: 200, damping: 10 })).not.toThrow();
  });

  test('springNaturalDuration throws RangeError for stiffness 0', () => {
    expect(() => Easing.springNaturalDuration({ stiffness: 0, damping: 10 })).toThrow(RangeError);
  });

  test('springNaturalDuration throws RangeError for Infinity stiffness', () => {
    expect(() => Easing.springNaturalDuration({ stiffness: Infinity, damping: 10 })).toThrow(RangeError);
  });
});
