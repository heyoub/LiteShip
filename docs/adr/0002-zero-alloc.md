# ADR-0002 — Zero-allocation hot path discipline

**Status:** Accepted
**Date:** 2026-04-21
**Audience:** Contributors editing the per-frame compositor path, dirty-tracking, or scene-system code. Skip if you're only authoring boundaries.

## Context

The compositor runs at 60–120 fps. GC pauses inside rAF show up as jank; per-frame allocation compounds across thousands of frames/sec and every downstream app inherits the pressure. Effect's runtime adds non-trivial per-call overhead, unsuitable for the frame loop. The CZAP engine's default is the cheapest valid output for the detected tier, and the per-frame inner loop cannot allocate.

## Decision

Per-frame hot paths allocate zero objects. Four mechanisms:

1. **Pooled composite state.** `CompositorStatePool` hands out pre-allocated `CompositeState` instances; compositor writes in place; renderer returns them (`packages/core/src/compositor-pool.ts`).
2. **Bitmap-backed dirty tracking.** `DirtyFlags` is a bitmask, not a `Set` (`packages/core/src/dirty.ts`).
3. **Float64Array dense ECS storage.** Contiguous typed arrays with index-wrapping writes (`packages/core/src/ecs.ts`, `_makeDenseStore` L60–92).
4. **Microtask batching.** Dirty marks accumulate within a microtask, then flush once: one evaluate → one quantize → one compile → one DOM write per coalesced burst (`compositor.ts`).

The per-frame inner loop is plain JS. Effect is used only for setup/teardown (scoped resources), never inside rAF.

## Consequences

- No GC during animation frames: baseline was ~600 alloc/sec at 60 fps with 10 quantizers; now zero.
- `DirtyFlags` skips unchanged quantizers: **50–80% recompute elimination** typical.
- `CompositorStatePool` caps at `COMPOSITOR_POOL_CAP` (`defaults.ts`); beyond cap, `acquire()` returns a fresh instance. Documented tradeoff, not silent fallback.
- `DirtyFlags` caps at `DIRTY_FLAGS_MAX`; beyond cap, full recomputation runs. Crossing the cap is a signal to rearchitect.
- Dense stores throw `RangeError` at capacity (`ecs.ts:87-88`); callers size for their workload.
- `DenseStore.view()` Float64Array shares layout with the WASM escape-hatch input buffer. Zero-copy across the JS/WASM tier boundary.

## Evidence

- `Boundary.evaluate` at **71 ns / 10M+ ops/s**; `Compositor.computeState` at **~42 μs**. Together 0.05–0.25% of the 16 ms frame budget.
- `ECS World tick — 100 entities (dense)` at **3893 ns** vs sparse at **21789 ns** (5.6×).
- Bench source: `tests/bench/core.bench.ts`. Gate enforcement: `scripts/bench-gate.ts`. Numbers above are baseline reference points; the *current* gate posture is recorded per-run in `benchmarks/directive-gate.json` and rolled up into `reports/runtime-seams.json`. Read those first when verifying claims; this ADR is the design rationale, not the live ledger.
- **Transport cost floor** (diagnostic `worker-runtime-startup`): the off-thread seam is inherent. Node/BenchWorker median overhead ~75–80% (support ~32 μs/iter, parity ~17 μs). Dominant residual stages (`state-delivery:message-receipt` for one microtask turn in Node, structured-clone + event-loop hop in browser, Chromium ~100 μs; and `request-compute:dispatch-send`) are `support-only` in `WORKER_STARTUP_DIAGNOSTIC_STAGE_LABELS`: no in-process analogue by design. SAB-backed delivery rejected (strings in `BootstrapQuantizerRegistration` still need encoding). **Tradeoff:** keep structured-clone envelopes; residual is boundary cost, not product debt. Threshold `WORKER_TRANSPORT_FLOOR_THRESHOLD = 100%` gives ~22 pp headroom; reducible shared portion is hard-gated via `worker-runtime-startup-shared` (15%).

## Rejected alternatives

- **Per-frame allocation with GC tuning**: brittle, engine-dependent.
- **Copy-on-write immutable state**: doubles per-frame allocation for no product benefit.

## References

- `packages/core/src/compositor.ts`, `compositor-pool.ts`, `dirty.ts`, `ecs.ts`, `frame-budget.ts`
- `tests/bench/core.bench.ts`

## Amendment (2026-04-23): Dense ECS Systems in Scene Playback

Scene playback in `@czap/scene` uses the dense `Part` stores from `@czap/core` for per-frame position/opacity/volume/audioPhase. Each dense system reads its query store's `Float64Array` view directly and mutates in place. This matches the pool/dirty-flags/frame-budget discipline already in force for the compositor working line.

The scene compiler (`packages/scene/src/compile.ts`) spawns one ECS entity per declared track at world-construction time with component seeds produced by the Track helpers. During playback, no system allocates per tick.

The canonical systems bound by this discipline:

- `VideoSystem`: writes `Opacity` dense store
- `AudioSystem`: writes `Volume` + `AudioPhase` dense stores
- `TransitionSystem`: writes `BlendFactor` dense store
- `EffectSystem`: writes `Intensity` dense store
- `SyncSystem`: reads marker arrays (pre-baked via `BeatMarkerProjection`), writes `Intensity` (shared dense store with `EffectSystem`)
- `PassThroughMixer`: reads `Volume` + `Pan`, emits receipts to an externally supplied sink (no internal allocation)

Tasks 33-35 added two additive ECS primitives that these systems use ergonomically: `World.setComponent(id, name, value)` (schema-free write-back) and entity-query results that spread component values as direct properties alongside the existing `.components` Map. Both are backward-compatible. Existing ECS consumers that only read `.components` are unaffected.

### Additional references

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §5.3, §7
- `docs/adr/0009-ecs-scene-composition.md`
- `packages/scene/src/systems/*.ts` — canonical scene systems

## Amendment (2026-04-24): Scene runtime tick cadence

`@czap/scene` ships a `SceneRuntime` (`stateMachine` arm capsule
`scene.runtime`, `packages/scene/src/runtime.ts`) that owns world
lifetime via an explicit `Scope` and registers the 6 canonical scene
systems in topological order:

```
Video → Audio → Transition → Effect → Sync → PassThroughMixer
```

Each `tick(dtMs)` call advances a single mutable frame-index ref
shared across system wrappers, then invokes `world.tick()` which
walks the registered systems in order. System factories rebuild
once per tick (factory-closure pattern via `wrapForFrame`); inner
system instances themselves are stateless. The runtime budgets this
as `allocClass: 'bounded'`. Six small objects per frame is real
allocation but bounded and predictable, distinct from the unbounded
allocations this ADR was originally written to forbid.

Beat entities are spawned BEFORE system registration so SyncSystem's
world query (`world.query('Beat')`) returns populated results on the
very first tick. The default `mixSink` is bounded to
`DEFAULT_MIX_RECEIPT_CAP = 1024` last receipts to prevent unbounded
growth on long renders; callers that supply their own sink take
ownership of bookkeeping.

This subsection is informative. The load-bearing zero-alloc rules
above remain the canonical spec. SceneRuntime documents the one
sanctioned bounded-allocation cadence at the scene-tick boundary,
not a relaxation of the per-frame inner-loop discipline.
