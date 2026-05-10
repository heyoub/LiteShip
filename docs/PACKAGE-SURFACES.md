# Package surfaces

## Purpose

This document maps the main `@czap/*` compartments in the repo: the hull sections you import from.

It answers:

- what each package owns
- what to import from it
- when to reach for it

It is a public-surface map, not a source dump.

Product naming for surrounding docs: [GLOSSARY.md](./GLOSSARY.md).

---

## `@czap/core`

Source: [`packages/core/src/index.ts`](../packages/core/src/index.ts)

The semantic and runtime foundation. Runtime status: `host-wired`, including `Plan` and `ECS` through the shared `RuntimeCoordinator` host surface.

Reach for it when you need:

- definitions
- reactive primitives
- scheduling
- compositor logic
- diagnostics
- video and capture contracts

Main surfaces:

- `Boundary`
- `Token`
- `Theme`
- `Style`
- `Component`
- `Signal`
- `Animation`
- `Timeline`
- `Scheduler`
- `Compositor`
- `BlendTree`
- `FrameBudget`
- `DirtyFlags`
- `VideoRenderer`
- `TokenBuffer`
- `UIQuality`
- `GenFrame`
- `Diagnostics`
- `Cell`
- `Derived`
- `Zap`
- `Wire`
- `Op`
- `Store`
- `Plan`
- `RuntimeCoordinator`
- `Part`
- `World`
- `Receipt`
- `DAG`

---

## `@czap/quantizer`

Source: [`packages/quantizer/src/index.ts`](../packages/quantizer/src/index.ts)

Turns boundaries and outputs into live quantized behavior. Runtime status: `host-wired`.

Reach for it when you need:

- boundary evaluation
- output-target routing
- motion-tier filtering
- animated transitions between named states

Main surfaces:

- `Q`
- `evaluate`
- `Transition`
- `AnimatedQuantizer`
- `MemoCache`

---

## `@czap/compiler`

Source: [`packages/compiler/src/index.ts`](../packages/compiler/src/index.ts)

Projects authored definitions into target-specific outputs. Runtime status: `host-wired` through the Vite and Astro host paths.

Reach for it when you need:

- CSS compilation
- GLSL or WGSL output
- ARIA output
- AI manifest output
- Tailwind token emission

Main surfaces:

- `CSSCompiler`
- `GLSLCompiler`
- `WGSLCompiler`
- `ARIACompiler`
- `AIManifestCompiler`
- `TokenCSSCompiler`
- `TokenTailwindCompiler`
- `TokenJSCompiler`
- `ThemeCSSCompiler`
- `StyleCSSCompiler`
- `ComponentCSSCompiler`
- `dispatch`

---

## `@czap/web`

Source: [`packages/web/src/index.ts`](../packages/web/src/index.ts)

The browser runtime package. Runtime status: `host-wired`.

Reach for it when you need:

- DOM morphing
- slot registration
- SSE and resumption
- physical state capture and restore
- WebCodecs capture
- LLM chunk adaptation
- audio processor bootstrapping

Main surfaces:

- `Morph`
- `SemanticId`
- `Hints`
- `SlotRegistry`
- `SlotAddressing`
- `SSE`
- `Resumption`
- `Physical`
- `WebCodecsCapture`
- `renderToCanvas`
- `captureVideo`
- `LLMAdapter`
- `createAudioProcessor`

---

## `@czap/detect`

Source: [`packages/detect/src/index.ts`](../packages/detect/src/index.ts)

Reads capabilities and maps them into the tier lattice. Runtime status: `host-wired`.

Reach for it when you need:

- capability probing
- tier mapping
- runtime observation of changing device conditions

Main surfaces:

- `detect`
- `detectGPUTier`
- `watchCapabilities`
- `tierFromCapabilities`
- `designTierFromCapabilities`
- `motionTierFromCapabilities`
- `capSetFromCapabilities`

---

## `@czap/vite`

Source: [`packages/vite/src/index.ts`](../packages/vite/src/index.ts)

The authored-CSS transformation layer. Runtime status: `host-wired`.

Reach for it when you need:

- Vite plugin integration
- parsing and compiling `@token`, `@theme`, `@style`, and `@quantize`
- definition resolution
- HMR behavior
- virtual modules

Main surfaces:

- `plugin`
- `parseQuantizeBlocks`
- `compileQuantizeBlock`
- `parseTokenBlocks`
- `compileTokenBlock`
- `resolveToken`
- `parseThemeBlocks`
- `compileThemeBlock`
- `resolveTheme`
- `parseStyleBlocks`
- `compileStyleBlock`
- `resolveStyle`
- `resolveBoundary`
- `resolveVirtualId`
- `isVirtualId`
- `loadVirtualModule`
- `handleHMR`

---

## `@czap/astro`

Source: [`packages/astro/src/index.ts`](../packages/astro/src/index.ts)

The Astro host package. Runtime status: `host-wired`.

Reach for it when you need:

- Astro integration setup
- request-time middleware
- initial state resolution
- shell attribute generation

Main surfaces:

- `integration`
- `resolveInitialState`
- `satelliteAttrs`
- `resolveInitialStateFallback`
- `czapMiddleware`
- `CzapMiddlewareConfig`

Host-owned shared runtime surfaces:

- `@czap/astro/runtime` slot bootstrap and swap reinit helpers
- `@czap/astro/runtime` wasm runtime configuration and loading
- internal runtime adapters for `satellite`, `stream`, `llm`, `worker`, and `wasm`

---

## `@czap/edge`

Source: [`packages/edge/src/index.ts`](../packages/edge/src/index.ts)

The edge / server capability and caching layer. Runtime status: `host-wired`.

Reach for it when you need:

- client hints parsing
- server-side tier decisions
- boundary output caching
- theme compilation at the edge

Main surfaces:

- `ClientHints`
- `EdgeTier`
- `createEdgeHostAdapter`
- `EdgeHostAdapter`
- `createBoundaryCache`
- `KVCache`
- `compileTheme`

The default Astro host path now routes through `createEdgeHostAdapter`, which combines `ClientHints`, `EdgeTier`, `compileTheme`, and `createBoundaryCache` into one request-time resolution pass. This is the package for request-time adaptation outside the browser.

---

## `@czap/worker`

Source: [`packages/worker/src/index.ts`](../packages/worker/src/index.ts)

The off-main-thread runtime layer. Runtime status: `host-wired`.

Reach for it when you need:

- shared worker message contracts
- lock-free ring buffers
- compositor workers
- render workers
- a coordinating host

Main surfaces:

- `Messages`
- `SPSCRing`
- `CompositorWorker`
- `RenderWorker`
- `WorkerHost`

This package assumes stronger runtime requirements and should be used where the surface meaning justifies off-thread work. The Astro worker directive routes through this package rather than carrying its own worker protocol. By the way, `SPSCRing` is a real lock-free single-producer / single-consumer ring on `SharedArrayBuffer`, with `Atomics.load` and `Atomics.store` only — no `Atomics.wait` or `Atomics.notify`, which keeps it fully non-blocking on both sides.

---

## `@czap/remotion`

Source: [`packages/remotion/src/index.ts`](../packages/remotion/src/index.ts)

The React / Remotion video adapter. Runtime status: `standalone subsystem`.

Reach for it when you need:

- precomputed frame consumption in Remotion
- CSS var projection from `CompositeState`
- frame-indexed composition helpers

Main surfaces:

- `cssVarsFromState`
- `stateAtFrame`
- `useCompositeState`
- `precomputeFrames`
- `Provider`
- `useCzapState`

This package is for the Remotion / video branch of the ecosystem, not the main Astro static-site path.

---

## A simple selection rule

If the problem is:

- semantic authored definitions: `@czap/core`
- live quantized state: `@czap/quantizer`
- cast to output targets: `@czap/compiler`
- browser runtime behavior: `@czap/web`
- capability decisions: `@czap/detect`
- authored CSS in Vite: `@czap/vite`
- Astro host integration: `@czap/astro`
- request-time adaptation: `@czap/edge`
- off-thread runtime: `@czap/worker`
- Remotion / video composition: `@czap/remotion`
