# LiteShip documentation glossary

Vocabulary for prose across this repository. Technical identifiers (`Boundary`, `@czap/core`, `czapMiddleware`, `--czap-*`, `host-wired`, CLI `czap`, ...) stay exactly as shipped; this file governs surrounding language only.

## Three-layer naming

| Layer | Use when |
| --- | --- |
| **LiteShip** | Product and distribution: what readers adopt, what README hooks name, social posts. |
| **CZAP** | Engine name (Content-Zoned Adaptive Projection, "see-zap"): architecture, ADRs, how projection and zones work. |
| **`@czap/*`** | npm namespace only: install lines, imports, package lists. Never renamed. |

**Canonical sentence:** *LiteShip — powered by the CZAP engine, distributed as `@czap/*` packages on npm.*

## Primitives (prose register)

| Term | Consistent description |
| --- | --- |
| **Boundaries** | Rig, tension, set. Where continuous signals partition into named bearings. Avoid *wire* for boundaries in prose. |
| **Tokens** | Materials of the design language: axes, fallbacks, craft vocabulary. |
| **Styles** | Named-state outputs: what casts or projects when a boundary's bearing changes. |
| **Themes** | Coordinated variants: how materials re-trim when the presentation mode shifts. |
| **Compile path** | Cast to CSS, project to GLSL / WGSL / ARIA / AI. Not "compile" in casual prose if a register verb fits. |
| **Runtime / hot path** | Working deck, working line, thrust / photon language for trim and off-main-thread work; off-deck or engine room for workers. |

## Banned in marketing-style prose

*next-generation, leverage, robust, powerful, seamless, blazingly fast, cutting-edge, world-class, enterprise-grade, paradigm-shifting, game-changing, revolutionary, unleash, supercharge, harness the power of.* Replace with concrete behavior, or cut.

## Translator notes

A few terms in this corpus are polysemous; future i18n / machine-translation work should treat them as terms-of-art and pin the meaning rather than translate by surface form:

- **cast** — verb only, "project a definition into a target output surface" (CSS, GLSL, ARIA, etc.). Not the noun (theatrical cast) and not type-coercion (`as` casting). Always carries a target.
- **rig** — both verb ("rig a boundary") and noun ("the rig is in between"). The system that ties continuous signals to named bearings. Not the unrelated rigging-of-results sense.
- **surface** — noun, "a runtime target the compiler emits to" (CSS surface, ARIA surface). Not the verb sense (something coming to attention).
- **bearing** — noun, "a named discrete state a boundary partitions to" (one of `mobile/tablet/desktop`, etc.). Not the mechanical-bearing or the comportment sense.
- **trim** — runtime-cost language: "kept the working deck trim" = "kept the runtime cost low."

## Maritime register (CLI surface)

User-facing CLI strings (`czap doctor`, `pnpm setup`, postinstall, clean, dispatch errors) draw from one consistent shipyard vocabulary. Authors of new CLI output should pull from here rather than invent register on the fly. The lint test `tests/unit/cli/glossary-lint.test.ts` enforces that every term used in CLI source is defined here and in `czap glossary`.

| Term | Meaning | Where it appears |
| --- | --- | --- |
| **hull** | The built `dist/` artifact of a package. "Hull not yet laid" = no `dist/` on disk. "Hull check" = the rolled-up status emitted by `czap doctor`. | `czap doctor` verdict; `bin/czap.mjs` not-yet-built error |
| **keel** | The TypeScript build output. "Lay the keel" = run `pnpm run build`. The first thing you put down before anything else floats. | `czap doctor` hints |
| **cast off** | Begin the run: leave the dock. Used for first actions after install ("Cast off with: pnpm setup") and for non-blocking caution states. | postinstall banner; `czap doctor` verdict; workspace-install hint |
| **moored** | Installed but not yet underway. Immediately after `pnpm install` — `node_modules` present, build / test not run. | `scripts/postinstall.ts` |
| **shake-down** | First-run aggregate (`pnpm setup`). Runs doctor → build → test on a new hull. | `scripts/setup.ts` phase headers |
| **dry-dock** | Clean state. `pnpm clean` wipes `dist/`, `coverage/`, `reports/`, `.tsbuildinfo`. | `scripts/clean.ts` |
| **deck plan** | The npm-scripts catalogue (`pnpm scripts`). Grouped by purpose. | `scripts/scripts-index.ts` header |
| **chart** | The CLI verb table (`czap help`). Map of bearings — what verb does what. | `czap help` header; dispatch unknown-command error |
| **rig** *(verb)* | Install or wire infrastructure into place. "Rig the pre-commit hook" = link `.git/hooks/pre-commit`. Distinct from the noun "rig" (the boundary system). | `czap doctor` git-hook hint |
| **stow** | Pack a downloaded artifact into its expected location. "Stow the browsers" = `pnpm exec playwright install`. "Stow Rust" = install via rustup. | `czap doctor` Playwright / WASM hints |
| **quay** | The release surface. Where a package ties up before shipping to npm. *Reserved register* — defined here so it can be wired consistently when added to the ship / publish flow. | (future) |
| **bearing** *(verdict sense)* | One of `ok` / `warn` / `fail` for a probe; or `ready` / `caution` / `blocked` for the rolled-up verdict. Same metaphor as the boundary-bearing primitive — a discrete state projected from a continuous signal. | `czap doctor` receipts |

## Drift check

After editing docs, run the sweep: mixed boundary verbs (*wire* vs *rig*), banned words, accidental rename of `@czap/*` or public APIs. The glossary holds; the prose comes back to it.
