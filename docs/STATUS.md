# LiteShip — status and remaining work

Last updated: 2026-05-07

Coverage stack standardized on Vitest 4.1.2 + Playwright browser mode.
Current node lane: run `pnpm test` for the fresh pass/fail and file-count truth.
Current browser lane: shared-runtime suites run against a Chromium + Firefox + WebKit matrix, with capability-specific browser tests remaining Chromium-first where the platform surface is intentionally non-uniform.

Product naming for prose elsewhere: [GLOSSARY.md](./GLOSSARY.md). Tables below stay operational. Identifiers like `host-wired` and `pnpm exec czap` are literal gate vocabulary, not marketing rename targets.

Current first-class support target:

- Node 22 + pnpm 10
- Vite 8 + Astro 6
- Windows + Linux
- PowerShell + bash
- Chromium + Firefox + WebKit shared-runtime browser lane
- Chromium-first capability coverage where browser APIs are intentionally not uniform, including WebCodecs capture

Current security/default-trust posture:

- runtime endpoints are same-origin by default
- cross-origin runtime endpoints require an explicit allowlist policy
- artifact ids are path-segment validated
- LLM rendering defaults to text-safe behavior
- stream and LLM HTML flows route through shared `text` / `sanitized-html` / explicit `trusted-html` trust surfaces
- morph parsing strips executable markup classes
- boundary state writes default to `--czap-*`, `aria-*`, and `role`
- theme compilation rejects unsafe prefixes and CSS-breaking token values
- `__CZAP_DETECT__` is a frozen, non-enumerable, minimal runtime snapshot rather than a writable probe dump
- `__CZAP_RUNTIME_POLICY__` is a frozen, non-enumerable runtime trust snapshot for endpoint and HTML policy decisions

Current browser-security posture:

- runtime code avoids `eval` and `new Function`
- strict CSP currently requires host-provided hashes or nonces for Astro-injected bootstrap scripts
- Trusted Types are not auto-installed by LiteShip; hosts that enforce them should keep HTML sinks routed through the shared runtime trust surfaces

---

## Gates

| Gate                        | Result                                                  | Shell              |
| --------------------------- | ------------------------------------------------------- | ------------------ |
| `pnpm install`              | passes                                                  | PowerShell + bash  |
| `pnpm run build`            | green                                                   | any                |
| `pnpm run lint`             | green, zero errors, zero warnings (`--max-warnings 0`) | any                |
| `pnpm run typecheck`        | green, package graph plus workflow-critical `scripts/**/*.ts` | any          |
| `pnpm run typecheck:scripts` | green, standalone script lane for CI/runtime tooling    | any                |
| `pnpm run typecheck:spine`  | green                                                   | any                |
| `pnpm run check`            | green                                                   | any                |
| `pnpm test`                 | green, see fresh local Vitest output for current counts | any                |
| `pnpm run test:vite`        | green                                                   | PowerShell + bash  |
| `pnpm run test:astro`       | green                                                   | PowerShell + bash  |
| `pnpm run test:tailwind`    | green                                                   | PowerShell + bash  |
| `pnpm run test:e2e`         | green, `retries: 0`                                     | any                |
| `pnpm run test:e2e:stress`  | green, 10x repeated WebCodecs capture run               | any                |
| `pnpm run test:e2e:stream-stress` | green, 10x repeated stream reconnect / retarget run | any                |
| `pnpm run test:flake`       | green, repeated scheduler / stream / worker-sensitive suites; browser repeat pass defaults to Chromium unless `CZAP_VITEST_BROWSERS` is set | any           |
| `pnpm run test:redteam`     | green, dedicated negative trust-boundary regression lane | any               |
| `pnpm run bench`            | green                                                   | any                |
| `pnpm run bench:gate`       | green, replicated statistical gate                      | any                |
| `pnpm run bench:reality`    | green, browser cold-start evidence artifact             | any                |
| `pnpm run package:smoke`    | green, pack/install/export smoke for all 15 publishable `@czap/*` scopes | any           |
| `pnpm run coverage:node`    | green, v8 coverage output                               | any                |
| `pnpm run coverage:browser` | green, Vitest browser mode with Chromium-only coverage collection (matrix correctness runs separately) | any |
| `pnpm run coverage:merge`   | green, merged thresholds enforced                       | any                |
| `pnpm run report:runtime-seams` | green, writes local `reports/runtime-seams.json` + `.md`  | any          |
| `pnpm run feedback:verify`  | green, fail-closed provenance and contradiction check   | any                |
| `pnpm run audit`            | green, advisory-first audit backed by verified artifacts | any               |
| `pnpm run report:satellite-scan` | green, writes local `reports/satellite-scan.json` + `.md` | any         |
| `pnpm run runtime:gate`     | green, final fail-closed telemetry enforcement            | any                |
| `pnpm run gauntlet:full`    | canonical full sequential gauntlet                      | any                |
| `pnpm run capsule:compile`  | green, emits reports/capsule-manifest.json + .czap/generated/mcp-manifest.json | any |
| `pnpm run capsule:verify`   | green, runs all generated tests + benches               | any                |
| `pnpm exec czap describe`   | green, emits JSON schema of catalog + commands          | any                |
| `pnpm exec czap mcp`        | runs indefinitely on stdio; MCP tools/list + tools/call | any                |

