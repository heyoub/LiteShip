# LiteShip documentation map

This file is the shortest route to the right document.

Use it as the entry point for humans and agents.

Shared vocabulary (LiteShip / CZAP / `@czap/*`): [GLOSSARY.md](./GLOSSARY.md).

---

## Start Here

### If the question is "What is LiteShip?"

Read [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md), then
[ARCHITECTURE.md](./ARCHITECTURE.md).

Together these explain the ontology and the package shape:

- signals
- boundaries
- named states
- outputs
- package DAG
- projection targets
- Vite and Astro positioning
- scene, asset, CLI, and MCP surfaces

### If the question is "What is the philosophy behind the runtime?"

Read [ADR-0002 zero-alloc](./adr/0002-zero-alloc.md) and
[ADR-0004 plan/coordinator](./adr/0004-plan-coordinator.md).

These are the performance and capability decisions:

- cheapest-valid runtime
- zero-allocation hot path (pool, dirty, dense ECS, microtask batching)
- per-tick phase sequencing

### If the question is "How should I think with this on a visually rich Astro site?"

Read [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md).

This is the theory-first authoring frame:

- signals
- boundaries
- named states
- outputs
- Astro as document host

### If the question is "How do I author definitions and compose surfaces?"

Read [AUTHORING-MODEL.md](./AUTHORING-MODEL.md).

This is the mechanics layer:

- definitions
- file shapes
- boundaries, tokens, themes, styles
- naming and composition rules

### If the question is "How does Astro actually host and run this?"

Read [ASTRO-RUNTIME-MODEL.md](./ASTRO-RUNTIME-MODEL.md).

This is the LiteShip host layer (Astro + CZAP runtime):

- integration
- middleware
- server-resolved initial state
- client directives
- runtime escalation

### If the question is "Which package should I reach for?"

Read [PACKAGE-SURFACES.md](./PACKAGE-SURFACES.md).

This is the public surface map:

- package-by-package exports
- what each package owns
- what to import for which job

### If the question is "What is green right now?"

Read [STATUS.md](./STATUS.md).

This is the reality document:

- gates
- coverage
- benchmark policy
- current limitations

### If the question is "Where is the project headed?"

Read [ROADMAP.md](./ROADMAP.md).

### If the question is "What changed?"

Read [CHANGELOG.md](../CHANGELOG.md). For shipping npm/GitHub releases, see
[RELEASING.md](./RELEASING.md).

---

## Reading paths by reader

### If you're new (theory-first arc)

1. [GLOSSARY.md](./GLOSSARY.md): LiteShip / CZAP / `@czap/*` + prose register (short; read once)
2. [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md)
3. [ARCHITECTURE.md](./ARCHITECTURE.md)
4. [ADR-0002 zero-alloc](./adr/0002-zero-alloc.md) + [ADR-0004 plan/coordinator](./adr/0004-plan-coordinator.md)
5. [AUTHORING-MODEL.md](./AUTHORING-MODEL.md)
6. [ASTRO-RUNTIME-MODEL.md](./ASTRO-RUNTIME-MODEL.md)
7. [PACKAGE-SURFACES.md](./PACKAGE-SURFACES.md)
8. [STATUS.md](./STATUS.md)

### If you're authoring with LiteShip in your app

1. [GETTING-STARTED.md](./GETTING-STARTED.md): clone to a runnable boundary in ten minutes
2. [AUTHORING-MODEL.md](./AUTHORING-MODEL.md): the shape of day-to-day authoring
3. [PACKAGE-SURFACES.md](./PACKAGE-SURFACES.md): which package owns what you need to import
4. [ASTRO-RUNTIME-MODEL.md](./ASTRO-RUNTIME-MODEL.md): when escalation makes sense
5. tests and package source for exact behavior

### If you're contributing to LiteShip

1. [ARCHITECTURE.md](./ARCHITECTURE.md): the package DAG and where things live
2. [ADR-0001 namespace pattern](./adr/0001-namespace-pattern.md) + [ADR-0002 zero-alloc](./adr/0002-zero-alloc.md): the load-bearing conventions
3. [AUDIT.md](./AUDIT.md): the advisory pipeline that watches for drift
4. [STATUS.md](./STATUS.md): live gates, watch items, runtime seam hotspots
5. [../CONTRIBUTING.md](../CONTRIBUTING.md): the gauntlet, PR conventions, code style

### If you're operating LiteShip in production

1. [../SECURITY.md](../SECURITY.md): trust boundaries, CSP requirements, Trusted Types policy
2. [STATUS.md](./STATUS.md): current bench posture, watch items, security defaults
3. [AUDIT.md](./AUDIT.md): the codebase-audit signal, what to expect in a release artifact
4. [RELEASING.md](./RELEASING.md): publish, tags, GitHub releases
5. [HISTORY_SCRUB.md](./HISTORY_SCRUB.md): pre-public discovery checklist

---

## Discovery index (file paths for common queries)

For agents and grep-first humans, here is where the canonical answer lives:

| Question | File |
|---|---|
| Where is `Boundary` defined? | `packages/core/src/boundary.ts` (re-exported from `packages/core/src/index.ts`) |
| Where is `Token` defined? | `packages/core/src/token.ts` |
| Where is `Style` defined? | `packages/core/src/style.ts` |
| Where is `Theme` defined? | `packages/core/src/theme.ts` |
| Where does the canonical CBOR encoder live? | `packages/core/src/cbor.ts` (consumed by every primitive's `deterministicId`) |
| Where is the FNV-1a hash? | `packages/core/src/fnv.ts` |
| Where is the SPSC ring buffer? | `packages/worker/src/spsc-ring.ts` |
| Where is the compositor pool? | `packages/core/src/compositor-pool.ts` |
| Where is `DirtyFlags`? | `packages/core/src/dirty.ts` |
| Where is the HTML sanitizer? | `packages/web/src/security/html-trust.ts` |
| Where is the SSRF / private-IP guard? | `packages/web/src/security/runtime-url.ts` |
| Where is the runtime policy global written? | `packages/astro/src/runtime/policy.ts`, via `globals.ts` |
| Where does `client:satellite` register? | `packages/astro/src/integration.ts` |
| Where is the `Satellite` Astro component? | `packages/astro/src/Satellite.astro` (default export from `@czap/astro/Satellite`) |
| How do I add a new compile target? | `docs/adr/0006-compiler-dispatch.md`, then `packages/compiler/src/dispatch.ts` |
| How do I add a new primitive? | `docs/adr/0001-namespace-pattern.md`, then mirror the existing primitive shape in `packages/core/src/` |
| How do I extend an existing type union? | The pattern is grep-first today; see CONTRIBUTING.md "Architecture changes" and the affected `_spine/*.d.ts` file |
| Where is the canonical CI workflow? | `.github/workflows/ci.yml` (truth-linux job runs `pnpm run gauntlet:full`) |
| Where is the red-team regression suite? | `tests/regression/red-team-runtime.test.ts` |
| What does `flex:verify` actually check? | `scripts/flex-verify.ts` (7 dimensions; rolled up by gauntlet phase 29) |

---

## Working Principle

When the docs and the code disagree:

- trust [STATUS.md](./STATUS.md) for repo state
- trust package source for exact runtime behavior
- trust tests for executable truth
