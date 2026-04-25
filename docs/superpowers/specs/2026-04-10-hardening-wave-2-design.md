# Hardening Wave 2: Browser Coverage + Deep Performance Pass + Codebase Audit

**Date**: 2026-04-10
**Status**: Approved
**Approach**: Three-Track Parallel with Deep Optimization (3)

## Context

Gauntlet run on 2026-04-10 showed the repo in strong shape (2,193 tests, 98.98% statements, 99.79% branches, 0/0/0 audit, feedback:verify clean) but surfaced five weakness areas:

1. **Browser-only coverage at 29.2%** -- most code tested via Node mocks, not real browser APIs
2. **LLM steady-state overhead at ~23%** -- mixed text/tool session slope 2x pure-text slope
3. **Worker startup 60-90% overhead** -- concentrated in message-receipt IPC seam
4. **SSE invalid JSON path at 15.8us** -- try/catch around JSON.parse without pre-flight check
5. **Slow-flagged microsecond paths** -- satellite evaluate 2.3us, edge resolve 5us

Codex deep-read confirmed: no hidden systemic rot. Worker seam is 66% `state-delivery:message-receipt` (browser IPC), 27% `dispatch-send`, 5% shared residual. LLM slope split points to tool-delta scheduling churn, not parser cost.

## Architecture: Two-Track Parallel

### Track 1: Browser Coverage Expansion

**Goal**: Browser-only coverage from 29.2% to 60%+.

#### New Test Files (tests/browser/)

| File | Module Under Test | Browser APIs Exercised |
|------|-------------------|----------------------|
| `audio-processor.test.ts` | `web/src/audio/processor.ts` | AudioContext, AudioWorkletNode, SharedArrayBuffer, Atomics, port.postMessage |
| `webcodecs-capture.test.ts` | `web/src/capture/webcodecs.ts` | VideoEncoder, VideoFrame, EncodedVideoChunk, OffscreenCanvas |
| `sse-client.test.ts` | `web/src/stream/sse.ts` | EventSource, Effect streams, heartbeat timers, reconnection backoff |
| `spsc-ring-browser.test.ts` | `worker/src/spsc-ring.ts` | SharedArrayBuffer, Atomics (COOP/COEP context) |
| `render-worker.test.ts` | `worker/src/render-worker.ts` | OffscreenCanvas, Worker postMessage, requestAnimationFrame, transferControlToOffscreen |
| `morph-browser.test.ts` | `web/src/morph/hints.ts` + `semantic-id.ts` | Real DOM remap, MutationObserver, live element matching |
| `physical-restore.test.ts` | `web/src/physical/restore.ts` | Focus management, scrollTo, Selection API, IME compositionend |
| `slot-registry-browser.test.ts` | `web/src/slot/registry.ts` | MutationObserver, querySelectorAll, live DOM scanning |

#### Not in scope for browser tests
- `slot/addressing.ts` -- pure path manipulation, no browser APIs
- `morph/diff-pure.ts` -- pure logic, fully covered in Node

### Track 2: Deep Performance Optimization

#### 2A: SSE Pre-flight Check
- **File**: `packages/web/src/stream/sse-pure.ts`
- **Change**: Add `{`/`[` first-char check before `JSON.parse`, matching `llm.ts:firstMeaningfulCharCode()` pattern
- **Target**: Invalid JSON path from 15.8us to <2us

#### 2B: LLM Tool-Delta Scheduling Path
- **File**: `packages/astro/src/runtime/llm-session.ts`
- **Root cause**: `tool-call-start`/`tool-call-end` call `flushPendingText()` + `promoteFastLane()`, forcing runtime claim + token buffer reset + full scheduler activation on every tool boundary
- **Changes**:
  - Defer `promoteFastLane()` until first text chunk after tool boundary
  - Batch tool-call-delta normalization to avoid per-delta object allocation
  - Skip `flushPendingText()` when `queuedTextFragments` is already empty
- **Target**: Mixed-session slope from ~852ns to ~550-600ns per chunk (40-50% gap reduction)