`pnpm run coverage:merge` is the source of truth for threshold enforcement.
It seeds missing runtime files, merges node + browser lanes, and hard-fails if
merged totals or per-package totals drop below the configured thresholds.
It now also writes `coverage/coverage-meta.json`, which fingerprints the merged
coverage artifact, records the active include/exclude policy, and snapshots the
zero/missing-runtime file counts used by downstream feedback checks.

### Coverage timing (2026-04-23)

- `coverage:browser` runs in ~10s locally on current hardware once the Vite
  browser dep cache is warm. Earlier gauntlet logs showed ~19 minutes; that
  cost reflected cold `node_modules/.vite-browser` + multi-browser optimizer
  churn rather than real test wall time. With the persistent cache dir and
  the existing `coverageEnabled ? 'chromium' : ...` matrix clamp, the browser
  lane is already at its structural floor -- further reductions would require
  skipping real browser semantics (DOM, Canvas, Worker, AudioWorklet paths),
  which we reject because those paths are the reason the browser lane exists.
- `coverage:browser` now drops the `html` and `lcov` reporters when
  `process.env.CI` is unset, so local runs write only the merge-critical
  `coverage-final.json` plus the console `text` report. CI keeps the full
  reporter set so drill-down HTML and lcov uploads remain available.
- `coverage:merge` wall time is dominated by `coverage:node` (~40s) plus the
  `coverage:browser` pass. Node lane cost is driven by real test execution
  across 135 files; no per-file shard reduced it meaningfully when we tried.

`pnpm run report:runtime-seams` must run after a fresh `pnpm run coverage:merge`.
If the seam report reads stale merged coverage, the hotspot story is wrong even
when the code is fine. This ordering is required and enforced by the gauntlet
sequence, not optional.

`pnpm run bench:gate` writes `benchmarks/directive-gate.json`, evaluates
median overhead across five replicates, and only fails a hard-gated pair when
the regression is both above threshold and stable across replicates. The JSON
artifact now includes a top-level summary and an explicit `workerGateDecision`
record showing whether the normalized worker pair is promoted and why. It also
records worker startup seam shares plus LLM steady-state early-warning signals
so tail drift and scaling drift show up as explainable telemetry instead of one
scary percentage.

`pnpm run bench` now persists raw replicate data to
`benchmarks/directive-bench.json`, keyed by the same source + environment
fingerprint used elsewhere. `pnpm run bench:gate` reuses those samples when
the fingerprints match (same gauntlet run, no drift since `bench`), and only
falls back to running a fresh replicate pass when the cache is missing or
stale. The gate still runs across five replicates with identical
median/exceedance math; only the redundant second sampling pass is
eliminated. When the cache is honored, the `[bench-gate]` log line records
"Reusing replicates from benchmarks/directive-bench.json"; otherwise it
records the drift that triggered a fresh run.

`pnpm run feedback:verify` is the anti-lie step. It independently re-derives
coverage, bench, startup reality, runtime-seams, satellite-scan, and audit
truths, then hard-fails on stale fingerprints, impossible ordering, or
contradictory summaries. A report file existing is no longer enough to count
as truth.

`pnpm run bench:reality` is the browser startup evidence lane. It records cold
start envelopes, staged summaries, raw samples, and outliers in
`benchmarks/startup-reality.json`, but it is not the canonical startup verdict
by itself. Startup truth now comes from the verified synthesis in
`reports/runtime-seams.json`, which combines replicated shared-pair parity from
`bench:gate` with browser reality context from `bench:reality`.

