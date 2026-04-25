# Flex to Ten — Gap Closure Design (Phase A + B)

**Date:** 2026-04-21
**Status:** Draft — pending user review
**Scope:** Phase A (close rating gaps to 10/10) + Phase B (address watch items, infrastructure polish)
**Out of scope:** Phase C (Astro-primary-vs-invest framing) — separate brainstorm after this ships

---

## 1. Overall shape

**Goal:** Earn an objectively justified 10/10 across all six rating dimensions (Architecture, Type discipline, Testing rigor, Performance, Release discipline, Docs), with every watch item either closed or explicitly documented.

**Phases (sequenced, gated):**

| Phase | Contents | Gate to next |
|---|---|---|
| **A** | Type discipline (Cell/Derived variadic + tupleMap, broader cast sweep), Perf ADR (dispatch coherence story), Docs full-send (TSDoc + ESLint enforcement + TypeDoc + 6 ADRs) | Gauntlet green, new ADRs committed, TypeDoc build passing, TSDoc ESLint rule at zero warnings |
| **B** | `llm-runtime-steady` harness, `worker-runtime-startup` investigation + outcome, SSE preflight enforced, `coverage:browser` speedup, `bench`/`bench:gate` consolidation, deprecated-alias cleanup, Effect boundary audit, residual-branch coverage sweep, function-coverage audit, `compositor-types.ts` exclusion | Gauntlet green, zero WATCHLIST entries, all paired-truth gates PASS, `flex:verify` folded into `gauntlet:full` |

**Breaking changes policy:** Allowed freely. Greenfield, no users, ~2–3 months old. No deprecation shims, no `_renamed` cruft. Compiler is the spec.

**Verification standard:** Every claim has a reproducible command. `flex:verify` script runs every per-dimension check and is invoked by `gauntlet:full`. If the project is 10/10, `pnpm run gauntlet:full` says so; if it isn't, the gauntlet is red.

---

## 2. Phase A — Type discipline

**Goal:** Zero `as` / `as unknown` / `@ts-*` directives in `packages/*/src/`, with one sanctioned containment point (`tupleMap` in `packages/core/src/tuple.ts`).

### 2.1 New utility

`packages/core/src/tuple.ts`:

```ts
/**
 * Map each element of a readonly tuple, preserving tuple arity.
 *
 * TypeScript's Array.prototype.map returns U[], erasing tuple structure.
 * This helper reintroduces the mapped tuple type via one narrow cast,
 * provably safe: the map is total and the output element type is uniform.
 */
export const tupleMap = <T extends readonly unknown[], U>(
  tuple: T,
  fn: (element: T[number], index: number) => U,
): { readonly [K in keyof T]: U } =>
  tuple.map(fn) as { readonly [K in keyof T]: U };
```

One documented cast. Everywhere else: zero.

### 2.2 Cell / Derived refactor

- `cell.ts` — `Cell.all` uses `<const T extends readonly unknown[]>` + `tupleMap(cells, c => c.get)` → `Effect.all` tuple overload preserves `T` end-to-end. Removes 3 casts (lines 48, 55, 68). **Public signature unchanged.**
- `derived.ts` — `Derived.combine` same pattern. Removes 4 casts (lines 49, 57, 60, 67). **Public signature unchanged.**

Ergonomics for callers are preserved: `Cell.all([cellA, cellB, cellC])` still works.

### 2.3 Broader cast sweep

Additional cast sites discovered in deeper audit (must all be eliminated):

| File | Site(s) | Fix approach |
|---|---|---|
| `core/boundary.ts` | 241, 262, 263 | `satisfies` + explicit tuple typing for `config.at` unpacking, states array, and deterministicId args |
| `core/typed-ref.ts` | 27 (`BufferSource` cast on crypto.subtle.digest) | Use proper `ArrayBufferView` typing or widen the receiver |
| `core/wasm-dispatch.ts` | 211 (`instance.exports as unknown as WASMExports`) | Typed validator/initializer function; runtime shape-check |
| `astro/runtime/llm.ts` | 157 (`JSON.parse(data) as unknown`) | `JSON.parse` already returns `any`; drop cast |
| `astro/runtime/globals.ts` | 4 (`window as unknown as RuntimeGlobalWindow`) | `declare global { interface Window { ... } }` module augmentation |
| `vite/src/plugin.ts` | 356 | Investigate — possibly needs Vite types upgrade or documented narrow helper |
| `worker/compositor-startup.ts` | 460 (`f64 as unknown as readonly number[]`) | `Array.from(f64)` or widen receiver to `ArrayLike<number>` |