#### 2C: Worker Transferable Objects
- **File**: `packages/worker/src/compositor-worker.ts` + `messages.ts`
- **Change**: Use `Transferable` arrays for threshold arrays in quantizer registration and numeric arrays in GLSL outputs
- **Constraint**: Only transfer fire-and-forget data (registration thresholds, per-cycle GLSL arrays)
- **Target**: `dispatch-send` from 1157.5ns to <1050ns

#### 2D: Satellite If-Chain for Small Arrays
- **File**: `packages/core/src/boundary.ts`
- **Change**: Unrolled if-chain for `thresholds.length <= 4`, binary search for >4
- **Target**: Satellite evaluate from ~2.3us to ~1.5us

#### 2E: Lazy Quantizer Key Generation
- **File**: `packages/worker/src/compositor-worker.ts`
- **Change**: Defer CSS/GLSL/ARIA key generation from registration to first `compute()` call
- **Target**: 1-3% worker startup reduction, compounding with 2C

#### New Bench Gates

| Gate | Metric | Threshold | Type | Rationale |
|------|--------|-----------|------|-----------|
| SSE fast-reject | Invalid JSON parseMessage latency | 2us | Hard | Proves pre-flight check works; removal regresses to 15us |
| Mixed-session slope | mixedChunk / longSession ratio | 1.75x | Hard | Catches tool-delta scheduling regressions |
| Tool-delta throughput | tool-call-delta ingest rate | 1M ops/s | Hard | Catches LLMChunkNormalization weight gain |

#### Accepted Physics (Documented, Not Fixed)
- Worker `state-delivery:message-receipt` at 2907.5ns -- browser IPC scheduling, irreducible
- Worker `dispatch-send` baseline after transferables -- message posting cost, irreducible past ~900ns
- Full worker startup seam breakdown documented in STATUS.md

## Quality Standards

### Browser Test Requirements
- **Real APIs, not mocks** -- AudioContext with real worklet, not a spy. SharedArrayBuffer with real Atomics, not a stub.
- **Observable side effects** -- assert on output data, DOM state, buffer contents. Not that internal methods were called.
- **Deterministic** -- no timing-dependent assertions. Use `waitFor` with concrete conditions, not `setTimeout`. If async settling needed, wait for specific state change.
- **Real browser errors** -- SecurityError, NotSupportedError, AbortError from actual API misuse, not synthetic throws.

### Bench Gate Requirements
- **Statistical rigor** -- 5 replicates, median comparison, spread tracking. Match existing directive-suite pattern.
- **Hard vs diagnostic classification** -- hard gates fail the build for things we control. Diagnostics inform for browser-controlled costs.
- **Directive vs manual pairs** -- every gate has a baseline doing same logical work without framework layer. We measure our overhead, not V8's.
- **Canary protection** -- inherit existing integer-accumulator and JSON-encode canary benchmarks for environment drift detection.

### System-Wide Wiring
- New browser tests match existing `tests/browser/*.test.ts` glob in `vitest.browser.config.ts`
- New bench gates added to `scripts/bench/directive-suite.ts` pairs array AND `scripts/bench-gate.ts` gate definitions
- Coverage merge picks up browser coverage automatically via `coverage/browser/coverage-final.json`
- `report-runtime-seams.ts` updated if new metrics feed seam analysis
- `feedback-verify.ts` expected counts updated for new test files and bench pairs
- `report-satellite-scan.ts` inherits changes through fingerprint chain
- STATUS.md documents new gates, accepted physics, coverage expansion

### Track 3: Codebase & Test Suite Audit

**Goal**: Find and fix brittle tests, lazy implementations, half-assed hacks, and anything that slipped through code review. Trust nothing -- verify everything.

#### Phase 1: Thread-Pulling (12 Sonnet agents in parallel)

Each agent gets a focused search mandate. They report back threads -- suspicious patterns, not fixes.

