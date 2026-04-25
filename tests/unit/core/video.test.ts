/**
 * Video rendering primitives -- FrameScheduler, VideoRenderer, controllable signals.
 */

import { describe, it, expect } from 'vitest';
import { Effect, SubscriptionRef, Ref } from 'effect';
import { Scheduler, VideoRenderer, Signal, Compositor, Boundary, Timeline, Easing, Millis } from '@czap/core';

// ---------------------------------------------------------------------------
// § 1. FrameScheduler
// ---------------------------------------------------------------------------

describe('FrameScheduler', () => {
  describe('Scheduler.fixedStep', () => {
    it('starts at frame 0', () => {
      const sched = Scheduler.fixedStep(30);
      expect(sched.frame).toBe(0);
      expect(sched._tag).toBe('FrameScheduler');
    });

    it('step() advances frame count', () => {
      const sched = Scheduler.fixedStep(60);
      sched.step();
      expect(sched.frame).toBe(1);
      sched.step();
      expect(sched.frame).toBe(2);
      sched.step();
      expect(sched.frame).toBe(3);
    });

    it('fires callback with correct timestamp at 30fps', () => {
      const sched = Scheduler.fixedStep(30);
      const timestamps: number[] = [];
      const cb = (now: number) => {
        timestamps.push(now);
        sched.schedule(cb);
      };
      sched.schedule(cb);
      for (let i = 0; i < 5; i++) sched.step();
      expect(timestamps.length).toBe(5);
      expect(timestamps[0]).toBeCloseTo(0, 1);
      expect(timestamps[1]).toBeCloseTo(1000 / 30, 1);
      expect(timestamps[2]).toBeCloseTo(2000 / 30, 1);
    });

    it('fires callback with correct timestamp at 60fps', () => {
      const sched = Scheduler.fixedStep(60);
      const timestamps: number[] = [];
      const cb = (now: number) => {
        timestamps.push(now);
        sched.schedule(cb);
      };
      sched.schedule(cb);
      sched.step();
      sched.step();
      sched.step();
      expect(timestamps[0]).toBeCloseTo(0, 1);
      expect(timestamps[1]).toBeCloseTo(1000 / 60, 1);
      expect(timestamps[2]).toBeCloseTo(2000 / 60, 1);
    });

    it('cancel() prevents callback from firing', () => {
      const sched = Scheduler.fixedStep(30);
      let called = false;
      sched.schedule(() => {
        called = true;
      });
      sched.cancel(0);
      sched.step();
      expect(called).toBe(false);
    });

    it('step() without pending callback still advances frame', () => {
      const sched = Scheduler.fixedStep(30);
      sched.step();
      sched.step();
      expect(sched.frame).toBe(2);
    });
  });

  describe('Scheduler.noop', () => {
    it('returns 0 from schedule and does nothing', () => {
      const sched = Scheduler.noop();
      expect(sched._tag).toBe('FrameScheduler');
      const id = sched.schedule(() => {});
      expect(id).toBe(0);
      sched.cancel(id);
    });
  });

  describe('Scheduler.raf', () => {
    it('returns a scheduler with correct _tag and methods', () => {
      const sched = Scheduler.raf();
      expect(sched._tag).toBe('FrameScheduler');
      expect(typeof sched.schedule).toBe('function');
      expect(typeof sched.cancel).toBe('function');
    });
  });
});

// ---------------------------------------------------------------------------
// § 2. VideoRenderer
// ---------------------------------------------------------------------------

