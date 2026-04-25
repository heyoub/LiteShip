# Full Unification Plan: @czap/astro

## Decisions (locked via brainstorm)

1. **czap replaces Datastar** — keep czap's SSE/Morph in @czap/web, no Datastar dependency
2. **Effect: defer excision** — browser export conditions + lint rule preventing Effect in client paths. Full excision in a dedicated PR later.
3. **DX: named boundary registry** — `data-czap="hero"` resolved by Vite plugin at build time
4. **Cell shading = quantization** — the framework IS the cel shading primitive. GLSL compiler output IS the shader parameter system. What's missing is the demo proving same boundary → CSS + GLSL.
5. **All client directives Effect-free** — vanilla JS, matching existing 83-line satellite pattern

## Audit Summary

**Effect reality:** 20/51 core files use Effect at runtime (SubscriptionRef, Stream, PubSub, Fiber). All existing client directives, compilers, Vite plugin, edge, and workers are Effect-free. Zero behavioral difference if excised — it's used as a heavy reactive substrate where `let` + `Set<listener>` + `AbortController` would suffice. Deferred: add `"browser"` export condition in core/quantizer/web package.json pointing to Effect-free builds + lint rule.

**Disconnected pieces found:**

- WASM crate (3 kernels: spring, boundary eval, blend) + core wasm-dispatch.ts — not wired to Vite build or Astro
- Worker package (CompositorWorker, RenderWorker, SPSC ring) — not wired to Astro
- GLSL/WGSL compilers — exist but no shader runtime directive in Astro
- Video/capture pipeline — exists but not in Astro
- SSE/LLM streaming — exists in @czap/web but not exposed as Astro directives
- GPU probe — only provisional in Astro (heuristic from cores/memory), full WebGL probe in @czap/detect unused

---

## Changes by File

### 1. Named Boundary Registry (DX: `data-czap="hero"`)

**File: `packages/vite/src/plugin.ts`** (EDIT)

- Add HTML transform pass: scan for `data-czap="name"` attributes in `.astro`/`.html` files
- Resolve boundary by name via existing `resolveBoundary()` infrastructure
- Replace `data-czap="hero"` with `data-czap-boundary='{"id":"hero","input":"viewport.width",...}'` at build time
- Auto-inject `client:satellite` directive when `data-czap` is found (unless another `client:*` czap directive present)
- Register `virtual:czap/boundaries` with resolved boundary map for runtime access

**File: `packages/vite/src/html-transform.ts`** (NEW ~80 lines)

- Parse HTML for `data-czap="name"` attributes
- Call `resolveBoundary(name, fromFile, projectRoot)` for each
- Serialize resolved boundary to minimal JSON (id, input, thresholds, states, hysteresis)
- Return transformed HTML with `data-czap-boundary` attribute

**File: `packages/astro/src/Satellite.ts`** (EDIT)

- Add shorthand: `satelliteAttrs({ name: 'hero' })` that looks up from boundary registry
- Keep existing `satelliteAttrs({ boundary: Boundary.Shape })` for dynamic/computed boundaries

### 2. WASM Build Pipeline

**File: `packages/vite/src/plugin.ts`** (EDIT)

- Add wasm asset handling: detect `.wasm` imports, copy to build output with content hash
- Register `virtual:czap/wasm` module: exports `loadKernels()` async function
- Config option: `wasm?: { path?: string }` on PluginConfig

**File: `packages/vite/src/wasm-resolve.ts`** (NEW ~60 lines)

- Resolves czap-compute `.wasm` binary from `crates/czap-compute/target/wasm32-unknown-unknown/release/`
- Falls back to configured path
- Returns resolved path for Vite's asset pipeline

### 3. Client Directives (all Effect-free vanilla JS)

**File: `packages/astro/src/client-directives/stream.ts`** (NEW ~120 lines)

- `client:stream` — SSE-powered DOM morphing (czap replaces Datastar here)
- Parses `data-czap-stream-url`, `data-czap-stream-slot`
- Creates EventSource, parses SSE messages (patch/batch/signal/snapshot types matching @czap/web SSEMessage)
- Minimal morph: innerHTML replacement with scroll/focus preservation (inline capture/restore, no Effect)
- Reconnect with exponential backoff (inline, matching core SSE.ts pattern)
- Custom events: `czap:stream-connected`, `czap:stream-morph`, `czap:stream-error`

**File: `packages/astro/src/client-directives/llm.ts`** (NEW ~100 lines)

- `client:llm` — LLM token streaming to DOM
- Parses `data-czap-llm-url`, `data-czap-llm-format` (text/markdown/json)
- Uses EventSource for SSE endpoint, or fetch+ReadableStream for streaming responses
- Token accumulation with ring buffer pattern (from core/token-buffer.ts, inlined)
- ABR quality integration: reads `data-czap-tier` to gate rendering complexity
  - skeleton: show loading state
  - text-only: raw text insertion
  - styled: innerHTML with basic formatting
  - interactive/rich: full morph with slot registry
- Custom events: `czap:llm-start`, `czap:llm-token`, `czap:llm-done`, `czap:llm-error`

