// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Effect } from 'effect';
import { AVBridge, Signal } from '@czap/core';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

describe('Signal.make', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('tracks viewport width changes', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'viewport', axis: 'width' });
        return yield* signal.current;
      }),
    );

    expect(value).toBe(800);
  });

  test('tracks viewport height resize events and cleans up the listener', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'viewport', axis: 'height' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

        yield* Effect.sync(() => {
          Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
          window.dispatchEvent(new Event('resize'));
        });

        return yield* signal.current;
      }),
    );

    expect(value).toBe(720);
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  test('tracks viewport width resize events through the width branch', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'viewport', axis: 'width' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

        yield* Effect.sync(() => {
          Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
          window.dispatchEvent(new Event('resize'));
        });

        return yield* signal.current;
      }),
    );

    expect(value).toBe(1024);
  });

  test('computes scroll progress and reacts to scroll events', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    const value = await runScoped(
      Effect.gen(function* () {
        Object.defineProperty(window, 'scrollY', { value: 250, configurable: true });
        const signal = yield* Signal.make({ type: 'scroll', axis: 'progress' });
        return yield* signal.current;
      }),
    );

    expect(value).toBeCloseTo(0.25);
  });

  test('tracks scroll axes and zero-progress ranges', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    const values = await runScoped(
      Effect.gen(function* () {
        const xSignal = yield* Signal.make({ type: 'scroll', axis: 'x' });
        const ySignal = yield* Signal.make({ type: 'scroll', axis: 'y' });
        const progressSignal = yield* Signal.make({ type: 'scroll', axis: 'progress' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

        yield* Effect.sync(() => {
          Object.defineProperty(window, 'scrollX', { value: 120, configurable: true });
          Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
          window.dispatchEvent(new Event('scroll'));
        });

        return {
          x: yield* xSignal.current,
          y: yield* ySignal.current,
          progress: yield* progressSignal.current,
        };
      }),
    );

    expect(values).toEqual({ x: 120, y: 240, progress: 0 });
  });

  test('updates scroll progress through the positive-range event path', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'scroll', axis: 'progress' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
        yield* Effect.sync(() => {
          Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
          window.dispatchEvent(new Event('scroll'));
        });

        return yield* signal.current;
      }),
    );

    expect(value).toBeCloseTo(0.5);
  });

  test('tracks pointer updates', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'pointer', axis: 'pressure' });
        return yield* signal.current;
      }),
    );

    expect(value).toBe(0);
  });

  test('tracks pointer axes and cleans up pointer listeners', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');

    const values = await runScoped(
      Effect.gen(function* () {
        const xSignal = yield* Signal.make({ type: 'pointer', axis: 'x' });
        const ySignal = yield* Signal.make({ type: 'pointer', axis: 'y' });
        const pressureSignal = yield* Signal.make({ type: 'pointer', axis: 'pressure' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

        yield* Effect.sync(() => {
          const event = new MouseEvent('pointermove', { clientX: 48, clientY: 96 });
          Object.defineProperty(event, 'pressure', { value: 0.75, configurable: true });
          window.dispatchEvent(event);
        });

        return {
          x: yield* xSignal.current,
          y: yield* ySignal.current,
          pressure: yield* pressureSignal.current,
        };
      }),
    );

    expect(values).toEqual({ x: 48, y: 96, pressure: 0.75 });
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });

  test('tracks media-query changes', async () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = [];
    const mql = {
      matches: false,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.push(listener);
      },
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => mql),
    });

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'media', query: '(prefers-reduced-motion: reduce)' });
        return yield* signal.current;
      }),
    );

    expect(value).toBe(0);
  });

  test('tracks media-query listeners through match changes and cleanup', async () => {
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const mql = {
      matches: true,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListener = listener;
      }),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => mql),
    });

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'media', query: '(prefers-color-scheme: dark)' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
        yield* Effect.sync(() => {
          changeListener?.({ matches: false } as MediaQueryListEvent);
        });

        return yield* signal.current;
      }),
    );

    expect(value).toBe(0);
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  test('covers additional initial branches for viewport height, scroll axes, and matching media queries', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 32, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 96, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1_640, configurable: true });

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const values = await runScoped(
      Effect.gen(function* () {
        const viewport = yield* Signal.make({ type: 'viewport', axis: 'height' });
        const scrollX = yield* Signal.make({ type: 'scroll', axis: 'x' });
        const scrollY = yield* Signal.make({ type: 'scroll', axis: 'y' });
        const media = yield* Signal.make({ type: 'media', query: '(prefers-contrast: more)' });

        return {
          viewport: yield* viewport.current,
          scrollX: yield* scrollX.current,
          scrollY: yield* scrollY.current,
          media: yield* media.current,
        };
      }),
    );

    expect(values).toEqual({ viewport: 640, scrollX: 32, scrollY: 96, media: 1 });
  });

  test('updates absolute time signals on their interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const values = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'time', mode: 'absolute' });
        const initial = yield* signal.current;

        yield* Effect.sync(() => {
          vi.advanceTimersByTime(1000);
        });

        return [initial, yield* signal.current] as const;
      }),
    );

    expect(values[1]).toBe(values[0]! + 1000);
  });

  test('updates elapsed time signals with requestAnimationFrame and cancels the latest frame on cleanup', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    let releaseSetup: (() => void) | undefined;
    let currentTime = 1_000;
    const ready = new Promise<void>((resolve) => {
      releaseSetup = resolve;
    });

    vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

    const requestAnimationFrameSpy = vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    });
    const cancelAnimationFrameSpy = vi.fn((id: number) => {
      callbacks.delete(id);
    });

    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

    const elapsedPromise = runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'time', mode: 'elapsed' });

        yield* Effect.promise(() => ready);
        yield* Effect.sync(() => {
          currentTime = 1_000;
          callbacks.get(1)?.(1_000);
          currentTime = 1_060;
          callbacks.get(2)?.(1_060);
        });

        return yield* signal.current;
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseSetup?.();

    const elapsed = await elapsedPromise;

    expect(elapsed).toBe(60);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(3);
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(3);
  });

  test('leaves elapsed time signals inert when requestAnimationFrame is unavailable', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined as never);

    const elapsed = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'time', mode: 'elapsed' });
        return yield* signal.current;
      }),
    );

    expect(elapsed).toBe(0);
  });

  test('leaves scheduled time signals under external control', async () => {
    const current = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'time', mode: 'scheduled' });
        return yield* signal.current;
      }),
    );

    expect(current).toBe(0);
  });

  test('returns the default value for custom signals', async () => {
    const current = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'custom', id: 'search-query' });
        return yield* signal.current;
      }),
    );

    expect(current).toBe(0);
  });

  test('returns the default value for audio source placeholders', async () => {
    const current = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'audio', mode: 'normalized' });
        return yield* signal.current;
      }),
    );

    expect(current).toBe(0);
  });

  test('runs scheduled, custom, and audio setup paths without attaching browser listeners', async () => {
    const addListener = vi.spyOn(window, 'addEventListener');

    const values = await runScoped(
      Effect.gen(function* () {
        const scheduled = yield* Signal.make({ type: 'time', mode: 'scheduled' });
        const custom = yield* Signal.make({ type: 'custom', id: 'runtime-mode' });
        const audio = yield* Signal.make({ type: 'audio', mode: 'sample' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

        return {
          scheduled: yield* scheduled.current,
          custom: yield* custom.current,
          audio: yield* audio.current,
        };
      }),
    );

    expect(values).toEqual({
      scheduled: 0,
      custom: 0,
      audio: 0,
    });
    expect(addListener).not.toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addListener).not.toHaveBeenCalledWith('scroll', expect.any(Function), expect.anything());
    expect(addListener).not.toHaveBeenCalledWith('pointermove', expect.any(Function));
  });

  test('gracefully leaves browser-driven signals inert when window is unavailable', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    try {
      const values = await runScoped(
        Effect.gen(function* () {
          const viewport = yield* Signal.make({ type: 'viewport', axis: 'width' });
          const scroll = yield* Signal.make({ type: 'scroll', axis: 'progress' });
          const pointer = yield* Signal.make({ type: 'pointer', axis: 'pressure' });
          const media = yield* Signal.make({ type: 'media', query: '(prefers-color-scheme: dark)' });

          yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

          return {
            viewport: yield* viewport.current,
            scroll: yield* scroll.current,
            pointer: yield* pointer.current,
            media: yield* media.current,
          };
        }),
      );

      expect(values).toEqual({ viewport: 0, scroll: 0, pointer: 0, media: 0 });
    } finally {
      vi.stubGlobal('window', originalWindow);
      vi.stubGlobal('document', originalDocument);
    }
  });

  test('covers no-window setup branches and positive media transitions with explicit listener setup', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    try {
      const inert = await runScoped(
        Effect.gen(function* () {
          const viewport = yield* Signal.make({ type: 'viewport', axis: 'height' });
          const scroll = yield* Signal.make({ type: 'scroll', axis: 'x' });
          const pointer = yield* Signal.make({ type: 'pointer', axis: 'x' });
          const media = yield* Signal.make({ type: 'media', query: '(prefers-reduced-motion: reduce)' });

          yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

          return {
            viewport: yield* viewport.current,
            scroll: yield* scroll.current,
            pointer: yield* pointer.current,
            media: yield* media.current,
          };
        }),
      );

      expect(inert).toEqual({ viewport: 0, scroll: 0, pointer: 0, media: 0 });
    } finally {
      vi.stubGlobal('window', originalWindow);
      vi.stubGlobal('document', originalDocument);
    }

    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const mql = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListener = listener;
      }),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => mql),
    });

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'media', query: '(prefers-contrast: more)' });

        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
        yield* Effect.sync(() => {
          changeListener?.({ matches: true } as MediaQueryListEvent);
        });

        return yield* signal.current;
      }),
    );

    expect(value).toBe(1);
  });
});