`pnpm run report:satellite-scan` is the operator north-star report. It fuses
runtime-seams, audit, startup-reality, and coverage steering into one ranked
strike board. It is self-checking and is now validated by `feedback:verify` as
part of the fail-closed artifact chain.

Startup steering now follows a generic `paired-truth` model:

- replicated shared-pair startup parity from `bench:gate` is the primary gateable truth
- browser cold-start evidence from `bench:reality` is support context and envelope evidence
- `runtime-seams` is the verified synthesized startup truth
- `runtime:gate` is the final fail-closed enforcement step
- invalid measurements fail verification
- support-lane noise cannot become a top-level warning when the browser lane passes

## Current Watch Items

- `llm-runtime-steady` remains the main warm steady-state watch lane; it is diagnostic-only and should keep trending away from threshold flirtation.
- `worker-envelope` remains a transport watch lane; it is healthier than the broader worker startup seam, but still worth watching for avoidable wrapper tax.
- satellite hard-gate margin is a watch item when the pass is close enough to threshold that future runtime churn could erase headroom.
- `worker-runtime-startup` remains the loudest honest residual seam; it is diagnostic-only because shared startup parity is the gateable truth.
- raw bench formatter tone is an operator-experience watch item; the output should stay honest without implying release danger where the verified gate posture is green.
- partial pasted transcripts are not authoritative; fresh shell output plus verified artifacts are the source of truth.
- Capsule catalog closure -- any new assembly arm proposal must go through an ADR amendment with first concrete instance in the same PR (ADR-0008). Governance watch, not a bench watch.
- `ReceiptDAG.nodes` has no pruning, TTL, or max-size guard; per-session DAGs grow until `tracker.reset()` on session close. Bounded by user behavior in normal flows, but worth a future `linearizeFrom`-or-pruning policy if long-lived LLM sessions become common. Not a bench watch; a memory-shape watch.

`pnpm run gauntlet:full` is the canonical sequential order:

1. `pnpm run build`
2. `pnpm run capsule:compile`
3. `pnpm run typecheck`
4. `pnpm run lint`
5. `pnpm run docs:check`
6. `pnpm exec tsx scripts/check-invariants.ts`
7. `pnpm test`
8. `pnpm run coverage:browser` (background, overlaps phases 9-20)
9. `pnpm run test:vite`
10. `pnpm run test:astro`
11. `pnpm run test:tailwind`
12. `pnpm run test:e2e`
13. `pnpm run test:e2e:stress`
14. `pnpm run test:e2e:stream-stress`
15. `pnpm run test:flake`
16. `pnpm run test:redteam`
17. `pnpm run bench`
18. `pnpm run bench:gate`
19. `pnpm run bench:reality`
20. `pnpm run package:smoke`
21. `pnpm run coverage:node`
22. `pnpm run coverage:merge` (waits for background browser coverage)
23. `pnpm run report:runtime-seams`
24. `pnpm run audit`
25. `pnpm run report:satellite-scan`
26. `pnpm run feedback:verify`
27. `pnpm run runtime:gate`
28. `pnpm run capsule:verify`
29. `pnpm run flex:verify`

---

## Quality Policy

- Package source files do not use raw `console.*` for runtime boundary logging.
  Centralized diagnostics now flow through `@czap/core` `Diagnostics`.
- Diagnostics are typed (`level`, `source`, `code`, `message`, optional
  `cause`, optional `detail`) and testable via a swappable sink.
- `warnOnce` is the standard path for deduped capability and fallback notices.
- Lint is a hard architecture gate, not best-effort hygiene. Warnings are
  treated as debt and fail the repo gate.

---

## Runtime Wiring Model

Astro client directives are now lifecycle shells over shared runtime adapters.
The source of truth for runtime behavior is no longer embedded directive-local
logic.