**File: `packages/astro/src/client-directives/worker.ts`** (NEW ~90 lines)

- `client:worker` — off-thread compositor via @czap/worker
- Imports WorkerHost.create() from @czap/worker (tree-shakeable, Effect-free)
- Parses boundary configs from `data-czap-boundary`, creates quantizer registry in worker
- Subscribes to CompositeState updates, applies to element:
  - CSS: sets `--czap-*` custom properties
  - ARIA: sets `aria-*` attributes
  - GLSL: dispatches `czap:uniform-update` event (for gpu directive to consume)
- Detects COOP/COEP (SharedArrayBuffer required for SPSC ring); falls back to main-thread eval
- Custom events: `czap:worker-ready`, `czap:worker-state`

**File: `packages/astro/src/client-directives/gpu.ts`** (NEW ~140 lines)

- `client:gpu` — WebGL2/WebGPU shader runtime (the "cell shading = quantization" proof)
- Element must be `<canvas>` or wraps a `<canvas>`
- Parses `data-czap-shader-type` (glsl|wgsl), `data-czap-shader-src` (URL or inline)
- WebGL2 path:
  - Compiles vertex shader (default fullscreen quad) + fragment shader (user-supplied)
  - Binds uniforms from CompositeState (listens for `czap:uniform-update` or `czap:worker-state`)
  - Uses `bindUniforms()` pattern matching GLSLCompiler output
  - rAF render loop gated by MotionTier (skip if `data-czap-tier` < 'gpu')
- WebGPU path:
  - Creates device, render pipeline from WGSL compiler output
  - Uniform buffer from CompositeState
  - Falls back to WebGL2 if no WebGPU
- Graceful degradation: no WebGL2 → CSS-only (satellite handles it)
- Custom events: `czap:gpu-ready`, `czap:gpu-frame`

**File: `packages/astro/src/client-directives/wasm.ts`** (NEW ~50 lines)

- `client:wasm` — WASM compute kernel loader
- Fetches from `data-czap-wasm-url` or resolved `virtual:czap/wasm` path
- Calls WASMDispatch.load() (imports from @czap/core, Effect-free)
- Dispatches `czap:wasm-ready` event on document
- Other directives can `await` this event or check `WASMDispatch.isLoaded()`
- Transparent fallback: `WASMDispatch.kernels()` returns TS fallbacks if WASM unavailable

### 4. Integration Updates

**File: `packages/astro/src/integration.ts`** (EDIT)

- Register all new client directives: `stream`, `llm`, `worker`, `gpu`, `wasm`
- New config options:
  ```ts
  interface IntegrationConfig {
    readonly vite?: PluginConfig;
    readonly detect?: boolean; // existing
    readonly serverIslands?: boolean; // existing
    readonly wasm?: { enabled?: boolean; path?: string };
    readonly gpu?: { enabled?: boolean; preferWebGPU?: boolean };
    readonly workers?: { enabled?: boolean };
    readonly stream?: { enabled?: boolean };
    readonly llm?: { enabled?: boolean };
  }
  ```
- When `workers.enabled`: add COOP/COEP response headers in dev server middleware
- When `gpu.enabled`: inject GPU probe upgrade script (deferred, post-DOMContentLoaded)
- Inject upgraded detect script with full GPU tier (replaces provisional)

**File: `packages/astro/src/detect-upgrade.ts`** (NEW ~80 lines)

- Deferred inline script (runs after DOMContentLoaded, not render-blocking)
- Creates throwaway WebGL context, reads UNMASKED_RENDERER_WEBGL extension
- Classifies GPU tier (0-3) using same regex heuristics as `@czap/detect/detect.ts`
- Checks `navigator.gpu` for WebGPU availability
- Updates HTML element: `data-czap-tier`, `data-czap-gpu-tier`, `data-czap-webgpu`
- Removes `data-czap-tier-provisional`
- Updates `window.__CZAP_DETECT__` with full capabilities

### 5. Edge Middleware

**File: `packages/astro/src/middleware.ts`** (NEW ~80 lines)

- Astro middleware: `export const onRequest`
- Imports from `@czap/edge` (Effect-free): `ClientHints.parseClientHints()`, `EdgeTier.detectTier()`, `EdgeTier.tierDataAttributes()`
- On each request:
  1. Parse Client Hints from `request.headers`
  2. Compute tier result (capLevel, motionTier, designTier)
  3. Store in `Astro.locals.czap` for component access
  4. Set response headers: `Accept-CH`, `Critical-CH`
- Optionally: compile theme tokens per tier via `compileTheme()` for tier-specific CSS

### 6. Effect Guardrails (deferred excision prep)

**File: `packages/core/package.json`** (EDIT)

- Add `"browser"` export condition pointing to future Effect-free entry
- For now: same entry, but the condition exists for the future swap

**File: `.eslintrc` or `eslint.config.js`** (EDIT)

- Add rule: `no-restricted-imports` for `effect` in `packages/astro/src/client-directives/**`
- Add rule: `no-restricted-imports` for `effect` in any file matching `**/client/**` or `**/browser/**`