| Agent | Hunt Mandate |
|-------|-------------|
| S1 | **Brittle time-dependent tests** -- find tests using setTimeout, Date.now, performance.now, or timing assertions that could flake under load |
| S2 | **Mock fidelity gaps** -- find mocks/stubs that don't match the real API signature, or mocks that skip error paths the real API can throw |
| S3 | **Assertion weakness** -- find tests with no assertions, single weak assertions (toBeTruthy on complex objects), or tests that pass when the feature is broken |
| S4 | **Copy-paste test smell** -- find duplicated test logic that should be shared fixtures, or tests that test the same thing with different names |
| S5 | **Hardcoded magic numbers** -- find unexplained numeric literals in source code (not tests) that should be named constants or derived from config |
| S6 | **Error swallowing** -- find catch blocks that silently discard errors, empty catch, or catch-and-return-null without logging |
| S7 | **Type assertion abuse** -- find `as any`, `as unknown as X`, `!` non-null assertions that bypass real type safety, especially on hot paths |
| S8 | **Dead code & unreachable branches** -- find code that coverage says is hit but logic analysis shows can never execute, or exports nothing imports |
| S9 | **Incomplete cleanup** -- find tests missing afterEach/afterAll cleanup, leaked event listeners, unclosed resources, or global state mutation without reset |
| S10 | **Boundary condition gaps** -- find functions that handle the happy path but skip empty arrays, zero values, negative numbers, NaN, or MAX_SAFE_INTEGER |
| S11 | **Inconsistent error handling patterns** -- find places where similar operations handle errors differently (some throw, some return null, some log) |
| S12 | **Stale comments & misleading docs** -- find comments that describe behavior the code no longer has, or TODO/FIXME/HACK/XXX markers |

#### Phase 2: Deep Investigation (4 Opus agents)

After all 12 Sonnet agents report back, cluster the threads into 4 investigation areas. Each Opus agent gets the relevant Sonnet findings and does a deep dive:

| Agent | Investigation Area |
|-------|-------------------|
| O1 | **Test integrity** -- S1 + S3 + S4 + S9 findings. Determine which tests are actually brittle/useless, propose fixes or replacements |
| O2 | **Mock & stub fidelity** -- S2 + S6 + S11 findings. Determine where mock divergence could hide real bugs, propose corrections |
| O3 | **Code quality & type safety** -- S5 + S7 + S8 + S12 findings. Determine which shortcuts are tech debt vs acceptable pragmatism, propose fixes for the real debt |
| O4 | **Boundary robustness** -- S10 findings + any edge cases surfaced by other agents. Determine which boundary gaps are exploitable, propose hardening |

#### Phase 3: Remediation (Audit Complete — Results Below)

**Stats**: 166 findings from 12 Sonnets, 55 HIGH investigated by 4 Opus agents. 1 production bug, 1 security issue, ~15 important fixes, ~20 dismissed as acceptable pragmatism.

##### CRITICAL (fix immediately)

| Finding | File | Fix |
|---------|------|-----|
| render-worker evaluateThresholds off-by-one | `worker/src/render-worker.ts:95` | Change `states[Math.min(i+1, ...)]` to `states[i]` — returns wrong state (one tier too high) |
| receipt HMAC hex parsing silent corruption | `core/src/receipt.ts:377` | Validate hex format (`/^[0-9a-fA-F]+$/`) before `parseInt` — whitespace zeroes signature bytes |

##### IMPORTANT (fix in this wave)

