/**
 * SceneRuntime — `stateMachine` arm capsule `scene.runtime`.
 *
 * Owns the ECS world lifetime via an explicit `Scope`, registers the
 * 6 canonical scene systems (Video → Audio → Transition → Effect →
 * Sync → PassThroughMixer) in topological order, and exposes
 * `tick(dtMs)` + `release()` for use by render pipelines (CLI,
 * browser player, smoke tests).
 *
 * Closes the bug-#3 gap: `compileScene` previously returned a world
 * whose internal `Scope` had already closed AND that had no systems
 * registered (it merely attached a `registeredSystems: string[]`
 * metadata field via an `as unknown` cast). SceneRuntime turns
 * "compiled scene" into something that can actually tick.
 *
 * The 6 systems are factory functions parameterized by `frameIndex`
 * (and additional knobs for AudioSystem/PassThroughMixer). They are
 * stateless, so the runtime wraps each as a thin `System` whose
 * `execute` reads the current frame index from a mutable ref. That
 * lets us register the systems exactly once, in order, and have
 * `world.tick()` walk them every frame.
 *
 * @module
 */

import { Effect, Schema, Scope, Exit } from 'effect';
import type { System, World as WorldNS } from '@czap/core';
import { defineCapsule, World } from '@czap/core';
import type { CompiledScene } from './compile.js';
import { BeatBinding } from './capsules/beat-binding.js';
import { VideoSystem } from './systems/video.js';
import { AudioSystem } from './systems/audio.js';
import { TransitionSystem } from './systems/transition.js';
import { EffectSystem } from './systems/effect.js';
import { SyncSystem } from './systems/sync.js';
import { PassThroughMixer, type MixReceipt } from './systems/pass-through-mixer.js';

/** Number of canonical scene systems — pinned for invariants. */
const CANONICAL_SYSTEM_COUNT = 6;

// ---------------------------------------------------------------------------
// Capsule declaration
// ---------------------------------------------------------------------------

const SceneRuntimeInputSchema = Schema.Struct({
  scene: Schema.Unknown,
});

const SceneRuntimeOutputSchema = Schema.Struct({
  systemsRegistered: Schema.Number,
  entitySpawnCount: Schema.Number,
});

/**
 * The declared `scene.runtime` capsule. Registered in the module-level
 * catalog at import time; walked by the factory compiler. Behavior is
 * implemented by {@link SceneRuntime.build} below.
 */
export const sceneRuntimeCapsule = defineCapsule({
  _kind: 'stateMachine',
  name: 'scene.runtime',
  input: SceneRuntimeInputSchema,
  output: SceneRuntimeOutputSchema,
  capabilities: { reads: [], writes: ['ecs.world'] },
  invariants: [
    {
      name: 'all-canonical-systems-registered',
      check: (_input, output) => {
        const o = output as { systemsRegistered?: number };
        return o.systemsRegistered === CANONICAL_SYSTEM_COUNT;
      },
      message: `runtime must register exactly ${CANONICAL_SYSTEM_COUNT} canonical scene systems in topological order`,
    },
    {
      name: 'entity-spawn-count-non-negative',
      check: (_input, output) => {
        const o = output as { entitySpawnCount?: number };
        return typeof o.entitySpawnCount === 'number' && o.entitySpawnCount >= 0;
      },
      message: 'entity spawn count must be >= 0',
    },
  ],
  budgets: { p95Ms: 500, allocClass: 'bounded' },
  site: ['node', 'browser'],
});

// ---------------------------------------------------------------------------
// Runtime handle
// ---------------------------------------------------------------------------

/**
 * Cap on the default mix-receipt collector. Long-running renders would
 * otherwise leak unboundedly through `handle.receipts`. Callers who need
 * every receipt should supply their own `mixSink` (no cap is applied
 * when a sink is provided — bookkeeping is the caller's responsibility).
 */
export const DEFAULT_MIX_RECEIPT_CAP = 1024;

/** Options accepted by {@link SceneRuntime.build}. */
export interface SceneRuntimeOptions {
  /** Audio sample rate fed to AudioSystem. Defaults to 48_000. */
  readonly sampleRate?: number;
  /**
   * Mix-receipt sink for PassThroughMixer. Defaults to a bounded ring
   * (last {@link DEFAULT_MIX_RECEIPT_CAP} receipts) accessible via
   * `handle.receipts`. Pass an explicit sink to receive every receipt.
   */
  readonly mixSink?: (receipt: MixReceipt) => void;
}

