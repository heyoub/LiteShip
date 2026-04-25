# Final QA Audit Report

Comprehensive code audit of the czap codebase covering: completeness, drift/almost-correctness, incoherence, abstraction bounds, test quality, architecture sanity, logic correctness, and brittleness.

**Methodology**: 6 parallel deep-dive audits across all 10 packages, tests, benchmarks, configs, and docs. Critical findings verified by direct source inspection.

---

## TIER 1: Bugs and Logic Errors (Fix Before Anything Else)

### 1.1 DEAD CODE: style.ts double throw (unreachable error)
**File**: `packages/core/src/style.ts:207-213`
```ts
if (!boundaryStates.includes(key)) {
  throw new Error(                    // <-- this fires
    `Style state "${key}" does not match boundary states...`
  );
  throw new CzapValidationError(      // <-- DEAD CODE, never executes
    'Style.make',
    `state "${key}" does not match boundary states...`
  );
}
```
**Problem**: The generic `Error` fires instead of `CzapValidationError`, breaking the codebase-wide error handling pattern. The CzapValidationError is unreachable.
**Fix**: Remove the generic Error throw, keep only CzapValidationError.

### 1.2 CACHE POISONING: quantizer output cache ignores springCSS
**File**: `packages/quantizer/src/quantizer.ts:148-178`
```ts
const cacheKey = `${configId}:${state as string}` as ContentAddress;
const cached = outputCache.get(cacheKey);
if (cached && !springCSS) return cached;    // skips cache read when springCSS present
// ...
if (target === 'css' && springCSS) {
  result[target] = { ...stateOutputs, '--czap-easing': springCSS };
}
// ...
outputCache.set(cacheKey, result);          // but WRITES the springCSS-injected result
```
**Problem**: When called WITH springCSS, it skips cache read but writes the springCSS-injected result. Next call WITHOUT springCSS returns the cached springCSS-polluted result.
**Fix**: Either include springCSS presence in the cache key, or only cache when `springCSS === null`.

### 1.3 FPS METER DRIFT: fpsAccum single-subtract instead of reset
**File**: `packages/core/src/frame-budget.ts:71-74`
```ts
if (fpsAccum >= 1000) {
  currentFps = Math.round((frameCount * 1000) / fpsAccum);
  frameCount = 0;
  fpsAccum -= 1000;  // <-- only subtracts 1000 once
}
```
**Problem**: If `fpsAccum` reaches 2500 (e.g., tab was backgrounded), subtracting 1000 once leaves 1500. Next frame immediately re-triggers the FPS calculation with a stale accumulator, causing FPS to jitter or report wrong values.
**Fix**: Use `fpsAccum %= 1000` or `while (fpsAccum >= 1000) { ... fpsAccum -= 1000; }`.

### 1.4 INTERPOLATION ASSUMES ZERO DEFAULT
**File**: `packages/core/src/interpolate.ts:24-28`
```ts
// Keys only in `to` (interpolate from implicit 0)
for (const key in to) {
  if (Object.prototype.hasOwnProperty.call(to, key) && !(key in result)) {
    result[key] = to[key]! * eased;  // interpolates FROM 0
  }
}
```
**Problem**: Properties present in `to` but not `from` interpolate from 0. For CSS properties like `scale` (default 1), `opacity` (default 1), or `rotate` (default 0deg as number), starting from 0 produces jarring visual artifacts. A `scale` going from "undefined" to 2 would interpolate 0->2 instead of 1->2.
**Fix**: Accept an optional `defaults` parameter, or document that callers must provide symmetric key sets.

### 1.5 SPECULATIVE EVALUATOR MAGIC CONSTANT
**File**: `packages/core/src/speculative.ts:130`
```ts
const predictedValue = nearest.direction === 'up'
  ? nearest.threshold + 0.001
  : nearest.threshold - 0.001;
```
**Problem**: Hardcoded `0.001` offset. If thresholds are very close together (e.g., 100.000, 100.001, 100.002 for fine-grained control), this offset could skip states. If thresholds are large (e.g., milliseconds 0-10000), the offset is negligible and may not actually cross into the next state when hysteresis is present.
**Fix**: Use a fraction of the minimum threshold gap, or the hysteresis half-width.