| Classification | Package / Surface | Current status |
| -------------- | ----------------- | -------------- |
| `host-wired` | `@czap/astro` shared runtime adapters | `satellite`, `stream`, `llm`, `worker`, and `wasm` all route through `packages/astro/src/runtime/*` |
| `host-wired` | `@czap/web` DOM runtime | Astro stream + LLM paths use shared `SSE`, `Resumption`, `Morph`, `SlotRegistry`, and `LLMAdapter` |
| `host-wired` | `@czap/worker` | Astro worker directive now uses `WorkerHost` rather than inline Blob worker protocol |
| `host-wired` | `@czap/core` runtime coordination + WASM / GenUI surfaces | Compositor and worker host paths now expose shared `RuntimeCoordinator` state; Astro wasm uses `WASMDispatch`; Astro llm uses `TokenBuffer`, `UIQuality`, `GenFrame`, `Receipt`, and `DAG`-ordered replay plumbing |
| `host-wired` | `@czap/vite` wasm asset path | `virtual:czap/wasm-url` is wired into the real plugin/integration path |
| `host-wired` | `@czap/edge` request + cache/theme host path | Astro middleware now routes through `createEdgeHostAdapter`, which resolves `ClientHints`, `EdgeTier`, `compileTheme`, and `createBoundaryCache` in one host path |
| `standalone subsystem` | `@czap/remotion` | supported video branch, not part of the default Astro/Web runtime path |
| `host-wired` | `@czap/core` `Plan` / `ECS` | promoted through `RuntimeCoordinator`; the compositor and worker host paths now use a real plan graph plus ECS-backed dense stores for runtime bookkeeping |

---

## Coverage Snapshot

Latest merged coverage (`pnpm run coverage:merge`):

- read `coverage/coverage-final.json` and `coverage/coverage-meta.json` for the fresh merged totals and policy fingerprint
- `tests/generated/` is a tracked test source contributed by `capsule:compile`; generated property tests and benches are included in the merged coverage totals

## Runtime Steering

Use `pnpm run report:runtime-seams` after intentional runtime/coverage waves.
It summarizes the real next work instead of relying on memory or stale notes.
The seams report is now a derived report backed by provenance checks against
coverage + bench artifacts, not a standalone truth source.

Use `pnpm run report:satellite-scan` when the question is bigger than one seam.
The scan now ranks strikes by startup impact, browser-vs-proxy divergence,
branch-hotspot overlap, and feedback confidence instead of just raw overhead.

Current steering artifacts:

- local `reports/runtime-seams.json`
- local `reports/runtime-seams.md`
- local `reports/satellite-scan.json`
- local `reports/satellite-scan.md`
- `coverage/coverage-meta.json`
- `benchmarks/startup-reality.json`

`reports/` artifacts are generated per run and are intentionally local now.
They are still fail-closed telemetry inputs, but they are no longer a tracked
source of repo history. When you need the latest hotspot or strike-board story,
regenerate them from the current tree instead of trusting an old diff.

Fresh local guidance now comes from verified generated reports rather than a
hardcoded ledger in this file. After a clean sequential gauntlet:

- read `reports/codebase-audit.json` for the current advisory counts and aggregate score
- read `reports/runtime-seams.json` for the current paired-truth statuses and startup seam story
- read `reports/satellite-scan.json` for the current runtime warning summary and ranked strike board
- `reports/` is git-ignored local telemetry, so a fresh gauntlet should not
  leave tracked report churn behind

Current browser startup evidence from `bench:reality`:

- worker cold start median: see fresh local `benchmarks/startup-reality.json`
- worker cold start p99: see fresh local `benchmarks/startup-reality.json`
- llm simple cold start envelope: see fresh local `benchmarks/startup-reality.json`
- llm promoted cold start envelope: see fresh local `benchmarks/startup-reality.json`

Current worker startup steering from fresh local runtime seams:

- `worker-runtime-startup` remains a broad continuity diagnostic, not a gate
- `worker-runtime-startup-shared` is the primary shared-parity read; use fresh
  local artifacts for the current status instead of this file
- `worker-runtime-startup-seam` is the honest residual note for off-thread handoff cost
- runtime seams now emits `messageReceiptSharePct`, `dispatchSendSharePct`,
  `sharedResidualSharePct`, seam-to-browser-startup ratio, and a seam tail ratio
- the dominant remaining worker startup seam stage should be read from fresh
  local `reports/runtime-seams.json`, not from this file
- worker shared startup parity status: read from fresh local `reports/runtime-seams.json`
- llm simple startup paired truth status: read from fresh local `reports/runtime-seams.json`
- llm promoted startup paired truth status: read from fresh local `reports/runtime-seams.json`

Current LLM steady-state steering from fresh local runtime seams:

- `llm-runtime-steady` remains diagnostic-only unless a future policy change promotes it
- bench artifacts now emit replicate exceedance rate plus directive-to-baseline
  `p75` / `p99` ratios
- long text-session slope and mixed text/tool-session slope are now first-class
  early-warning signals for scheduler drift and buffering churn
- if mixed-session slope rises materially faster than long-text slope, investigate
  tool-call delta normalization or flush churn before touching parser internals

Current advisory audit headline:

- read fresh local `reports/codebase-audit.json` for the current errors / warnings / info / suppressed counts
- runtime seams, audit, satellite scan, feedback verification, and `runtime:gate` should agree on the current source fingerprint and gauntlet run id

The advisory audit is also now a derived report, not an oracle. If runtime-seams
provenance fails, the audit is expected to accuse the telemetry chain first and
mark the supporting artifact as failed instead of quietly treating it as present.

Current satellite scan blind spots:

- worker browser startup tail remains a watch item, but the current fresh p99
  should be read from local `benchmarks/startup-reality.json` rather than
  trusting a hardcoded number here
- worker startup residual should now be read through the early-warning lens in
  `reports/runtime-seams.md`: shared bootstrap drift vs off-thread handoff
  pressure vs host callback congestion
- current local merged hotspot cluster is `packages/vite/src/style-transform.ts`,
  `packages/core/src/signal.ts`, `packages/quantizer/src/animated-quantizer.ts`,
  `packages/vite/src/plugin.ts`, `packages/compiler/src/ai-manifest.ts`,
  `packages/worker/src/compositor-worker.ts`, `packages/astro/src/runtime/worker.ts`,
  `packages/astro/src/runtime/stream.ts`, `packages/astro/src/headers.ts`,
  and `packages/astro/src/runtime/receipt-chain.ts`
- hard-gated bench lanes remain `watch` rather than `fail`, with replicate
  spread and canary context recorded in the verified artifacts
- audit warnings cleared; remaining blind spots are telemetry watch notes, not
  active audit findings
- the exact ranked hotspot list should be read from fresh local
  `reports/satellite-scan.md` and `reports/satellite-scan.json` outputs

Worker startup early-warning trigger:

- do not jump to SAB/shared-memory transport from one noisy run
- if `worker-runtime-startup-seam.absoluteMeanNs > 10000` and
  `messageReceiptSharePct >= 60` for two consecutive verified runs, open a
  separate transport architecture evaluation
- use fresh `reports/runtime-seams.*` and `reports/satellite-scan.*` outputs
  for the current evidence trail instead of hardcoding a verdict here

Explicit runtime coverage exclusions now live in `vitest.shared.ts` and are
limited to barrels plus runtime-unexecutable/type-only files:

- `packages/core/src/capture.ts`
- `packages/core/src/protocol.ts`
- `packages/core/src/quantizer-types.ts`
- `packages/core/src/type-utils.ts`
- `packages/web/src/lite.ts`
- `packages/web/src/types.ts`

Merged thresholds currently enforced:

- totals: `90 / 80 / 90 / 90` for statements / branches / functions / lines
- per package: `85 / 75 / 85 / 85`
- missing non-excluded runtime files are treated as `0%` during merge

---

## Benchmark Gate

- Bench pairs run against shared production/runtime helpers, not benchmark-only
  duplicate logic.
- The `stream` directive benchmark reuses `@czap/web` `SSE.parseMessage()`
  instead of a local parser copy.
- Hard-gated pairs: `satellite`, `stream`, `llm`, `worker`,
  `llm-startup-shared`, `llm-promoted-startup-shared`,
  `worker-runtime-startup-shared`
- Diagnostic-only pairs: `worker-envelope`, `llm-runtime-steady`,
  `edge-request`, `worker-runtime-startup`, `worker-runtime-steady`
- Browser startup evidence lane: `benchmarks/startup-reality.json` records real
  browser worker and llm cold-start timings, staged summaries, raw samples,
  top outliers, timer-floor metadata for sub-resolution llm slices, p75/p95/p99
  budgets, and divergence from the Node proxy without promoting timer-quantized
  slices into top-level truth
- Canary tasks now live in the directive bench config to surface harness noise
  instead of silently absorbing it
