# Capsule Factory + Video Stack Design Spec

**Date:** 2026-04-23
**Status:** Draft — pending user review
**Scope:** Spec 1 — Capsule Factory kernel + Scene/Asset/Audio/CLI/MCP as one coherent clean-room restructure (Approach 1 — factory-first sequential)
**Out of scope:** Spec 2 (hardening-wave continuation — branch-hotspot sweep, F.3-F.9, advisory audit cleanup). Spec 3+ (product-adjacent future epics as assembly instances on the factory).

---

## 1. Decision ledger

Nine keystone decisions locked during brainstorm. All carried into the design below.

| # | Decision | Lock |
|---|---|---|
| 1 | Scope | Factory + Video stack as one atomic spec (Approach A) |
| 2 | Assembly catalog | Full-7 canonical catalog (Option D) |
| 3 | Scene paradigm | ECS, using czap's existing `packages/core/src/ecs.ts` |
| 4 | Scene declaration | Hybrid — typed Track helpers compile to ECS seeds, plus DX/UX sugar (Option C+) |
| 5 | Asset model | Asset capsules as first concrete `cachedProjection` instances (Option D) |
| 6 | Audio scope | Params-based vocabulary only; `PassThroughMixer` reference system (C-enabled, not C-functional) |
| 7 | Render backend | Direct-ffmpeg subprocess; Revideo out of Spec 1 (Option B) |
| 8 | CLI audience | Both — AI gets full control via JSON I/O, humans get cool shit via dev mode + authoring ergonomics |
| 9 | MCP depth | Manifest emission + thin `czap mcp` server runner (Option B + A-features) |
| 10 | Spine as canonical type source | `packages/_spine/` becomes single source of truth for branded types + contracts (added post-brainstorm 2026-04-23 during doctrine audit; closes Island #1 from `docs/sixsigma/`) |

---

## 2. One-sentence pitch

czap becomes a capsule factory — typed declarations of business logic emit runtime behavior plus generated tests, benches, docs, and audit receipts, governed by a 7-arm closed assembly catalog, with video/scene authoring as the first load-bearing instance that proves the catalog under real-world pressure.

---

## 3. Architecture

### 3.1 Five-part kernel, mapped to czap

| Part | New or existing | Lives at |
|---|---|---|
| Safe substrate | Existing (95%) | `eslint.config.js`, `packages/core/src/brands.ts`, `packages/core/src/tuple.ts`, Effect v4 across core |
| Canonical type source | Existing package wired in for the first time | `packages/_spine/*.d.ts` becomes runtime-referenced; `brands.ts` re-exports from `_spine` (see §4.5) |
| Architectural ledger | New type layer over existing namespace+`_make` pattern | `packages/core/src/capsule.ts` (new, ~100 LOC) |
| Assembly catalog | New — 7 arms | `packages/core/src/assembly.ts` (new, ~250 LOC) |
| Repo compiler | New — extends existing audit/gauntlet infra | `scripts/capsule-compile.ts` (~300 LOC), `scripts/capsule-verify.ts` (~150 LOC) |
| Harness lattice | New per-arm templates, reuses existing property/bench infra | `packages/core/src/harness/*` (~550 LOC across 7 files) |

### 3.2 Dual-audience surfaces

**AI surface (full control):**
- `@czap/cli` — JSON I/O by default, typed exit codes, content-addressed idempotency
- `czap describe` — schema dump of catalog + commands
- `@czap/mcp-server` — thin runner over manifest
- Extended `packages/compiler/src/ai-manifest.ts` — MCP-compatible manifest emission

**Human surface (cool shit):**
- `czap scene dev` — browser player with HMR via existing `packages/vite/src/hmr.ts`
- Scene authoring DX/UX sugar (Track helpers, `Beat(N)`, typed cross-refs, TSDoc autocomplete)
- `examples/` annotated gallery (each example is itself a capsule)
- Human-pretty TTY mode — JSON receipt plus short human summary when stdout is a terminal

Both surfaces share the same capsule factory. Neither is a reduced version of the other.

### 3.3 Invariants the system maintains

- Everything content-addressed (FNV-1a over CBOR-canonical, matching existing czap convention)
- Everything Effect-typed (R channel declares capabilities; runtime enforcement via service provision)
- Everything gauntlet-verified (`capsule:verify` folds into `gauntlet:full`)
- Everything capsule-declarable (CLI commands, MCP tools, generated tests are themselves assembly instances — factory eats itself)

---

## 4. Assembly catalog

Closed at seven. Adding an eighth arm requires an ADR amendment plus explicit justification that the new archetype does not reduce to an existing one.

### 4.1 Base contract

```ts
// packages/core/src/capsule.ts
export interface CapsuleContract<K extends AssemblyKind, In, Out, R> {
  readonly _kind: K;
  readonly id: ContentAddress;
  readonly name: string;
  readonly input: Schema.Schema<In>;
  readonly output: Schema.Schema<Out>;
  readonly capabilities: CapabilityDecl<R>;
  readonly invariants: readonly Invariant<In, Out>[];
  readonly budgets: BudgetDecl;
  readonly site: readonly Site[];  // 'node' | 'browser' | 'worker' | 'edge'
  readonly attribution?: AttributionDecl;
}

export type AssemblyKind =
  | 'pureTransform'
  | 'receiptedMutation'
  | 'stateMachine'
  | 'siteAdapter'
  | 'policyGate'
  | 'cachedProjection'
  | 'sceneComposition';
```

### 4.2 The seven arms

Each arm adds kind-specific fields to the base contract and owns its own harness template.

**`pureTransform<In, Out, R>`** — deterministic function.
Adds: `run: (ctx: R, input: In) => Effect<Out>`.
Harness: property tests (for all `In`, `Out` satisfies invariants), benches (p95 per call).
First instances (Phase 2): `Boundary.evaluate`, CLI command handlers.

**`receiptedMutation<In, Out, R>`** — side-effecting op with receipt.
Adds: `run: (ctx: R, input: In) => Effect<{output: Out; receipt: Receipt}>`, `faults: Schema.Schema<Fault>`.
Harness: contract tests, fault-injection, idempotency checks, trace/audit verification.
First instances (Phase 2): stream receipt flow in `@czap/web`, `czap scene render`.

**`stateMachine<S, Event, R>`** — states + transitions.
Adds: `states: Schema.Schema<S>`, `transitions: Record<string, Transition<S, Event>>`.
Harness: illegal-transition tests, replay, invariant preservation across random paths, exhaustive coverage.
First instance (Phase 2): `TokenBuffer`.

**`siteAdapter<NativeIn, NativeOut, R>`** — bridges czap primitives to a host runtime.
Adds: `host: HostDescriptor`, `adapt: (native: NativeIn) => Effect<NativeOut>`.
Harness: round-trip tests (native → czap → native equality), host-capability matrix.
First instance (Phase 2): `@czap/remotion` re-expressed as a capsule.

**`policyGate<Subject, Decision, R>`** — permission/authz check.
Adds: `decide: (ctx: R, subject: Subject) => Effect<Decision>`; decisions carry a reason chain.
Harness: allow/deny coverage, decision-reason traceability, no-silent-deny.
No first instance in Spec 1 (arm is load-bearing in vocabulary; first real use comes from Spec 3+ authz/feature-flag work).

**`cachedProjection<Source, Derived, R>`** — content-addressed transform with cache.
Adds: `derive: (ctx: R, source: Source) => Effect<Derived>`, `cacheKey: (source: Source) => ContentAddress`.
Harness: cache-hit equality, invalidation correctness, decode-throughput bench.
First instances (Phase 3): Asset capsules, `BeatMarkerProjection`, `OnsetProjection`, `WaveformProjection`.

**`sceneComposition<World, FrameOut, R>`** — ECS-world-backed timeline.
Adds: `world: World.Shape` (czap's existing ECS), `frameClock: FrameClock`, `duration: Millis`, `tracks: readonly Track[]`.
Harness: determinism (same seed → same frame stream), sync-accuracy (A/V alignment ±1ms), per-frame budget, invariant preservation across playback.
First instance (Phase 3): reference music-video scene.

### 4.3 Factory entry point

```ts
// packages/core/src/assembly.ts (simplified)
export function defineCapsule<K extends AssemblyKind, In, Out, R>(
  decl: CapsuleContract<K, In, Out, R>
): CapsuleDef<K, In, Out, R> {
  // Validates shape, computes content address via FNV-1a over CBOR-canonical,
  // registers in module-level catalog, returns a typed def.
  // No runtime behavior beyond registration; behavior comes from the harness/compiler.
}
```

### 4.4 Cap-the-catalog discipline

Seven arms is the frozen number. Adding an eighth requires:
1. ADR amendment to ADR-0008 with explicit justification
2. Demonstration that the candidate archetype does not cleanly reduce to an existing arm
3. First concrete instance in the same PR (no speculative arms)

### 4.5 Spine as canonical type source

`packages/_spine/` contains 13 `.d.ts` files with comprehensive branded-type contracts (~90K+ lines). Until now it has had zero runtime connection — confirmed in `docs/sixsigma/threads/thread-04-spine-runtime-gap.md`. Capsule factory closes that gap as a side effect:

- `CapsuleContract` imports `ContentAddress`, `SignalInput`, `ThresholdValue`, `StateName`, and future branded types from `@czap/_spine` rather than redeclaring them in `brands.ts`
- `packages/core/src/brands.ts` re-exports type definitions FROM `_spine` while keeping its runtime constructors (eliminates 100% type duplication, preserves the constructor-factory pattern)
- `packages/_spine/` added to `tsconfig.json` project references and `vitest.shared.ts` aliases (`'@czap/_spine'`)
- A lightweight `TypeValidator` helper in `packages/core/src/capsule.ts` (~50 LOC) uses `_spine` contracts for runtime validation of capsule inputs
- ADR-0010 "Spine as canonical type source" documents the bridge

**LOC cost:** ~50 LOC new (`TypeValidator`) + import rewiring across 10-15 files + tsconfig/vitest edits. Structurally huge, code-wise small.

**Why in Spec 1:** the capsule factory's pitch is "typed declaration → everything else derives." If the declaration layer is still duplicating types across `_spine` and implementation packages, the factory inherits that duplication. Closing the island now is cheaper than retrofit later and gives every capsule a canonical type source from day one.

---

## 5. Scene composition stack

### 5.1 Scene capsule example

```ts
export const intro = defineCapsule({
  _kind: 'sceneComposition',
  name: 'mortgage-intro-v1',
  duration: Millis(4000),
  fps: 60,
  bpm: 128,
  tracks: [
    Track.video('hero', { from: Beat(0), to: Beat(8), source: Q.from(heroBoundary).outputs({ ... }) }),
    Track.audio('bed', { from: Beat(0), to: Beat(16), source: AssetRef('intro-bed'), mix: { volume: -6 } }),
    Track.transition('fade-in', { from: Beat(0), to: Beat(1), kind: 'crossfade', between: ['previous', 'hero'] }),
    Track.effect('beat-pulse', { kind: 'pulse', target: 'hero', syncTo: syncTo.beat('bed') }),
  ],
  invariants: [mustResolveAllAssets, audioInBounds, framesDeterministic],
  budgets: { p95FrameMs: 16, memoryMb: 200 },
  site: ['node', 'browser'],
} satisfies CapsuleContract<'sceneComposition', SceneInput, VideoFrameOutput, SceneContext>);
```

### 5.2 Track helpers (catalog closed at 4)

Each `Track.*` call at declare time emits an `EntitySeed` and registers the systems that process it. The scene compiler walks the seeds, spawns a world via czap's existing `World.make()`, registers dense stores, wires systems, returns a ready-to-tick `sceneComposition` instance.

| Track helper | Entity seed components | Systems registered |
|---|---|---|
| `Track.video(id, {...})` | `VideoSource`, `FrameRange`, `TrackLayer` | `VideoSystem` (opacity, position) |
| `Track.audio(id, {...})` | `AudioSource`, `FrameRange`, `Volume`, `Pan?`, `SyncBeatMarker?` | `AudioSystem` (volume, phase) |
| `Track.transition(id, {...})` | `TransitionKind`, `FrameRange`, `Between` | `TransitionSystem` |
| `Track.effect(id, {...})` | `EffectKind`, `TargetEntity`, `SyncAnchor?` | `EffectSystem`, conditionally `SyncSystem` |

Adding a fifth Track helper requires ADR amendment.

### 5.3 DX sugar

- **Typed cross-references** via template literal types: `between: ['hero', 'outro']` fails typecheck unless both IDs are declared in the same scene's `tracks: [...]` tuple. Implemented via `TrackId<Scene>` extracted from the scene's tuple type.
- **`czap scene dev`** — Vite dev server with HMR, browser scrubber/play/pause/frame-step UI, live-reload preserving playhead on save, asset drop zones, error overlay with `file:line:col` source links.
- **Error messages with source locations** — invariant failures quote the offending Track line: `"bed" references AssetRef('intro-bed') — capsule not found. Declared at intro.ts:12:5`.
- **`Scene.include(subScene, { offset: Beat(8) })`** — composable sub-worlds; nested scene's entities get a time offset, share the outer world's BPM/fps.
- **TSDoc on every helper field** — autocomplete teaches the DSL.

### 5.4 UX sugar (authoring feel)

- **`Beat(n)`** — scene BPM converts `Beat(n)` → `Millis` at compile time.
- **`syncTo.beat(track)`, `syncTo.onset(track)`, `syncTo.peak(track)`** — emit `SyncAnchor` components referencing a derived marker asset.
- **Envelope helpers** — `fade.in(Beat(1))`, `fade.out(Beat(2))`, `pulse.every(Beat(0.5), { amplitude: 0.3 })` emit automation-curve components.
- **Named easings** — `ease.cubic`, `ease.spring`, `ease.bounce`, `ease.stepped(8)` as a closed tagged enum.
- **Preset transitions** — `kind: 'crossfade' | 'swipe.left' | 'swipe.right' | 'zoom.in' | 'zoom.out' | 'cut'` as closed tagged enum on `Track.transition`.
- **Layout helpers** — `Layout.stack(tracks)`, `Layout.grid(cols, tracks)` arrange tracks spatially without hand-positioning.

All sugar catalogs follow the same cap-the-catalog rule. New presets require ADR amendment.

---

## 6. Asset capsules + analysis

### 6.1 Asset capsule (first `cachedProjection` instance)

```ts
export const introBed = defineCapsule({
  _kind: 'cachedProjection',
  name: 'intro-bed',
  source: 'intro-bed.wav',
  kind: 'audio',
  decoder: audioDecoder,
  attribution: { license: 'CC-BY-4.0', author: 'Hobby Musician', url: '...' },
  budgets: { decodeP95Ms: 50, memoryMb: 30 },
  invariants: [mustHaveDuration, mustMatchDeclaredCodec],
} satisfies CapsuleContract<'cachedProjection', AssetSource, DecodedAudio, AssetContext>);
```

Asset capsules are gauntlet-verified: decode throughput benched, loader correctness property-tested, attribution audit-receipted. Scenes reference by ID (`AssetRef('intro-bed')`); scene compiler resolves at compile time.

### 6.2 Analysis projections (nested `cachedProjection` capsules)

```ts
export const introBedBeats = defineCapsule({
  _kind: 'cachedProjection',
  name: 'intro-bed-beats',
  source: AssetRef('intro-bed'),  // depends on another capsule
  kind: 'beat-markers',
  derive: detectBeats,
  cacheKey: (src) => contentAddress(src),
  budgets: { analyzeP95Ms: 200 },
  invariants: [markersInBounds, markersOrdered, bpmWithinRange],
} satisfies CapsuleContract<'cachedProjection', DecodedAudio, BeatMarkerSet, AnalysisContext>);
```

Analysis runs offline at scene-compile time, cached by content address, invalidates automatically when source changes. `OnsetProjection` and `WaveformProjection` follow the same pattern. The `syncTo.beat('bed')` sugar helper resolves to `AssetRef('intro-bed-beats')` under the hood so authors never touch analysis plumbing directly.

### 6.3 Content addressing

Each capsule's content address is `fnv1a(cbor-canonical(contract))`. Changing any invariant, budget, or field invalidates the cache for that capsule and every downstream dependent (including analysis projections). This matches czap's existing content-addressing discipline from `packages/core/src/boundary.ts:258-300`.

---

## 7. Audio pipeline (C-enabled, not C-functional)

### 7.1 Mix components (typed vocabulary only)

Shipped as attachable ECS components; scenes declare them on audio entities via `Track.audio(..., { mix: {...} })`:

```ts
Volume({ db: number })
Pan({ position: number })  // -1 to 1
Send({ to: MixBusId, amount: number })
FxSlot({ kind: FxKind, params: unknown })
MixBus({ id: string, gain: number })
AutomationCurve({ target: ComponentRef, points: CurvePoint[] })
```

### 7.2 Systems

- **`MixerSystem` contract** — typed interface any real mixer must implement; reads the mix components, produces a mix output signal.
- **`PassThroughMixer`** (czap's only shipped mixer, ~80 LOC) — reads `Volume`/`Pan` components, forwards values verbatim, emits a receipt entry per tick. Proves wiring end-to-end; does no signal processing.
- **Real mixing is user-provided.** Users wire their own DSP (WebSocket to backend, Rust service, future `@czap/audio-worklet` package). czap provides the socket, not the appliance.

### 7.3 Scope guard

If a scene declares a non-`PassThroughMixer` system that is not user-provided at runtime, `czap scene render` fails with exit code 1 and "requires external mix target". Scene-dev mode shows the same error in the browser overlay. AudioWorklet integration stays deferred to Spec 2+.

---

## 8. CLI surface

### 8.1 Command catalog

```
czap describe [--format=json|mcp]     schema dump of catalog + commands
czap scene compile <scene.ts>          compile scene capsule, write receipt
czap scene render <scene.ts> -o <out>  render to mp4 via direct-ffmpeg
czap scene verify <scene.ts>           run generated property tests + benches
czap scene dev <scene.ts>              launch Vite + browser player (human surface)
czap asset analyze <asset> --projection beat|onset|waveform
czap asset verify <asset>
czap capsule inspect <capsule-id>
czap capsule verify <capsule-id>
czap capsule list [--kind <arm>]
czap gauntlet                          runs full gauntlet:full
czap mcp [--http :port]                thin MCP server (stdio or http)
```

### 8.2 I/O contract

Every command emits a JSON receipt to stdout. Stderr gets structured log events as JSON lines. When stdout is a TTY, a pretty human summary prints *after* the JSON (piping to `jq` still works).

### 8.3 Typed exit codes

- `0` — success
- `1` — declared failure (invalid input, missing capsule, missing asset)
- `2` — invariant violation
- `3` — budget breach
- `4` — audit-receipt failure (missing attribution, forbidden capability)
- `5` — system error (fs, subprocess)

Agents branch on codes; humans see the pretty summary.

### 8.4 Content-addressed idempotency

Every command hashes its inputs (capsule content address + input args + environment fingerprint). If `.czap/cache/<hash>.json` exists, the command returns it without re-running. `--force` overrides.

### 8.5 Render backend (direct-ffmpeg)

`czap scene render` flow:
1. Compile scene capsule
2. Instantiate `VideoRenderer` from `packages/core/src/video.ts`
3. Walk `frames()` async generator
4. Pipe each `VideoFrameOutput.state` through `Compositor`
5. Encode to PNG or raw RGBA
6. Write to ffmpeg stdin
7. ffmpeg produces mp4

Parallel frame computation via worker pool (reuses `@czap/worker` infrastructure). Audio tracks concatenated/positioned via ffmpeg `filter_complex` (no DSP — matches the C-enabled rule).

### 8.6 Dev mode (`czap scene dev`)

Launches Vite via existing `packages/vite/src/plugin.ts` + HMR. Serves `packages/scene/src/dev/player.html` with scrubber, play/pause/frame-step, keyboard shortcuts (space = play, `[`/`]` = frame back/forward, `,`/`.` = nudge), live-reload preserving playhead position, asset drop zones, error overlay with source-link navigation.

---

## 9. MCP integration

### 9.1 Manifest emission

`packages/compiler/src/ai-manifest.ts` extended to emit MCP-spec-compliant JSON-RPC 2.0 tool descriptors:

```ts
compileAIManifest({ target: 'mcp', capsules: catalog, commands: cliCommands })
// emits .czap/generated/mcp-manifest.json
```

Every capsule command AND every capsule instance (scenes, assets, analysis projections) shows up as a discoverable tool. Users wire into Claude Desktop (`~/.claude/claude_desktop_config.json`), Cursor, or any MCP host by pointing at the file or the `czap mcp` server.

### 9.2 Thin server runner (`@czap/mcp-server`)

~300 LOC. Reads the manifest, speaks MCP protocol over stdio (default) or HTTP (`--http :port`), dispatches tool calls to the same command executor that `czap` CLI uses. No separate execution pipeline.

---

## 10. Repo compiler + harness lattice

### 10.1 `scripts/capsule-compile.ts` (~300 LOC)

1. Walk `packages/**/src/**/*.ts` via `@typescript-eslint/parser` (AST-level, not regex) for `defineCapsule(...)` calls.
2. Extract each capsule's contract shape → compute content address.
3. For each capsule, dispatch to the appropriate per-arm harness generator.
4. Emit generated test/bench/docs/audit files.
5. Write `reports/capsule-manifest.json` (all capsules, hashes, generated-file paths, timestamps).
6. Emit `.czap/generated/mcp-manifest.json` via `ai-manifest.ts` extension.

### 10.2 `scripts/capsule-verify.ts` (~150 LOC)

1. Run generated tests (vitest), benches (tinybench), audits.
2. Read `reports/capsule-manifest.json`; fail if any declared capsule has no receipt or if any receipt is stale vs. source content address.
3. Emit verdict to stdout JSON; exit code follows the typed vocabulary from §8.3.

### 10.3 Harness lattice (per-arm generators)

Seven files, one per arm, in `packages/core/src/harness/`. Each is a pure function `generate(capsule) → emittedFileContents`.

| Arm | Harness generates | ~LOC |
|---|---|---|
| `pureTransform` | property test (fast-check arb from `In` schema, asserts `Out` satisfies invariants) + bench (p95 over N iterations) | 70 |
| `receiptedMutation` | contract test, fault-injection, idempotency, receipt-chain audit | 90 |
| `stateMachine` | illegal-transition coverage, replay, invariant preservation across random paths, exhaustive coverage | 100 |
| `siteAdapter` | round-trip equality, host-capability matrix | 60 |
| `policyGate` | allow/deny coverage, decision-reason traceability, no-silent-deny | 70 |
| `cachedProjection` | cache-hit equality, invalidation correctness, decode-throughput bench | 70 |
| `sceneComposition` | determinism, sync-accuracy, per-frame budget, playback invariant | 90 |

**Total: ~550 LOC.**

### 10.4 Generated-file locations (following czap conventions)

- Tests → `tests/generated/<capsule-name>.{test,bench}.ts` (tracked, reviewable, CI-runnable)
- Docs → `docs/api/capsules/<capsule-name>.md` (tracked, alongside existing typedoc output)
- Manifests → `reports/capsule-manifest.json` (git-ignored, per-run; matches `reports/` pattern in STATUS.md:243)
- MCP manifest → `.czap/generated/mcp-manifest.json` (git-ignored)
- Receipts → `.czap/cache/<hash>.json` (git-ignored content-addressed cache)

`.czap/` added to `.gitignore` as part of Phase 1.

---

## 11. Gauntlet integration

Two new phases inserted into `scripts/gauntlet.ts` canonical sequence (currently 23 phases per STATUS.md:158-182):

- **Phase 1.5 — `capsule:compile`** — after `build`, before `typecheck`. Generates tests/docs/manifests from capsule declarations.
- **Phase 24 — `capsule:verify`** — after `runtime:gate`, before `flex:verify` (gauntlet terminal). Verifies all capsules have fresh receipts and all generated tests passed.

`flex:verify` extended with a 7th acceptance dimension: **Capsule Factory** — 7 assembly arms present, all declared capsules have valid receipts, catalog matches ADR-0008. `scripts/flex-verify.ts` gains a `CapsuleFactory` check (~40 LOC).

The gauntlet stays atomic. If `capsule:verify` fails, the full run fails closed.

---

## 12. File structure

### 12.1 Package layout after Spec 1

```
packages/
├── core/              existing — gains capsule.ts, assembly.ts, harness/*
├── quantizer/         existing — unchanged
├── compiler/          existing — ai-manifest.ts extended for MCP
├── web/               existing — unchanged
├── detect/            existing — unchanged
├── vite/              existing — hmr.ts powers scene:dev mode
├── astro/             existing — unchanged
├── edge/              existing — unchanged
├── worker/            existing — used by render backend for parallel frames
├── remotion/          existing (230 LOC) — becomes 1st siteAdapter capsule instance
├── scene/             NEW — ~1,530 LOC
├── assets/            NEW — ~700 LOC
├── cli/               NEW — ~1,250 LOC
└── mcp-server/        NEW — ~300 LOC
```

### 12.2 New files

```
packages/core/src/capsule.ts
packages/core/src/assembly.ts
packages/core/src/harness/index.ts
packages/core/src/harness/pure-transform.ts
packages/core/src/harness/receipted-mutation.ts
packages/core/src/harness/state-machine.ts
packages/core/src/harness/site-adapter.ts
packages/core/src/harness/policy-gate.ts
packages/core/src/harness/cached-projection.ts
packages/core/src/harness/scene-composition.ts

packages/scene/package.json
packages/scene/src/index.ts
packages/scene/src/contract.ts
packages/scene/src/track.ts
packages/scene/src/compile.ts
packages/scene/src/systems/video.ts
packages/scene/src/systems/audio.ts
packages/scene/src/systems/transition.ts
packages/scene/src/systems/effect.ts
packages/scene/src/systems/sync.ts
packages/scene/src/systems/pass-through-mixer.ts
packages/scene/src/sugar/beat.ts
packages/scene/src/sugar/sync-to.ts
packages/scene/src/sugar/fade.ts
packages/scene/src/sugar/ease.ts
packages/scene/src/sugar/layout.ts
packages/scene/src/dev/server.ts
packages/scene/src/dev/player.html
packages/scene/src/dev/player.ts

packages/assets/package.json
packages/assets/src/index.ts
packages/assets/src/contract.ts
packages/assets/src/decoders/audio.ts
packages/assets/src/decoders/video.ts
packages/assets/src/decoders/image.ts
packages/assets/src/analysis/beat-markers.ts
packages/assets/src/analysis/onsets.ts
packages/assets/src/analysis/waveform.ts

packages/cli/package.json
packages/cli/src/index.ts
packages/cli/src/dispatch.ts
packages/cli/src/render.ts
packages/cli/src/describe.ts
packages/cli/src/receipts.ts
packages/cli/src/pretty.ts

packages/mcp-server/package.json
packages/mcp-server/src/index.ts
packages/mcp-server/src/stdio.ts
packages/mcp-server/src/http.ts
packages/mcp-server/src/dispatch.ts

scripts/capsule-compile.ts
scripts/capsule-verify.ts

docs/adr/0007-adapter-vs-peer-framing.md
docs/adr/0008-capsule-assembly-catalog.md
docs/adr/0009-ecs-scene-composition.md
docs/adr/0010-spine-canonical-type-source.md

examples/scenes/intro.ts
examples/scenes/beat-pulse.ts
examples/scenes/crossfade-sequence.ts
examples/assets/README.md
```

### 12.3 Modified files (non-exhaustive)

```
packages/compiler/src/ai-manifest.ts     — MCP manifest emission
scripts/gauntlet.ts                      — add phases 1.5 + 24
scripts/flex-verify.ts                   — add CapsuleFactory dimension
eslint.config.js                         — allow packages/scene/** + packages/assets/** + packages/cli/** + packages/mcp-server/**
.gitignore                               — add .czap/
docs/adr/0002-zero-alloc.md              — new section on dense ECS systems in scene playback
docs/adr/README.md                       — register 0007, 0008, 0009, 0010
packages/core/src/brands.ts              — re-export types FROM _spine; keep runtime constructors
tsconfig.json                            — add packages/_spine to project references
vitest.shared.ts                         — add @czap/_spine alias
docs/ARCHITECTURE.md                     — add scene + capsule-factory pointers
docs/STATUS.md                           — refresh gate list + watch items
docs/ROADMAP.md                          — reframe product-adjacent epics as assembly instances
package.json                             — new workspace packages + new scripts
pnpm-workspace.yaml                      — register new packages
```

### 12.4 Total LOC estimate

| Area | New | Modified |
|---|---|---|
| Factory kernel (`capsule.ts` ~100 + `TypeValidator` ~50 + `assembly.ts` ~250 + `harness/*` ~550 + `capsule-compile.ts` ~300 + `capsule-verify.ts` ~150) | ~1,400 | ~80 |
| Spine runtime bridge (tsconfig, vitest.shared.ts, brands.ts re-export, imports) | 0 | ~40 |
| Scene composition stack | ~1,530 | — |
| Asset capsules + analysis | ~700 | — |
| CLI + render backend + dev mode | ~1,250 | — |
| MCP server + manifest extension | ~300 | ~80 |
| ADRs | — | ~400 words × 4 |
| Gauntlet + flex:verify wiring | — | ~100 |
| Examples gallery | ~300 | — |
| **Total** | **~5,480 LOC new** | **~300 LOC modified + 4 ADRs** |

---

## 13. ADRs

Three new ADRs plus one amendment.

| ADR | Title | Status |
|---|---|---|
| 0007 | Adapter vs peer framing (Remotion / Edge / future integrations) | New — previously deferred slot filled |
| 0008 | Capsule assembly catalog (7 arms + closure rule) | New — keystone |
| 0009 | ECS as scene composition substrate | New — commits to existing `@czap/core` ECS as scene model |
| 0002 | Zero-allocation hot path | Amended — new section on dense ECS systems in scene playback |
| 0010 | Spine as canonical type source | New — closes sixsigma Island #1 Spine Runtime Gap |

### 13.1 ADR-0007 content outline

- Context — pre-existing `@czap/remotion` adapter, Remotion license gate (>3 employees), desire for vendor-neutral framing
- Decision — host integrations are `siteAdapter` capsule instances. Remotion adapter stays as the first such instance. Future integrations (Revideo, Twick, custom) add as peer capsules, not as primary-surface changes.
- Consequences — adapters inherit gauntlet, license obligations stay with downstream users, primary-surface question dissolves

### 13.2 ADR-0008 content outline

- Context — capsule factory needs a bounded vocabulary to avoid cathedral creep
- Decision — 7 arms (listed above). Closure rule: adding an 8th requires ADR amendment + first concrete instance in the same PR.
- Consequences — contributors must map new domains to existing arms; speculative arms rejected; catalog audit becomes mechanical

### 13.3 ADR-0009 content outline

- Context — scene composition needs a flexible-but-verifiable internal structure
- Decision — scenes are ECS worlds using the existing `packages/core/src/ecs.ts`. Track helpers compile to entity seeds + system registrations. Dense `Float64Array`-backed component stores power per-frame hot paths.
- Consequences — scenes inherit zero-allocation hot-path discipline; runtime ECS and scene ECS share substrate; new Track kinds require ADR amendment

### 13.4 ADR-0002 amendment

New section: **Dense ECS systems in scene playback**. Scene playback uses czap's dense `Part` stores for per-frame position/opacity/volume/audioPhase. Zero-allocation iteration matches the pool/dirty-flags/frame-budget discipline already in place.

### 13.5 ADR-0010 content outline

- Context — `packages/_spine/` exists with 13 `.d.ts` files and comprehensive branded-type contracts, but has zero runtime imports (100% type duplication, classic Island Syndrome per `docs/sixsigma/threads/thread-04-spine-runtime-gap.md`). Capsule factory needs a canonical type source.
- Decision — `_spine` becomes the single source of truth for branded types. Implementation packages re-export types FROM `_spine` and keep runtime constructors. `CapsuleContract` imports its structural types from `_spine`. A `TypeValidator` helper uses `_spine` contracts for runtime validation.
- Consequences — eliminates 100% type duplication; runtime validation bridges contracts to implementation; `_spine` stops being an island; future contributors have one authoritative type location instead of two.

---

## 14. Phase sequence (Approach 1 — factory-first sequential)

Each phase ends with `pnpm run gauntlet:full` green. Nothing partial ships. Clean-room discipline.

### 14.1 Phase 1 — Factory kernel

- `packages/core/src/capsule.ts` — `CapsuleContract<K, In, Out, R>`, `AssemblyKind` union, `defineCapsule`
- `packages/core/src/assembly.ts` — 7-arm tagged union + per-arm factories
- `packages/core/src/harness/*.ts` — 7 per-arm generators (~550 LOC)
- `scripts/capsule-compile.ts` + `scripts/capsule-verify.ts` (~450 LOC)
- `.gitignore` — add `.czap/`
- `docs/adr/0008-capsule-assembly-catalog.md` written
- `scripts/gauntlet.ts` — add phases 1.5 + 24
- `scripts/flex-verify.ts` — add CapsuleFactory dimension
- `packages/_spine/` wired into `tsconfig.json` project references + `vitest.shared.ts` aliases (`'@czap/_spine'`)
- `packages/core/src/brands.ts` re-exports types FROM `_spine` (keeping runtime constructors)
- `TypeValidator` helper in `packages/core/src/capsule.ts` (~50 LOC)
- `docs/adr/0010-spine-canonical-type-source.md` written

**Acceptance:** gauntlet green; `flex:verify` reports 7/7 dimensions; one trivial `pureTransform` test capsule compiles and verifies end-to-end; `_spine` appears in runtime imports (grep confirms non-zero); no type duplication remains between `_spine` and `brands.ts`.

### 14.2 Phase 2 — Canonical assembly instances (~0 new LOC, reshapes existing)

Re-express 4 existing czap primitives as capsule declarations to prove the kernel:
- `Boundary.evaluate` → `pureTransform` capsule
- Stream receipt flow in `@czap/web` → `receiptedMutation` capsule
- `TokenBuffer` → `stateMachine` capsule
- `@czap/remotion` → `siteAdapter` capsule

Existing tests migrate to the generated harness. Content addresses stable across runs.

**Acceptance:** 4 capsules in the manifest; all green; existing 2480+ test count preserved or improved.

### 14.3 Phase 3 — Scene + Asset + Audio (~2,230 LOC new)

- `packages/scene/` full contents (tracks, compile, systems, sugar, dev)
- `packages/assets/` full contents (AssetContract + analysis projections)
- `docs/adr/0009-ecs-scene-composition.md` written
- `docs/adr/0002-zero-alloc.md` amended

**Acceptance:** one reference music-video scene compiles via `capsule:compile`; generated tests pass; bench stays within budget; scene renders identically across 3 consecutive runs (determinism check).

### 14.4 Phase 4 — CLI + MCP (~1,550 LOC new, ~80 modified)

- `packages/cli/` full contents
- `packages/mcp-server/` full contents
- `packages/compiler/src/ai-manifest.ts` extended for MCP emission
- `docs/adr/0007-adapter-vs-peer-framing.md` written

**Acceptance:** `czap describe` dumps full schema; `czap scene render` produces valid mp4; `czap scene dev` launches browser player; `czap mcp` accepts MCP tool calls over stdio; emitted manifest validates against MCP JSON schema.

### 14.5 Phase 5 — Integration + gauntlet fold (~100 modified, docs refreshed)

- Integration sanity pass — all phase outputs green simultaneously
- `gauntlet:full` canonical sequence updated to include `capsule:compile` + `capsule:verify`
- `flex:verify` CapsuleFactory dimension fully wired
- `docs/ROADMAP.md` updated — product-adjacent future epics reframed as assembly instances
- `docs/STATUS.md` updated — gate list + watch items + coverage snapshot refreshed
- `docs/ARCHITECTURE.md` updated — new capsule + scene pointers

**Acceptance:** `gauntlet:full` green start-to-finish; `flex:verify` reports 7/7 including CapsuleFactory; 2480+ existing tests still pass plus ~430 new test cases; no regression in any bench gate.

---

## 15. Testing strategy

Every capsule automatically gets:
- **Property tests** from its schema + invariants (fast-check arbitraries generated from `In` schema)
- **Benches** from its budgets (tinybench, replicate-exceedance-rate gating from existing `scripts/bench-gate.ts`)
- **Audit receipts** from its capabilities (runtime enforcement via Effect R channel; declared capabilities must match invoked services)
- **Docs** from its TSDoc + contract fields (markdown emission → `docs/api/capsules/`)

New testing surfaces beyond the existing 2480+:
- `tests/generated/` (tracked) — one file per capsule, auto-generated, re-runs every gauntlet
- Scene-specific tests in `tests/integration/scene/` (hand-written scene-compile flow)
- CLI tests in `tests/integration/cli/` (subprocess execution, JSON I/O verification, exit-code matrix)
- MCP server tests in `tests/integration/mcp/` (stdio protocol, tool dispatch)

Estimated new test count: ~300 property tests + ~50 benches + ~80 integration tests = **~430 new test cases**.

---

## 16. Explicit non-goals for Spec 1

- Real-time audio DSP or mixing implementations (C-enabled only — PassThroughMixer ships; real mixers are user-provided)
- AudioWorklet integration (still deferred from unification sprint)
- WebRTC / live-streaming output
- Effect excision from core client paths (still deferred; lint + browser exports stay staged)
- LSP / analyze package (still deferred from unification sprint)
- `@czap/revideo` adapter (add later as a `siteAdapter` instance if demand surfaces)
- Scene editing GUI beyond the dev-mode scrubber
- Component-local data loading (future epic, re-expressible as `cachedProjection` when demanded)
- Stateful edge AI bindings (future epic, re-expressible as `receiptedMutation @ site:edge`)
- Plugin-as-framework sidecar (future epic, re-expressible as `siteAdapter` refinement)
- Hardening-wave items (F.3–F.9, branch-hotspot sweep, advisory audit cleanup) — separate Spec 2
- Property Test Feedback Loop (self-improving type-guard regeneration from property failures) — Spec 2/3 (sixsigma Island #2)
- PluginConfig dead-code cleanup (4 unused directory fields per `docs/sixsigma/`) — verify state, Spec 2 if still present
- Config Hub full unification beyond existing `virtual:czap/config` — Spec 2 (sixsigma Almost Correctness #3)
- Any new assembly arm beyond the 7 — catalog stays closed

### 16.1 `policyGate` has no first instance in Spec 1

The arm exists in the closed catalog because it's load-bearing in the vocabulary (policy is distinct from mutation and from pure transformation). First concrete instance comes from Spec 3+ (authz, feature flags, compliance gates). This is explicitly not speculation — the arm has a shape; only its instances are deferred.

---

## 17. Next step

After user approval of this spec: invoke `superpowers:writing-plans` to produce the ordered implementation plan with task-level checkpoints matching the 5 phases above.
