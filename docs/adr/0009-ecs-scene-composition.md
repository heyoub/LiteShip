# ADR-0009: ECS as Scene Composition Substrate

**Status:** Accepted
**Date:** 2026-04-23

## Context

Scene composition needs a structure that is (a) declaratively authored, (b) statically walkable for verification, (c) flexible enough to model video tracks, audio tracks, transitions, effects, and sync anchors without forcing a nested hierarchy, and (d) performant on a per-frame hot path.

`@czap/core` already ships an ECS (`packages/core/src/ecs.ts`) with content-addressed entity ids, dense `Float64Array`-backed component stores (zero-allocation per tick), regular + dense system flavors, and four existing test lanes (`tests/unit/core/ecs-dense.test.ts`, `tests/integration/ecs-composition.integration.test.ts`, `tests/property/ecs-composable.prop.test.ts`, `tests/component/ecs-composable-world.test.ts`). Before this ADR it was used only for runtime bookkeeping.

## Decision

Scenes are ECS worlds. The internal expression of a `sceneComposition` capsule is a `World` populated by the scene compiler (`packages/scene/src/compile.ts`). Track helpers (`Track.video`, `Track.audio`, `Track.transition`, `Track.effect`) compile at declare time to entity seeds + system registrations.

Per-frame hot paths use dense `Part` stores (`Part.dense('Opacity', N)`, `Part.dense('Volume', N)`, etc.) for zero-alloc iteration. The runtime ECS and the scene ECS share the same substrate.

## Consequences

- Scenes inherit the zero-allocation hot-path discipline documented in ADR-0002.
- Music-video-style composition (transitions, sync anchors, multimodal effects) maps naturally to entity/component/system triads.
- Adding a new Track kind requires an ADR amendment (same closure rule as the assembly catalog in ADR-0008).
- Property tests walk the entity seed statically; generated scene harnesses derive determinism, sync-accuracy, and per-frame-budget checks from the world schema.
- Task 33-35 introduced two additive ECS primitives to make the pattern ergonomic: `World.setComponent(id, name, value)` for schema-free write-back, and entity query results that spread component values as direct properties alongside the `.components` Map. Both are backward-compatible; existing ECS consumers are unaffected.

## Supporting evidence

- `packages/core/src/ecs.ts` (existing, line 184 `World.make`)
- `packages/scene/src/compile.ts`: introduced with this ADR
- `packages/scene/src/systems/*.ts`: 6 canonical systems (VideoSystem, AudioSystem, TransitionSystem, EffectSystem, SyncSystem, PassThroughMixer)
- `examples/scenes/intro.ts`: reference music-video scene proving end-to-end composition
- `tests/integration/scene-intro-example.test.ts`: validates 6-entity world compilation + structural determinism

## References

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §5
- `docs/adr/0002-zero-alloc.md`
- `docs/adr/0008-capsule-assembly-catalog.md`