- The bench artifact now also records a worker startup breakdown so we can see
  `claim-or-create`, `coordinator-reset-or-create`, `listener-bind`,
  `quantizer-bootstrap`, `request-compute`, `state-delivery`, and `dispose`
  costs without promoting those subphases into top-level warnings.
- The bench/report chain now also splits worker startup meaning explicitly:
  `worker-runtime-startup` remains the broad continuity envelope,
  `worker-runtime-startup-shared` measures comparable startup work as a real
  hard-gated parity slice, and `worker-runtime-startup-seam` records the
  worker-only residual as absolute time first and derived percent second.
- The Astro worker directive now uses host-authoritative resolved state for
  visible startup and hysteresis-sensitive updates; the worker mirrors that
  resolved state and acknowledges agreement instead of being the source of
  truth for first paint.
- Worker startup artifacts now also carry `visible-first-paint` and
  `worker-takeover-seam` timings so the bench warning reflects handoff cost
  rather than first visible state latency.
- The broader diagnostic pairs measure shared runtime boundaries, not just
  parser or serialization leaf work.
- `worker-runtime-startup` is now an honest Node-side host bootstrap support
  lane (`WorkerHost.create()` / first update flush / first compute), and its
  async shim no longer produces negative `state-delivery`.
- LLM startup paired truth now reads matched shared slices from
  `reports/runtime-seams.json` rather than broad envelope timings.
- Browser startup budgets are enforced through `feedback:verify`; support lanes
  can only fail the chain when they become invalid measurements.
- `CompositorWorker` now reuses a cached inline worker script URL, so repeated
  host construction no longer recompiles the same Blob URL on every create.
- Failure rule: median overhead exceeds threshold and at least `4/5` replicates
  exceed threshold
- Artifact: `benchmarks/directive-gate.json` includes per-replicate raw inputs,
  aggregate decision data, `runtimeClass`, `workerGateDecision`, and final
  pass/fail reasoning

---

## Done — Spec 1.1 Hardening via Flex (2026-04-24)

11 audit findings closed by turning each bug into a reusable kernel:

- **CanonicalCbor encoder** (`core.canonical-cbor`) — RFC 8949 §4.2.1
  honored in code; ADR-0003 graduates from aspiration to spec.
- **Type-directed AST walker** — `cachedProjection` arm went from 0
  to 2 real manifest instances; factory-wrapped capsules detected.
- **Phantom-kinded TrackId** — `TrackId<K>` brands cross-kind refs
  as compile-time errors; `typecheck:tests` gauntlet step added.
- **VitestRunner capsule** — three execSync sites retrofitted; argv
  spawn closes RCE surface; Windows cmd.exe quoting drift-guarded.
- **RIFF walker + WAV decoder** — `examples/scenes/intro-bed.wav` now
  decodes cleanly; `intro-bed:wav-metadata` reads INAM/IART/IBPM.
- **SceneRuntime capsule** — worlds actually tick; ADR-0009's ECS-
  as-substrate claim no longer theatrical.
- **JsonRpcServer kernel** — JSON-RPC 2.0 conformance; 35 §6/§7
  examples transcribed as tests; -32700/-32600/-32601/-32602/-32603
  emitted correctly; notifications no longer get responses.
- **Real generative property tests** — vacuous `() => true` tests
  replaced with `fc.property` over schema-derived arbitraries OR
  honest `it.skip` with TODO when no run handler is **set**.
- **Beat-binding sceneComposition** — BeatMarkerProjection output
  reaches SyncSystem via pure ECS data flow; no closure sidecar.
- **Scoped SceneContext** — `Scene.subscene(parent, partial)` fills
  missing bpm/fps from parent.
- **Self-describing CLI describe** — drift-guard test asserts every
  dispatch verb appears in describe output.

E2E reference render verified (intro-bed scene compiles, ticks, and
emits stable mix receipts end-to-end through the SceneRuntime).

## Decided (Closed)

### B.1: DECIDED -- examples/remotion-demo is standalone

`examples/remotion-demo` is excluded from both workspaces and tsconfig.
It's a standalone demo requiring its own `cd examples/remotion-demo && pnpm install`.
Documented in README.

### B.2: DECIDED -- Node/PNPM wrappers are the supported feedback loop

**Fix applied**:

- Root scripts now run through `pnpm`, `tsx`, and `vitest` directly.
- `scripts/test-vite.ts`, `test-astro.ts`, and `test-tailwind.ts` import by
  `pathToFileURL()` so Windows paths work under ESM.