describe('VideoRenderer', () => {
  it('computes correct totalFrames', () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 30, width: 1920, height: 1080, durationMs: Millis(5000) }, compositor);
    expect(renderer.totalFrames).toBe(150);
  });

  it('yields correct frame count', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 30, width: 1920, height: 1080, durationMs: Millis(1000) }, compositor);

    const frames: Array<{ frame: number; timestamp: number; progress: number }> = [];
    for await (const f of renderer.frames()) {
      frames.push({ frame: f.frame, timestamp: f.timestamp, progress: f.progress });
    }

    expect(frames.length).toBe(30);
    expect(frames[0]!.frame).toBe(0);
    expect(frames[0]!.timestamp).toBeCloseTo(0, 1);
    expect(frames[29]!.frame).toBe(29);
    expect(frames[29]!.progress).toBeCloseTo(1, 5);
  });

  it('yields CompositeState with correct shape for every frame', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 10, width: 1280, height: 720, durationMs: Millis(500) }, compositor);

    let checked = 0;
    for await (const f of renderer.frames()) {
      expect(f.state).toBeDefined();
      expect(f.state.discrete).toEqual({});
      expect(f.state.blend).toEqual({});
      expect(f.state.outputs.css).toEqual({});
      expect(f.state.outputs.glsl).toEqual({});
      expect(f.state.outputs.aria).toEqual({});
      checked++;
    }
    expect(checked).toBe(5);
  });

  it('progress goes from 0 to 1 across frames', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 10, width: 640, height: 480, durationMs: Millis(1000) }, compositor);

    const progresses: number[] = [];
    for await (const f of renderer.frames()) {
      progresses.push(f.progress);
    }

    expect(progresses[0]).toBe(0);
    expect(progresses[progresses.length - 1]).toBeCloseTo(1, 5);
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]!).toBeGreaterThanOrEqual(progresses[i - 1]!);
    }
  });

  it('single frame duration yields 1 frame', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 30, width: 1920, height: 1080, durationMs: Millis(10) }, compositor);

    const frames: Array<{ frame: number; progress: number }> = [];
    for await (const frame of renderer.frames()) {
      frames.push({ frame: frame.frame, progress: frame.progress });
    }

    expect(frames).toEqual([{ frame: 0, progress: 1 }]);
  });

  it('timestamp increments correctly at 60fps', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 60, width: 1920, height: 1080, durationMs: Millis(100) }, compositor);

    const timestamps: number[] = [];
    for await (const f of renderer.frames()) {
      timestamps.push(f.timestamp);
    }

    for (let i = 1; i < timestamps.length; i++) {
      const dt = timestamps[i]! - timestamps[i - 1]!;
      expect(dt).toBeCloseTo(1000 / 60, 1);
    }
  });

  it('seeks a controllable signal before each frame when one is provided', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const signal = Effect.runSync(Effect.scoped(Signal.controllable()));
    const renderer = VideoRenderer.make({ fps: 4, width: 320, height: 180, durationMs: Millis(1000) }, compositor, signal);

    const seen: number[] = [];
    for await (const frame of renderer.frames()) {
      seen.push(Effect.runSync(signal.current));
      expect(Effect.runSync(signal.current)).toBe(frame.timestamp);
    }

    expect(seen).toEqual([0, 250, 500, 750]);
  });
});

// ---------------------------------------------------------------------------
// § 3. Timeline with FixedStepScheduler
// ---------------------------------------------------------------------------

describe('Timeline with FixedStepScheduler', () => {
  const boundary = Boundary.make({
    input: 'time',
    at: [
      [0, 'intro'],
      [500, 'middle'],
      [1000, 'outro'],
    ] as const,
  });

  it('produces deterministic state transitions', () => {
    const sched = Scheduler.fixedStep(60);

    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            scheduler: sched,
          });
          yield* tl.play();

          // Advance enough frames to cross 500ms threshold
          // At 60fps, each frame = ~16.67ms. 31 frames ≈ 516ms
          for (let i = 0; i < 31; i++) sched.step();

          return yield* tl.state;
        }),
      ),
    );

    expect(result).toBe('middle');
  });

  it('seek produces correct state without stepping', () => {
    const sched = Scheduler.fixedStep(30);

    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            scheduler: sched,
          });

          yield* tl.seek(Millis(1050));
          return yield* tl.state;
        }),
      ),
    );

    expect(result).toBe('outro');
  });

  it('scrub to 0.5 lands in middle state', () => {
    const sched = Scheduler.fixedStep(30);

    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            scheduler: sched,
          });

          yield* tl.scrub(0.5); // 0.5 * 1200 = 600ms -> middle
          return yield* tl.state;
        }),
      ),
    );

    expect(result).toBe('middle');
  });

  it('reverse changes playback direction', () => {
    const sched = Scheduler.fixedStep(60);

    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            scheduler: sched,
          });

          // Seek to middle, then play in reverse
          yield* tl.seek(Millis(800));
          yield* tl.play();
          yield* tl.reverse();

          // Step 20 frames backwards at 60fps -> ~333ms backwards -> 800 - 333 = ~467
          for (let i = 0; i < 20; i++) sched.step();

          return yield* tl.state;
        }),
      ),
    );

    expect(result).toBe('intro');
  });
});

// ---------------------------------------------------------------------------
// § 4. ControllableSignal
// ---------------------------------------------------------------------------

describe('ControllableSignal', () => {
  it('starts at 0', () => {
    const val = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const sig = yield* Signal.controllable();
          expect(sig.source.type).toBe('time');
          expect(sig.source.mode).toBe('scheduled');
          return yield* sig.current;
        }),
      ),
    );
    expect(val).toBe(0);
  });

  it('seek updates current value', () => {
    const val = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const sig = yield* Signal.controllable();
          yield* sig.seek(42);
          return yield* sig.current;
        }),
      ),
    );
    expect(val).toBe(42);
  });

  it('multiple seeks update correctly', () => {
    const vals = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const sig = yield* Signal.controllable();
          yield* sig.seek(10);
          const a = yield* sig.current;
          yield* sig.seek(20);
          const b = yield* sig.current;
          yield* sig.seek(0);
          const c = yield* sig.current;
          return [a, b, c] as const;
        }),
      ),
    );
    expect(vals).toEqual([10, 20, 0]);
  });
});

