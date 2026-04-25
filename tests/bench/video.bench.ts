/**
 * Video rendering benchmarks -- scheduler, VideoRenderer, Compositor hot loop.
 */

import { Bench } from 'tinybench';
import { Effect } from 'effect';
import { Scheduler, VideoRenderer, Compositor, Millis } from '@czap/core';

const bench = new Bench({ warmupIterations: 50 });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

bench.add('FixedStepScheduler -- 1000 steps @ 60fps', () => {
  const sched = Scheduler.fixedStep(60);
  let count = 0;
  sched.schedule(() => {
    count++;
  });
  for (let i = 0; i < 1000; i++) {
    sched.step();
    sched.schedule(() => {
      count++;
    });
  }
});

bench.add('VideoRenderer -- 30 frames @ 30fps', async () => {
  const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
  const renderer = VideoRenderer.make({ fps: 30, width: 1920, height: 1080, durationMs: Millis(1000) }, compositor);
  for await (const _ of renderer.frames()) {
    /* consume */
  }
});

bench.add('VideoRenderer -- 300 frames @ 60fps', async () => {
  const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
  const renderer = VideoRenderer.make({ fps: 60, width: 1920, height: 1080, durationMs: Millis(5000) }, compositor);
  for await (const _ of renderer.frames()) {
    /* consume */
  }
});

bench.add('Compositor.compute() -- hot loop (100 calls)', () => {
  Effect.runSync(
    Effect.scoped(
      Effect.gen(function* () {
        const c = yield* Compositor.create();
        for (let i = 0; i < 100; i++) {
          yield* c.compute();
        }
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await bench.run();
console.table(bench.table());