### 1.6 ANIMATED QUANTIZER USES Date.now() INSTEAD OF performance.now()
**File**: `packages/quantizer/src/animated-quantizer.ts:152-155`
```ts
const startTime = Date.now();
// ...
const elapsed = Date.now() - startTime;
progress = Math.min(elapsed / duration, 1);
```
**Problem**: `Date.now()` has ~10-16ms resolution on many systems. For a 200ms animation, that's 5-8% quantization error per frame. Causes visible stuttering.
**Fix**: Use `performance.now()` (microsecond precision).

---

## TIER 2: Incoherence and Pattern Violations

### 2.1 caps.ts breaks namespace object pattern
**File**: `packages/core/src/caps.ts`
Every other core module uses the namespace object pattern (only `export const X = {...}`). This module exports every function at the top level AND collects them in `Cap`:
```ts
export const empty = (): CapSet => ...    // <-- top-level export
export const from = (levels: ...) => ...  // <-- top-level export
// ...
export const Cap = { empty, from, grant, revoke, has, superset, union, intersection, atLeast, ordinal };
```
**Problem**: Namespace pollution. Users can import `empty` or `Cap.empty` -- inconsistent with rest of codebase. Since `index.ts` only exports `Cap`, the top-level exports are orphaned.
**Fix**: Remove all top-level exports. Define functions as `const _empty`, `const _from`, etc. and only export via `Cap`.

### 2.2 astro/tsconfig.json missing 3 project references
**File**: `packages/astro/tsconfig.json`
```json
"references": [
  { "path": "../core" },
  { "path": "../vite" },
  { "path": "../detect" }
]
```
**Missing**: `../web`, `../edge`, `../worker` -- all three are imported in astro source files but not declared as project references. This can cause TypeScript composite build ordering issues.
**Fix**: Add the three missing references.