### 7. Tests

**File: `tests/unit/astro-directives.test.ts`** (NEW)

- Unit tests for each directive's core logic (parsing, evaluation, state updates)
- Mock EventSource, ResizeObserver, WebGL2RenderingContext, Worker, SharedArrayBuffer
- Test: satellite with named boundary resolution
- Test: stream reconnect with backoff
- Test: llm token accumulation and ABR tier gating
- Test: worker fallback when no SharedArrayBuffer
- Test: gpu fallback chain (WebGPU → WebGL2 → CSS-only)
- Test: wasm loading + fallback to TS kernels

**File: `tests/unit/astro-middleware.test.ts`** (NEW)

- Test Client Hints parsing → tier detection → locals injection
- Test header configuration
- Test missing/malformed headers → conservative defaults

**File: `tests/unit/html-transform.test.ts`** (NEW)

- Test `data-czap="hero"` → resolved JSON attribute
- Test missing boundary name → warning, no transform
- Test auto-injection of client:satellite

**File: `tests/integration/astro-wasm.test.ts`** (NEW)

- Integration: WASM resolve → virtual module → runtime load → kernel execution → fallback

---

## Developer Experience (After Unification)

```astro
---
// boundaries.ts exports are auto-discovered by Vite plugin
// No manual imports needed for named boundaries
---

<!-- Simplest case: named boundary, CSS-only reactivity -->
<section data-czap="hero">
  <slot name="heading" />
  <slot name="media" />
</section>

<!-- SSE streaming (czap replaces Datastar) -->
<div data-czap="feed" data-czap-stream-url="/api/feed" client:stream>
  <p>Loading feed...</p>
</div>

<!-- LLM chat streaming with ABR quality -->
<div data-czap="chat" data-czap-llm-url="/api/chat" client:llm>
  <div class="skeleton" />
</div>

<!-- GPU shader: same boundary drives CSS AND GLSL uniforms -->
<!-- THE "cell shading = quantization" proof -->
<canvas data-czap="hero" data-czap-shader-src="/shaders/toon.frag" client:gpu />

<!-- Off-thread compositor for complex state trees -->
<div data-czap="dashboard" client:worker>
  <slot name="charts" />
</div>

<!-- WASM auto-loader (place once, benefits all directives) -->
<div client:wasm />
```

No event listeners. No resize observers. No runtime JS for the CSS path. Developer declares what (boundary), where (slots), how (directive). czap handles everything else.

---

## Dependency Flow

```
  Developer writes:
    boundaries.ts     →  Boundary.make({ input: 'viewport.width', ... })
    *.astro           →  <section data-czap="hero">...</section>
    @quantize hero {} →  CSS block with boundary-driven custom properties

  Build time (Vite + Astro):
    ┌────────────────────────────────────────────────┐
    │  @czap/vite plugin                             │
    │  ├─ @token → TokenCSSCompiler → CSS vars       │
    │  ├─ @theme → ThemeCSSCompiler → theme CSS      │
    │  ├─ @style → StyleCSSCompiler → scoped CSS     │
    │  ├─ @quantize → CSSCompiler → @container rules │
    │  ├─ data-czap="name" → boundary JSON injection │
    │  └─ .wasm → asset pipeline → content-hashed URL│
    └────────────────────────────────────────────────┘
              │
              ▼
    ┌────────────────────────────────────────────────┐
    │  @czap/astro integration                       │
    │  ├─ Registers 6 client directives              │
    │  ├─ Injects detect script (provisional tier)   │
    │  ├─ Injects GPU probe (deferred, full tier)    │
    │  └─ Configures COOP/COEP + Client Hints headers│
    └────────────────────────────────────────────────┘

  Server time:
    ┌────────────────────────────────────────────────┐
    │  @czap/astro middleware (onRequest)             │
    │  ├─ Client Hints → EdgeTier.detectTier()       │
    │  ├─ Astro.locals.czap = { cap, motion, design }│
    │  └─ Response headers: Accept-CH, Critical-CH   │
    └────────────────────────────────────────────────┘

  Client time (directives, all Effect-free):
    ┌──────────┬──────────┬──────────┬──────────┬──────────┐
    │satellite │ stream   │ llm      │ worker   │ gpu      │
    │CSS only  │ SSE+morph│ tokens   │ off-thrd │ WebGL/GPU│
    │0 JS/frame│ EventSrc │ ABR tiers│ SPSC ring│ uniforms │
    └─────┬────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘
          │         │          │          │          │
          └─────────┴──────────┴──────────┴──────────┘
                               │
                          ┌────▼────┐
                          │  wasm   │
                          │ loader  │
                          │ (opt-in)│
                          └─────────┘
```

## Not In Scope

- Effect excision from core (deferred — lint + browser exports prep only)
- Remotion ↔ Astro bridge (separate concern, different rendering target)
- AudioWorklet integration (niche, separate PR)
- LSP/analyze package (follow-up — extend Astro's Volar)
- Kit (Elixir) integration (server-side, separate repo)