describe('Signal.make time-elapsed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('time-elapsed signal starts a requestAnimationFrame loop and cleans up on scope close', async () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.make({ type: 'time', mode: 'elapsed' });
        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
        return yield* signal.current;
      }),
    );

    expect(value).toBeGreaterThanOrEqual(0);
    expect(rafSpy).toHaveBeenCalled();
    expect(cafSpy).toHaveBeenCalled();
  });
});

describe('Signal.controllable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('seek, pause, and resume control scheduled time updates', async () => {
    const current = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.controllable();

        yield* signal.seek(100);
        yield* signal.pause();
        yield* signal.seek(200);
        yield* signal.resume();
        yield* signal.seek(300);

        return yield* signal.current;
      }),
    );

    expect(current).toBe(300);
  });
});

describe('Signal.audio', () => {
  test('poll returns the raw sample count in sample mode', async () => {
    const bridge = AVBridge.make({ sampleRate: 48_000, fps: 60 });
    bridge.advanceSamples(2400);

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.audio(bridge);
        return yield* signal.poll();
      }),
    );

    expect(value).toBe(2400);
  });

  test('poll normalizes audio progress against total duration', async () => {
    const bridge = AVBridge.make({ sampleRate: 48_000, fps: 60 });
    bridge.advanceSamples(24_000);

    const value = await runScoped(
      Effect.gen(function* () {
        const signal = yield* Signal.audio(bridge, 'normalized', 1);
        return yield* signal.poll();
      }),
    );

    expect(value).toBeCloseTo(0.5);
  });

  test('falls back to the raw sample count when normalization is missing or invalid', async () => {
    const bridge = AVBridge.make({ sampleRate: 48_000, fps: 60 });
    bridge.advanceSamples(1_200);

    const values = await runScoped(
      Effect.gen(function* () {
        const withoutDuration = yield* Signal.audio(bridge, 'normalized');
        const zeroDuration = yield* Signal.audio(bridge, 'normalized', 0);

        return {
          withoutDuration: yield* withoutDuration.poll(),
          zeroDuration: yield* zeroDuration.poll(),
        };
      }),
    );

    expect(values).toEqual({ withoutDuration: 1_200, zeroDuration: 1_200 });
  });
});