### 2.4 JSDoc example cleanup

JSDoc `@example` blocks in `edge/kv-cache.ts`, `web/stream/llm-adapter.ts`, `web/slot/registry.ts` contain `as any` — copy-paste foot-gun for future users. Replace with branded-type-correct examples.

### 2.5 Enforcement

ESLint rules added to `eslint.config.js`:
- `@typescript-eslint/consistent-type-assertions` → `error`, with narrow file exception for `packages/core/src/tuple.ts`.
- `@typescript-eslint/no-unnecessary-type-assertion` → `error`.
- `@typescript-eslint/ban-ts-comment` → `error` on `@ts-ignore`/`@ts-nocheck`; `@ts-expect-error` requires a description.
- Existing `--max-warnings 0` already blocks promotion.

### 2.6 Verification

```bash
# Zero casts outside the sanctioned helper
grep -rnE ' as (unknown|any|\{|[A-Z])| as [a-z_]+ ' packages/*/src/ \
  --include='*.ts' | grep -v 'packages/core/src/tuple.ts'   # expected: empty
grep -rnE '@ts-(ignore|nocheck|expect-error)' packages/*/src/ --include='*.ts'  # expected: empty
pnpm run lint              # expected: zero warnings
pnpm run typecheck         # expected: pass
pnpm test                  # all existing tests pass unchanged
```

---

## 3. Phase A — Performance (ADR-0006)

**Goal:** Turn the 9% dispatch overhead from an unaddressed gap into a deliberate, evidence-backed platform decision. No code changes to production. One durable architectural document.

### 3.1 Deliverable

`docs/adr/0006-compiler-dispatch.md`, ~300–400 words, structured:

1. **Status** — Accepted. Date. Supersedes/superseded-by: none.
2. **Context** — CSS is one of six compile targets; plugin extensibility is a stated platform goal; compile path runs at build/HMR/SSR, not per-frame.
3. **Decision** — `dispatch(def: CompilerDef)` is the canonical compiler API. Direct calls to `CSSCompiler.compile()` etc. are permitted internally but not promoted as a user-facing fast path.
4. **Consequences**
   - One API surface. Adding a new compiler = one union arm + one switch case. Platform-coherent.
   - Dispatch adds ~150ns per call (9% over direct on the 1.6μs CSS compile path).
   - Content-addressed caching (`memo-cache.ts`, `fnv.ts`) means each unique definition compiles once; dispatch cost is paid **once per content hash**, not per render/request/tick.
5. **Evidence** — Inline table from `tests/bench/compiler.bench.ts` (`CSSCompiler.compile() -- direct` vs `dispatch() -- CSSCompiler tag`), committed JSON bench artifact path, reference to `bench:gate` hard-gate threshold (15%) and current margin.
6. **Rejected alternatives** — Two-tier API (promoted direct + fallback dispatch); compile-time tag elision. Each with one-line rationale.
7. **References** — `packages/compiler/src/dispatch.ts`, `tests/bench/compiler.bench.ts`, `scripts/bench-gate.ts`.

### 3.2 Minor cleanup

- Delete `export const dispatchDef = dispatch;` (`compiler/dispatch.ts:90`). Greenfield; no users; no deprecation shim needed.

### 3.3 Verification

```bash
test -f docs/adr/0006-compiler-dispatch.md            # expected: file exists
grep -n 'dispatchDef' packages/compiler/src/dispatch.ts  # expected: empty
pnpm run bench:gate                                    # expected: PASS
```

---

## 4. Phase A — Docs (full send, single source of truth)

**Goal:** One navigable doc surface. Code is the source of truth for *what*; ADRs are the source of truth for *why*. No duplication.

