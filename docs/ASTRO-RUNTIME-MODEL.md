# LiteShip in Astro

## Purpose

How LiteShip sits inside an Astro site: where the document host ends and the CZAP runtime begins. Imports stay on `@czap/*`; export names like `czapMiddleware()` stay literal.

Naming: [GLOSSARY.md](./GLOSSARY.md).

This is not a routing guide and not a content-model guide. It is about runtime responsibility.

---

## The division of labor

Astro should own:

- document structure
- HTML delivery
- server rendering
- content composition

LiteShip should own:

- adaptive state logic
- capability-aware escalation
- authored visual state outputs
- media, worker, and shader runtime behavior where needed

This division is important.

---

## The main Astro surfaces

The public Astro package surface is in [`packages/astro/src/index.ts`](../packages/astro/src/index.ts).

The important exports are:

- `integration`
- `resolveInitialState`
- `satelliteAttrs`
- `resolveInitialStateFallback`
- `czapMiddleware`

These form the Astro host layer.

---

## Integration

`integration()` is the Astro integration entry point: the host-level hook that registers transforms and rigs detection alongside Astro's lifecycle.

It is responsible for:

- registering the Vite plugin path that understands authored `@token` / `@theme` / `@style` / `@quantize` transforms
- rigging client-side detection support
- connecting Astro lifecycle behavior to LiteShip's assumptions

Use it when the site itself is a LiteShip-aware Astro host.

---

## Middleware

`czapMiddleware()` is the request-time bridge.

Its job is to let the server side understand request and capability context well enough to emit a sensible initial result.

The important idea is:

- first paint should already reflect a good state guess
- client runtime should refine or continue, not invent the experience from nothing

For static visual sites, this keeps the document legible and intentional before client work begins.

---

## Initial state

`resolveInitialState()` and `resolveInitialStateFallback()` exist because a surface should not begin life as an empty runtime shell.

The server can often choose a useful initial state from:

- request context
- known defaults
- capability hints
- authored fallback rules

This is one of the strongest reasons to pair LiteShip with Astro. Initial state can be resolved server-side from those signals; the client doesn't begin from an empty shell.

---

## Satellite attributes

`satelliteAttrs()` expresses the shell contract that client directives and runtime code understand.

This matters because LiteShip runtime behavior is DOM-and-attribute based. The shell is not a virtual tree abstraction. It is real HTML with semantic `data-czap-*` meaning attached.

That keeps Astro in its strongest mode:

- declarative HTML
- explicit enhancement
- small client runtime surface

---

## Client directives

The Astro client-directive layer currently includes important runtime surfaces:

- `satellite`
- `stream`
- `llm`
- `gpu`
- `worker`
- `wasm`

These are not interchangeable. They represent different escalation levels.

### `satellite`

Use when a surface needs adaptive state tracking tied to authored boundaries.

### `stream`

Use when server-originated streamed content becomes part of the visual surface.

### `llm`

Use when generative content is part of the presentation system.

### `gpu`

Use when the visual meaning depends on shader execution, not merely decoration.

### `worker`

Use when off-main-thread coordination is part of the surface's runtime need.

### `wasm`

Use when compute cost meaningfully exceeds what the normal runtime should carry. Worth noting: every directive past `satellite` is additive. The surface should still be coherent if `wasm` doesn't load and the worker falls back to TypeScript kernels (`packages/core/src/wasm-fallback.ts`). The escalation path is a budget, not a dependency.

---

## Runtime escalation in Astro

The correct Astro posture is:

1. emit real HTML
2. let CSS carry as much as possible
3. attach LiteShip runtime only where authored behavior needs it
4. escalate to worker, gpu, or wasm only where meaning requires it

That is the host model.

Astro gives the page a strong server-rendered base. LiteShip adds stateful adaptive behavior without forcing every surface into a general-purpose app runtime.

---

## Capability ceilings

A key LiteShip invariant is that authored intent degrades gracefully under capability ceilings (see [ADR-0002](./adr/0002-zero-alloc.md) for the cheapest-valid-default discipline).

Inside Astro, that means:

- the document should remain coherent without rich runtime
- richer directives should be additive, not required for baseline meaning
- surfaces should preserve narrative and hierarchy even when the runtime is reduced

This makes the system suitable for static visual websites rather than only for full client apps.

---

## The rendering sequence

The ideal sequence is:

1. Astro renders the document
2. server-side context resolves a sensible initial state
3. shell attributes encode authored meaning into DOM
4. CSS and compiled outputs express the cheapest valid surface
5. client directives refine or continue the experience where needed
6. richer runtimes take over only where they add real value

That sequence is the correct model to preserve.

Following that order keeps server-rendered HTML the baseline and limits client runtime to surfaces that actually need it. If everything assumes maximum runtime from the start, the server-rendered base is doing less work than it could.

---

## Working definition

Inside Astro, LiteShip should be understood as:

> an adaptive authored runtime layered on top of an HTML-first document host

That is the frame to keep stable while building.
