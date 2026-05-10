# ADR-0008: Capsule Assembly Catalog

**Status:** Accepted
**Date:** 2026-04-23
**Supersedes:** —

## Context

The capsule factory needs a bounded vocabulary of assembly kinds to avoid cathedral creep. Unbounded catalogs let every new domain mint its own arm, at which point the "factory" degenerates into a dispatch table of ad-hoc shapes.

## Decision

The catalog is closed at seven arms:

1. `pureTransform`: deterministic function
2. `receiptedMutation`: side-effecting op with receipt
3. `stateMachine`: states + transitions
4. `siteAdapter`: host-runtime bridge
5. `policyGate`: permission / authz check
6. `cachedProjection`: content-addressed transform with cache
7. `sceneComposition`: ECS-world-backed timeline

Each arm has a typed contract (`CapsuleContract<K, In, Out, R>`), a factory (`defineCapsule`), and a harness template that emits property tests, benches, docs, and audit receipts.

**Closure rule:** adding an 8th arm requires:
1. An ADR amendment to this document with explicit justification
2. Demonstration that the candidate archetype does not cleanly reduce to an existing arm
3. A first concrete instance in the same PR (no speculative arms)

## Consequences

- Contributors must map new domains to existing arms; speculative arms are rejected.
- Catalog audit becomes mechanical: grep `_kind` literals, compare against the seven.
- Cross-domain isomorphism claim becomes testable: if most real-world primitives (HTTP handlers, GraphQL resolvers, LLM tool-calls, DB migrations, scenes) do reduce to these seven, the catalog is load-bearing.

## Supporting evidence

- `packages/core/src/assembly.ts` implements the tagged union.
- `packages/core/src/harness/` ships 7 per-arm templates (`pure-transform.ts`, `receipted-mutation.ts`, `state-machine.ts`, `site-adapter.ts`, `policy-gate.ts`, `cached-projection.ts`, `scene-composition.ts`).
- `scripts/capsule-compile.ts` dispatches per arm via `isAssemblyKind` guard + exhaustive `switch`; no fallback path.
- `scripts/flex-verify.ts` `CapsuleFactory` dimension reports `arms-with-instances=K/7` so the closure is observable.

## References

- [LiteShip vocabulary](../GLOSSARY.md): product / engine / `@czap/*` naming
- `docs/adr/0007-adapter-vs-peer-framing.md` (paired adapter framing ADR)
- `docs/adr/0010-spine-canonical-type-source.md` (paired bridge ADR)

### Capsule detection is type-directed (2026-04-24 amendment)

The capsule compiler at `scripts/capsule-compile.ts` originally used
a syntax-only AST walker (`ts.createSourceFile`) that extracted
`_kind` and `name` from string-literal initializers. It was blind
to factory-wrapped capsules. `defineAsset(...)`,
`BeatMarkerProjection(id)`, and similar patterns silently dropped
from the manifest because they don't pass `_kind: 'cachedProjection'`
as a literal at the factory call site.

The detector at `scripts/lib/capsule-detector.ts` now uses
`ts.createProgram` + `getTypeChecker()` to resolve every
`CallExpression`'s return type. Any call whose type extends
`CapsuleContract<K, ...>` or `CapsuleDef<K, ...>` is detected,
regardless of whether the callee is `defineCapsule` directly or a
factory wrapper. `K` is read from the type parameter via
`CAPSULE_TYPE_NAMES` (`packages/core/src/capsule.ts`).

Factory-wrapped capsules surface in the manifest with a `factory`
field (the wrapper name) and `args` (literal arguments captured at
the call site). Naming conventions for known factories (e.g.
`BeatMarkerProjection('intro-bed')` → `intro-bed:beats`) live in
`scripts/capsule-compile.ts` `FACTORY_NAMING`; unknown factories
fall back to the first string-literal argument or the binding name.

Cross-package import resolution uses an explicit `WORKSPACE_ALIASES`
map (`scripts/lib/capsule-detector.ts` L24-43) so the type checker
sees source `.ts` files rather than built `.d.ts` outputs. Without
that, factory return types like `CapsuleDef<'cachedProjection', ...>`
collapse to `any` and the type-directed detector would degenerate
back to the syntax-only behavior.

This closes the "factory-wrapped capsule" gap: the `cachedProjection`
arm now records real instances instead of an empty list.
