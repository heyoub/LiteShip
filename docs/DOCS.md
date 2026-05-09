# czap Documentation Map

This file is the shortest route to the right document.

Use it as the entry point for humans and agents.

---

## Start Here

### If the question is "What is czap?"

Read [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md), then
[ARCHITECTURE.md](./ARCHITECTURE.md).

Together these explain the ontology and the package shape:

- signals
- boundaries
- named states
- outputs
- package DAG
- compiler targets
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

This is the framework-host layer:

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

## Recommended Reading Order

For a theory-first understanding:

1. [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [ADR-0002 zero-alloc](./adr/0002-zero-alloc.md) + [ADR-0004 plan/coordinator](./adr/0004-plan-coordinator.md)
4. [AUTHORING-MODEL.md](./AUTHORING-MODEL.md)
5. [ASTRO-RUNTIME-MODEL.md](./ASTRO-RUNTIME-MODEL.md)
6. [PACKAGE-SURFACES.md](./PACKAGE-SURFACES.md)
7. [STATUS.md](./STATUS.md)

For implementation work:

1. [PACKAGE-SURFACES.md](./PACKAGE-SURFACES.md)
2. [AUTHORING-MODEL.md](./AUTHORING-MODEL.md)
3. [ASTRO-RUNTIME-MODEL.md](./ASTRO-RUNTIME-MODEL.md)
4. [STATUS.md](./STATUS.md)
5. tests and package source

---

## Working Principle

When the docs and the code disagree:

- trust [STATUS.md](./STATUS.md) for repo state
- trust package source for exact runtime behavior
- trust tests for executable truth