// ---------------------------------------------------------------------------
// § 5. springToLinearCSS (verify format)
// ---------------------------------------------------------------------------

describe('springToLinearCSS', () => {
  it('produces valid CSS linear() function', () => {
    const css = Easing.springToLinearCSS({ stiffness: 100, damping: 10 });
    expect(css.startsWith('linear(')).toBe(true);
    expect(css.endsWith(')')).toBe(true);
    // Default 32 samples -> 33 points (0 through 32 inclusive)
    const points = css.slice(7, -1).split(', ');
    expect(points.length).toBe(33);
    expect(parseFloat(points[0]!)).toBeCloseTo(0, 1);
    expect(parseFloat(points[points.length - 1]!)).toBeCloseTo(1, 0);
  });

  it('custom sample count changes point count', () => {
    const css = Easing.springToLinearCSS({ stiffness: 100, damping: 10 }, 16);
    const points = css.slice(7, -1).split(', ');
    expect(points.length).toBe(17);
  });
});

describe('springNaturalDuration', () => {
  it('returns a reasonable value for known spring config', () => {
    const dur = Easing.springNaturalDuration({ stiffness: 400, damping: 30 });
    expect(dur).toBeGreaterThan(0.3);
    expect(dur).toBeLessThan(0.6);
  });

  it('critically damped spring settles faster than underdamped', () => {
    const critical = Easing.springNaturalDuration({ stiffness: 100, damping: 20 });
    const underdamped = Easing.springNaturalDuration({ stiffness: 100, damping: 5 });
    expect(critical).toBeLessThanOrEqual(underdamped);
  });
});

// ---------------------------------------------------------------------------
// § 6. VideoRenderer edge cases
// ---------------------------------------------------------------------------

describe('VideoRenderer edge cases', () => {
  it('durationMs: Millis(0) yields zero frames', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 30, width: 1920, height: 1080, durationMs: Millis(0) }, compositor);
    expect(renderer.totalFrames).toBe(0);

    let count = 0;
    for await (const _ of renderer.frames()) count++;
    expect(count).toBe(0);
  });

  it('fps: 1 with 1500ms yields 2 frames', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 1, width: 320, height: 240, durationMs: Millis(1500) }, compositor);
    expect(renderer.totalFrames).toBe(2); // ceil(1.5 * 1) = 2

    let count = 0;
    for await (const _ of renderer.frames()) count++;
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// § 7. Timeline loop and pause
// ---------------------------------------------------------------------------

describe('Timeline loop and pause', () => {
  const boundary = Boundary.make({
    input: 'time',
    at: [
      [0, 'intro'],
      [500, 'middle'],
      [1000, 'outro'],
    ] as const,
  });

  it('pause stops time advancement', () => {
    const sched = Scheduler.fixedStep(60);

    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            scheduler: sched,
          });
          yield* tl.play();

          // Advance a few frames
          for (let i = 0; i < 5; i++) sched.step();
          yield* tl.pause();

          const elapsedBefore = yield* tl.elapsed;

          // Step more -- should NOT advance
          for (let i = 0; i < 20; i++) sched.step();

          const elapsedAfter = yield* tl.elapsed;
          expect(elapsedAfter).toBe(elapsedBefore);
          return yield* tl.state;
        }),
      ),
    );

    expect(result).toBe('intro');
  });

  it('loop wraps time back to start', () => {
    const sched = Scheduler.fixedStep(60);

    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            loop: true,
            scheduler: sched,
          });
          yield* tl.play();

          // At 60fps, 1200ms = 72 frames for one loop.
          // Step 80 frames -> wraps to ~133ms into second loop
          for (let i = 0; i < 80; i++) sched.step();

          const elapsed = yield* tl.elapsed;
          expect(elapsed).toBeLessThan(1200);
          return yield* tl.state;
        }),
      ),
    );

    expect(result).toBe('intro');
  });

  it('progress reads correctly', () => {
    const sched = Scheduler.fixedStep(60);

    const progress = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const tl = yield* Timeline.from(boundary, {
            duration: Millis(1200),
            scheduler: sched,
          });

          yield* tl.seek(Millis(600));
          return yield* tl.progress;
        }),
      ),
    );

    expect(progress).toBeCloseTo(0.5, 5);
  });
});
