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

Read [CHANGELOG.md](./CHANGELOG.md). For shipping npm/GitHub releases, see
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

## Working Principle

When the docs and the code disagree:

- trust [STATUS.md](./STATUS.md) for repo state
- trust package source for exact runtime behavior
- trust tests for executable truth
