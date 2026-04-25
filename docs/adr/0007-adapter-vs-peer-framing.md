# ADR-0007: Adapter vs Peer Framing

**Status:** Accepted
**Date:** 2026-04-23

## Context

Originally, czap shipped `@czap/remotion` as a bare adapter over Remotion's React composition API. As the project grew, the question of whether Remotion (and future hosts like Revideo, Twick, Astro) should be primary surfaces or peer integrations became load-bearing. Spec `2026-04-23-capsule-factory-video-stack-design.md` §4 answered this by generalizing host integrations to the `siteAdapter` assembly arm.

Remotion's license is also a consideration — commercial use above three employees requires a paid license. czap cannot accept that license into its own license surface, but czap users who consume Remotion through an adapter carry the obligation themselves. This is standard dependency discipline, but worth naming.

## Decision

Host integrations are `siteAdapter` capsule instances. `@czap/remotion` is the first such instance. Future integrations (Revideo, Twick, custom hosts) are added as peer capsules — not as primary-surface changes to czap core.

Every adapter capsule declares:

- `_kind: 'siteAdapter'` plus a contract with clear input/output schemas
- `capabilities` listing what it reads and writes
- `site` list for the hosts it targets (typically `['node', 'browser']` for SSR adapters, narrower for specialized hosts)
- `attribution` when the upstream host carries license obligations distinct from czap's MIT

The repo compiler's harness template for `siteAdapter` emits round-trip tests (native → czap → native equivalence) and a host-capability matrix so adapter bugs surface in the gauntlet.

## Consequences

- Adapters inherit the gauntlet — new adapters ship with generated tests, benches, docs, and audit receipts automatically.
- czap core stays vendor-neutral. Primary-surface questions dissolve because there is no primary surface; there is `@czap/core` plus N `siteAdapter` capsules.
- License obligations stay with downstream users of licensed hosts (Remotion, etc.). czap's own license surface stays MIT.
- Adding a new host is additive and cheap — one capsule file, one line of system wiring. No core changes.

## Supporting evidence

- `packages/remotion/src/capsules/remotion-adapter.ts` — first `siteAdapter` capsule instance (Task 24, commit `6b1e266`)
- `packages/core/src/harness/site-adapter.ts` — harness template (Task 9, commit `3e607d0`)
- `reports/capsule-manifest.json` — `remotion.video-frame-output` entry with `Remotion-Company-License` attribution
- Spec §4 assembly catalog + §11 phased rollout

## References

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §4
- `docs/adr/0008-capsule-assembly-catalog.md`
- https://www.remotion.dev/docs/license
