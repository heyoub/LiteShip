# LiteShip documentation glossary

Vocabulary for prose across this repository. **Technical identifiers** (`Boundary`, `@czap/core`, `czapMiddleware`, `--czap-*`, `host-wired`, CLI `czap`, …) stay exactly as shipped; this file governs **surrounding language** only.

## Three-layer naming

| Layer | Use when |
| --- | --- |
| **LiteShip** | Product and distribution: what readers adopt, what marketing and README hooks name. |
| **CZAP** | Engine name (*Content-Zoned Adaptive Projection*, pronounced “see-zap”): architecture, ADRs, how projection and zones work. |
| **`@czap/*`** | npm namespace only: install lines, imports, package lists — **never rename**. |

**Canonical sentence:** *LiteShip — powered by the CZAP engine, distributed as `@czap/*` packages on npm.*

## Primitives (prose register)

| Term | Consistent description |
| --- | --- |
| **Boundaries** | **Rig**, **tension**, **set** — where continuous signals partition into named bearings. Avoid *wire* for boundaries in prose. |
| **Tokens** | **Materials** of the design language — axes, fallbacks, craft vocabulary. |
| **Styles** | Named-state **outputs** — what **casts** or **projects** when a boundary’s bearing changes. |
| **Themes** | Coordinated variants — how materials **re-trim** when the presentation mode shifts. |
| **Compile path** | **Cast** to CSS, **project** to GLSL / WGSL / ARIA / AI — not “compile” in casual prose if a register verb fits. |
| **Runtime / hot path** | **Working deck**, **working line**, **thrust** / **photon** language for trim and off-main-thread work; **off-deck** or **engine room** for workers. |

## Banned in marketing-style prose

*next-generation, leverage, robust, powerful, seamless, blazingly fast, cutting-edge, world-class, enterprise-grade, paradigm-shifting, game-changing, revolutionary, unleash, supercharge, harness the power of* — replace with concrete behavior or cut.

## Drift check

After editing docs, search for mixed boundary verbs (*wire* vs *rig*), banned words, and accidental product rename of `@czap/*` or public APIs.