/** Live runtime handle returned by {@link SceneRuntime.build}. */
export interface SceneRuntimeHandle {
  /** The underlying ECS world — exposed for query-based assertions. */
  readonly world: WorldNS.Shape;
  /** Number of systems registered (always {@link CANONICAL_SYSTEM_COUNT}). */
  readonly systemsRegistered: number;
  /** Number of entities spawned at build time (one per scene track). */
  readonly entitySpawnCount: number;
  /** Current scene time in milliseconds (advanced by {@link tick}). */
  readonly currentTimeMs: () => number;
  /** Current frame index derived from `currentTimeMs * fps / 1000`. */
  readonly currentFrame: () => number;
  /** Mix receipts collected via the configured sink. Empty when a custom sink was supplied. */
  readonly receipts: readonly MixReceipt[];
  /**
   * Advance the simulation by `dtMs` milliseconds, then run every
   * registered system once over the world.
   */
  readonly tick: (dtMs: number) => Promise<void>;
  /** Release the world's scope. Idempotent. */
  readonly release: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Build — the real runtime construction. Manifest-level capsule above
// captures the contract; this function does the work.
// ---------------------------------------------------------------------------

/**
 * Build a live SceneRuntime handle from a {@link CompiledScene}.
 *
 * Holds an explicit {@link Scope} for the world's lifetime so the
 * caller controls when finalizers run. Systems are registered in the
 * canonical topological order — this matches ADR-0009's
 * ECS-as-scene-substrate discipline.
 */
async function build(
  compiled: CompiledScene,
  opts: SceneRuntimeOptions = {},
): Promise<SceneRuntimeHandle> {
  const sampleRate = opts.sampleRate ?? 48_000;
  // Bounded ring for the default sink — long renders would otherwise grow
  // `collected` without limit. Custom sinks bypass the ring entirely.
  const collected: MixReceipt[] = [];
  const defaultSink = (r: MixReceipt): void => {
    collected.push(r);
    if (collected.length > DEFAULT_MIX_RECEIPT_CAP) collected.shift();
  };
  const mixSink = opts.mixSink ?? defaultSink;

  // Long-lived scope holds the world (and any future resources).
  const scope = await Effect.runPromise(Scope.make());

  // Mutable runtime context — system wrappers close over this ref so
  // we can register them exactly once and still let the frame index
  // advance each tick.
  const ctx = { frameIndex: 0, timeMs: 0 };

  // Build the world inside our long-lived scope. Effect.runPromise
  // strips `Scope` from the requirements via `Scope.use(scope)`.
  const world = await Effect.runPromise(Scope.use(World.make(), scope));

  // Spawn one entity per compiled track.
  let entitySpawnCount = 0;
  for (const t of compiled.trackSpawns) {
    await Effect.runPromise(world.spawn({ trackId: t.trackId, ...t.components }));
    entitySpawnCount++;
  }

  // Spawn beat entities BEFORE registering systems so SyncSystem sees
  // them on the very first tick. Bug #8 fix: pure ECS data flow,
  // SyncSystem queries `Beat`-tagged entities instead of reading a
  // perpetually-empty closure-private `_beats` array.
  if (compiled.beats.length > 0) {
    const spawns = BeatBinding.bind(compiled.beats);
    for (const beatSpawn of spawns) {
      await Effect.runPromise(world.spawn({ Beat: beatSpawn.components }));
    }
  }

  // Wrap each canonical factory as a single system that delegates to a
  // fresh factory instance per tick. This keeps the public system
  // semantics intact (each factory builds a `System` keyed to a frame
  // index) without re-registering systems on every frame.
  const wrapped: readonly System[] = [
    wrapForFrame('VideoSystem', ['VideoSource', 'FrameRange'], () =>
      VideoSystem(ctx.frameIndex),
    ),
    wrapForFrame('AudioSystem', ['AudioSource', 'FrameRange'], () =>
      AudioSystem(ctx.frameIndex, compiled.fps, sampleRate),
    ),
    wrapForFrame('TransitionSystem', ['TransitionKind', 'FrameRange', 'Between'], () =>
      TransitionSystem(ctx.frameIndex),
    ),
    wrapForFrame('EffectSystem', ['EffectKind', 'FrameRange'], () =>
      EffectSystem(ctx.frameIndex),
    ),
    wrapForFrame('SyncSystem', ['SyncAnchor'], () => SyncSystem(ctx.frameIndex, compiled.fps)),
    wrapForFrame('PassThroughMixer', ['AudioSource', 'Volume', 'Pan'], () =>
      PassThroughMixer(ctx.frameIndex, mixSink),
    ),
  ];

  for (const sys of wrapped) {
    await Effect.runPromise(world.addSystem(sys));
  }

  let released = false;

  const handle: SceneRuntimeHandle = {
    world,
    systemsRegistered: wrapped.length,
    entitySpawnCount,
    currentTimeMs: () => ctx.timeMs,
    currentFrame: () => ctx.frameIndex,
    receipts: collected,
    tick: async (dtMs: number) => {
      if (released) {
        throw new Error('SceneRuntime: tick() called after release()');
      }
      ctx.timeMs += dtMs;
      ctx.frameIndex = Math.floor((ctx.timeMs / 1000) * compiled.fps);
      await Effect.runPromise(world.tick());
    },
    release: async () => {
      if (released) return;
      released = true;
      await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));
    },
  };

  return handle;
}

/**
 * Wrap a frame-indexed system factory as a single registered `System`.
 * The wrapper preserves the factory's `name` and `query`, but rebuilds
 * the inner system every tick so it sees the current frame index.
 */
function wrapForFrame(
  name: string,
  query: readonly string[],
  factory: () => System,
): System {
  return {
    name,
    query,
    execute: (entities, world) =>
      Effect.gen(function* () {
        const inner = factory();
        yield* inner.execute(entities, world);
      }),
  };
}

// ---------------------------------------------------------------------------
// Namespace export (ADR-0001)
// ---------------------------------------------------------------------------

/**
 * SceneRuntime namespace — build a live, tickable handle from a
 * compiled scene. The companion type namespace exposes
 * `SceneRuntime.Handle` and `SceneRuntime.Options`.
 */
export const SceneRuntime = {
  /** Number of canonical scene systems the runtime always registers. */
  systemCount: CANONICAL_SYSTEM_COUNT,
  /** Build a live runtime handle. */
  build,
} as const;

export declare namespace SceneRuntime {
  /** Live runtime handle — see {@link SceneRuntimeHandle}. */
  export type Handle = SceneRuntimeHandle;
  /** Build-time options — see {@link SceneRuntimeOptions}. */
  export type Options = SceneRuntimeOptions;
}