- `tests/integration/*/test.ts` and `scripts/test-e2e.ts` use `spawn(..., { shell: false })`
  and switch to `pnpm.cmd` automatically on Windows.
- Root `prepare` now uses `scripts/link-pre-commit.ts`, so `pnpm install` is
  non-failing on PowerShell and Linux.
- `scripts/check-invariants.ts` is pure Node and no longer shells out to `grep`.

### B.3: RESOLVED

~~Comment `fx.components` in style-css.ts:5~~ -- fixed to `czap.components`.

---

## Known Limitations

### B.4: Browser coverage is partial, not complete

The Playwright-backed browser lane now covers:

- slot registry DOM scanning and mutation observation
- physical capture / restore behavior
- audio processor bootstrapping
- capture pipeline rendering
- worker / wasm / gpu directive happy paths
- stream directive reconnect / morph behavior
- llm directive tiering / tool-call / reconnect behavior
- stream reconnect / retarget stress behavior
- detect preference and fallback browser probes

The shared-runtime browser lane now runs as a browser matrix. Capability-specific
paths are still allowed to stay Chromium-first when the browser API itself is
non-uniform, but correctness/fallback behavior is expected across Chromium,
Firefox, and WebKit.

Remaining browser-level gaps still exist in:

- deeper `satellite.ts` timing / attribute-mutation edges
- deeper morph / semantic remap edge cases beyond the current reorder / swap / retarget coverage

The host seams that used to be directive-local are now shared-runtime seams,
which means the browser lane is measuring the real host path rather than a set
of per-directive one-offs.

### B.5: Remaining branch hotspots

Most packages now clear the enforced gate, but the following areas still have
less margin than the rest of the repo and are the right place to buy future
stability:

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

### B.6: Browser capture stress remains worth keeping

WebCodecs capture is now part of the main gate with `retries: 0`, and
`pnpm run test:e2e:stress` gives us a repeat-each feedback loop to catch future
browser regressions early. The current harness passed 10 repeated capture runs
cleanly, but this remains the most platform-sensitive path in the repo and is
worth keeping under stress coverage.

### B.7: Virtual module stubs (by design, not a gap)

`virtual-modules.ts` returns `export const tokens = {}` etc. This is
intentional: transform pipeline replaces @token/@theme blocks inline in CSS files.
Stubs exist for explicit `import 'virtual:czap/tokens'` use (type-checker/bundler
happy path). Documented in JSDoc.

---

## Extraction Checklist (Definition of Done)

### 1. Fresh clone installs cleanly

`git clone <czap-repo> && cd czap && pnpm install` must succeed with zero
parent-repo assumptions. No paths that reach outside the repo root.

### 2. Root gates stay green

`tsc --build --force` and `pnpm test` must both pass on a fresh clone.

### 3. Shell matrix -- DECIDED

PowerShell and bash are both supported for the root feedback-loop commands.
CI still runs in a Unix-like environment, but wrapper scripts in `scripts/*.ts`
normalize cross-platform invocation so local development is not shell-fragile.

### 4. examples/remotion-demo -- DECIDED

Excluded from workspace and tsconfig. Documented as standalone example
requiring its own `cd examples/remotion-demo && pnpm install`.

### 5. Release model for packages

Packages are publish-shaped and tarball-smoke-tested. The repo still dogfoods
through `workspace:*` links until each external npm cut.

- package surfaces, `dist/` outputs, export maps, and type entrypoints must
  stay release-ready
- `package:smoke` is required proof for every publishable `@czap/*` scope
  (15 packages, including type-only `@czap/_spine`)
- external publishing remains a deliberate release decision, not an accidental
  side effect of package shape

---

## Future Work

### Medium priority (can schedule)

| ID  | Task                          | Scope                                                          |
| --- | ----------------------------- | -------------------------------------------------------------- |
| F.3 | `brands.ts` runtime tests     | Minimal -- brand constructors + `brand()` factory              |
| F.4 | Merge gate ratchet-up         | Raise totals beyond `94.08 / 84.81 / 93.78 / 95.24` as remaining runtime files close |
| F.5 | Runtime seam hotspot lift     | Use `reports/runtime-seams.md` to target the next real branch/perf hotspots |
| F.6 | `webcodecs.ts` browser tests  | Move current mocked-node coverage into a real browser lane |