| Finding | File | Fix |
|---------|------|-----|
| frame-budget if-guarded assertions | `tests/unit/frame-budget.test.ts:87-107` | Remove if-guards, assert precondition unconditionally |
| Object.defineProperty cleanup gap (systemic) | `tests/helpers/define-property-stub.ts` (NEW) | Create shared `definePropertyStub` + `createStubRegistry` helper |
| 17+ Object.defineProperty leaks | `tests/unit/astro-runtime-branches.test.ts` | Replace with `stubs.define()` + `stubs.restoreAll()` in afterEach |
| 3 Object.defineProperty leaks | `tests/unit/astro-directive-branches.test.ts` | Same pattern |
| crossOriginIsolated leak | `tests/unit/astro-directives.test.ts:586` | Restore via stub helper |
| Missing vi.unstubAllGlobals | `tests/component/compositor-worker.test.ts` afterEach | Add `vi.unstubAllGlobals()` |
| 16x runScoped copies | 16 test files | Replace with import from `tests/helpers/effect-test.js` |
| 14x Worker stub pattern | `tests/unit/astro-runtime-branches.test.ts` | Extract `stubWorkerEnvironment()` helper |
| WASM load: no Diagnostics call | `astro/src/runtime/wasm.ts:52-61` | Add `Diagnostics.warn` alongside existing CustomEvent |
| detect-upgrade bare catch | `astro/src/detect-upgrade.ts:97` | Add `data-czap-tier-probe-error` DOM breadcrumb |
| easing.ts div-by-zero | `core/src/easing.ts` spring/springNaturalDuration | Validate stiffness>0, mass>0 at construction |
| av-bridge.ts div-by-zero | `core/src/av-bridge.ts:72` | Validate sampleRate>0, fps>0 at construction |
| frame-budget.ts targetFps=0 | `core/src/frame-budget.ts:54` | Validate targetFps>0 at construction |
| spsc-ring.ts attach* skip validation | `worker/src/spsc-ring.ts` _makeRing | Move validation into _makeRing (covers all call sites) |
| resumption.ts unchecked network casts | `web/src/stream/resumption.ts:88,218,264` | Add Schema validation for network/storage data |
| SHA-256 comment is false | `core/src/boundary.ts:38-39` | Rewrite to reflect FNV-1a reality |
| Pool capacity 64 vs 8 divergence | `worker/src/compositor-worker.ts:950` | Document or align with defaults.ts |
| WGSL "not implemented" misleading | `astro/src/runtime/gpu.ts:84` | Clarify WGSLCompiler exists, directive not wired |

##### NICE-TO-HAVE (track for later)

- GPU uniform `catch { /* ignore */ }` → use `Diagnostics.warnOnce`
- Dead dirty flags (`packetRegistrationsDirty`/`updatesDirty`) removal
- "FX" prefix in generated GLSL/WGSL shader comments → rename to "czap"
- `stream.ts:40` `as never` → `as string`
- speculative.ts confidence weights → extract to named constants
- Boundary fixture 48x inline → extract to file-level constant
- createRepo() 3x copy → extract to shared helper
- CLAUDE.md "716 tests, 40 files" → update to current counts

##### Dismissed as Acceptable Pragmatism

- All 5 HIGH mock fidelity gaps (mocks scoped to tested behavior)
- Slot path parse/scan dual contract (intentional design)
- CPU spin-loop in frame-budget test (deterministic)
- `not.toThrow()` on dispose/resilience tests (that IS the assertion)
- isCell/isDerived/isZap/isWire exports (public API surface)
- appendText fallback (defensive, harmless)
- wasm-dispatch double cast (validated post-cast)
- compositor.ts `Map.get()!` assertions (structurally safe, single-threaded)
- Debug renderer magic numbers (debug-only code)
- BoundarySpec.isActive (deliberately staged rollout)

#### Quality Standard for Audit Fixes
- Every fix must be accompanied by a test that would have caught the original issue
- No "cleanup" that changes behavior without a test proving the old behavior was wrong
- Brittle test replacements must be proven deterministic (run 10x without flake)

## Convergence Verification

After all three tracks complete, run `pnpm run gauntlet:full` and verify:

1. All existing 2,193+ tests green
2. All new browser tests green
3. All existing bench gates pass
4. All new bench gates pass (SSE fast-reject, mixed-session slope, tool-delta throughput)
5. Browser-only coverage 60%+
6. Merged coverage stays 98%+
7. `feedback:verify` clean
8. Audit 0/0/0

### Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Browser-only coverage | 29.2% | 60%+ |
| SSE invalid JSON latency | 15.8us | <2us |
| Mixed-session slope ratio | 2.0x | <1.75x |
| Satellite evaluate | 2.3us | <1.6us |
| Worker dispatch-send | 1157.5ns | <1050ns |
| Hard bench gates | 4 | 7 |
| Browser test files | 3 | 11 |
| Browser tests | 16 | 80+ |
| Audit findings fixed | 0 | 2 CRITICAL + ~15 IMPORTANT |
| Production bugs found | 0 | 1 (render-worker off-by-one) |
| Security issues found | 0 | 1 (HMAC hex parsing) |

### Explicit Non-Goals
- No changing gauntlet order or verification chain structure
- No weakening existing thresholds
- Worker `message-receipt` stays as-is (browser physics)
- Track 3 audit fixes are scoped to real issues only -- no cosmetic cleanup
