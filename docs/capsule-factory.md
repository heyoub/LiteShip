# Capsule factory + video stack (2026-04-23)

Part of LiteShip: the CZAP engine's capsule and scene assembly. Vocabulary: [GLOSSARY.md](./GLOSSARY.md).

Landed by spec `2026-04-23-capsule-factory-video-stack-design.md` (the spec itself was an internal design document; the resulting decisions live in ADRs 0007, 0008, 0009, and 0010 in this repo).

## Capsule factory

- `packages/core/src/capsule.ts`: `CapsuleContract<K, In, Out, R>` base type; `TypeValidator` runtime check against `_spine` schemas.
- `packages/core/src/assembly.ts`: 7-arm catalog (`pureTransform`, `receiptedMutation`, `stateMachine`, `siteAdapter`, `policyGate`, `cachedProjection`, `sceneComposition`) + `defineCapsule` factory + module-level registry.
- `packages/core/src/harness/*`: per-arm harness templates emit property tests, benches, docs, audit receipts.
- `scripts/capsule-compile.ts`: AST walk of every `defineCapsule(...)` call, dispatches to harness templates, emits `reports/capsule-manifest.json`.
- `scripts/capsule-verify.ts`: re-runs generated tests, checks manifest integrity.
- ADR-0008 governs the catalog; adding an 8th arm requires amendment + first instance in the same PR.

## Scene stack

- `packages/scene/`: `SceneContract` + `Track.video/audio/transition/effect` helpers + scene compiler that spawns ECS worlds + 6 canonical systems (Video/Audio/Transition/Effect/Sync/PassThroughMixer).
- `packages/scene/src/dev/`: Vite-backed browser player with HMR-reactive scene reload.
- ADR-0009 commits to ECS as the scene substrate.

## Assets

- `packages/assets/`: `defineAsset` wraps `cachedProjection`, decoders for audio/video/image, analysis projections (`BeatMarkerProjection`, `OnsetProjection`, `WaveformProjection`).

## CLI + MCP

- `packages/cli/`: dual-audience surface. JSON receipts by default; TTY-detect for human-pretty summaries. Commands: describe / scene.{compile,render,verify,dev} / asset.{analyze,verify} / capsule.{inspect,verify,list} / gauntlet / mcp.
- `packages/mcp-server/`: thin MCP runner. Stdio default, `--http=:port` optional. Dispatches tools/call to `@czap/cli`.

## Spine as Canonical Types

- `packages/_spine/*.d.ts` is now referenced from project references + vitest aliases.
- `packages/core/src/brands.ts` re-exports branded types FROM `_spine`. Runtime constructors remain in the implementation packages.
- ADR-0010 documents the closure of the Spine Runtime Gap (sixsigma Island #1).
