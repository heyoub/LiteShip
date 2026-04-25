# czap Roadmap

> Verified against the 2026-04-08 hardening wave. See `docs/STATUS.md` for live counts, gate totals, coverage numbers, and current telemetry watch items.

## Current Phase

The current wave is a pre-1.0 hardening pass, not a feature land-grab.

Active priorities:

1. Keep runtime correctness and hotspot coverage moving until the remaining low-branch runtime files are no longer structural laggards.
2. Keep security defaults fail-closed for HTML, URL, selector, style, and boundary-state surfaces.
3. Keep CI truth aligned with the canonical local gauntlet.
4. Keep packaging truth aligned with what will actually ship to consumers.
5. Keep dogfooding friction feeding back into framework tests, telemetry, and docs instead of app-local hacks.

## Already Promoted

These are no longer roadmap aspirations; they are current repo reality:

- versioned authored defs with `_version: 1`
- quantizer runtime branding via `_tag: 'Quantizer'`
- dedicated `test:redteam` regression lane
- same-origin-by-default runtime URL policy with explicit allowlist support
- artifact-id path-segment validation
- text-safe default LLM rendering
- shared HTML trust pipeline for stream and LLM rendering
- morph sanitization for dangerous HTML classes
- boundary-state lockdown to `--czap-*`, `aria-*`, and `role`
- package tarball smoke for publishable packages
- Linux truth CI plus Windows truth-preserving and browser-matrix lanes
- production middleware parity for worker-isolation headers

## Near-Term Hardening Epics

### 1. Runtime branch-hotspot sweep

Keep reducing the current hotspot cluster surfaced by `reports/runtime-seams.*`, especially:

- `packages/vite/src/style-transform.ts`
- `packages/core/src/signal.ts`
- `packages/quantizer/src/animated-quantizer.ts`
- `packages/vite/src/plugin.ts`
- `packages/compiler/src/ai-manifest.ts`
- `packages/worker/src/compositor-worker.ts`
- `packages/astro/src/runtime/worker.ts`
- `packages/astro/src/runtime/stream.ts`
- `packages/astro/src/headers.ts`
- `packages/astro/src/runtime/receipt-chain.ts`

Success condition:
- hotspot tables stop surfacing obviously under-covered runtime seams
- added coverage corresponds to real behavior branches, not synthetic padding

### 2. Advisory audit cleanup

Work down the remaining advisory pressure without cargo-culting the detector:

- remove or better justify fallback/default paths that look like semantic laundering
- improve helper traceability where files still read like isolated doubles
- shrink "partial proof inventory" pockets in runtime files that still rely on one-sided evidence

Success condition:
- advisory warning/info count trends down without hiding real diagnostics

### 3. CI and release truth parity

Keep enforcing the same source of truth everywhere:

- `gauntlet:full` remains the canonical sequential lane
- CI jobs stay semantically aligned with the gauntlet
- packaged tarballs stay installable and export-map-valid
- docs continue to point to live telemetry instead of hardcoded ledgers

Success condition:
- local truth, CI truth, and release/package truth stop drifting

## Completed Since Last Revision (2026-04-23)

Spec `2026-04-23-capsule-factory-video-stack-design.md` shipped with 5 atomic phases:

- Capsule factory kernel + 7-arm assembly catalog (ADR-0008)
- Spine runtime-gap closure (ADR-0010, closes sixsigma Island #1)
- Scene composition stack on existing ECS (ADR-0009, ADR-0002 amended)
- Asset capsules + analysis cachedProjections
- CLI + MCP dual-audience surfaces
- ADR-0007 (adapter vs peer framing) resolved

`flex:verify` dimensions expanded to 7 (added `CapsuleFactory`).

## Product-Adjacent Future Epics

These are real future framework directions, but they are not promises for the current hardening wave.

### Component-local data loading

Goal:
- define a host-safe, boundary-aware data-loading model that does not accidentally turn `czap` into an RPC framework

Entry criteria:
- current runtime/security/package hardening wave is stable
- dogfooded apps show repeated loader patterns that belong in the framework

**Assembly mapping:** cachedProjection capsules keyed on (url, params, auth-scope). Scenes and hosts reference loaders by capsule id; the factory emits decode + cache-invalidation harnesses.

### Stateful edge AI bindings

Goal:
- offer explicit, host-owned AI/stream bindings at the edge without making the frontend runtime depend on a vendor-specific control plane

Entry criteria:
- current trust boundaries for stream/LLM/runtime URLs are stable
- receipt/authenticity semantics are made explicit enough to build on safely

**Assembly mapping:** receiptedMutation capsules at site: ['edge'], paired with policyGate capsules for authorization.

### Plugin-as-a-framework sidecar

Goal:
- make the Vite/Astro integration path feel like a coherent framework sidecar without collapsing package boundaries

Entry criteria:
- package smoke, CI truth, and support-matrix policy stay stable across dogfooding

**Assembly mapping:** refinement of the existing siteAdapter arm. Vite plugin + Astro integration become capsule instances with declared capabilities.

## Explicit Non-Goals For This Wave

- built-in auth/session system
- ORM/storage/queue stack
- RPC/server-action mutation layer
- backend/router framework expansion
- stateful edge AI substrate implementation
- component-local data loading implementation

## Stop Condition

This hardening wave is done when:

- correctness seams are closed
- adjacent debt surfaced by that work is also closed
- red-team findings are fixed or deliberately justified
- package distribution is proven
- CI truth matches local truth
- dogfooding no longer produces structural framework feedback
- remaining work is genuinely micro-optimization or speculative enhancement