### Low priority (can stay as-is indefinitely)

| ID  | Task                             | Notes                                                            |
| --- | -------------------------------- | ---------------------------------------------------------------- |
| F.7 | `vite/src/hmr.ts` tests          | Browser-only, `document.querySelector` -- needs jsdom/Playwright |
| F.8 | `vite/src/environments.ts` tests | Internal, Vite environment config builder                        |
| F.9 | Capture stress cadence            | Keep `test:e2e:stress` in the toolbox for browser/runtime regressions |

---

## Completed Work Summary

### Phases 1-5: Render Runtime (2026-03-17)

| Phase                        | Items | Scope                                                                                                                                                          |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1: Conveyor Belt       | 8/8   | CompositorStatePool, DirtyFlags wiring, MotionTier gating, MemoCache, springToLinearCSS, FrameBudget priority lanes, SpeculativeEvaluator, microtask batching  |
| Phase 1.5: GenUI Pipeline    | 5/5   | TokenBuffer (jitter buffer + EMA), UIQuality (ABR tiers), GenFrame (I/P/B frames + receipt chain), LLMAdapter (provider-agnostic), gap resolution orchestrator |
| Phase 2: Edge Pipeline       | 4/4   | Client Hints parser (13 headers), EdgeTier detection + data-czap-\* attributes, KV boundary cache (content-addressed), per-tenant theme compilation            |
| Phase 3: Worker Architecture | 4/4   | SPSC lock-free ring buffer (SharedArrayBuffer), compositor worker (typed messages), VideoRenderer + OffscreenCanvas, main-thread host coordinator              |
| Phase 4: WASM Escape Hatch   | 3/3   | czap-compute Rust crate (#![no_std], C-ABI), WASMDispatch detection/loading, TypeScript fallback kernels                                                       |
| Phase 5: A/V Convergence     | 5/5   | AVBridge (atomic sample counter on SAB), Signal.audio() (sample/normalized), Scheduler.audioSync(), AVRenderer (deterministic offline), AudioWorklet processor |

### Phase 6 Waves (all verified green)

| Wave                       | Items               | Scope                                                                                                                                                                                                   |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 1: Showstoppers       | 6/6                 | WebCodecs sync, AnimatedQuantizer, Op.retry, Derived.flatten, Codec errors, receipt MAC                                                                                                                 |
| Wave 2: Ontological Rename | 3/3                 | `--fx-` -> `--czap-`, `data-fx-` -> `data-czap-`, `virtual:fx/` -> `virtual:czap/`                                                                                                                      |
| Wave 3: Almost-Correct     | 11/11               | Zap.debounce, Cell.all semaphore, Op.allSettled, Spring scaling, Animation duration, Compositor blend, Video scheduler, CSS inferSyntax, Plan.topoSort, Vite CSS parser, DOM diff + WGSL + ComponentCSS |
| Wave 4: Architectural      | 5/5                 | DAG multi-parent, LiveCell crossings + `makeBoundary`, CSS block overrides, HMR virtual module, test imports                                                                                            |
| Wave 5: Platform + Cleanup | 17 items            | HLC overflow, Boundary validation, Wire shutdown, SSE queue, resumption URL, restore try/catch, dead code removal, ARIA/WGSL fixes, bench setup                                                         |
| Wave 6: Test Coverage      | 15 files, 514 tests | 12 new test files from original wave + 3 new (store, typed-ref, live-cell)                                                                                                                              |

### Effect 4.0.0-beta.32 API Adjustments

- `Schedule.intersect` -> `Schedule.both` (intersection combinator)
- `Effect.makeSemaphore` -> `Semaphore.makeUnsafe(1)`
- `Effect.fork` -> `Effect.forkChild` / `Effect.forkScoped`
- `Stream.make` -> `Stream.succeed` (single-value stream)

### Unicode Cleanup

All em dashes and arrows replaced with ASCII across all source, test, demo,
spine, fixture, and documentation files.

### Repo Restructure (2026-03-17)

- Packages moved from root to `packages/`
- Tests moved from `test/` to `tests/` (unit/bench/e2e/integration)
- Demo moved from `demo/remotion` to `examples/remotion-demo`
- Docs moved to `docs/` (ARCHITECTURE.md, STATUS.md, plus the rest); `CHANGELOG.md` was subsequently moved back to the repo root
- Scripts extracted to `scripts/*.ts`