### 4.1 Layer 1 — TSDoc + ESLint enforcement

- **Scope:** Every exported symbol in `packages/*/src/` gets a TSDoc block. First-party exports only (index.ts re-exports don't need re-docs).
- **Tooling:**
  - `eslint-plugin-tsdoc` — validates TSDoc syntax.
  - `eslint-plugin-jsdoc` — `jsdoc/require-jsdoc` on exported `FunctionDeclaration`, `ClassDeclaration`, `InterfaceDeclaration`, `TSTypeAliasDeclaration`, `ExportNamedDeclaration`.
  - Test files, generated code, and `_private` helpers exempted.
- **Backfill:** Current coverage ~40%. Writing phase flushes to 100% on public exports.

### 4.2 Layer 2 — TypeDoc at `docs/api/`

- `typedoc` + `typedoc-plugin-markdown` → outputs `.md` (GitHub renders inline when clicked through).
- `typedoc.json` at root; entry points = each package's `src/index.ts`.
- Output `docs/api/<package>/<module>.md`, **committed**.
- `pnpm run docs:build` regenerates.
- `pnpm run docs:check` regenerates to temp dir and diffs against committed output — CI fails on drift. No silent staleness.
- **Downstream context:** user is migrating a company dev-docs site to Astro/czap; committed markdown here is directly ingestible by that future site.

### 4.3 Layer 3 — 6 ADRs at `docs/adr/`

- `docs/adr/README.md` — index with status + one-line summary per ADR.
- `docs/adr/0000-template.md` — canonical template.
- Each ADR: 200–400 words, structured Status / Context / Decision / Consequences / Evidence / References. Code references via `packages/.../file.ts:line` — never duplicate code content.

| ADR | Subject | Captures |
|---|---|---|
| 0001 | Namespace object pattern + branded types | `const X = {...}; declare namespace X { export type Shape = ... }` + `Brand.Branded` over classes/interfaces |
| 0002 | Zero-allocation hot path discipline | CompositorStatePool, DirtyFlags, FrameBudget; the `DIRTY_FLAGS_MAX` capping heuristic; **transport cost floor** section (from Phase B 5.2 outcome if structural) |
| 0003 | Content-addressing (FNV-1a + CBOR) | Why FNV-1a, why CBOR-canonical, invalidation model, alternatives considered (SHA-256, structural equality) |
| 0004 | Plan IR vs RuntimeCoordinator split | How generic Plan IR maps to compositor phases, why the split exists |
| 0005 | Effect boundary rules | When Effect begins, where plain JS takes over, categorization of all `Effect.runSync` sites (event-handler grounding, finalizers, hot-path reads, state-machine wrapping); decisions for each category |
| 0006 | Compiler dispatch tagged union | See §3 |

### 4.4 Layer 4 — Consolidate existing docs

- **`docs/ARCHITECTURE.md`** → refactored to pure index: package table linking to `docs/api/`, ADR list, "where to start." Current conceptual content migrates into ADRs 0001–0005.
- **`docs/RENDER-RUNTIME.md`** → content folds into ADR-0002 (zero-alloc) and ADR-0004 (Plan/Coordinator). **Before deletion: explicit content-parity audit.** Every non-trivial paragraph/decision/rationale must be mapped to its new home in an ADR. Review the mapping. Only then delete the file. No unique content lost.
- **`docs/STATUS.md`** → stays. Living test/bench state, not duplicating code.
- **Per-package `README.md`** → either deleted (if anemic) or reduced to a 3-line link into `docs/api/<package>/`.

### 4.5 Verification

```bash
pnpm run lint                    # expected: zero jsdoc/require-jsdoc + tsdoc/syntax warnings
pnpm run docs:build              # regenerates docs/api/
pnpm run docs:check              # CI gate: committed docs match source TSDoc
ls docs/adr/*.md | wc -l         # expected: >= 8 (6 ADRs + README + template)
test ! -f docs/RENDER-RUNTIME.md # expected: pass (deleted after content-parity audit)
wc -l docs/ARCHITECTURE.md       # expected: significantly less than current (refactored to index)
```

---

## 5. Phase B — Watch items & infrastructure (expanded to 10)

Each item: root-cause-driven outcome. No arbitrary percentage thresholds. No hour estimates — the decision is driven by what investigation reveals, not by how long it took.

### 5.1 `llm-runtime-steady` bench harness

- **Diagnosis:** Bench harness recreates LLM session per iteration, charging setup to every op. The diagnostic output literally says: *"should reuse a live session instead of charging setup on every chunk."*
- **Fix:** `tests/bench/directive.bench.ts` — lift session creation into bench `setup` / module scope; hot loop passes chunks through the existing session.
- **If harness fix reveals real session-reuse issue** in `LLMAdapter`, that becomes a separate finding.
- **Verification:** `pnpm run bench:gate` — `llm-runtime-steady` drops to PASS, median well under 25% threshold.

### 5.2 `worker-runtime-startup` investigation (77% diagnostic)

- **Dominant seam:** `state-delivery:message-receipt`, 93.8% worker-only share. Cost lives in postMessage → receipt, not compute.
- **Investigation:** Profile the message-receipt path (payload size, schedule latency, handshake count). Try SharedArrayBuffer-backed state delivery as a spike (parallels existing SPSC ring pattern).
- **Outcome rule (correctest):** Drive decision by evidence, not hours.
  - If a clean fix emerges and measurably moves p50, implement it; re-measure; spec it.
  - If the overhead is structural (inherent to worker postMessage / structured-clone), upgrade ADR-0002 with a "transport cost floor" section explaining why. Watchlist entry flips from "regression" to "accepted + documented."
- **Verification:** `pnpm run bench:gate` — worker-runtime-startup either PASS or tagged as documented-structural; ADR-0002 contains a "transport cost floor" section if doc path chosen.

### 5.3 SSE preflight enforcement

- **Current state:** Preflight is available; diag bench pair `[DIAG] stream-preflight` shows it makes invalid-JSON rejection 99% cheaper. But it's not mandatory in the public SSE client.
- **Fix:** `packages/web/src/stream/sse.ts` — preflight always-on in public API; remove opt-out path (greenfield, no users). Update any tests that disabled it. TSDoc note documents the decision.
- **Verification:**
  ```bash
  grep -nE 'preflight.*false|disablePreflight' packages/web/src/stream/sse.ts  # expected: empty
  pnpm run test:redteam   # PASS
  pnpm run bench          # PASS (diag preflight pair already exercises this path)
  ```

### 5.4 `coverage:browser` speedup (19m → structural floor)

- **Investigation-first:** Profile with per-file timings; identify the top 10 offenders.
- **Apply what applies (correctest):**
  - Narrow surface: skip modules already 100%-covered in node (redundant re-run adds wall-clock, no signal; merge step already unions the two).
  - Shard across vitest workers where parallelism is available.
  - Pick faster instrumentation (v8 vs istanbul) per profiling.
  - Drop reporters not used by CI.
- **Target:** Whatever the structural floor turns out to be after applying justified optimizations. No arbitrary time budget. Document floor in `docs/STATUS.md` if it's above expectation.
- **Verification:**
  ```bash
  time pnpm run coverage:browser                       # meaningfully faster than 19m
  pnpm run coverage:merge | grep -E 'Lines|Branches'   # totals unchanged (>= 99.94% lines)
  ```

### 5.5 `bench` + `bench:gate` consolidation

- **Investigation-first:** Confirm whether dual-run is load-bearing for statistical rigor, or just sequential duplication.
- **Correctest path:** If dual-run is not load-bearing, merge:
  - `bench` step emits canonical JSON artifacts (`benchmarks/*.json`) with raw sample arrays (skip human-readable stdout for directive bench).
  - `bench:gate` reads JSON and computes replicates statistically.
- **If dual-run IS load-bearing:** engineer a proper single-pass with enough replicates to satisfy both concerns. Don't bail-and-document; don't sacrifice rigor for wall-clock.
- **Verification:**
  ```bash
  time pnpm run gauntlet:full     # total meaningfully below 20m
  pnpm run bench:gate             # PASS, same hard-gate semantics
  ls benchmarks/*.json | wc -l    # same or more artifacts as before
  ```

### 5.6 Deprecated-alias cleanup

- `dispatchDef` in `compiler/dispatch.ts:90` — delete (see §3.2).
- `@deprecated` alias marker in `web/slot/registry.ts:25` — delete alias, update any internal references.
- **Verification:** `grep -rn '@deprecated' packages/*/src/` returns empty (or only comments unrelated to API surface).

### 5.7 Effect boundary audit → ADR-0005

- **Scope:** Enumerate all ~30 `Effect.runSync` sites in non-doc production code. Categorize:
  - **Event-handler grounding** (signal.ts ×6, zap.ts, timeline.ts ×3) — likely correct; document the pattern.
  - **Hot-path reads** (compositor.ts:169, 228) — audit whether cached refs would be cleaner.
  - **SSE state machine** (sse.ts ×17) — ~17 Ref.get/Ref.set sites. Timeboxed investigation: can this be refactored to a pure reducer pattern, eliminating Effect wrapping cost and making state transitions testable without Effect?
  - **Resource cleanup** (wire.ts finalizers) — inherent; document as "cleanup is sync by necessity."
- **Outcome:** ADR-0005 records decisions for each category. SSE pure-reducer refactor happens if investigation shows clean path; otherwise documented as current-by-design with rationale.
- **Verification:** ADR-0005 committed; if SSE refactored, `pnpm test tests/component/sse-client.test.ts` passes unchanged.

### 5.8 Residual coverage-branch sweep

- Targeted single-line branch gaps: `signal.ts:150`, `compositor-startup.ts:330`, `compositor-worker.ts:104`, `animated-quantizer.ts:58`, `runtime-url.ts:37`, `vite/plugin.ts:463`, `astro/runtime/worker.ts:47`.
- **Per line:** Either write the test covering it OR mark with `/* v8 ignore next */` + one-line rationale comment. No silent gaps.
- **Verification:** Merged coverage shows either 100% branches for these files, or the ignored branches have associated rationale in code.

### 5.9 Function-coverage gaps

- Audit sub-100% function coverage in merged report: `codec.ts` (75%), `store.ts` (88%), `op.ts` (90%), `live-cell.ts` (92%), `scheduler.ts` (94%), `signal.ts` (94%), `receipt.ts` (94%), `cell.ts` (94%), `timeline.ts` (90%), `zap.ts` (96%), `wire.ts` (97%), `vite/resolve-utils.ts` (50%), `web/stream/resumption.ts` (84%), `web/stream/sse.ts` (91%), plus any surfaced in the Effect-boundary audit.
- **Per uncovered function:** Either test it OR remove it if dead. No "exists but untested" gray zone.
- **Verification:** Merged coverage function percentage ≥ 99.5% (or every exemption has a documented reason).

### 5.10 `compositor-types.ts` coverage exclusion

- Pure-types file wrongly counted at 0% by v8.
- **Fix:** Exclude from coverage surface in `vitest.config.ts` (or add file-level `/* v8 ignore file */`).
- **Verification:** Merged coverage report no longer shows `compositor-types.ts`.

---

## 6. Verification & acceptance

Each rating dimension: claim, verification command, bright-line pass. Folded into a single `flex:verify` script, which becomes part of `gauntlet:full`.

### 6.1 Per-dimension acceptance

| Dimension | Claim | Verification |
|---|---|---|
| **Architecture** | Every non-obvious architectural decision has an ADR | `ls docs/adr/*.md \| wc -l` ≥ 8; each ADR has all 6 sections populated |
| **Type discipline** | Zero casts except `tupleMap`; ESLint-enforced | `grep` for casts / `@ts-*` returns empty (minus `tuple.ts`); `pnpm run lint` zero warnings |
| **Testing rigor** | 2480+ tests green; flake-resistant; property + red-team + e2e stress + meta-verification all PASS | `pnpm run gauntlet:full` exits 0 with `GAUNTLET PASSED` |
| **Performance** | All hard-gated directive pairs PASS; zero WATCHLIST entries; SSE preflight mandatory | `pnpm run bench:gate` PASS with zero WATCH; `grep -nE 'disablePreflight' packages/web/src/stream/sse.ts` empty |
| **Release discipline** | Gauntlet + feedback:verify + runtime:gate + `docs:check` all PASS | `pnpm run gauntlet:full && pnpm run docs:check` both exit 0 |
| **Docs** | TSDoc on 100% of public exports; TypeDoc committed without drift; 6 ADRs; ARCHITECTURE.md is an index; RENDER-RUNTIME.md deleted after parity audit | `pnpm run lint` zero warnings; `pnpm run docs:check` PASS; file presence/absence checks |

### 6.2 Roll-up: `flex:verify`

New script `scripts/flex-verify.ts` runs every per-dimension check, prints a six-row PASS/FAIL table, exits non-zero on any FAIL.

**Folded into `gauntlet:full`:** every CI run proves 10/10 (or the build goes red). The gauntlet is the truth-machine; the 10/10 claim becomes a continuously-verified property of the repo.

### 6.3 Rollback criteria

Any individual gap-close can be reverted if:
- It breaks the gauntlet (tests, bench gate, or feedback:verify fail).
- It introduces API surface instability that can't be justified in an ADR.
- It creates more cast sites than it eliminates.

The spec is additive; nothing here is irreversible.

---

## 7. Out of scope (Phase C preview)

**Phase C — Astro-primary-vs-invest framing decision:** deferred to separate spec after Phase A + B ship and `flex:verify` is reporting 10/10.

Reasoning:
- Framing/scope decision, not a code-correctness gap. Doesn't affect whether 10/10 is earned by the rating criteria — only affects project presentation.
- Better inputs after A+B: accurate current API docs, observations from Phase B touching Edge/Remotion, clean state to design against.
- Two forks (demote-and-frame vs. invest-to-parity) each need their own small spec; which one is chosen requires its own brainstorm.

**Placeholder:** `docs/adr/README.md` will note `ADR-0007 — Adapter vs peer framing (deferred)` as a known-upcoming slot.

### Other explicit non-goals for A+B

- New feature work. Strictly gap-closing.
- Dependency upgrades beyond what's needed for TypeDoc/ESLint plugin installs. Effect stays at 4.0.0-beta.32.
- Rust crate changes. `crates/czap-compute/` untouched.
- CI provider restructure. `ci.yml` gets only the `flex:verify` addition via `gauntlet:full`.

---

## 8. Appendix — implementation file list (informational, not exhaustive)

**New files:**
- `packages/core/src/tuple.ts`
- `docs/adr/README.md`
- `docs/adr/0000-template.md`
- `docs/adr/0001-namespace-pattern.md`
- `docs/adr/0002-zero-alloc.md`
- `docs/adr/0003-content-addressing.md`
- `docs/adr/0004-plan-coordinator.md`
- `docs/adr/0005-effect-boundary.md`
- `docs/adr/0006-compiler-dispatch.md`
- `docs/api/**/*.md` (TypeDoc-generated)
- `typedoc.json`
- `scripts/flex-verify.ts`

**Modified files (non-exhaustive):**
- `packages/core/src/cell.ts`, `derived.ts`, `boundary.ts`, `typed-ref.ts`, `wasm-dispatch.ts`, `signal.ts`
- `packages/compiler/src/dispatch.ts`
- `packages/web/src/stream/sse.ts`, `llm-adapter.ts`, `slot/registry.ts`
- `packages/edge/src/kv-cache.ts`
- `packages/astro/src/runtime/llm.ts`, `globals.ts`
- `packages/vite/src/plugin.ts`
- `packages/worker/src/compositor-startup.ts`
- `tests/bench/directive.bench.ts`
- `vitest.config.ts`
- `eslint.config.js`
- `package.json` (new scripts + dev deps)
- `docs/ARCHITECTURE.md` (refactor to index)
- `docs/STATUS.md` (record structural floors if any)

**Deleted files:**
- `docs/RENDER-RUNTIME.md` (after content-parity audit)

---

## 9. Next step

After user approval of this spec: invoke `superpowers:writing-plans` to produce the ordered implementation plan with review checkpoints.