### 2.3 Error handling divergence across packages
Four different error reporting mechanisms used inconsistently:
- `core`: `CzapValidationError` custom class
- `web/physical`: `Diagnostics.warn()` calls
- `astro/runtime`: `CustomEvent` dispatch only (swallows errors)
- `vite`: `this.warn()` (Vite's built-in)
- `edge`: `Diagnostics.warnOnce()`

Not all of these need to be the same (Vite plugins use Vite's API, etc.), but the web and astro packages should standardize.

### 2.4 Effect.runSync() abuse in SSE/stream code
**File**: `packages/web/src/stream/sse.ts:81-109`
Multiple `Effect.runSync()` calls inside EventSource event handlers. Effect is designed for async/generator composition; calling `runSync` in tight event callbacks creates unnecessary fiber overhead per event. This is an anti-pattern that defeats the purpose of using Effect.

### 2.5 _spine package missing edge.d.ts and worker.d.ts
The `packages/_spine/` type documentation package covers 8 of 10 packages but is missing definitions for `edge` and `worker`.

### 2.6 ARCHITECTURE.md doesn't document edge and worker
The dependency DAG diagram in docs omits two packages entirely.

---

## TIER 3: Almost-Correctness / Subtle Issues

### 3.1 Quantizer builder forcedTargets mutation persists
**File**: `packages/quantizer/src/quantizer.ts:241-354`
The `.force(...)` method mutates a closure-captured `forcedTargets` variable. Calling `.force('css')` then `.outputs({...})` freezes that forced set for that config, but the builder reference retains the mutation. Subsequent `.outputs()` calls inherit the stale forced set unless `.force()` is called again.
**Fix**: Reset `forcedTargets` to null after each `.outputs()` call, or make the builder immutable.

### 3.2 HLC counter global mutable state
**File**: `packages/quantizer/src/quantizer.ts:186`
`let hlcCounter = 0` is module-level. Shared across all quantizer instances. Not safe for concurrent Web Worker scenarios.

### 3.3 evaluate.ts binary search assumes non-empty thresholds
**File**: `packages/quantizer/src/evaluate.ts:54-55`
```ts
let hi = thresholds.length - 1; // Assumes thresholds.length > 0
```
No guard for empty thresholds array. Boundary.make() enforces at least one pair, but the evaluate function doesn't validate its own contract.

### 3.4 wasm-dispatch.ts unvalidated WASM exports
**File**: `packages/core/src/wasm-dispatch.ts:201`
```ts
wasmInstance = instance.exports as unknown as WASMExports;
```
No runtime validation that the WASM module actually exports the expected functions. Malformed modules fail at call time, not load time.

### 3.5 dispatch.ts missing default case (TypeScript-safe but runtime-unsafe)
**File**: `packages/compiler/src/dispatch.ts:44-74`
The `switch(target)` has no default clause. TypeScript exhaustive checking covers compile time, but if called with a string coerced to `CompilerTarget`, the function returns `undefined` at runtime.
**Fix**: Add `default: throw new Error(\`Unknown compiler target: ${target}\`)`.

### 3.6 AI manifest validateAIOutput missing array/object types
**File**: `packages/compiler/src/ai-manifest.ts:362-368`
Only validates `'number'`, `'string'`, `'boolean'` param types. If a param has `type: 'array'` or `type: 'object'`, no validation occurs and the check passes silently.

### 3.7 token.ts silent fallback on missing axis values
**File**: `packages/core/src/token.ts:63-69`
```ts
.map((axis) => axisValues[axis] ?? '')  // missing axis = empty string
```
A typo in axis names (e.g., `{ thme: 'dark' }` instead of `{ theme: 'dark' }`) silently falls back to the default value instead of erroring.

### 3.8 Boundary.make() allows duplicate state names
**File**: `packages/core/src/boundary.ts:206-228`
Validates thresholds are ascending but doesn't check for duplicate state names. `Boundary.make({ at: [[0, 'a'], [768, 'a'], [1280, 'b']] })` is accepted, creating ambiguous quantization.

### 3.9 vector-clock _concurrent() has correct but confusing semantics
**File**: `packages/core/src/vector-clock.ts:61-62`
```ts
const _concurrent = (a, b) => !_happensBefore(a, b) && !_happensBefore(b, a) && !_equals(a, b);
```
The `!_equals(a, b)` check IS semantically correct (equal clocks are not concurrent, they're identical), but the function could use a clarifying comment since distributed systems definitions vary.

---

## TIER 4: Test Quality Issues

### 4.1 CRITICAL: Conditional assertions that may never execute
**File**: `tests/unit/speculative.test.ts:43-46`
```ts
if (result.prefetched) {
  expect(result.prefetched).toBe('medium');   // only runs if prefetched exists!
  expect(result.confidence).toBeGreaterThan(0);
}
```
And again at lines 84-86:
```ts
if (far.confidence > 0 && near.confidence > 0) {
  expect(near.confidence).toBeGreaterThanOrEqual(far.confidence);
}
```
**Problem**: These tests can pass vacuously without executing any assertions. If the speculative evaluator changes behavior, tests still pass green.
**Fix**: Remove conditionals. Assert the expected state unconditionally, or use separate tests for the "no prefetch" case.

### 4.2 physical.test.ts tests nothing meaningful
**File**: `tests/unit/physical.test.ts`
Entire test file (142 lines) only tests:
1. That functions exist (`typeof Physical.capture === 'function'`)
2. That hand-constructed objects match their own values

Zero behavioral testing. Comment says "DOM-dependent, so we limit testing" but this could use jsdom or happy-dom.
**Fix**: Add jsdom-based tests for capture/restore, or delete the file and mark as browser-only.

### 4.3 runtime-wiring-invariants.test.ts is extremely brittle
**File**: `tests/unit/runtime-wiring-invariants.test.ts`
All 6 tests use `readFileSync()` to check that source files contain/don't contain specific strings:
```ts
expect(source).toContain('RuntimeCoordinator.create');
expect(source).not.toContain('stateIndexCache');
```
**Problem**: Any refactor (rename, extract, restructure) breaks these tests. They test source text, not behavior.
**Fix**: Replace with integration tests that verify the actual wiring works, not that specific strings appear in source.

### 4.4 frame-budget.test.ts CPU-spinning for timing
**File**: `tests/unit/frame-budget.test.ts:62-65`
```ts
while (performance.now() - start < 1) { /* spin */ }
```
**Problem**: Unreliable across environments. Test comment admits: "May or may not be null depending on timing".
**Fix**: Use deterministic budget tracking (mock `performance.now()`).

### 4.5 compositor.test.ts tests internal API evaluateSpeculative()
**File**: `tests/unit/compositor.test.ts:153-168`
Tests `compositor.evaluateSpeculative()` which is an internal method. Couples tests to implementation.

### 4.6 Multiple tests use magic sleep values
`Effect.sleep('1 millis')`, `Effect.sleep('10 millis')` scattered across cell, derived, live-cell, signal, and store tests. Timing-dependent, will be flaky on slow CI.

### 4.7 Benchmark duplication
`tests/bench/core.bench.ts` and `tests/bench/compiler.bench.ts` both benchmark `Boundary.evaluate()` with nearly identical setup.

### 4.8 Missing benchmarks for critical paths
No benchmarks for: Receipt chain validation, HLC comparison, LiveCell propagation, Store dispatch throughput, Derived dependency resolution.

### 4.9 Coverage gaps
- **morph.test.ts**: Only tests `SemanticId` and `Hints` helpers, not the actual morph algorithm
- **sse.test.ts**: `buildUrl()` tests don't cover empty URL, existing query params, or malformed URLs
- **plan.test.ts**: No self-cycle test (`A -> A`), no large graph test
- **hlc.test.ts**: No tests for NaN/Infinity wall_ms, no counter-at-max-then-increment test

---

## TIER 5: Architecture and Abstraction Issues

### 5.1 Compositor worker and render worker duplicate evaluation logic
**Files**: `packages/worker/src/compositor-worker.ts` and `packages/worker/src/render-worker.ts`
Both maintain quantizer state and inline threshold evaluation. Should share a module.

### 5.2 Three different GPU tier detection implementations
- `packages/detect/src/detect.ts` -- full WebGL probe
- `packages/edge/src/client-hints.ts` -- User-Agent regex heuristic
- `packages/astro/src/detect-upgrade.ts` -- WebGL renderer string

No single source of truth. The edge implementation uses unanchored regexes that could false-positive.

### 5.3 Compositor hardcodes CSS/GLSL/ARIA naming conventions
**File**: `packages/core/src/compositor.ts:259-272`
```ts
cssKey: `--czap-${name}`,
glslKey: `u_${name}`,
ariaKey: `data-czap-${name}`,
```
Not configurable. If anyone needs a different prefix, they modify core.

### 5.4 Vite plugin over-invalidates caches on HMR
**File**: `packages/vite/src/plugin.ts:317-323`
When ANY definition file changes, ALL four caches (boundary, token, theme, style) are cleared. Changing just a token file needlessly invalidates theme/style caches.

### 5.5 SSE and stream session coupling in astro
`web/stream/sse.ts` has its own Effect state machine. `astro/runtime/stream-session.ts` has a separate RuntimeSession. `astro/runtime/stream.ts` coordinates both manually. The two state machines don't talk to each other; coupling is implicit.

---

## TIER 6: Documentation Style Example Issue

### 6.1 style.ts example uses `as any`
**File**: `packages/core/src/style.ts:171`
```ts
transition: { duration: 200 as any },  // <-- anti-pattern in docs
```
Should use proper `Millis` brand or helper.

---

## Summary Table

| Tier | Category | Count | Action |
|------|----------|-------|--------|
| **1** | Bugs & Logic Errors | 6 | Fix now |
| **2** | Incoherence & Pattern Violations | 6 | Fix now |
| **3** | Almost-Correctness / Subtle | 9 | Fix in next pass |
| **4** | Test Quality | 9 categories | Refactor tests |
| **5** | Architecture / Abstraction | 5 | Design decisions |
| **6** | Documentation | 1 | Quick fix |

**Total actionable findings: 36**

---

## Recommended Fix Order

1. **style.ts:207** -- Remove dead code double throw (30 seconds)
2. **quantizer.ts:148** -- Fix cache key to include springCSS (5 minutes)
3. **frame-budget.ts:74** -- Fix fpsAccum reset (1 line)
4. **animated-quantizer.ts:152** -- Date.now() -> performance.now() (1 line)
5. **speculative.ts:130** -- Replace magic 0.001 with computed offset
6. **interpolate.ts** -- Document or fix zero-default assumption
7. **caps.ts** -- Remove top-level exports, namespace pattern only
8. **astro/tsconfig.json** -- Add missing project references
9. **dispatch.ts** -- Add default case with exhaustive check
10. **boundary.ts** -- Add duplicate state name validation
11. **speculative.test.ts** -- Remove conditional assertions
12. **runtime-wiring-invariants.test.ts** -- Replace source-text checks with behavioral tests
13. **physical.test.ts** -- Add real tests or mark browser-only
14. Remaining items from Tier 3-6
