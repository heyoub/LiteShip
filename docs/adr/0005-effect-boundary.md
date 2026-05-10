# ADR-0005 — Effect boundary rules

**Status:** Accepted
**Date:** 2026-04-21

## Context

LiteShip uses Effect v4 for async composition, resource lifecycle, and streams. Effect has runtime overhead; per-frame compute and event handlers must be sync. We need explicit categories for where Effect is used and where it isn't.

## Decision

Six categorized patterns:

1. **Setup/teardown.** `Signal.make`, `Cell.make`, `Derived.make`, `Compositor.create`, `SSE.create` return `Effect<..., never, Scope.Scope>`. Scope releases resources on close.
2. **Hot loops plain JS.** `computeStateSync`, `Boundary.evaluate`, `DenseStore` iteration — no Effect on inner loops.
3. **Event-handler grounding.** DOM handlers sync-update state via `Effect.runSync(SubscriptionRef.set(ref, val))`. Sanctioned seam: browser events are sync; Effect owns the Ref.
4. **State-machine wrapping.** Long-lived machines model transitions as plain mutable state; Effect appears only at the Scope boundary and public reader accessors.
5. **Resource cleanup (finalizers).** Sync finalizer-side `runSync` (e.g. `Queue.shutdown(...).pipe(Effect.runSync)`).
6. **Hot-path reads.** Compositor short-circuits `quantizer.state` via optional sync `stateSync()`; `Effect.runSync` remains as a safety-net fallback.

## Consequences

- Predictable per-frame cost: no Effect on rAF inner loop.
- Resource safety at setup/teardown; no leaks.
- `runSync` sites are inspectable bridges, not a smell.

## Category decisions (final)

Phase B §5.7 audit outcome:

| Category | Sites | Decision |
|---|---|---|
| 1. Setup/teardown | `Signal.make`, `Cell.make`, `Derived.make`, `Compositor.create`, `SSE.create`, `Quantizer.*`, `AnimatedQuantizer.make` | Correct by design. |
| 2. Hot loops | (empty) | `Boundary.evaluate` at 71 ns / >10M ops/s confirms no Effect on hot path. |
| 3. Event-handler grounding | `signal.ts` ×6, `zap.ts` ×1, `timeline.ts` ×3, `detect.ts` ×1, `astro/stream.ts` ×2, `blend.ts` ×1, `video.ts` ×2, `quantizer.ts` ×1 | Sanctioned seam — kept + documented. |
| 4. State-machine wrapping | `sse.ts` — **refactored**, 17 → 0 runSync sites | Converted to plain-JS reducer (single mutable `machine` record). All 2481 tests pass. |
| 5. Resource cleanup | `wire.ts` ×2 (`Queue.shutdown.pipe(runSync)`) | Inherent — finalizer seam. |
| 6. Hot-path reads | `compositor.ts:206` (quantizer.state fallback), `compositor.ts:265` (SubscriptionRef.set for `changes` Stream) | `stateSync` added to `AnimatedQuantizer` — fallback only reached by bespoke Quantizers. `changes` Stream publish is the one unavoidable seam — consumers rely on `Stream<CompositeState>` contract. |

**Production `Effect.runSync` count:** 35 → 21 (17 eliminated by SSE refactor). All remaining sites are category-classified and policy-justified.

## Rejected alternatives

- **All-Effect everywhere** — per-frame overhead unacceptable at 120 fps.
- **All-plain-JS** — loses Scope-backed resource safety.
- **Compositor stateRef → plain-JS pub/sub** — would break `Stream<CompositeState>` public API; gain <1 µs/frame.

## References

- `packages/core/src/signal.ts` — event-handler seam
- `packages/core/src/compositor.ts` — setup via Effect, per-frame plain JS
- `packages/web/src/stream/sse.ts` — pure-reducer state machine
- `packages/core/src/wire.ts` — finalizer seam
- `packages/quantizer/src/animated-quantizer.ts` — `stateSync` short-circuit
