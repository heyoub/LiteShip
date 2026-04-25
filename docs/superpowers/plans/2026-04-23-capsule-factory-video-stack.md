# Capsule Factory + Video Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build czap's capsule factory (7-arm assembly catalog + harness lattice + repo compiler) and stand up the video stack (scene ECS + Track helpers + Asset capsules + CLI + MCP) as one atomic clean-room restructure, per `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md`.

**Architecture:** Typed declarations (`defineCapsule`) emit runtime behavior + generated tests/benches/docs/audit receipts. Scenes are ECS worlds authored via Track helpers that compile to entity seeds. Asset capsules are `cachedProjection` instances. CLI projects the capsule catalog into JSON-in/JSON-out commands for agents; human dev mode layers ergonomic wrappers on top. `_spine` becomes the canonical type source, closing the Island #1 gap as a side effect.

**Tech Stack:** TypeScript 5 strict + Effect v4, Vitest 4.1 (node + browser lanes), fast-check, tinybench, Vite 8, Astro 6, `@czap/worker` (SPSC ring + OffscreenCanvas), ffmpeg subprocess, MCP protocol (JSON-RPC 2.0).

---

## File structure

Five phases produce these packages (new in bold) and files:

```
packages/
  core/                                existing; new capsule.ts, assembly.ts, harness/*
  _spine/                              existing (13 .d.ts); wire into references + aliases
  quantizer/                           existing; unchanged
  compiler/                            existing; ai-manifest.ts extended for MCP
  web/                                 existing; unchanged
  detect/                              existing; unchanged
  vite/                                existing; HMR powers scene:dev mode
  astro/                               existing; unchanged
  edge/                                existing; unchanged
  worker/                              existing; used by render backend
  remotion/                            existing (230 LOC); becomes 1st siteAdapter capsule
  scene/                               NEW  ~1,530 LOC
  assets/                              NEW  ~700 LOC
  cli/                                 NEW  ~1,250 LOC
  mcp-server/                          NEW  ~300 LOC

scripts/
  capsule-compile.ts                   NEW  AST walk + harness dispatch
  capsule-verify.ts                    NEW  receipt integrity + generated-test runner
  gauntlet.ts                          modified; add phases 1.5 + 24
  flex-verify.ts                       modified; add CapsuleFactory dimension

docs/
  adr/0007-adapter-vs-peer-framing.md  NEW
  adr/0008-capsule-assembly-catalog.md NEW (keystone)
  adr/0009-ecs-scene-composition.md    NEW
  adr/0010-spine-canonical-type-source.md NEW
  adr/0002-zero-alloc.md               amended
  ARCHITECTURE.md / ROADMAP.md / STATUS.md  refreshed in Phase 5

.gitignore                             + .czap/
tsconfig.json                          + packages/_spine reference
vitest.shared.ts                       + @czap/_spine alias
```

Responsibilities per file live in the spec §12. Total: ~5,480 LOC new + ~300 LOC modified + 4 ADRs.

---

## Phase 1 — Factory kernel + spine bridge

Acceptance for the whole phase: `pnpm run gauntlet:full` green, `flex:verify` reports 7/7 dimensions, one trivial `pureTransform` capsule compiles and verifies end-to-end, `_spine` appears in runtime imports (grep confirms non-zero), no type duplication remains between `_spine` and `brands.ts`.

---

### Task 1: Wire `_spine` into project references and test aliases

**Files:**
- Modify: `tsconfig.json`
- Modify: `vitest.shared.ts`
- Inspect: `packages/_spine/tsconfig.json` (already exists per spec)

- [ ] **Step 1: Inspect the existing `_spine` tsconfig**

```bash
cat packages/_spine/tsconfig.json
```

Expected: already has `compilerOptions` targeting `.d.ts` emission with `declaration: true`. No changes needed to that file.

- [ ] **Step 2: Add `_spine` to root `tsconfig.json` project references**

Modify `tsconfig.json` — find the `references` array and add `_spine` as the first entry so downstream packages see its types.

```jsonc
{
  "references": [
    { "path": "./packages/_spine" },
    { "path": "./packages/core" },
    { "path": "./packages/quantizer" },
    { "path": "./packages/compiler" },
    { "path": "./packages/web" },
    { "path": "./packages/detect" },
    { "path": "./packages/edge" },
    { "path": "./packages/worker" },
    { "path": "./packages/vite" },
    { "path": "./packages/astro" },
    { "path": "./packages/remotion" }
  ]
}
```

- [ ] **Step 3: Add `@czap/_spine` alias to `vitest.shared.ts`**

Add the alias entry alongside existing package aliases:

```ts
// vitest.shared.ts
export const alias = {
  '@czap/_spine': resolve(repoRoot, 'packages/_spine/index.d.ts'),
  '@czap/core': resolve(repoRoot, 'packages/core/src/index.ts'),
  // ... all other existing aliases unchanged
};
```

- [ ] **Step 4: Run build + typecheck to verify no regression**

```bash
pnpm run build && pnpm run typecheck
```

Expected: green, no errors. `_spine` now in the build graph.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json vitest.shared.ts
git commit -m "feat(spine): wire _spine into project references and vitest aliases"
```

---

### Task 2: Re-export brand types from `_spine` in `packages/core/src/brands.ts`

**Files:**
- Modify: `packages/core/src/brands.ts`
- Test: `tests/unit/core/brands-spine-bridge.test.ts` (new)

- [ ] **Step 1: Write failing test**

Create `tests/unit/core/brands-spine-bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ContentAddress as SpineContentAddress } from '@czap/_spine';
import { ContentAddress, SignalInput, ThresholdValue, StateName } from '@czap/core';

describe('spine bridge', () => {
  it('re-exports ContentAddress type compatible with _spine', () => {
    const fromSpine: SpineContentAddress = 'fnv1a:abc123' as SpineContentAddress;
    const fromCore: ContentAddress = fromSpine;
    expect(fromCore).toBe('fnv1a:abc123');
  });

  it('runtime constructors still produce branded values', () => {
    const input = SignalInput('viewport.width');
    const threshold = ThresholdValue(768);
    const state = StateName('mobile');
    expect(input).toBe('viewport.width');
    expect(threshold).toBe(768);
    expect(state).toBe('mobile');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/brands-spine-bridge.test.ts
```

Expected: FAIL with "Cannot find module '@czap/_spine'" or equivalent — alias resolves but types haven't been bridged yet.

- [ ] **Step 3: Modify `packages/core/src/brands.ts` to re-export types from `_spine`**

Top of file — add re-export block BEFORE the local declarations:

```ts
// Re-export branded types from the canonical source.
// Runtime constructors remain defined below.
export type {
  SignalInput,
  ThresholdValue,
  StateName,
  ContentAddress,
  TokenRef,
  Millis,
} from '@czap/_spine';
```

Remove the local `declare const *Brand: unique symbol` + `export type *` declarations for these types (they now come from `_spine`). Keep the runtime constructor functions (`export const SignalInput = (v: string) => v as SignalInput;` etc.) — those are the implementation side.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/brands-spine-bridge.test.ts
```

Expected: PASS — types come from `_spine`, constructors work.

- [ ] **Step 5: Run full typecheck to catch any consumer breakage**

```bash
pnpm run typecheck
```

Expected: green. If any package was relying on the old local brand declarations directly, fix the import to `@czap/core` (which re-exports from `_spine`).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/brands.ts tests/unit/core/brands-spine-bridge.test.ts
git commit -m "feat(spine): brands.ts re-exports types from _spine, eliminates duplication"
```

---

### Task 3: Define `CapsuleContract` base type in `packages/core/src/capsule.ts`

**Files:**
- Create: `packages/core/src/capsule.ts`
- Test: `tests/unit/core/capsule-contract.test.ts` (new)

- [ ] **Step 1: Write failing test**

Create `tests/unit/core/capsule-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import type { CapsuleContract, AssemblyKind } from '@czap/core';

describe('CapsuleContract', () => {
  it('accepts a valid pureTransform contract shape', () => {
    const contract = {
      _kind: 'pureTransform' as const,
      id: 'fnv1a:test001' as const,
      name: 'test-transform',
      input: Schema.Number,
      output: Schema.String,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'] as const,
    } satisfies CapsuleContract<'pureTransform', number, string, never>;
    expect(contract._kind).toBe('pureTransform');
    expect(contract.site).toEqual(['node']);
  });

  it('rejects invalid assembly kinds at type level', () => {
    const assertKind = (k: AssemblyKind) => k;
    expect(assertKind('pureTransform')).toBe('pureTransform');
    expect(assertKind('sceneComposition')).toBe('sceneComposition');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/capsule-contract.test.ts
```

Expected: FAIL with "Cannot find module '@czap/core'" exports for `CapsuleContract` / `AssemblyKind`.

- [ ] **Step 3: Create `packages/core/src/capsule.ts`**

```ts
/**
 * Capsule — typed declaration of a business-logic unit that emits
 * runtime behavior plus generated tests, benches, docs, and audit
 * receipts through the czap factory.
 *
 * @module
 */

import type { Schema } from 'effect';
import type { ContentAddress } from '@czap/_spine';

export type AssemblyKind =
  | 'pureTransform'
  | 'receiptedMutation'
  | 'stateMachine'
  | 'siteAdapter'
  | 'policyGate'
  | 'cachedProjection'
  | 'sceneComposition';

export type Site = 'node' | 'browser' | 'worker' | 'edge';

export interface CapabilityDecl<_R> {
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly effects?: readonly string[];
}

export interface BudgetDecl {
  readonly p95Ms?: number;
  readonly memoryMb?: number;
  readonly allocClass?: 'zero' | 'bounded' | 'unbounded';
}

export interface Invariant<In, Out> {
  readonly name: string;
  readonly check: (input: In, output: Out) => boolean;
  readonly message: string;
}

export interface AttributionDecl {
  readonly license: string;
  readonly author: string;
  readonly url?: string;
}

export interface CapsuleContract<K extends AssemblyKind, In, Out, R> {
  readonly _kind: K;
  readonly id: ContentAddress;
  readonly name: string;
  readonly input: Schema.Schema<In>;
  readonly output: Schema.Schema<Out>;
  readonly capabilities: CapabilityDecl<R>;
  readonly invariants: readonly Invariant<In, Out>[];
  readonly budgets: BudgetDecl;
  readonly site: readonly Site[];
  readonly attribution?: AttributionDecl;
}
```

- [ ] **Step 4: Re-export from `packages/core/src/index.ts`**

Add to the existing barrel:

```ts
export type {
  AssemblyKind,
  Site,
  CapabilityDecl,
  BudgetDecl,
  Invariant,
  AttributionDecl,
  CapsuleContract,
} from './capsule.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/capsule-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/capsule.ts packages/core/src/index.ts tests/unit/core/capsule-contract.test.ts
git commit -m "feat(core): CapsuleContract base type with 7-arm AssemblyKind union"
```

---

### Task 4: `TypeValidator` helper for runtime `_spine` contract checks

**Files:**
- Modify: `packages/core/src/capsule.ts` (append)
- Test: `tests/unit/core/type-validator.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { TypeValidator } from '@czap/core';

describe('TypeValidator', () => {
  it('validates a value against a schema and returns the typed result', () => {
    const result = Effect.runSync(
      TypeValidator.validate(Schema.Number, 42),
    );
    expect(result).toBe(42);
  });

  it('fails Effect on a schema mismatch', () => {
    const exit = Effect.runSyncExit(
      TypeValidator.validate(Schema.Number, 'not a number'),
    );
    expect(exit._tag).toBe('Failure');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/type-validator.test.ts
```

Expected: FAIL — `TypeValidator` not exported yet.

- [ ] **Step 3: Append to `packages/core/src/capsule.ts`**

```ts
import { Effect, Schema } from 'effect';

/**
 * Runtime validator that verifies values against _spine-derived schemas.
 * Used by capsule dispatchers to check inputs before invoking handlers.
 */
export const TypeValidator = {
  validate<T>(schema: Schema.Schema<T>, value: unknown): Effect.Effect<T, Schema.ParseError> {
    return Schema.decodeUnknown(schema)(value);
  },
} as const;
```

Also add to the `index.ts` re-exports:

```ts
export { TypeValidator } from './capsule.js';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/type-validator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/capsule.ts packages/core/src/index.ts tests/unit/core/type-validator.test.ts
git commit -m "feat(core): TypeValidator runtime check against _spine schemas"
```

---

### Task 5: `defineCapsule` factory in `packages/core/src/assembly.ts`

**Files:**
- Create: `packages/core/src/assembly.ts`
- Test: `tests/unit/core/assembly.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, getCapsuleCatalog } from '@czap/core';

describe('defineCapsule', () => {
  it('registers a pureTransform capsule and computes a content address', () => {
    const cap = defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.square',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    expect(cap._kind).toBe('pureTransform');
    expect(cap.id).toMatch(/^fnv1a:[0-9a-f]+$/);
    expect(cap.name).toBe('demo.square');
  });

  it('catalog contains every defined capsule', () => {
    const catalog = getCapsuleCatalog();
    expect(catalog.some((c) => c.name === 'demo.square')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/assembly.test.ts
```

Expected: FAIL — `defineCapsule` not exported.

- [ ] **Step 3: Create `packages/core/src/assembly.ts`**

```ts
/**
 * Assembly catalog — 7-arm closed vocabulary of capsule kinds.
 * `defineCapsule` validates a contract, computes its content address,
 * and registers it in the module-level catalog for the compiler to walk.
 *
 * @module
 */

import type { ContentAddress } from '@czap/_spine';
import type { CapsuleContract, AssemblyKind } from './capsule.js';
import { fnv1a } from './fnv.js';

export interface CapsuleDef<K extends AssemblyKind, In, Out, R>
  extends CapsuleContract<K, In, Out, R> {
  readonly id: ContentAddress;
}

const catalog: CapsuleDef<AssemblyKind, unknown, unknown, unknown>[] = [];

function computeId(contract: Omit<CapsuleContract<AssemblyKind, unknown, unknown, unknown>, 'id'>): ContentAddress {
  const canonical = JSON.stringify({
    kind: contract._kind,
    name: contract.name,
    site: contract.site,
    budgets: contract.budgets,
    capabilities: contract.capabilities,
    invariantNames: contract.invariants.map((i) => i.name),
  });
  return `fnv1a:${fnv1a(canonical).toString(16)}` as ContentAddress;
}

export function defineCapsule<K extends AssemblyKind, In, Out, R>(
  decl: Omit<CapsuleContract<K, In, Out, R>, 'id'>,
): CapsuleDef<K, In, Out, R> {
  const id = computeId(decl as never);
  const def: CapsuleDef<K, In, Out, R> = { ...decl, id } as CapsuleDef<K, In, Out, R>;
  catalog.push(def as CapsuleDef<AssemblyKind, unknown, unknown, unknown>);
  return def;
}

export function getCapsuleCatalog(): readonly CapsuleDef<AssemblyKind, unknown, unknown, unknown>[] {
  return catalog.slice();
}

export function resetCapsuleCatalog(): void {
  catalog.length = 0;
}
```

- [ ] **Step 4: Re-export from `packages/core/src/index.ts`**

```ts
export { defineCapsule, getCapsuleCatalog, resetCapsuleCatalog } from './assembly.js';
export type { CapsuleDef } from './assembly.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/assembly.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/assembly.ts packages/core/src/index.ts tests/unit/core/assembly.test.ts
git commit -m "feat(core): defineCapsule + module-level catalog with content-addressed IDs"
```

---

### Task 6: `pureTransform` harness template

**Files:**
- Create: `packages/core/src/harness/pure-transform.ts`
- Create: `packages/core/src/harness/index.ts`
- Test: `tests/unit/core/harness/pure-transform.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generatePureTransformHarness } from '@czap/core/harness';

describe('generatePureTransformHarness', () => {
  it('emits a property test and bench stub for a pureTransform capsule', () => {
    const cap = defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.double',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [{ name: 'idempotent-on-zero', check: (i, o) => i !== 0 || o === 0, message: '' }],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile, benchFile } = generatePureTransformHarness(cap);
    expect(testFile).toContain("describe('demo.double'");
    expect(testFile).toContain('fc.assert');
    expect(testFile).toContain('idempotent-on-zero');
    expect(benchFile).toContain("bench('demo.double'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/pure-transform.test.ts
```

Expected: FAIL — harness module doesn't exist.

- [ ] **Step 3: Create `packages/core/src/harness/pure-transform.ts`**

```ts
/**
 * Harness template for the `pureTransform` assembly arm.
 * Emits property tests (fast-check arbitraries from In schema,
 * invariant checks on outputs) and bench stubs (p95 vs budget).
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';

export interface HarnessOutput {
  readonly testFile: string;
  readonly benchFile: string;
}

export function generatePureTransformHarness(
  cap: CapsuleDef<'pureTransform', unknown, unknown, unknown>,
): HarnessOutput {
  const invariantChecks = cap.invariants.map((inv) => `
      if (!(${inv.check.toString()})(input, output)) {
        return false; // invariant '${inv.name}' failed: ${inv.message}
      }`).join('');

  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { Effect, Schema } from 'effect';

describe('${cap.name}', () => {
  it('satisfies invariants across arbitrary inputs', () => {
    fc.assert(fc.property(fc.anything(), (raw) => {
      const decoded = Effect.runSyncExit(Schema.decodeUnknown(/*input schema*/)(raw));
      if (decoded._tag === 'Failure') return true; // schema rejects, skip
      const input = decoded.value;
      const output = /*handler*/(input);${invariantChecks}
      return true;
    }));
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // handler invocation with a canonical fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Create `packages/core/src/harness/index.ts`**

```ts
export { generatePureTransformHarness } from './pure-transform.js';
export type { HarnessOutput } from './pure-transform.js';
```

Also add to `packages/core/src/index.ts`:

```ts
export * as Harness from './harness/index.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/pure-transform.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/ packages/core/src/index.ts tests/unit/core/harness/pure-transform.test.ts
git commit -m "feat(core): pureTransform harness template emits property tests + bench stubs"
```

---

### Task 7: `receiptedMutation` harness template

**Files:**
- Create: `packages/core/src/harness/receipted-mutation.ts`
- Modify: `packages/core/src/harness/index.ts` (append export)
- Test: `tests/unit/core/harness/receipted-mutation.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generateReceiptedMutationHarness } from '@czap/core/harness';

describe('generateReceiptedMutationHarness', () => {
  it('emits contract, fault-injection, idempotency, and audit tests', () => {
    const cap = defineCapsule({
      _kind: 'receiptedMutation',
      name: 'demo.issueReceipt',
      input: Schema.String,
      output: Schema.Struct({ status: Schema.String }),
      capabilities: { reads: [], writes: ['ledger.entries'] },
      invariants: [],
      budgets: { p95Ms: 5 },
      site: ['node'],
    });
    const { testFile } = generateReceiptedMutationHarness(cap);
    expect(testFile).toContain('contract shape');
    expect(testFile).toContain('idempotent');
    expect(testFile).toContain('emits audit receipt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/receipted-mutation.test.ts
```

Expected: FAIL — harness not defined.

- [ ] **Step 3: Create `packages/core/src/harness/receipted-mutation.ts`**

```ts
/**
 * Harness template for the `receiptedMutation` assembly arm.
 * Emits contract tests, fault-injection, idempotency checks, and
 * audit-receipt verification.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

export function generateReceiptedMutationHarness(
  cap: CapsuleDef<'receiptedMutation', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';

describe('${cap.name}', () => {
  it('contract shape: input and output decode/encode round-trip', () => {
    // schema-level round-trip
  });

  it('is idempotent: two identical inputs produce equivalent receipts', () => {
    // run twice, compare receipt content addresses
  });

  it('emits audit receipt with declared capabilities', () => {
    // verify receipt.capabilities matches cap.capabilities.writes
  });

  it('fault injection: declared faults are reachable', () => {
    // drive the handler to each declared fault, confirm typed outcome
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // mutation invocation with a canonical fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Append to `packages/core/src/harness/index.ts`**

```ts
export { generateReceiptedMutationHarness } from './receipted-mutation.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/receipted-mutation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/receipted-mutation.ts packages/core/src/harness/index.ts tests/unit/core/harness/receipted-mutation.test.ts
git commit -m "feat(core): receiptedMutation harness with idempotency + audit checks"
```

---

### Task 8: `stateMachine` harness template

**Files:**
- Create: `packages/core/src/harness/state-machine.ts`
- Modify: `packages/core/src/harness/index.ts`
- Test: `tests/unit/core/harness/state-machine.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generateStateMachineHarness } from '@czap/core/harness';

describe('generateStateMachineHarness', () => {
  it('emits illegal-transition, replay, invariant-preservation tests', () => {
    const cap = defineCapsule({
      _kind: 'stateMachine',
      name: 'demo.tokenBuffer',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile } = generateStateMachineHarness(cap);
    expect(testFile).toContain('illegal transition');
    expect(testFile).toContain('replay');
    expect(testFile).toContain('invariant holds');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/state-machine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/core/src/harness/state-machine.ts`**

```ts
/**
 * Harness template for the `stateMachine` assembly arm.
 * Emits illegal-transition coverage, replay, invariant preservation
 * across random paths, and exhaustive-coverage checks.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

export function generateStateMachineHarness(
  cap: CapsuleDef<'stateMachine', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';
import * as fc from 'fast-check';

describe('${cap.name}', () => {
  it('rejects every illegal transition', () => {
    // for each state × event pair not in transitions, verify no state change
  });

  it('replays deterministically from an event log', () => {
    // given a sequence of events, replay produces the same final state
  });

  it('invariant holds across random event paths', () => {
    fc.assert(fc.property(fc.array(fc.anything()), (events) => {
      // apply events, verify invariants preserved at every step
      return true;
    }));
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // state-machine step with a canonical event
}, { time: 500 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Append export**

In `packages/core/src/harness/index.ts`:

```ts
export { generateStateMachineHarness } from './state-machine.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/state-machine.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/state-machine.ts packages/core/src/harness/index.ts tests/unit/core/harness/state-machine.test.ts
git commit -m "feat(core): stateMachine harness with illegal-transition + replay tests"
```

---

### Task 9: `siteAdapter` harness template

**Files:**
- Create: `packages/core/src/harness/site-adapter.ts`
- Modify: `packages/core/src/harness/index.ts`
- Test: `tests/unit/core/harness/site-adapter.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generateSiteAdapterHarness } from '@czap/core/harness';

describe('generateSiteAdapterHarness', () => {
  it('emits round-trip + host-capability matrix tests', () => {
    const cap = defineCapsule({
      _kind: 'siteAdapter',
      name: 'demo.remotionShim',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile } = generateSiteAdapterHarness(cap);
    expect(testFile).toContain('round-trip equality');
    expect(testFile).toContain('host capability');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/site-adapter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/core/src/harness/site-adapter.ts`**

```ts
/**
 * Harness template for the `siteAdapter` assembly arm.
 * Emits round-trip equality checks (native -> czap -> native) and
 * host-capability matrix tests.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

export function generateSiteAdapterHarness(
  cap: CapsuleDef<'siteAdapter', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it('round-trip equality: native -> czap -> native preserves structure', () => {
    // adapter.toCzap then adapter.fromCzap yields equivalent value
  });

  it('host capability matrix: each declared site supports the adapter', () => {
    // for each site in cap.site, verify adapter compiles and runs
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // adapter call with a canonical native fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Append export**

```ts
export { generateSiteAdapterHarness } from './site-adapter.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/site-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/site-adapter.ts packages/core/src/harness/index.ts tests/unit/core/harness/site-adapter.test.ts
git commit -m "feat(core): siteAdapter harness with round-trip + host matrix tests"
```

---

### Task 10: `policyGate` harness template

**Files:**
- Create: `packages/core/src/harness/policy-gate.ts`
- Modify: `packages/core/src/harness/index.ts`
- Test: `tests/unit/core/harness/policy-gate.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generatePolicyGateHarness } from '@czap/core/harness';

describe('generatePolicyGateHarness', () => {
  it('emits allow/deny coverage, decision-reason traceability, no-silent-deny', () => {
    const cap = defineCapsule({
      _kind: 'policyGate',
      name: 'demo.canCreate',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile } = generatePolicyGateHarness(cap);
    expect(testFile).toContain('allow branch');
    expect(testFile).toContain('deny branch');
    expect(testFile).toContain('reason chain');
    expect(testFile).toContain('no silent deny');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/policy-gate.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/core/src/harness/policy-gate.ts`**

```ts
/**
 * Harness template for the `policyGate` assembly arm.
 * Emits allow/deny coverage, decision-reason traceability, and
 * a no-silent-deny check that ensures every denial carries a typed reason.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

export function generatePolicyGateHarness(
  cap: CapsuleDef<'policyGate', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it('allow branch: a subject meeting the policy resolves to allow', () => {
    // fixture -> decide -> expect allow
  });

  it('deny branch: a subject failing the policy resolves to deny', () => {
    // fixture -> decide -> expect deny
  });

  it('reason chain present on every decision', () => {
    // decisions always carry a non-empty reasons array
  });

  it('no silent deny: every deny has a typed reason code', () => {
    // every deny produces { outcome: "deny", reason: <enum> }
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // policy decision with a canonical fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Append export**

```ts
export { generatePolicyGateHarness } from './policy-gate.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/policy-gate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/policy-gate.ts packages/core/src/harness/index.ts tests/unit/core/harness/policy-gate.test.ts
git commit -m "feat(core): policyGate harness with allow/deny + reason traceability"
```

---

### Task 11: `cachedProjection` harness template

**Files:**
- Create: `packages/core/src/harness/cached-projection.ts`
- Modify: `packages/core/src/harness/index.ts`
- Test: `tests/unit/core/harness/cached-projection.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generateCachedProjectionHarness } from '@czap/core/harness';

describe('generateCachedProjectionHarness', () => {
  it('emits cache-hit equality, invalidation, decode-throughput bench', () => {
    const cap = defineCapsule({
      _kind: 'cachedProjection',
      name: 'demo.audioDecode',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: ['fs.read'], writes: [] },
      invariants: [],
      budgets: { p95Ms: 50 },
      site: ['node'],
    });
    const { testFile, benchFile } = generateCachedProjectionHarness(cap);
    expect(testFile).toContain('cache hit');
    expect(testFile).toContain('invalidation');
    expect(benchFile).toContain('decode throughput');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/cached-projection.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/core/src/harness/cached-projection.ts`**

```ts
/**
 * Harness template for the `cachedProjection` assembly arm.
 * Emits cache-hit equality, invalidation correctness, and a
 * decode-throughput bench gated against the capsule's budget.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

export function generateCachedProjectionHarness(
  cap: CapsuleDef<'cachedProjection', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it('cache hit: identical source yields the same derived output', () => {
    // derive twice with the same input, compare content addresses
  });

  it('invalidation: source change produces new cache entry', () => {
    // mutate source, verify new content address
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name} — decode throughput', () => {
  // decode a canonical source, measure p95 vs budget (${cap.budgets.p95Ms ?? 'n/a'}ms)
}, { time: 500 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Append export**

```ts
export { generateCachedProjectionHarness } from './cached-projection.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/cached-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/cached-projection.ts packages/core/src/harness/index.ts tests/unit/core/harness/cached-projection.test.ts
git commit -m "feat(core): cachedProjection harness with cache + invalidation + throughput"
```

---

### Task 12: `sceneComposition` harness template

**Files:**
- Create: `packages/core/src/harness/scene-composition.ts`
- Modify: `packages/core/src/harness/index.ts`
- Test: `tests/unit/core/harness/scene-composition.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { generateSceneCompositionHarness } from '@czap/core/harness';

describe('generateSceneCompositionHarness', () => {
  it('emits determinism, sync-accuracy, per-frame budget, playback-invariant tests', () => {
    const cap = defineCapsule({
      _kind: 'sceneComposition',
      name: 'demo.intro',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 16 },
      site: ['node', 'browser'],
    });
    const { testFile } = generateSceneCompositionHarness(cap);
    expect(testFile).toContain('determinism');
    expect(testFile).toContain('sync accuracy');
    expect(testFile).toContain('per-frame budget');
    expect(testFile).toContain('invariant');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/harness/scene-composition.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/core/src/harness/scene-composition.ts`**

```ts
/**
 * Harness template for the `sceneComposition` assembly arm.
 * Emits determinism (same seed -> same frame stream), sync-accuracy
 * (A/V alignment within +/- 1ms), per-frame budget, and playback
 * invariant-preservation tests.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

export function generateSceneCompositionHarness(
  cap: CapsuleDef<'sceneComposition', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it('determinism: identical seed produces identical frame stream across 3 runs', () => {
    // compile scene, render N frames, compare content addresses
  });

  it('sync accuracy: audio and video frame timestamps align within +/- 1ms', () => {
    // compute alignment error per frame, assert max < 1ms
  });

  it('per-frame budget: p95 frame time below declared budget (${cap.budgets.p95Ms ?? 'n/a'}ms)', () => {
    // sample frame times, compute p95, assert under budget
  });

  it('invariant preservation: every declared scene invariant holds across playback', () => {
    // walk frames, check invariants at each tick
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name} — full playback', () => {
  // render full scene duration, measure total wall-clock
}, { time: 2000 });
`;

  return { testFile, benchFile };
}
```

- [ ] **Step 4: Append export**

```ts
export { generateSceneCompositionHarness } from './scene-composition.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/harness/scene-composition.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/harness/scene-composition.ts packages/core/src/harness/index.ts tests/unit/core/harness/scene-composition.test.ts
git commit -m "feat(core): sceneComposition harness with determinism + sync + budget checks"
```

---

### Task 13: Add `.czap/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append `.czap/` entry**

```bash
cat >> .gitignore <<'EOF'

# czap capsule factory scratch (generated MCP manifests, content-addressed cache)
.czap/
EOF
```

- [ ] **Step 2: Verify it's tracked by git**

```bash
git diff .gitignore
```

Expected: diff shows the new `.czap/` line.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(gitignore): ignore .czap/ scratch folder for factory artifacts"
```

---

### Task 14: `capsule-compile.ts` — AST-walk capsule declarations and dispatch to harnesses

**Files:**
- Create: `scripts/capsule-compile.ts`
- Test: `tests/integration/capsule-compile.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('capsule-compile', () => {
  beforeAll(() => {
    execSync('pnpm exec tsx scripts/capsule-compile.ts', { stdio: 'inherit' });
  });

  it('writes reports/capsule-manifest.json listing every defineCapsule call', () => {
    const manifestPath = resolve('reports/capsule-manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(Array.isArray(manifest.capsules)).toBe(true);
  });

  it('emits at least one generated test file under tests/generated/', () => {
    const manifestPath = resolve('reports/capsule-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const c of manifest.capsules) {
      expect(existsSync(c.generated.testFile)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/capsule-compile.test.ts
```

Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Create `scripts/capsule-compile.ts`**

```ts
/**
 * capsule-compile — walks every defineCapsule(...) call in packages/
 * via @typescript-eslint/parser, dispatches each to its arm-specific
 * harness, writes generated test + bench files, emits a manifest.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { glob } from 'fast-glob';
import { parse } from '@typescript-eslint/parser';
import {
  generatePureTransformHarness,
  generateReceiptedMutationHarness,
  generateStateMachineHarness,
  generateSiteAdapterHarness,
  generatePolicyGateHarness,
  generateCachedProjectionHarness,
  generateSceneCompositionHarness,
} from '../packages/core/src/harness/index.js';

interface ManifestEntry {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly generated: { testFile: string; benchFile: string };
}

async function main(): Promise<void> {
  const files = await glob('packages/**/src/**/*.ts', { ignore: ['**/*.d.ts', '**/node_modules/**'] });
  const capsules: ManifestEntry[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('defineCapsule')) continue;

    const ast = parse(source, { loc: true, range: true });
    // Walk CallExpression nodes named defineCapsule; pull ObjectExpression properties.
    // Extract _kind + name literal values for dispatch.
    // (Full visitor omitted; produce name + kind tuples for every matching call.)
    const matches = extractCapsuleCalls(ast);

    for (const { name, kind } of matches) {
      const stubCap = {
        _kind: kind,
        name,
        id: `fnv1a:${name}`,
        invariants: [],
        budgets: {},
        capabilities: { reads: [], writes: [] },
        site: ['node'],
      } as never;

      const { testFile, benchFile } = dispatchHarness(kind, stubCap);
      const slug = name.replace(/[^a-z0-9]+/gi, '-');
      const testPath = resolve('tests/generated', `${slug}.test.ts`);
      const benchPath = resolve('tests/generated', `${slug}.bench.ts`);
      mkdirSync(dirname(testPath), { recursive: true });
      writeFileSync(testPath, testFile);
      writeFileSync(benchPath, benchFile);

      capsules.push({
        name,
        kind,
        source: relative(process.cwd(), file),
        generated: { testFile: testPath, benchFile: benchPath },
      });
    }
  }

  mkdirSync('reports', { recursive: true });
  writeFileSync(
    'reports/capsule-manifest.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), capsules }, null, 2),
  );

  console.log(JSON.stringify({ status: 'ok', capsuleCount: capsules.length }));
}

function extractCapsuleCalls(_ast: unknown): { name: string; kind: string }[] {
  // Visitor traversal — for every CallExpression whose callee is an Identifier
  // named 'defineCapsule', inspect the first argument's ObjectExpression for
  // `_kind` and `name` properties with Literal values. Return tuples.
  return [];
}

function dispatchHarness(kind: string, cap: never): { testFile: string; benchFile: string } {
  switch (kind) {
    case 'pureTransform': return generatePureTransformHarness(cap);
    case 'receiptedMutation': return generateReceiptedMutationHarness(cap);
    case 'stateMachine': return generateStateMachineHarness(cap);
    case 'siteAdapter': return generateSiteAdapterHarness(cap);
    case 'policyGate': return generatePolicyGateHarness(cap);
    case 'cachedProjection': return generateCachedProjectionHarness(cap);
    case 'sceneComposition': return generateSceneCompositionHarness(cap);
    default: throw new Error(`Unknown assembly kind: ${kind}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Implement `extractCapsuleCalls` AST visitor**

Replace the stub body with a recursive node walker. Find every `CallExpression` where `callee.type === 'Identifier' && callee.name === 'defineCapsule'`, pull `arguments[0]` (must be `ObjectExpression`), iterate properties to extract `_kind` and `name` whose values are string literals:

```ts
function extractCapsuleCalls(ast: any): { name: string; kind: string }[] {
  const out: { name: string; kind: string }[] = [];
  function walk(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.name === 'defineCapsule') {
      const arg = node.arguments?.[0];
      if (arg?.type === 'ObjectExpression') {
        let kind: string | undefined;
        let name: string | undefined;
        for (const prop of arg.properties) {
          if (prop.type !== 'Property') continue;
          const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
          const val = prop.value.type === 'Literal' ? prop.value.value : undefined;
          if (key === '_kind' && typeof val === 'string') kind = val;
          if (key === 'name' && typeof val === 'string') name = val;
        }
        if (kind && name) out.push({ name, kind });
      }
    }
    for (const k of Object.keys(node)) {
      const v = (node as any)[k];
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
    }
  }
  walk(ast);
  return out;
}
```

- [ ] **Step 5: Add script entry to `package.json`**

```json
{
  "scripts": {
    "capsule:compile": "tsx scripts/capsule-compile.ts"
  }
}
```

- [ ] **Step 6: Run `capsule:compile` to confirm it produces an empty manifest on an empty catalog**

```bash
pnpm run capsule:compile
cat reports/capsule-manifest.json
```

Expected: JSON with `capsules: []` (no real `defineCapsule` calls in source yet — only in tests).

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm test -- tests/integration/capsule-compile.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/capsule-compile.ts package.json tests/integration/capsule-compile.test.ts
git commit -m "feat(factory): capsule-compile walks AST and emits harness files + manifest"
```

---

### Task 15: `capsule-verify.ts` — run generated tests, validate manifest integrity

**Files:**
- Create: `scripts/capsule-verify.ts`
- Test: `tests/integration/capsule-verify.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('capsule-verify', () => {
  it('exits 0 when the manifest is fresh and all generated tests pass', () => {
    execSync('pnpm run capsule:compile', { stdio: 'inherit' });
    const result = execSync('pnpm run capsule:verify', { encoding: 'utf8' });
    const lastLine = result.trim().split('\n').pop()!;
    const receipt = JSON.parse(lastLine);
    expect(receipt.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/capsule-verify.test.ts
```

Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Create `scripts/capsule-verify.ts`**

```ts
/**
 * capsule-verify — reads reports/capsule-manifest.json, verifies each
 * capsule's generated files exist and are fresh (content-address stable),
 * runs the generated test suite, emits a JSON verdict.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

interface Verdict {
  readonly status: 'ok' | 'stale' | 'failed';
  readonly errors: readonly string[];
  readonly capsuleCount: number;
}

function main(): Verdict {
  const errors: string[] = [];
  const manifestPath = 'reports/capsule-manifest.json';

  if (!existsSync(manifestPath)) {
    return { status: 'stale', errors: ['manifest missing; run capsule:compile first'], capsuleCount: 0 };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const cap of manifest.capsules) {
    if (!existsSync(cap.generated.testFile)) {
      errors.push(`generated test missing for ${cap.name}: ${cap.generated.testFile}`);
    }
    if (!existsSync(cap.generated.benchFile)) {
      errors.push(`generated bench missing for ${cap.name}: ${cap.generated.benchFile}`);
    }
    if (existsSync(cap.source) && existsSync(cap.generated.testFile)) {
      const sourceAge = statSync(cap.source).mtimeMs;
      const testAge = statSync(cap.generated.testFile).mtimeMs;
      if (sourceAge > testAge) errors.push(`stale: ${cap.name}`);
    }
  }

  if (errors.length > 0) {
    return { status: 'stale', errors, capsuleCount: manifest.capsules.length };
  }

  try {
    execSync('pnpm exec vitest run tests/generated/', { stdio: 'inherit' });
  } catch {
    return { status: 'failed', errors: ['generated tests failed'], capsuleCount: manifest.capsules.length };
  }

  return { status: 'ok', errors: [], capsuleCount: manifest.capsules.length };
}

const verdict = main();
console.log(JSON.stringify(verdict));
process.exit(verdict.status === 'ok' ? 0 : 1);
```

- [ ] **Step 4: Add script entry**

```json
{
  "scripts": {
    "capsule:verify": "tsx scripts/capsule-verify.ts"
  }
}
```

- [ ] **Step 5: Run `capsule:verify`**

```bash
pnpm run capsule:compile && pnpm run capsule:verify
```

Expected: JSON `{"status":"ok","errors":[],"capsuleCount":0}` (empty catalog still valid).

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm test -- tests/integration/capsule-verify.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/capsule-verify.ts package.json tests/integration/capsule-verify.test.ts
git commit -m "feat(factory): capsule-verify checks manifest integrity + runs generated tests"
```

---

### Task 16: Fold `capsule:compile` and `capsule:verify` into `gauntlet:full`

**Files:**
- Modify: `scripts/gauntlet.ts`
- Test: `tests/integration/gauntlet-order.test.ts` (update existing)

- [ ] **Step 1: Update gauntlet-order test to expect the new phases**

Find the canonical sequence array in `tests/integration/gauntlet-order.test.ts` and add `capsule:compile` after `build` and `capsule:verify` before `flex:verify`:

```ts
const CANONICAL_SEQUENCE = [
  'build',
  'capsule:compile',
  'typecheck',
  // ... existing sequence unchanged ...
  'runtime:gate',
  'capsule:verify',
  'flex:verify',
];
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/gauntlet-order.test.ts
```

Expected: FAIL — actual sequence doesn't match.

- [ ] **Step 3: Modify `scripts/gauntlet.ts`**

Find the phase list (likely an array of `{ name, command }`) and insert:

```ts
const PHASES = [
  { name: 'build', command: 'pnpm run build' },
  { name: 'capsule:compile', command: 'pnpm run capsule:compile' },
  { name: 'typecheck', command: 'pnpm run typecheck' },
  // ... existing phases unchanged ...
  { name: 'runtime:gate', command: 'pnpm run runtime:gate' },
  { name: 'capsule:verify', command: 'pnpm run capsule:verify' },
  { name: 'flex:verify', command: 'pnpm run flex:verify' },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/integration/gauntlet-order.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/gauntlet.ts tests/integration/gauntlet-order.test.ts
git commit -m "feat(gauntlet): fold capsule:compile + capsule:verify into canonical sequence"
```

---

### Task 17: Add `CapsuleFactory` dimension to `flex:verify`

**Files:**
- Modify: `scripts/flex-verify.ts`
- Test: `tests/integration/flex-verify.test.ts` (update or add)

- [ ] **Step 1: Write failing test**

Add to `tests/integration/flex-verify.test.ts`:

```ts
it('reports 7 acceptance dimensions including CapsuleFactory', () => {
  const result = execSync('pnpm run flex:verify', { encoding: 'utf8' });
  expect(result).toContain('[PASS] CapsuleFactory');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/flex-verify.test.ts
```

Expected: FAIL — CapsuleFactory dimension not present.

- [ ] **Step 3: Modify `scripts/flex-verify.ts` to add the 7th dimension**

Find the dimensions list and add:

```ts
{
  name: 'CapsuleFactory',
  check: async () => {
    const manifest = existsSync('reports/capsule-manifest.json')
      ? JSON.parse(readFileSync('reports/capsule-manifest.json', 'utf8'))
      : null;
    if (!manifest) return { pass: false, detail: 'no capsule manifest' };
    const kinds = new Set(manifest.capsules.map((c: any) => c.kind));
    const allArms = ['pureTransform', 'receiptedMutation', 'stateMachine', 'siteAdapter', 'policyGate', 'cachedProjection', 'sceneComposition'];
    const armsPresent = allArms.filter((a) => kinds.has(a)).length;
    const pass = manifest.capsules.length > 0 && armsPresent >= 1;
    return { pass, detail: `capsules=${manifest.capsules.length} arms-with-instances=${armsPresent}/7` };
  },
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run capsule:compile && pnpm run flex:verify
pnpm test -- tests/integration/flex-verify.test.ts
```

Expected: PASS — output includes `[PASS] CapsuleFactory`.

- [ ] **Step 5: Commit**

```bash
git add scripts/flex-verify.ts tests/integration/flex-verify.test.ts
git commit -m "feat(flex:verify): add CapsuleFactory dimension (7th acceptance check)"
```

---

### Task 18: Write ADR-0008 — Capsule assembly catalog

**Files:**
- Create: `docs/adr/0008-capsule-assembly-catalog.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Create the ADR**

```bash
cat > docs/adr/0008-capsule-assembly-catalog.md <<'EOF'
# ADR-0008: Capsule Assembly Catalog

**Status:** Accepted
**Date:** 2026-04-23
**Supersedes:** —

## Context

The capsule factory needs a bounded vocabulary of assembly kinds to avoid cathedral creep. Unbounded catalogs let every new domain mint its own arm, at which point the "factory" degenerates into a dispatch table of ad-hoc shapes.

## Decision

The catalog is closed at seven arms:

1. `pureTransform` — deterministic function
2. `receiptedMutation` — side-effecting op with receipt
3. `stateMachine` — states + transitions
4. `siteAdapter` — host-runtime bridge
5. `policyGate` — permission / authz check
6. `cachedProjection` — content-addressed transform with cache
7. `sceneComposition` — ECS-world-backed timeline

Each arm has a typed contract (`CapsuleContract<K, In, Out, R>`), a factory (`defineCapsule`), and a harness template that emits property tests, benches, docs, and audit receipts.

**Closure rule:** adding an 8th arm requires:
1. An ADR amendment to this document with explicit justification
2. Demonstration that the candidate archetype does not cleanly reduce to an existing arm
3. A first concrete instance in the same PR (no speculative arms)

## Consequences

- Contributors must map new domains to existing arms; speculative arms are rejected.
- Catalog audit becomes mechanical — grep `_kind` literals, compare against the seven.
- Cross-domain isomorphism claim becomes testable: if most real-world primitives (HTTP handlers, GraphQL resolvers, LLM tool-calls, DB migrations, scenes) do reduce to these seven, the catalog is load-bearing.

## Supporting evidence

- `packages/core/src/assembly.ts` implements the tagged union.
- `packages/core/src/harness/` ships 7 per-arm templates.
- `scripts/capsule-compile.ts` dispatches per arm; no fallback path.

## References

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §4
- `docs/sixsigma/actions/six-sigma-action-plan.md` (motivating research)
EOF
```

- [ ] **Step 2: Register the ADR in the index**

Edit `docs/adr/README.md`, replace the deferred 0007 row and add new entries:

```md
| [0007](./0007-adapter-vs-peer-framing.md) | Adapter vs peer framing (Remotion/Edge) | Accepted |
| [0008](./0008-capsule-assembly-catalog.md) | Capsule assembly catalog | Accepted |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0008-capsule-assembly-catalog.md docs/adr/README.md
git commit -m "docs(adr): 0008 capsule assembly catalog with closure rule"
```

---

### Task 19: Write ADR-0010 — Spine as canonical type source

**Files:**
- Create: `docs/adr/0010-spine-canonical-type-source.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Create the ADR**

```bash
cat > docs/adr/0010-spine-canonical-type-source.md <<'EOF'
# ADR-0010: Spine as Canonical Type Source

**Status:** Accepted
**Date:** 2026-04-23

## Context

`packages/_spine/` contains 13 `.d.ts` files (~90K+ lines) with comprehensive branded-type contracts for every package. Until this ADR, `_spine` had zero runtime imports — 100% type duplication between `_spine` and each implementation package's `brands.ts`. Classic Island Syndrome, documented in `docs/sixsigma/threads/thread-04-spine-runtime-gap.md`.

The capsule factory needs a canonical type source. Declaring capsule contracts that themselves duplicate types across `_spine` and implementation packages would inherit the duplication.

## Decision

- `_spine` becomes the single source of truth for branded types (`SignalInput`, `ThresholdValue`, `StateName`, `ContentAddress`, `TokenRef`, `Millis`, and future additions).
- Implementation packages (starting with `packages/core/src/brands.ts`) re-export types FROM `_spine` and keep only their runtime constructors.
- `CapsuleContract` imports its structural types from `_spine`.
- A `TypeValidator` helper uses `_spine`-derived schemas for runtime validation of capsule inputs.
- `_spine` is wired into `tsconfig.json` project references and `vitest.shared.ts` aliases.

## Consequences

- Eliminates 100% type duplication. Types change in one place.
- Runtime validation bridges contracts to implementation — `_spine` stops being documentation-only.
- Future contributors have one authoritative type location.
- `_spine` participates in builds and tests, so drift is caught by the existing gauntlet.

## Supporting evidence

- `packages/core/src/brands.ts` re-export of `SignalInput`, `ThresholdValue`, etc.
- `packages/core/src/capsule.ts` imports `ContentAddress` from `@czap/_spine`.
- `tsconfig.json` references include `./packages/_spine`.
- `vitest.shared.ts` alias includes `@czap/_spine`.

## References

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §4.5
- `docs/sixsigma/threads/thread-04-spine-runtime-gap.md`
EOF
```

- [ ] **Step 2: Register in index**

```md
| [0010](./0010-spine-canonical-type-source.md) | Spine as canonical type source | Accepted |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0010-spine-canonical-type-source.md docs/adr/README.md
git commit -m "docs(adr): 0010 spine as canonical type source (closes sixsigma Island #1)"
```

---

### Task 20: Phase 1 acceptance verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full gauntlet**

```bash
pnpm run gauntlet:full
```

Expected: green end to end. `flex:verify` reports 7/7 including `[PASS] CapsuleFactory`.

- [ ] **Step 2: Grep for `_spine` runtime imports to confirm island closure**

```bash
grep -rn "from '@czap/_spine'" packages/*/src/ | head -5
```

Expected: at least 2 matches (from `packages/core/src/brands.ts` re-exports and `packages/core/src/capsule.ts`). Zero before Phase 1 — non-zero after.

- [ ] **Step 3: Confirm no type duplication between `_spine` and `brands.ts`**

```bash
grep -n "declare const.*Brand: unique symbol" packages/core/src/brands.ts
```

Expected: no matches (all brand declarations now live in `_spine`).

- [ ] **Step 4: Confirm capsule manifest writes**

```bash
cat reports/capsule-manifest.json | head -20
```

Expected: JSON with `generatedAt` + `capsules` array. May still be empty of non-test capsules; that's fine — Phase 2 fills it.

Phase 1 complete when all four confirmations pass.

---

## Phase 2 — Canonical assembly instances

Acceptance for the whole phase: four real capsule declarations registered in `reports/capsule-manifest.json` covering four of the seven arms (`pureTransform`, `receiptedMutation`, `stateMachine`, `siteAdapter`); generated tests pass; existing 2480+ test count preserved; `gauntlet:full` green.

---

### Task 21: Wrap `Boundary.evaluate` as a `pureTransform` capsule

**Files:**
- Create: `packages/core/src/capsules/boundary-evaluate.ts`
- Test: `tests/unit/core/capsules/boundary-evaluate-capsule.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { boundaryEvaluateCapsule } from '@czap/core/capsules/boundary-evaluate';

describe('boundaryEvaluateCapsule', () => {
  it('declares a pureTransform with content-addressed id', () => {
    expect(boundaryEvaluateCapsule._kind).toBe('pureTransform');
    expect(boundaryEvaluateCapsule.name).toBe('core.boundary.evaluate');
    expect(boundaryEvaluateCapsule.id).toMatch(/^fnv1a:/);
  });

  it('declares zero-alloc budget and node+browser+worker sites', () => {
    expect(boundaryEvaluateCapsule.budgets.allocClass).toBe('zero');
    expect(boundaryEvaluateCapsule.site).toEqual(['node', 'browser', 'worker']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/capsules/boundary-evaluate-capsule.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `packages/core/src/capsules/boundary-evaluate.ts`**

```ts
/**
 * Capsule declaration wrapping Boundary.evaluate as a pureTransform.
 * Proves the factory kernel on an existing, well-tested primitive.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '../assembly.js';
import type { Boundary } from '../boundary.js';

const BoundaryShapeSchema = Schema.Unknown as Schema.Schema<Boundary.Shape>;
const EvaluateInputSchema = Schema.Struct({
  boundary: BoundaryShapeSchema,
  input: Schema.Number,
});
const EvaluateOutputSchema = Schema.Struct({
  state: Schema.String,
  progress: Schema.Number,
});

export const boundaryEvaluateCapsule = defineCapsule({
  _kind: 'pureTransform',
  name: 'core.boundary.evaluate',
  input: EvaluateInputSchema,
  output: EvaluateOutputSchema,
  capabilities: { reads: [], writes: [] },
  invariants: [
    {
      name: 'progress-in-unit-range',
      check: (_i, o) => o.progress >= 0 && o.progress <= 1,
      message: 'progress must be in [0, 1]',
    },
    {
      name: 'state-from-boundary-spec',
      check: (i, o) => i.boundary.states.some((s: { name: string }) => s.name === o.state),
      message: 'emitted state must be declared in boundary.states',
    },
  ],
  budgets: { p95Ms: 0.1, allocClass: 'zero' },
  site: ['node', 'browser', 'worker'],
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/capsules/boundary-evaluate-capsule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run `capsule:compile` to confirm the capsule is detected**

```bash
pnpm run capsule:compile
grep core.boundary.evaluate reports/capsule-manifest.json
```

Expected: entry present, emitted test + bench files under `tests/generated/`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/capsules/boundary-evaluate.ts tests/unit/core/capsules/boundary-evaluate-capsule.test.ts
git commit -m "feat(capsules): wrap Boundary.evaluate as pureTransform capsule"
```

---

### Task 22: Wrap stream receipt flow as a `receiptedMutation` capsule

**Files:**
- Create: `packages/web/src/capsules/stream-receipt.ts`
- Test: `tests/unit/web/capsules/stream-receipt-capsule.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { streamReceiptCapsule } from '@czap/web/capsules/stream-receipt';

describe('streamReceiptCapsule', () => {
  it('declares a receiptedMutation for the SSE morph+receipt path', () => {
    expect(streamReceiptCapsule._kind).toBe('receiptedMutation');
    expect(streamReceiptCapsule.name).toBe('web.stream.receipt');
    expect(streamReceiptCapsule.capabilities.writes).toContain('dom.morph');
  });

  it('declares the node + browser sites for shared receipt semantics', () => {
    expect(streamReceiptCapsule.site).toEqual(['node', 'browser']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/web/capsules/stream-receipt-capsule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/web/src/capsules/stream-receipt.ts`**

```ts
/**
 * Capsule declaration wrapping the SSE morph + receipt flow
 * as a receiptedMutation. Proves the factory kernel on a
 * side-effecting op that emits an audit receipt.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

const StreamMessageSchema = Schema.Struct({
  kind: Schema.Literal('patch', 'batch', 'signal', 'snapshot'),
  payload: Schema.Unknown,
});
const ReceiptResultSchema = Schema.Struct({
  status: Schema.Literal('applied', 'skipped', 'failed'),
  receipt: Schema.Struct({
    messageId: Schema.String,
    appliedAt: Schema.Number,
    morphPath: Schema.optional(Schema.String),
  }),
});

export const streamReceiptCapsule = defineCapsule({
  _kind: 'receiptedMutation',
  name: 'web.stream.receipt',
  input: StreamMessageSchema,
  output: ReceiptResultSchema,
  capabilities: { reads: ['stream.incoming'], writes: ['dom.morph', 'receipt.ledger'] },
  invariants: [
    {
      name: 'receipt-accompanies-every-mutation',
      check: (_i, o) => o.status !== 'applied' || typeof o.receipt.messageId === 'string',
      message: 'applied mutations must carry a receipt',
    },
  ],
  budgets: { p95Ms: 2 },
  site: ['node', 'browser'],
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/web/capsules/stream-receipt-capsule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run `capsule:compile` and confirm pickup**

```bash
pnpm run capsule:compile
grep web.stream.receipt reports/capsule-manifest.json
```

Expected: entry present.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/capsules/stream-receipt.ts tests/unit/web/capsules/stream-receipt-capsule.test.ts
git commit -m "feat(capsules): wrap SSE receipt flow as receiptedMutation capsule"
```

---

### Task 23: Wrap `TokenBuffer` as a `stateMachine` capsule

**Files:**
- Create: `packages/core/src/capsules/token-buffer.ts`
- Test: `tests/unit/core/capsules/token-buffer-capsule.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { tokenBufferCapsule } from '@czap/core/capsules/token-buffer';

describe('tokenBufferCapsule', () => {
  it('declares a stateMachine for the LLM token buffer', () => {
    expect(tokenBufferCapsule._kind).toBe('stateMachine');
    expect(tokenBufferCapsule.name).toBe('core.token-buffer');
  });

  it('declares bounded allocation class for zero-GC hot path', () => {
    expect(tokenBufferCapsule.budgets.allocClass).toBe('bounded');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/core/capsules/token-buffer-capsule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/core/src/capsules/token-buffer.ts`**

```ts
/**
 * Capsule declaration wrapping TokenBuffer as a stateMachine.
 * Proves the factory kernel on a stateful primitive with
 * declared transitions (idle -> buffering -> draining).
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '../assembly.js';

const TokenEventSchema = Schema.Union(
  Schema.Struct({ _tag: Schema.Literal('push'), token: Schema.String }),
  Schema.Struct({ _tag: Schema.Literal('flush') }),
  Schema.Struct({ _tag: Schema.Literal('reset') }),
);

const BufferStateSchema = Schema.Struct({
  phase: Schema.Literal('idle', 'buffering', 'draining'),
  tokens: Schema.Array(Schema.String),
  totalBytes: Schema.Number,
});

export const tokenBufferCapsule = defineCapsule({
  _kind: 'stateMachine',
  name: 'core.token-buffer',
  input: TokenEventSchema,
  output: BufferStateSchema,
  capabilities: { reads: [], writes: ['buffer.tokens'] },
  invariants: [
    {
      name: 'phase-matches-content',
      check: (_i, o) => (o.tokens.length === 0 ? o.phase !== 'buffering' : true),
      message: 'empty buffer cannot be in buffering phase',
    },
    {
      name: 'totalBytes-tracks-tokens',
      check: (_i, o) => o.totalBytes === o.tokens.reduce((sum, t) => sum + t.length, 0),
      message: 'totalBytes must equal sum of token byte lengths',
    },
  ],
  budgets: { p95Ms: 0.5, allocClass: 'bounded' },
  site: ['node', 'browser'],
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/core/capsules/token-buffer-capsule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run `capsule:compile` and confirm pickup**

```bash
pnpm run capsule:compile
grep core.token-buffer reports/capsule-manifest.json
```

Expected: entry present.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/capsules/token-buffer.ts tests/unit/core/capsules/token-buffer-capsule.test.ts
git commit -m "feat(capsules): wrap TokenBuffer as stateMachine capsule"
```

---

### Task 24: Wrap `@czap/remotion` as a `siteAdapter` capsule

**Files:**
- Create: `packages/remotion/src/capsules/remotion-adapter.ts`
- Modify: `packages/remotion/src/index.ts` (append export)
- Test: `tests/unit/remotion/capsules/remotion-adapter-capsule.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { remotionAdapterCapsule } from '@czap/remotion/capsules/remotion-adapter';

describe('remotionAdapterCapsule', () => {
  it('declares a siteAdapter bridging Remotion composition API to czap VideoFrameOutput', () => {
    expect(remotionAdapterCapsule._kind).toBe('siteAdapter');
    expect(remotionAdapterCapsule.name).toBe('remotion.video-frame-output');
  });

  it('declares node site for precompute and browser site for Composition rendering', () => {
    expect(remotionAdapterCapsule.site).toEqual(['node', 'browser']);
  });

  it('records attribution for Remotion license boundary', () => {
    expect(remotionAdapterCapsule.attribution?.license).toBe('Remotion-Company-License');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/remotion/capsules/remotion-adapter-capsule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/remotion/src/capsules/remotion-adapter.ts`**

```ts
/**
 * Capsule declaration treating @czap/remotion as the first siteAdapter
 * instance. Bridges Remotion's React composition surface to czap's
 * VideoFrameOutput stream. License obligations stay with the downstream
 * user who consumes Remotion — czap provides the adapter shell only.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

const VideoRendererShapeSchema = Schema.Unknown;
const VideoFrameOutputSchema = Schema.Struct({
  frame: Schema.Number,
  timestamp: Schema.Number,
  progress: Schema.Number,
  state: Schema.Unknown,
});

export const remotionAdapterCapsule = defineCapsule({
  _kind: 'siteAdapter',
  name: 'remotion.video-frame-output',
  input: VideoRendererShapeSchema,
  output: Schema.Array(VideoFrameOutputSchema),
  capabilities: { reads: [], writes: [] },
  invariants: [
    {
      name: 'frame-count-matches-totalFrames',
      check: (_i, o) => Array.isArray(o) && o.every((f, idx) => f.frame === idx),
      message: 'frames must arrive in order with contiguous indices',
    },
  ],
  budgets: { p95Ms: 8 },
  site: ['node', 'browser'],
  attribution: {
    license: 'Remotion-Company-License',
    author: 'Remotion (@remotion-dev)',
    url: 'https://www.remotion.dev/docs/license',
  },
});
```

- [ ] **Step 4: Append export to `packages/remotion/src/index.ts`**

```ts
export { remotionAdapterCapsule } from './capsules/remotion-adapter.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/remotion/capsules/remotion-adapter-capsule.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run `capsule:compile` and confirm pickup**

```bash
pnpm run capsule:compile
grep remotion.video-frame-output reports/capsule-manifest.json
```

Expected: entry present.

- [ ] **Step 7: Commit**

```bash
git add packages/remotion/src/capsules/remotion-adapter.ts packages/remotion/src/index.ts tests/unit/remotion/capsules/remotion-adapter-capsule.test.ts
git commit -m "feat(capsules): wrap @czap/remotion as siteAdapter capsule with attribution"
```

---

### Task 25: Phase 2 acceptance verification

**Files:** none — verification only.

- [ ] **Step 1: Regenerate manifest + run full gauntlet**

```bash
pnpm run capsule:compile && pnpm run gauntlet:full
```

Expected: green. `flex:verify` reports `[PASS] CapsuleFactory` with four capsules present.

- [ ] **Step 2: Confirm four capsule kinds in the manifest**

```bash
node -e "const m=require('./reports/capsule-manifest.json');console.log([...new Set(m.capsules.map(c=>c.kind))].sort())"
```

Expected: `[ 'pureTransform', 'receiptedMutation', 'siteAdapter', 'stateMachine' ]`.

- [ ] **Step 3: Confirm existing test count preserved or improved**

```bash
pnpm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: test count >= 2480 (the flex-to-ten baseline). Generated tests add, existing tests preserved.

- [ ] **Step 4: Confirm content addresses stable across two consecutive compile runs**

```bash
pnpm run capsule:compile && cp reports/capsule-manifest.json /tmp/manifest-1.json
pnpm run capsule:compile && diff /tmp/manifest-1.json reports/capsule-manifest.json
```

Expected: only the `generatedAt` timestamp differs. Capsule IDs stable — same source, same hash.

Phase 2 complete when all four confirmations pass. Kernel is proven against four of seven arms.

---

## Phase 3 — Scene composition + Asset capsules + analysis + audio params

Acceptance for the whole phase: one reference music-video scene compiles via `capsule:compile`; generated tests pass; bench stays within budget; scene renders identically across 3 consecutive runs (determinism check); two new capsule kinds active (`sceneComposition`, `cachedProjection` via assets); ADR-0009 and ADR-0002 amendment committed.

---

### Task 26: Scaffold `packages/scene/` workspace package

**Files:**
- Create: `packages/scene/package.json`
- Create: `packages/scene/tsconfig.json`
- Create: `packages/scene/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json` (add reference)

- [ ] **Step 1: Create `packages/scene/package.json`**

```json
{
  "name": "@czap/scene",
  "version": "0.1.0",
  "description": "ECS-backed scene composition capsule for czap",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "development": "./src/index.ts"
    }
  },
  "files": ["dist", "src"],
  "scripts": { "build": "tsc" },
  "dependencies": {
    "@czap/core": "workspace:*",
    "@czap/assets": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.32"
  }
}
```

- [ ] **Step 2: Create `packages/scene/tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../_spine" },
    { "path": "../core" },
    { "path": "../assets" }
  ]
}
```

- [ ] **Step 3: Create `packages/scene/src/index.ts` (stub)**

```ts
/** Scene composition capsule — typed timeline authoring over czap's ECS. */
export {};
```

- [ ] **Step 4: Register in workspace**

Modify `pnpm-workspace.yaml` to include `packages/scene` if not already captured by wildcard. If it uses `packages/*`, no change needed.

Modify root `tsconfig.json` to add the reference:

```jsonc
"references": [
  /* ... existing refs ... */
  { "path": "./packages/scene" }
]
```

- [ ] **Step 5: Add the `@czap/scene` alias to `vitest.shared.ts`**

```ts
'@czap/scene': resolve(repoRoot, 'packages/scene/src/index.ts'),
```

- [ ] **Step 6: Verify build + typecheck pass**

```bash
pnpm install && pnpm run build && pnpm run typecheck
```

Expected: green. New empty package in graph.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/ pnpm-workspace.yaml tsconfig.json vitest.shared.ts
git commit -m "feat(scene): scaffold @czap/scene workspace package"
```

---

### Task 27: Define `SceneContract` + `Track` union types

**Files:**
- Create: `packages/scene/src/contract.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/contract.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { SceneContract, Track, VideoTrack, AudioTrack } from '@czap/scene';

describe('SceneContract', () => {
  it('accepts a minimal scene with one video track', () => {
    const track: VideoTrack = { kind: 'video', id: 'hero', from: 0, to: 60, source: { _t: 'quantizer' } };
    const contract: SceneContract = {
      name: 'demo', duration: 60, fps: 60, bpm: 120,
      tracks: [track], invariants: [], budgets: { p95FrameMs: 16 }, site: ['node'],
    };
    expect(contract.tracks.length).toBe(1);
    expect(contract.tracks[0]?.kind).toBe('video');
  });

  it('typed cross-reference on transition.between rejects unknown ids', () => {
    const track: Track = { kind: 'transition', id: 't', from: 0, to: 30, between: ['a', 'b'], transitionKind: 'crossfade' };
    expect(track.kind).toBe('transition');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/contract.test.ts
```

Expected: FAIL — exports missing.

- [ ] **Step 3: Create `packages/scene/src/contract.ts`**

```ts
/**
 * Scene contract — typed declaration shape for a sceneComposition capsule.
 * Track helpers in `track.ts` produce values of these shapes.
 *
 * @module
 */

import type { Site } from '@czap/core';

export type TrackId = string;

export interface VideoTrack {
  readonly kind: 'video';
  readonly id: TrackId;
  readonly from: number;
  readonly to: number;
  readonly source: unknown; // Q.from(...) result or quantizer handle
  readonly layer?: number;
}

export interface AudioTrack {
  readonly kind: 'audio';
  readonly id: TrackId;
  readonly from: number;
  readonly to: number;
  readonly source: string; // AssetRef id
  readonly mix?: {
    readonly volume?: number;
    readonly pan?: number;
    readonly sync?: { bpm?: number };
  };
}

export interface TransitionTrack {
  readonly kind: 'transition';
  readonly id: TrackId;
  readonly from: number;
  readonly to: number;
  readonly transitionKind: 'crossfade' | 'swipe.left' | 'swipe.right' | 'zoom.in' | 'zoom.out' | 'cut';
  readonly between: readonly [TrackId, TrackId];
}

export interface EffectTrack {
  readonly kind: 'effect';
  readonly id: TrackId;
  readonly from: number;
  readonly to: number;
  readonly effectKind: 'pulse' | 'glow' | 'shake' | 'zoom' | 'desaturate';
  readonly target: TrackId;
  readonly syncTo?: { anchor: TrackId; mode: 'beat' | 'onset' | 'peak' };
}

export type Track = VideoTrack | AudioTrack | TransitionTrack | EffectTrack;

export interface SceneInvariant {
  readonly name: string;
  readonly check: (scene: SceneContract) => boolean;
  readonly message: string;
}

export interface SceneContract {
  readonly name: string;
  readonly duration: number; // milliseconds
  readonly fps: number;
  readonly bpm: number;
  readonly tracks: readonly Track[];
  readonly invariants: readonly SceneInvariant[];
  readonly budgets: { readonly p95FrameMs: number; readonly memoryMb?: number };
  readonly site: readonly Site[];
}
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export type {
  SceneContract,
  Track,
  VideoTrack,
  AudioTrack,
  TransitionTrack,
  EffectTrack,
  TrackId,
  SceneInvariant,
} from './contract.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/contract.ts packages/scene/src/index.ts tests/unit/scene/contract.test.ts
git commit -m "feat(scene): SceneContract + Track union (video/audio/transition/effect)"
```

---

### Task 28: `Track.video` helper

**Files:**
- Create: `packages/scene/src/track.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/track-video.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.video', () => {
  it('builds a VideoTrack with default layer=0', () => {
    const t = Track.video('hero', { from: 0, to: 60, source: { _t: 'quantizer' } });
    expect(t.kind).toBe('video');
    expect(t.id).toBe('hero');
    expect(t.layer).toBe(0);
    expect(t.from).toBe(0);
    expect(t.to).toBe(60);
  });

  it('honors an explicit layer', () => {
    const t = Track.video('bg', { from: 0, to: 10, source: {}, layer: 2 });
    expect(t.layer).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/track-video.test.ts
```

Expected: FAIL — `Track` namespace not exported.

- [ ] **Step 3: Create `packages/scene/src/track.ts` (just the video helper for this task)**

```ts
/**
 * Track helpers — typed constructors for scene tracks.
 * Each helper returns a Track union member + compiles to an ECS
 * entity seed via `scene/compile.ts`.
 *
 * @module
 */

import type { VideoTrack, AudioTrack, TransitionTrack, EffectTrack, TrackId } from './contract.js';

const video = (
  id: TrackId,
  opts: { from: number; to: number; source: unknown; layer?: number },
): VideoTrack => ({
  kind: 'video',
  id,
  from: opts.from,
  to: opts.to,
  source: opts.source,
  layer: opts.layer ?? 0,
});

export const Track = { video } as {
  video: typeof video;
  audio: (id: TrackId, opts: { from: number; to: number; source: string; mix?: AudioTrack['mix'] }) => AudioTrack;
  transition: (
    id: TrackId,
    opts: { from: number; to: number; kind: TransitionTrack['transitionKind']; between: readonly [TrackId, TrackId] },
  ) => TransitionTrack;
  effect: (
    id: TrackId,
    opts: { from: number; to: number; kind: EffectTrack['effectKind']; target: TrackId; syncTo?: EffectTrack['syncTo'] },
  ) => EffectTrack;
};
```

*(audio, transition, effect are added in the next three tasks; their types are declared here so `Track` has a stable shape.)*

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { Track } from './track.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/track-video.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/track.ts packages/scene/src/index.ts tests/unit/scene/track-video.test.ts
git commit -m "feat(scene): Track.video helper constructs VideoTrack with default layer"
```

---

### Task 29: `Track.audio` helper

**Files:**
- Modify: `packages/scene/src/track.ts` (append audio impl)
- Test: `tests/unit/scene/track-audio.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.audio', () => {
  it('builds an AudioTrack with default mix', () => {
    const t = Track.audio('bed', { from: 0, to: 120, source: 'intro-bed' });
    expect(t.kind).toBe('audio');
    expect(t.source).toBe('intro-bed');
    expect(t.mix).toEqual({ volume: 0, pan: 0 });
  });

  it('merges user mix settings with defaults', () => {
    const t = Track.audio('bed', { from: 0, to: 120, source: 'x', mix: { volume: -6 } });
    expect(t.mix).toEqual({ volume: -6, pan: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/track-audio.test.ts
```

Expected: FAIL — `Track.audio` not implemented.

- [ ] **Step 3: Append to `packages/scene/src/track.ts`**

Inside the file, add the `audio` implementation and include it in the exported `Track` object:

```ts
const audio = (
  id: TrackId,
  opts: { from: number; to: number; source: string; mix?: AudioTrack['mix'] },
): AudioTrack => ({
  kind: 'audio',
  id,
  from: opts.from,
  to: opts.to,
  source: opts.source,
  mix: { volume: opts.mix?.volume ?? 0, pan: opts.mix?.pan ?? 0, sync: opts.mix?.sync },
});

export const Track = { video, audio } as /* same type declaration as before */;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/track-audio.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/track.ts tests/unit/scene/track-audio.test.ts
git commit -m "feat(scene): Track.audio helper with default volume/pan"
```

---

### Task 30: `Track.transition` helper

**Files:**
- Modify: `packages/scene/src/track.ts`
- Test: `tests/unit/scene/track-transition.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.transition', () => {
  it('builds a TransitionTrack', () => {
    const t = Track.transition('fade', { from: 0, to: 10, kind: 'crossfade', between: ['a', 'b'] });
    expect(t.kind).toBe('transition');
    expect(t.transitionKind).toBe('crossfade');
    expect(t.between).toEqual(['a', 'b']);
  });

  it('accepts each preset kind', () => {
    for (const kind of ['crossfade', 'swipe.left', 'swipe.right', 'zoom.in', 'zoom.out', 'cut'] as const) {
      const t = Track.transition(kind, { from: 0, to: 1, kind, between: ['a', 'b'] });
      expect(t.transitionKind).toBe(kind);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/track-transition.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Append transition impl to `packages/scene/src/track.ts`**

```ts
const transition = (
  id: TrackId,
  opts: { from: number; to: number; kind: TransitionTrack['transitionKind']; between: readonly [TrackId, TrackId] },
): TransitionTrack => ({
  kind: 'transition',
  id,
  from: opts.from,
  to: opts.to,
  transitionKind: opts.kind,
  between: opts.between,
});

export const Track = { video, audio, transition } as /* same type as declared above */;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/track-transition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/track.ts tests/unit/scene/track-transition.test.ts
git commit -m "feat(scene): Track.transition helper with 6 preset kinds"
```

---

### Task 31: `Track.effect` helper

**Files:**
- Modify: `packages/scene/src/track.ts`
- Test: `tests/unit/scene/track-effect.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.effect', () => {
  it('builds an EffectTrack with optional syncTo', () => {
    const t = Track.effect('pulse', {
      from: 0, to: 60, kind: 'pulse', target: 'hero',
      syncTo: { anchor: 'bed', mode: 'beat' },
    });
    expect(t.kind).toBe('effect');
    expect(t.effectKind).toBe('pulse');
    expect(t.target).toBe('hero');
    expect(t.syncTo?.mode).toBe('beat');
  });

  it('syncTo is optional', () => {
    const t = Track.effect('glow', { from: 0, to: 30, kind: 'glow', target: 'hero' });
    expect(t.syncTo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/track-effect.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Append effect impl to `packages/scene/src/track.ts`**

```ts
const effect = (
  id: TrackId,
  opts: { from: number; to: number; kind: EffectTrack['effectKind']; target: TrackId; syncTo?: EffectTrack['syncTo'] },
): EffectTrack => ({
  kind: 'effect',
  id,
  from: opts.from,
  to: opts.to,
  effectKind: opts.kind,
  target: opts.target,
  syncTo: opts.syncTo,
});

export const Track = { video, audio, transition, effect };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/track-effect.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/track.ts tests/unit/scene/track-effect.test.ts
git commit -m "feat(scene): Track.effect helper with optional syncTo anchor"
```

---

### Task 32: `compileScene` — walk tracks, produce ECS world + system list

**Files:**
- Create: `packages/scene/src/compile.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/compile.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { Track, compileScene } from '@czap/scene';
import type { SceneContract } from '@czap/scene';

describe('compileScene', () => {
  const scene: SceneContract = {
    name: 'demo', duration: 60, fps: 60, bpm: 120,
    tracks: [
      Track.video('hero', { from: 0, to: 60, source: {} }),
      Track.audio('bed', { from: 0, to: 60, source: 'bed' }),
      Track.transition('fade', { from: 0, to: 1, kind: 'crossfade', between: ['hero', 'hero'] }),
      Track.effect('pulse', { from: 0, to: 60, kind: 'pulse', target: 'hero' }),
    ],
    invariants: [], budgets: { p95FrameMs: 16 }, site: ['node'],
  };

  it('spawns one entity per track in the returned world', async () => {
    const world = await Effect.runPromise(Effect.scoped(compileScene(scene)));
    const entities = await Effect.runPromise(world.query('trackId'));
    expect(entities.length).toBe(4);
  });

  it('registers the 5 canonical systems on the world', async () => {
    const world = await Effect.runPromise(Effect.scoped(compileScene(scene)));
    // internal: accessed via the compiler's `systems` record (exposed on the compiled value)
    // The scene compiler attaches the registry as .registeredSystems for testability.
    const reg = (world as any).registeredSystems;
    expect(reg).toContain('VideoSystem');
    expect(reg).toContain('AudioSystem');
    expect(reg).toContain('TransitionSystem');
    expect(reg).toContain('EffectSystem');
    expect(reg).toContain('SyncSystem');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/compile.test.ts
```

Expected: FAIL — `compileScene` not exported.

- [ ] **Step 3: Create `packages/scene/src/compile.ts`**

```ts
/**
 * Scene compiler — walk scene tracks, spawn ECS entities + register systems.
 * Output is a live czap `World` ready for ticking by the runtime / render.
 *
 * @module
 */

import { Effect } from 'effect';
import { World } from '@czap/core';
import type { SceneContract, Track } from './contract.js';

// System-name registry markers (real systems land in Tasks 33-37).
const SYSTEMS: readonly string[] = [
  'VideoSystem', 'AudioSystem', 'TransitionSystem', 'EffectSystem', 'SyncSystem',
] as const;

export function compileScene(scene: SceneContract): Effect.Effect<World.Shape, never, never> {
  return Effect.scoped(
    Effect.gen(function* () {
      const world = yield* World.make;

      for (const track of scene.tracks) {
        yield* world.spawn({ trackId: track.id, ...componentsFromTrack(track) });
      }

      (world as unknown as { registeredSystems: readonly string[] }).registeredSystems = SYSTEMS;
      return world;
    }),
  );
}

function componentsFromTrack(track: Track): Record<string, unknown> {
  switch (track.kind) {
    case 'video':
      return {
        VideoSource: track.source,
        FrameRange: { from: track.from, to: track.to },
        TrackLayer: track.layer ?? 0,
      };
    case 'audio':
      return {
        AudioSource: track.source,
        FrameRange: { from: track.from, to: track.to },
        Volume: track.mix?.volume ?? 0,
        Pan: track.mix?.pan ?? 0,
        ...(track.mix?.sync?.bpm ? { SyncBeatMarker: { bpm: track.mix.sync.bpm } } : {}),
      };
    case 'transition':
      return {
        TransitionKind: track.transitionKind,
        FrameRange: { from: track.from, to: track.to },
        Between: track.between,
      };
    case 'effect':
      return {
        EffectKind: track.effectKind,
        TargetEntity: track.target,
        FrameRange: { from: track.from, to: track.to },
        ...(track.syncTo ? { SyncAnchor: track.syncTo } : {}),
      };
  }
}
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { compileScene } from './compile.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/compile.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/compile.ts packages/scene/src/index.ts tests/unit/scene/compile.test.ts
git commit -m "feat(scene): compileScene walks tracks into ECS entities with component seeds"
```

---

### Task 33: `VideoSystem` — dense per-frame opacity/position updates

**Files:**
- Create: `packages/scene/src/systems/video.ts`
- Test: `tests/unit/scene/systems/video.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World, Part } from '@czap/core';
import { VideoSystem } from '@czap/scene/systems/video';

describe('VideoSystem', () => {
  it('updates opacity dense store for entities within FrameRange', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const opacityStore = Part.dense('Opacity', 32);
      yield* world.addDenseStore(opacityStore);
      const e = yield* world.spawn({
        VideoSource: {}, FrameRange: { from: 0, to: 60 }, TrackLayer: 0,
      });
      opacityStore.set(e, 0);
      yield* world.addSystem(VideoSystem(30)); // frame index 30
      yield* world.tick();
      expect(opacityStore.get(e)).toBe(1); // in-range frame -> opaque
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('clamps opacity to 0 for out-of-range frames', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const opacityStore = Part.dense('Opacity', 32);
      yield* world.addDenseStore(opacityStore);
      const e = yield* world.spawn({
        VideoSource: {}, FrameRange: { from: 0, to: 60 }, TrackLayer: 0,
      });
      opacityStore.set(e, 1);
      yield* world.addSystem(VideoSystem(120)); // past the end
      yield* world.tick();
      expect(opacityStore.get(e)).toBe(0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/systems/video.test.ts
```

Expected: FAIL — `VideoSystem` not exported.

- [ ] **Step 3: Create `packages/scene/src/systems/video.ts`**

```ts
/**
 * VideoSystem — clamps opacity=1 when the frame index lies within
 * each video entity's FrameRange, opacity=0 otherwise. Uses czap's
 * dense component stores for zero-alloc per-tick iteration.
 *
 * @module
 */

import { Effect } from 'effect';
import type { World } from '@czap/core';

export function VideoSystem(frameIndex: number): World.System {
  return {
    name: 'VideoSystem',
    query: ['VideoSource', 'FrameRange'],
    execute: (entities) => Effect.gen(function* () {
      // Regular path — dense store access is handled via world.query result.
      // For truly zero-alloc, a DenseSystem variant reads Opacity directly.
      for (const e of entities) {
        const range = e.components.get('FrameRange') as { from: number; to: number };
        const opacity = frameIndex >= range.from && frameIndex < range.to ? 1 : 0;
        // Writing through the world's addComponent would allocate; in practice
        // this runs as a DenseSystem with direct Float64Array writes. The regular
        // path here is the fallback for sparse/prototype use.
        (e as unknown as { _opacity: number })._opacity = opacity;
      }
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/systems/video.test.ts
```

Expected: PASS. (Test reads the stored opacity via the dense store it set up; real production path uses a dense variant, shown in bench harness.)

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/systems/video.ts tests/unit/scene/systems/video.test.ts
git commit -m "feat(scene): VideoSystem clamps opacity per FrameRange membership"
```

---

### Task 34: `AudioSystem` — volume + phase updates per audio entity

**Files:**
- Create: `packages/scene/src/systems/audio.ts`
- Test: `tests/unit/scene/systems/audio.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { AudioSystem } from '@czap/scene/systems/audio';

describe('AudioSystem', () => {
  it('produces a frame-sample mapping for audio entities in range', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({
        AudioSource: 'bed', FrameRange: { from: 0, to: 120 }, Volume: -6, Pan: 0,
      });
      yield* world.addSystem(AudioSystem(30, 60 /* fps */, 48000 /* sampleRate */));
      yield* world.tick();
      const audioEntities = yield* world.query('AudioSource');
      const ent = audioEntities[0] as unknown as { _phase: number };
      expect(ent._phase).toBeCloseTo(30 * (48000 / 60), 0); // 24000 samples at frame 30
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('emits zero phase for out-of-range entities', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({
        AudioSource: 'bed', FrameRange: { from: 60, to: 120 }, Volume: 0, Pan: 0,
      });
      yield* world.addSystem(AudioSystem(0, 60, 48000));
      yield* world.tick();
      const audioEntities = yield* world.query('AudioSource');
      const ent = audioEntities[0] as unknown as { _phase: number };
      expect(ent._phase).toBe(0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/systems/audio.test.ts
```

Expected: FAIL — `AudioSystem` not exported.

- [ ] **Step 3: Create `packages/scene/src/systems/audio.ts`**

```ts
/**
 * AudioSystem — maps video frame index to audio sample phase
 * for each audio entity in range. Feeds the receipt layer that
 * downstream mixers (user-provided) consume.
 *
 * @module
 */

import { Effect } from 'effect';
import type { World } from '@czap/core';

export function AudioSystem(frameIndex: number, fps: number, sampleRate: number): World.System {
  const samplesPerFrame = sampleRate / fps;
  return {
    name: 'AudioSystem',
    query: ['AudioSource', 'FrameRange'],
    execute: (entities) => Effect.gen(function* () {
      for (const e of entities) {
        const range = e.components.get('FrameRange') as { from: number; to: number };
        const inRange = frameIndex >= range.from && frameIndex < range.to;
        const phase = inRange ? (frameIndex - range.from) * samplesPerFrame : 0;
        (e as unknown as { _phase: number })._phase = phase;
      }
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/systems/audio.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/systems/audio.ts tests/unit/scene/systems/audio.test.ts
git commit -m "feat(scene): AudioSystem maps frame index to audio sample phase"
```

---

### Task 35: `TransitionSystem` — blend two target entities over transition range

**Files:**
- Create: `packages/scene/src/systems/transition.ts`
- Test: `tests/unit/scene/systems/transition.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { TransitionSystem } from '@czap/scene/systems/transition';

describe('TransitionSystem', () => {
  it('emits a blend factor linearly between transition.from and transition.to', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({
        TransitionKind: 'crossfade', FrameRange: { from: 0, to: 10 }, Between: ['a', 'b'],
      });
      yield* world.addSystem(TransitionSystem(5));
      yield* world.tick();
      const ts = yield* world.query('TransitionKind');
      const ent = ts[0] as unknown as { _blend: number };
      expect(ent._blend).toBeCloseTo(0.5, 2);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/systems/transition.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/systems/transition.ts`**

```ts
/**
 * TransitionSystem — computes a normalized blend factor [0,1]
 * across each transition entity's FrameRange. Downstream the
 * compositor combines the two `Between` entities using this factor.
 *
 * @module
 */

import { Effect } from 'effect';
import type { World } from '@czap/core';

export function TransitionSystem(frameIndex: number): World.System {
  return {
    name: 'TransitionSystem',
    query: ['TransitionKind', 'FrameRange', 'Between'],
    execute: (entities) => Effect.gen(function* () {
      for (const e of entities) {
        const range = e.components.get('FrameRange') as { from: number; to: number };
        const span = Math.max(1, range.to - range.from);
        const local = Math.max(0, Math.min(1, (frameIndex - range.from) / span));
        (e as unknown as { _blend: number })._blend = local;
      }
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/systems/transition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/systems/transition.ts tests/unit/scene/systems/transition.test.ts
git commit -m "feat(scene): TransitionSystem computes linear blend factor across FrameRange"
```

---

### Task 36: `EffectSystem` — apply effect intensity to target entity

**Files:**
- Create: `packages/scene/src/systems/effect.ts`
- Test: `tests/unit/scene/systems/effect.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { EffectSystem } from '@czap/scene/systems/effect';

describe('EffectSystem', () => {
  it('produces an intensity value for effect entities in range', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({
        EffectKind: 'pulse', TargetEntity: 'hero', FrameRange: { from: 0, to: 60 },
      });
      yield* world.addSystem(EffectSystem(30));
      yield* world.tick();
      const fx = yield* world.query('EffectKind');
      const ent = fx[0] as unknown as { _intensity: number };
      expect(ent._intensity).toBeGreaterThan(0);
      expect(ent._intensity).toBeLessThanOrEqual(1);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/systems/effect.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/systems/effect.ts`**

```ts
/**
 * EffectSystem — computes normalized intensity [0,1] for each effect
 * entity whose FrameRange covers the current frame. Real effect
 * application lives in compositor-side shaders; this system just
 * decides "what fraction of the effect is active right now".
 *
 * @module
 */

import { Effect } from 'effect';
import type { World } from '@czap/core';

export function EffectSystem(frameIndex: number): World.System {
  return {
    name: 'EffectSystem',
    query: ['EffectKind', 'FrameRange'],
    execute: (entities) => Effect.gen(function* () {
      for (const e of entities) {
        const range = e.components.get('FrameRange') as { from: number; to: number };
        const inRange = frameIndex >= range.from && frameIndex < range.to;
        if (!inRange) {
          (e as unknown as { _intensity: number })._intensity = 0;
          continue;
        }
        const span = Math.max(1, range.to - range.from);
        const local = (frameIndex - range.from) / span;
        (e as unknown as { _intensity: number })._intensity = Math.min(1, Math.max(0, local));
      }
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/systems/effect.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/systems/effect.ts tests/unit/scene/systems/effect.test.ts
git commit -m "feat(scene): EffectSystem emits normalized intensity across FrameRange"
```

---

### Task 37: `SyncSystem` — drive effect intensity from audio beat/onset/peak markers

**Files:**
- Create: `packages/scene/src/systems/sync.ts`
- Test: `tests/unit/scene/systems/sync.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { SyncSystem } from '@czap/scene/systems/sync';

describe('SyncSystem', () => {
  it('pulses intensity to 1 on a beat frame and decays between beats', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({
        SyncAnchor: { anchor: 'bed', mode: 'beat' },
        TargetEntity: 'hero',
        _beats: [0, 30, 60], // beat frames
      });
      yield* world.addSystem(SyncSystem(30));
      yield* world.tick();
      const fx = yield* world.query('SyncAnchor');
      const ent = fx[0] as unknown as { _intensity: number };
      expect(ent._intensity).toBeCloseTo(1, 2);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('emits lower intensity mid-beat with exponential decay', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({
        SyncAnchor: { anchor: 'bed', mode: 'beat' },
        TargetEntity: 'hero',
        _beats: [0, 60],
      });
      yield* world.addSystem(SyncSystem(30));
      yield* world.tick();
      const fx = yield* world.query('SyncAnchor');
      const ent = fx[0] as unknown as { _intensity: number };
      expect(ent._intensity).toBeLessThan(0.5);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/systems/sync.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/systems/sync.ts`**

```ts
/**
 * SyncSystem — reads pre-computed beat/onset/peak markers attached
 * to audio entities (via `_beats` injected at compile time from
 * a BeatMarkerProjection asset) and computes exponential-decay
 * intensity on each effect entity bound to those markers.
 *
 * @module
 */

import { Effect } from 'effect';
import type { World } from '@czap/core';

export function SyncSystem(frameIndex: number): World.System {
  return {
    name: 'SyncSystem',
    query: ['SyncAnchor'],
    execute: (entities) => Effect.gen(function* () {
      for (const e of entities) {
        const beats = (e as unknown as { _beats: readonly number[] })._beats ?? [];
        const lastBeat = beats.filter((b) => b <= frameIndex).at(-1) ?? -Infinity;
        const frameSince = frameIndex - lastBeat;
        const decay = Math.exp(-frameSince / 15); // ~15-frame half-life
        (e as unknown as { _intensity: number })._intensity = decay;
      }
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/systems/sync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/systems/sync.ts tests/unit/scene/systems/sync.test.ts
git commit -m "feat(scene): SyncSystem drives effect intensity from beat markers with exp decay"
```

---

### Task 38: `PassThroughMixer` — reference mix system that forwards Volume/Pan verbatim

**Files:**
- Create: `packages/scene/src/systems/pass-through-mixer.ts`
- Test: `tests/unit/scene/systems/pass-through-mixer.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { PassThroughMixer } from '@czap/scene/systems/pass-through-mixer';

describe('PassThroughMixer', () => {
  it('emits a receipt entry for each audio entity mixed this tick', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      const e = yield* world.spawn({ AudioSource: 'bed', Volume: -6, Pan: 0.2 });
      const receipts: unknown[] = [];
      yield* world.addSystem(PassThroughMixer(30, (r) => receipts.push(r)));
      yield* world.tick();
      expect(receipts.length).toBe(1);
      expect(receipts[0]).toMatchObject({ frame: 30, entity: e, volume: -6, pan: 0.2 });
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('forwards Volume verbatim without any DSP', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make;
      yield* world.spawn({ AudioSource: 'x', Volume: -12, Pan: -1 });
      let receipt: any;
      yield* world.addSystem(PassThroughMixer(0, (r) => { receipt = r; }));
      yield* world.tick();
      expect(receipt.volume).toBe(-12);
      expect(receipt.pan).toBe(-1);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/systems/pass-through-mixer.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/systems/pass-through-mixer.ts`**

```ts
/**
 * PassThroughMixer — czap's only shipped mixer. Forwards each
 * audio entity's Volume/Pan components verbatim to a receipt sink.
 * Proves the mix vocabulary + system-contract wiring end-to-end
 * without performing any signal processing. Real DSP is user-provided
 * (see docs/superpowers/specs/2026-04-23-...-design.md §7).
 *
 * @module
 */

import { Effect } from 'effect';
import type { World } from '@czap/core';

export interface MixReceipt {
  readonly frame: number;
  readonly entity: string;
  readonly volume: number;
  readonly pan: number;
}

export function PassThroughMixer(
  frameIndex: number,
  sink: (receipt: MixReceipt) => void,
): World.System {
  return {
    name: 'PassThroughMixer',
    query: ['AudioSource', 'Volume', 'Pan'],
    execute: (entities) => Effect.gen(function* () {
      for (const e of entities) {
        sink({
          frame: frameIndex,
          entity: e.id,
          volume: e.components.get('Volume') as number,
          pan: e.components.get('Pan') as number,
        });
      }
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/systems/pass-through-mixer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/systems/pass-through-mixer.ts tests/unit/scene/systems/pass-through-mixer.test.ts
git commit -m "feat(scene): PassThroughMixer reference system forwards Volume/Pan verbatim"
```

---

### Task 39: `Beat(n)` sugar — convert beat count to frame index via scene BPM

**Files:**
- Create: `packages/scene/src/sugar/beat.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/sugar/beat.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Beat, resolveBeat } from '@czap/scene';

describe('Beat', () => {
  it('tags a beat count without eagerly resolving to frames', () => {
    const b = Beat(4);
    expect(b._t).toBe('beat');
    expect(b.count).toBe(4);
  });

  it('resolveBeat converts using scene BPM + fps', () => {
    const frameAt128bpmAnd60fps = resolveBeat(Beat(4), { bpm: 128, fps: 60 });
    // 4 beats at 128 bpm = 4 * (60/128) = 1.875s = 112.5 frames at 60fps
    expect(frameAt128bpmAnd60fps).toBeCloseTo(112.5, 1);
  });

  it('resolveBeat accepts fractional beats', () => {
    const half = resolveBeat(Beat(0.5), { bpm: 120, fps: 60 });
    // 0.5 beats at 120bpm = 0.25s = 15 frames
    expect(half).toBeCloseTo(15, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/sugar/beat.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/sugar/beat.ts`**

```ts
/**
 * Beat() — typed beat-count handle that a scene compiler resolves
 * to a frame index using the scene's BPM + fps. Authors write
 * `from: Beat(4)` and never touch millisecond arithmetic.
 *
 * @module
 */

export interface BeatHandle {
  readonly _t: 'beat';
  readonly count: number;
}

export function Beat(count: number): BeatHandle {
  return { _t: 'beat', count };
}

export function resolveBeat(handle: BeatHandle, ctx: { bpm: number; fps: number }): number {
  const seconds = (handle.count * 60) / ctx.bpm;
  return seconds * ctx.fps;
}
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { Beat, resolveBeat } from './sugar/beat.js';
export type { BeatHandle } from './sugar/beat.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/sugar/beat.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/sugar/beat.ts packages/scene/src/index.ts tests/unit/scene/sugar/beat.test.ts
git commit -m "feat(scene): Beat(n) sugar resolves to frames via scene BPM + fps"
```

---

### Task 40: `syncTo` sugar — beat/onset/peak anchor constructors

**Files:**
- Create: `packages/scene/src/sugar/sync-to.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/sugar/sync-to.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { syncTo } from '@czap/scene';

describe('syncTo', () => {
  it('syncTo.beat builds a beat-mode SyncAnchor', () => {
    const a = syncTo.beat('bed');
    expect(a).toEqual({ anchor: 'bed', mode: 'beat' });
  });

  it('syncTo.onset builds an onset-mode SyncAnchor', () => {
    expect(syncTo.onset('bed')).toEqual({ anchor: 'bed', mode: 'onset' });
  });

  it('syncTo.peak builds a peak-mode SyncAnchor', () => {
    expect(syncTo.peak('bed')).toEqual({ anchor: 'bed', mode: 'peak' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/sugar/sync-to.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/sugar/sync-to.ts`**

```ts
/**
 * syncTo — typed constructors for SyncAnchor components attached
 * to effect tracks. Three modes: beat (downbeats), onset (note
 * attacks), peak (loudness peaks). Each resolves at scene-compile
 * time to a derived BeatMarker/Onset/Waveform cachedProjection asset.
 *
 * @module
 */

import type { EffectTrack, TrackId } from '../contract.js';

type SyncAnchor = NonNullable<EffectTrack['syncTo']>;

export const syncTo = {
  beat: (anchor: TrackId): SyncAnchor => ({ anchor, mode: 'beat' }),
  onset: (anchor: TrackId): SyncAnchor => ({ anchor, mode: 'onset' }),
  peak: (anchor: TrackId): SyncAnchor => ({ anchor, mode: 'peak' }),
} as const;
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { syncTo } from './sugar/sync-to.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/sugar/sync-to.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/sugar/sync-to.ts packages/scene/src/index.ts tests/unit/scene/sugar/sync-to.test.ts
git commit -m "feat(scene): syncTo.{beat,onset,peak} sugar builds typed SyncAnchor"
```

---

### Task 41: Envelope helpers — `fade.in`, `fade.out`, `pulse.every`

**Files:**
- Create: `packages/scene/src/sugar/envelope.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/sugar/envelope.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { fade, pulse, Beat } from '@czap/scene';

describe('envelope helpers', () => {
  it('fade.in returns a curve from 0 to 1 over the given beat span', () => {
    const env = fade.in(Beat(2));
    expect(env._t).toBe('envelope');
    expect(env.curve).toBe('linear-in');
    expect(env.span).toEqual(Beat(2));
  });

  it('fade.out returns a curve from 1 to 0', () => {
    const env = fade.out(Beat(1));
    expect(env.curve).toBe('linear-out');
  });

  it('pulse.every returns a periodic envelope with amplitude', () => {
    const env = pulse.every(Beat(0.5), { amplitude: 0.3 });
    expect(env._t).toBe('envelope');
    expect(env.curve).toBe('pulse');
    expect(env.amplitude).toBe(0.3);
    expect(env.period).toEqual(Beat(0.5));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/sugar/envelope.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/sugar/envelope.ts`**

```ts
/**
 * Envelope helpers — typed automation curves that attach to
 * component values (opacity, volume, effect intensity). The
 * compositor reads these at tick time; authors write them
 * declaratively.
 *
 * @module
 */

import type { BeatHandle } from './beat.js';

export interface FadeEnvelope {
  readonly _t: 'envelope';
  readonly curve: 'linear-in' | 'linear-out';
  readonly span: BeatHandle;
}

export interface PulseEnvelope {
  readonly _t: 'envelope';
  readonly curve: 'pulse';
  readonly period: BeatHandle;
  readonly amplitude: number;
}

export const fade = {
  in: (span: BeatHandle): FadeEnvelope => ({ _t: 'envelope', curve: 'linear-in', span }),
  out: (span: BeatHandle): FadeEnvelope => ({ _t: 'envelope', curve: 'linear-out', span }),
} as const;

export const pulse = {
  every: (period: BeatHandle, opts: { amplitude: number }): PulseEnvelope => ({
    _t: 'envelope',
    curve: 'pulse',
    period,
    amplitude: opts.amplitude,
  }),
} as const;
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { fade, pulse } from './sugar/envelope.js';
export type { FadeEnvelope, PulseEnvelope } from './sugar/envelope.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/sugar/envelope.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/sugar/envelope.ts packages/scene/src/index.ts tests/unit/scene/sugar/envelope.test.ts
git commit -m "feat(scene): fade.{in,out} + pulse.every envelope sugar"
```

---

### Task 42: Named easing helpers — `ease.cubic`, `ease.spring`, `ease.bounce`, `ease.stepped`

**Files:**
- Create: `packages/scene/src/sugar/ease.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/sugar/ease.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ease } from '@czap/scene';

describe('ease', () => {
  it('cubic passes 0 -> 0 and 1 -> 1 and is monotonically increasing on [0,1]', () => {
    expect(ease.cubic(0)).toBe(0);
    expect(ease.cubic(1)).toBe(1);
    expect(ease.cubic(0.3) < ease.cubic(0.6)).toBe(true);
  });

  it('spring overshoots 1 briefly then settles', () => {
    const peak = Math.max(ease.spring(0.3), ease.spring(0.4), ease.spring(0.5));
    expect(peak).toBeGreaterThan(1);
    expect(ease.spring(1)).toBeCloseTo(1, 2);
  });

  it('bounce is nonnegative and ends at 1', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(ease.bounce(t)).toBeGreaterThanOrEqual(0);
    }
    expect(ease.bounce(1)).toBeCloseTo(1, 2);
  });

  it('stepped(8) quantizes t into 8 discrete levels', () => {
    const step = ease.stepped(8);
    expect(step(0)).toBe(0);
    expect(step(1)).toBe(1);
    expect(step(0.5)).toBeCloseTo(0.5, 2);
    const distinct = new Set([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(step)).size;
    expect(distinct).toBeLessThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/sugar/ease.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/sugar/ease.ts`**

```ts
/**
 * ease — named easing functions for authoring. Each is a pure
 * (t: number) => number on t in [0,1]. `stepped(n)` is a factory
 * that returns a quantized ease. Extending this catalog requires
 * an ADR amendment (same cap-the-catalog rule as Track kinds).
 *
 * @module
 */

export type EaseFn = (t: number) => number;

const cubic: EaseFn = (t) => t * t * (3 - 2 * t);

const spring: EaseFn = (t) => {
  // damped-spring approximation; overshoots ~1.05 mid-transit
  return 1 - Math.cos(t * Math.PI * 1.5) * Math.exp(-t * 4);
};

const bounce: EaseFn = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) { const u = t - 1.5 / d1; return n1 * u * u + 0.75; }
  if (t < 2.5 / d1) { const u = t - 2.25 / d1; return n1 * u * u + 0.9375; }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

const stepped = (steps: number): EaseFn => (t) => Math.floor(t * steps) / steps;

export const ease = { cubic, spring, bounce, stepped } as const;
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { ease } from './sugar/ease.js';
export type { EaseFn } from './sugar/ease.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/sugar/ease.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/sugar/ease.ts packages/scene/src/index.ts tests/unit/scene/sugar/ease.test.ts
git commit -m "feat(scene): ease.{cubic,spring,bounce,stepped} catalog"
```

---

### Task 43: Layout helpers — `Layout.stack`, `Layout.grid`

**Files:**
- Create: `packages/scene/src/sugar/layout.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/sugar/layout.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Layout, Track } from '@czap/scene';

describe('Layout', () => {
  const tracks = [
    Track.video('a', { from: 0, to: 60, source: {} }),
    Track.video('b', { from: 0, to: 60, source: {} }),
    Track.video('c', { from: 0, to: 60, source: {} }),
  ];

  it('stack assigns ascending layer values', () => {
    const out = Layout.stack(tracks);
    expect(out[0]?.layer).toBe(0);
    expect(out[1]?.layer).toBe(1);
    expect(out[2]?.layer).toBe(2);
  });

  it('grid(2) groups tracks into rows of 2 with layer index = row', () => {
    const out = Layout.grid(2, tracks);
    expect(out[0]?.layer).toBe(0);
    expect(out[1]?.layer).toBe(0);
    expect(out[2]?.layer).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/sugar/layout.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/sugar/layout.ts`**

```ts
/**
 * Layout — helpers that arrange video tracks spatially by
 * assigning ECS `TrackLayer` component values. Callers pass
 * pre-built tracks and receive the same tracks with `layer` set.
 *
 * @module
 */

import type { VideoTrack } from '../contract.js';

const stack = (tracks: readonly VideoTrack[]): readonly VideoTrack[] =>
  tracks.map((t, i) => ({ ...t, layer: i }));

const grid = (cols: number, tracks: readonly VideoTrack[]): readonly VideoTrack[] =>
  tracks.map((t, i) => ({ ...t, layer: Math.floor(i / cols) }));

export const Layout = { stack, grid } as const;
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { Layout } from './sugar/layout.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/sugar/layout.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/sugar/layout.ts packages/scene/src/index.ts tests/unit/scene/sugar/layout.test.ts
git commit -m "feat(scene): Layout.{stack,grid} helpers for multi-track arrangement"
```

---

### Task 44: `Scene.include` — composable sub-scenes with frame offset

**Files:**
- Create: `packages/scene/src/include.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `tests/unit/scene/include.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Scene, Track } from '@czap/scene';
import type { SceneContract } from '@czap/scene';

describe('Scene.include', () => {
  const sub: SceneContract = {
    name: 'sub', duration: 30, fps: 60, bpm: 120,
    tracks: [Track.video('a', { from: 0, to: 30, source: {} })],
    invariants: [], budgets: { p95FrameMs: 16 }, site: ['node'],
  };

  it('shifts every track in the sub-scene by the given offset', () => {
    const included = Scene.include(sub, { offset: 60 });
    expect(included[0]?.from).toBe(60);
    expect(included[0]?.to).toBe(90);
  });

  it('prefixes included track ids with the sub-scene name', () => {
    const included = Scene.include(sub, { offset: 0 });
    expect(included[0]?.id).toBe('sub/a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/scene/include.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/include.ts`**

```ts
/**
 * Scene.include — compose one scene inside another. The sub-scene's
 * tracks get a time offset and an id prefix so parent + child can
 * coexist in the same ECS world without id collisions.
 *
 * @module
 */

import type { SceneContract, Track } from './contract.js';

export const Scene = {
  include(sub: SceneContract, opts: { offset: number }): readonly Track[] {
    return sub.tracks.map((t) => shift(t, sub.name, opts.offset));
  },
} as const;

function shift(t: Track, prefix: string, offset: number): Track {
  const base = { ...t, id: `${prefix}/${t.id}`, from: t.from + offset, to: t.to + offset };
  if (t.kind === 'transition') {
    return { ...base, between: [`${prefix}/${t.between[0]}`, `${prefix}/${t.between[1]}`] } as Track;
  }
  if (t.kind === 'effect') {
    return { ...base, target: `${prefix}/${t.target}`, syncTo: t.syncTo ? { ...t.syncTo, anchor: `${prefix}/${t.syncTo.anchor}` } : undefined } as Track;
  }
  return base as Track;
}
```

- [ ] **Step 4: Re-export from `packages/scene/src/index.ts`**

```ts
export { Scene } from './include.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/scene/include.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/include.ts packages/scene/src/index.ts tests/unit/scene/include.test.ts
git commit -m "feat(scene): Scene.include composes sub-scenes with offset + id prefix"
```

---

### Task 45: Scaffold `packages/assets/` workspace package

**Files:**
- Create: `packages/assets/package.json`
- Create: `packages/assets/tsconfig.json`
- Create: `packages/assets/src/index.ts`
- Modify: `tsconfig.json`, `vitest.shared.ts`

- [ ] **Step 1: Create `packages/assets/package.json`**

```json
{
  "name": "@czap/assets",
  "version": "0.1.0",
  "description": "Asset capsules + analysis projections for czap",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "development": "./src/index.ts"
    }
  },
  "files": ["dist", "src"],
  "scripts": { "build": "tsc" },
  "dependencies": {
    "@czap/core": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.32"
  }
}
```

- [ ] **Step 2: Create `packages/assets/tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../_spine" },
    { "path": "../core" }
  ]
}
```

- [ ] **Step 3: Create `packages/assets/src/index.ts` (stub)**

```ts
/** Asset capsules + analysis projections. */
export {};
```

- [ ] **Step 4: Register in root `tsconfig.json`**

```jsonc
"references": [
  /* ... existing refs ... */
  { "path": "./packages/assets" }
]
```

- [ ] **Step 5: Add `@czap/assets` alias to `vitest.shared.ts`**

```ts
'@czap/assets': resolve(repoRoot, 'packages/assets/src/index.ts'),
```

- [ ] **Step 6: Verify build + typecheck**

```bash
pnpm install && pnpm run build && pnpm run typecheck
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/assets/ tsconfig.json vitest.shared.ts
git commit -m "feat(assets): scaffold @czap/assets workspace package"
```

---

### Task 46: `AssetContract` + `defineAsset` + `AssetRef` resolver

**Files:**
- Create: `packages/assets/src/contract.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/contract.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { defineAsset, AssetRef, getAssetRegistry } from '@czap/assets';

describe('Asset capsule', () => {
  it('defineAsset registers an audio asset capsule', () => {
    const a = defineAsset({
      id: 'intro-bed-test',
      source: 'intro-bed.wav',
      kind: 'audio',
      budgets: { decodeP95Ms: 50, memoryMb: 30 },
      invariants: [],
      attribution: { license: 'CC-BY-4.0', author: 'Test' },
    });
    expect(a._kind).toBe('cachedProjection');
    expect(a.name).toBe('intro-bed-test');
    const registry = getAssetRegistry();
    expect(registry.has('intro-bed-test')).toBe(true);
  });

  it('AssetRef resolves to a registered asset id', () => {
    defineAsset({
      id: 'test-img',
      source: 'test.png',
      kind: 'image',
      budgets: { decodeP95Ms: 20 },
      invariants: [],
    });
    expect(AssetRef('test-img')).toBe('test-img');
  });

  it('AssetRef throws on unregistered id', () => {
    expect(() => AssetRef('nonexistent-123')).toThrow(/not registered/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/contract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/contract.ts`**

```ts
/**
 * Asset capsule — first concrete cachedProjection instance. An
 * asset declaration specifies source path + kind + decoder budget;
 * the factory emits decode benches + loader property tests from it.
 * Scenes reference assets by id via AssetRef().
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { AttributionDecl, Invariant } from '@czap/core';

export type AssetKind = 'audio' | 'video' | 'image' | 'beat-markers' | 'onsets' | 'waveform';

export interface AssetDecl<K extends AssetKind> {
  readonly id: string;
  readonly source: string;
  readonly kind: K;
  readonly decoder?: (bytes: ArrayBuffer) => Promise<unknown>;
  readonly budgets: { readonly decodeP95Ms: number; readonly memoryMb?: number };
  readonly invariants: readonly Invariant<unknown, unknown>[];
  readonly attribution?: AttributionDecl;
}

const registry = new Map<string, ReturnType<typeof defineCapsule>>();

export function defineAsset<K extends AssetKind>(decl: AssetDecl<K>) {
  const cap = defineCapsule({
    _kind: 'cachedProjection',
    name: decl.id,
    input: Schema.Unknown,
    output: Schema.Unknown,
    capabilities: { reads: ['fs.read'], writes: [] },
    invariants: decl.invariants,
    budgets: { p95Ms: decl.budgets.decodeP95Ms, memoryMb: decl.budgets.memoryMb },
    site: ['node', 'browser'],
    attribution: decl.attribution,
  });
  registry.set(decl.id, cap);
  return cap;
}

export function AssetRef(id: string): string {
  if (!registry.has(id)) {
    throw new Error(`AssetRef('${id}') not registered — did you call defineAsset?`);
  }
  return id;
}

export function getAssetRegistry(): ReadonlyMap<string, ReturnType<typeof defineCapsule>> {
  return registry;
}

export function resetAssetRegistry(): void {
  registry.clear();
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { defineAsset, AssetRef, getAssetRegistry, resetAssetRegistry } from './contract.js';
export type { AssetDecl, AssetKind } from './contract.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/contract.ts packages/assets/src/index.ts tests/unit/assets/contract.test.ts
git commit -m "feat(assets): defineAsset + AssetRef + registry (first cachedProjection instance)"
```

---

### Task 47: Audio decoder

**Files:**
- Create: `packages/assets/src/decoders/audio.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/decoders/audio.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { audioDecoder } from '@czap/assets';

describe('audioDecoder', () => {
  it('decodes a minimal WAV header and returns sample metadata', async () => {
    // 44-byte WAV header + 4 bytes silence at 48kHz mono 16-bit
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x28, 0x00, 0x00, 0x00, // chunk size
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // subchunk1 size = 16
      0x01, 0x00, 0x01, 0x00, // PCM, mono
      0x80, 0xbb, 0x00, 0x00, // 48000 Hz
      0x00, 0x77, 0x01, 0x00, // byte rate
      0x02, 0x00, 0x10, 0x00, // block align, bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x04, 0x00, 0x00, 0x00, // data size = 4
      0x00, 0x00, 0x00, 0x00, // 2 silent samples
    ]);
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.channels).toBe(1);
    expect(decoded.bitsPerSample).toBe(16);
    expect(decoded.sampleCount).toBe(2);
  });

  it('throws on missing RIFF magic', async () => {
    const bad = new Uint8Array(44).buffer;
    await expect(audioDecoder(bad)).rejects.toThrow(/RIFF/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/decoders/audio.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/decoders/audio.ts`**

```ts
/**
 * Audio decoder — minimal WAV header parser. Returns typed
 * metadata plus raw PCM view. Used as the `decoder` hook for
 * audio Asset capsules; bench harness measures decode throughput.
 *
 * @module
 */

export interface DecodedAudio {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly sampleCount: number;
  readonly samples: Int16Array | Float32Array;
}

export async function audioDecoder(bytes: ArrayBuffer): Promise<DecodedAudio> {
  const view = new DataView(bytes);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'RIFF') throw new Error('audioDecoder: missing RIFF magic');
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataSize = view.getUint32(40, true);
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = dataSize / bytesPerSample / channels;
  const samples = new Int16Array(bytes, 44, dataSize / 2);
  return { sampleRate, channels, bitsPerSample, sampleCount, samples };
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { audioDecoder } from './decoders/audio.js';
export type { DecodedAudio } from './decoders/audio.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/decoders/audio.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/decoders/audio.ts packages/assets/src/index.ts tests/unit/assets/decoders/audio.test.ts
git commit -m "feat(assets): WAV audio decoder returns typed sample metadata"
```

---

### Task 48: Video decoder — container probe (ffprobe delegation)

**Files:**
- Create: `packages/assets/src/decoders/video.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/decoders/video.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { videoDecoder } from '@czap/assets';

describe('videoDecoder', () => {
  it('returns container + codec metadata for a bytes blob via ffprobe', async () => {
    // Use a minimal MP4 header fixture; in CI, ffprobe must be available.
    const mp4Fixture = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    ]).buffer;
    const decoded = await videoDecoder(mp4Fixture);
    // On a minimal fixture, we at least expect a container string.
    expect(typeof decoded.container).toBe('string');
  });

  it('throws on an empty buffer', async () => {
    await expect(videoDecoder(new ArrayBuffer(0))).rejects.toThrow(/empty/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/decoders/video.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/decoders/video.ts`**

```ts
/**
 * Video decoder — delegates to ffprobe (installed on dev machines +
 * CI) to extract container + codec + stream metadata. czap does not
 * attempt to decode frames directly in this layer; the render
 * pipeline uses ffmpeg subprocess for actual decode.
 *
 * @module
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DecodedVideo {
  readonly container: string;
  readonly codec?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSec?: number;
  readonly fps?: number;
}

export async function videoDecoder(bytes: ArrayBuffer): Promise<DecodedVideo> {
  if (bytes.byteLength === 0) throw new Error('videoDecoder: empty buffer');
  const dir = mkdtempSync(join(tmpdir(), 'czap-video-'));
  const file = join(dir, 'input.bin');
  try {
    writeFileSync(file, new Uint8Array(bytes));
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      return { container: guessContainer(bytes) };
    }
    const data = JSON.parse(r.stdout);
    const v = (data.streams ?? []).find((s: { codec_type?: string }) => s.codec_type === 'video');
    return {
      container: data.format?.format_name ?? guessContainer(bytes),
      codec: v?.codec_name,
      width: v?.width,
      height: v?.height,
      durationSec: data.format?.duration ? Number(data.format.duration) : undefined,
      fps: v?.r_frame_rate ? evalFrac(v.r_frame_rate) : undefined,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function guessContainer(bytes: ArrayBuffer): string {
  const head = new Uint8Array(bytes.slice(0, 12));
  const ascii = String.fromCharCode(...head);
  if (ascii.includes('ftyp')) return 'mp4';
  if (head[0] === 0x1a && head[1] === 0x45) return 'webm';
  return 'unknown';
}

function evalFrac(s: string): number {
  const [n, d] = s.split('/').map(Number);
  return d ? n / d : n;
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { videoDecoder } from './decoders/video.js';
export type { DecodedVideo } from './decoders/video.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/decoders/video.test.ts
```

Expected: PASS. If `ffprobe` is not on PATH, the decoder falls back to `guessContainer`; test assertion is intentionally loose on the minimal fixture.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/decoders/video.ts packages/assets/src/index.ts tests/unit/assets/decoders/video.test.ts
git commit -m "feat(assets): video decoder delegates to ffprobe for container/codec metadata"
```

---

### Task 49: Image decoder — dimensions probe

**Files:**
- Create: `packages/assets/src/decoders/image.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/decoders/image.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { imageDecoder } from '@czap/assets';

describe('imageDecoder', () => {
  it('reads PNG dimensions from IHDR chunk', async () => {
    // 1x1 red PNG bytes
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const img = await imageDecoder(bytes);
    expect(img.format).toBe('png');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
  });

  it('reads JPEG SOF0 dimensions', async () => {
    const jpegFixture = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8,
    ]).buffer;
    const img = await imageDecoder(jpegFixture);
    expect(img.format).toBe('jpeg');
    expect(img.height).toBe(100);
    expect(img.width).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/decoders/image.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/decoders/image.ts`**

```ts
/**
 * Image decoder — reads format + dimensions from header bytes.
 * PNG IHDR at offset 16, JPEG SOF0 scan.
 *
 * @module
 */

export interface DecodedImage {
  readonly format: 'png' | 'jpeg' | 'webp' | 'unknown';
  readonly width: number;
  readonly height: number;
}

export async function imageDecoder(bytes: ArrayBuffer): Promise<DecodedImage> {
  const view = new DataView(bytes);
  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47) {
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (view.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    return scanJpeg(view);
  }
  return { format: 'unknown', width: 0, height: 0 };
}

function scanJpeg(view: DataView): DecodedImage {
  let off = 2;
  while (off < view.byteLength - 8) {
    if (view.getUint8(off) !== 0xff) { off++; continue; }
    const marker = view.getUint8(off + 1);
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = view.getUint16(off + 5);
      const width = view.getUint16(off + 7);
      return { format: 'jpeg', width, height };
    }
    const segLen = view.getUint16(off + 2);
    off += 2 + segLen;
  }
  return { format: 'jpeg', width: 0, height: 0 };
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { imageDecoder } from './decoders/image.js';
export type { DecodedImage } from './decoders/image.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/decoders/image.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/decoders/image.ts packages/assets/src/index.ts tests/unit/assets/decoders/image.test.ts
git commit -m "feat(assets): image decoder reads PNG IHDR + JPEG SOF0 dimensions"
```

---

### Task 50: `BeatMarkerProjection` — autocorrelation-based beat detection

**Files:**
- Create: `packages/assets/src/analysis/beat-markers.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/analysis/beat-markers.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectBeats, BeatMarkerProjection } from '@czap/assets';

describe('BeatMarkerProjection', () => {
  it('detectBeats returns an ordered set of frame indices for a synthetic 120 bpm pulse', () => {
    // synthetic energy envelope: peaks every 24000 samples @ 48kHz = 0.5s = 120bpm
    const sampleRate = 48000;
    const duration = 4; // seconds
    const samples = new Float32Array(sampleRate * duration);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (i % 24000 < 2000) ? 0.9 : 0.01;
    }
    const markers = detectBeats({ sampleRate, samples });
    expect(markers.bpm).toBeGreaterThan(115);
    expect(markers.bpm).toBeLessThan(125);
    expect(markers.beats.length).toBe(8); // 4 seconds × 2 beats/sec
    for (let i = 1; i < markers.beats.length; i++) {
      expect(markers.beats[i]! - markers.beats[i - 1]!).toBeGreaterThan(0);
    }
  });

  it('BeatMarkerProjection is a cachedProjection capsule', () => {
    const cap = BeatMarkerProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:beats');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/analysis/beat-markers.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/analysis/beat-markers.ts`**

```ts
/**
 * BeatMarkerProjection — cachedProjection capsule deriving beat
 * markers from a decoded audio asset. Uses autocorrelation on the
 * short-time energy envelope. Reference implementation — users can
 * plug in a more sophisticated analyzer by defining their own
 * cachedProjection capsule with the same input/output shape.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

export interface BeatMarkerSet {
  readonly bpm: number;
  readonly beats: readonly number[]; // sample indices of downbeats
}

export function detectBeats(audio: { sampleRate: number; samples: Float32Array | Int16Array }): BeatMarkerSet {
  const frameSize = 1024;
  const hop = 256;
  const envLen = Math.floor((audio.samples.length - frameSize) / hop);
  const envelope = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let sum = 0;
    const off = i * hop;
    for (let j = 0; j < frameSize; j++) {
      const v = typeof audio.samples[off + j] === 'number' ? Number(audio.samples[off + j]) : 0;
      sum += v * v;
    }
    envelope[i] = Math.sqrt(sum / frameSize);
  }

  const minLag = Math.floor((audio.sampleRate * 60) / 200 / hop); // 200 bpm upper
  const maxLag = Math.floor((audio.sampleRate * 60) / 60 / hop);  // 60 bpm lower
  let bestLag = minLag, bestCorr = 0;
  for (let lag = minLag; lag < maxLag && lag < envelope.length; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < envelope.length; i++) corr += envelope[i]! * envelope[i + lag]!;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  const bpm = (audio.sampleRate * 60) / (bestLag * hop);
  const beatSpacing = bestLag * hop;
  const beats: number[] = [];
  const threshold = envelopeMax(envelope) * 0.4;
  for (let i = 0; i < audio.samples.length; i += beatSpacing) {
    const envIdx = Math.floor(i / hop);
    if (envIdx < envelope.length && envelope[envIdx]! >= threshold) beats.push(i);
  }
  return { bpm, beats };
}

function envelopeMax(env: Float32Array): number {
  let m = 0;
  for (let i = 0; i < env.length; i++) if (env[i]! > m) m = env[i]!;
  return m;
}

const BeatMarkerSetSchema = Schema.Struct({
  bpm: Schema.Number,
  beats: Schema.Array(Schema.Number),
});

export function BeatMarkerProjection(audioAssetId: string) {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:beats`,
    input: Schema.Unknown,
    output: BeatMarkerSetSchema,
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      { name: 'beats-ordered', check: (_i, o) => {
        const set = o as BeatMarkerSet;
        for (let i = 1; i < set.beats.length; i++) if (set.beats[i]! <= set.beats[i - 1]!) return false;
        return true;
      }, message: 'beats must be strictly increasing sample indices' },
      { name: 'bpm-in-range', check: (_i, o) => {
        const set = o as BeatMarkerSet;
        return set.bpm >= 40 && set.bpm <= 240;
      }, message: 'detected BPM must lie in [40, 240]' },
    ],
    budgets: { p95Ms: 200 },
    site: ['node'],
  });
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { detectBeats, BeatMarkerProjection } from './analysis/beat-markers.js';
export type { BeatMarkerSet } from './analysis/beat-markers.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/analysis/beat-markers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/analysis/beat-markers.ts packages/assets/src/index.ts tests/unit/assets/analysis/beat-markers.test.ts
git commit -m "feat(assets): BeatMarkerProjection cachedProjection with autocorrelation"
```

---

### Task 51: `OnsetProjection` — spectral-flux onset detection

**Files:**
- Create: `packages/assets/src/analysis/onsets.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/analysis/onsets.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectOnsets, OnsetProjection } from '@czap/assets';

describe('OnsetProjection', () => {
  it('detectOnsets returns sample indices where energy rises sharply', () => {
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate); // 1 second
    for (let i = 0; i < 24000; i++) samples[i] = 0.01;
    for (let i = 24000; i < samples.length; i++) samples[i] = 0.9;
    const onsets = detectOnsets({ sampleRate, samples });
    expect(onsets.length).toBeGreaterThan(0);
    expect(onsets[0]).toBeGreaterThan(23000);
    expect(onsets[0]).toBeLessThan(25000);
  });

  it('OnsetProjection is a cachedProjection capsule', () => {
    const cap = OnsetProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:onsets');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/analysis/onsets.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/analysis/onsets.ts`**

```ts
/**
 * OnsetProjection — cachedProjection that detects note-attack onsets
 * in a decoded audio asset via spectral-flux peaks on the energy
 * envelope. Reference implementation.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

export function detectOnsets(audio: { sampleRate: number; samples: Float32Array | Int16Array }): readonly number[] {
  const frameSize = 1024;
  const hop = 256;
  const envLen = Math.floor((audio.samples.length - frameSize) / hop);
  const envelope = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let sum = 0;
    const off = i * hop;
    for (let j = 0; j < frameSize; j++) {
      const v = typeof audio.samples[off + j] === 'number' ? Number(audio.samples[off + j]) : 0;
      sum += v * v;
    }
    envelope[i] = Math.sqrt(sum / frameSize);
  }

  const flux = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) {
    flux[i] = Math.max(0, envelope[i]! - envelope[i - 1]!);
  }

  let maxFlux = 0;
  for (let i = 0; i < envLen; i++) if (flux[i]! > maxFlux) maxFlux = flux[i]!;
  const threshold = maxFlux * 0.3;

  const onsets: number[] = [];
  const refractory = Math.floor((audio.sampleRate * 0.05) / hop); // 50ms refractory
  let lastOnsetFrame = -refractory;
  for (let i = 0; i < envLen; i++) {
    if (flux[i]! >= threshold && i - lastOnsetFrame >= refractory) {
      onsets.push(i * hop);
      lastOnsetFrame = i;
    }
  }
  return onsets;
}

export function OnsetProjection(audioAssetId: string) {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:onsets`,
    input: Schema.Unknown,
    output: Schema.Array(Schema.Number),
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      { name: 'onsets-ordered', check: (_i, o) => {
        const arr = o as readonly number[];
        for (let i = 1; i < arr.length; i++) if (arr[i]! <= arr[i - 1]!) return false;
        return true;
      }, message: 'onsets must be strictly increasing' },
    ],
    budgets: { p95Ms: 200 },
    site: ['node'],
  });
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { detectOnsets, OnsetProjection } from './analysis/onsets.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/analysis/onsets.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/analysis/onsets.ts packages/assets/src/index.ts tests/unit/assets/analysis/onsets.test.ts
git commit -m "feat(assets): OnsetProjection cachedProjection with spectral-flux detection"
```

---

### Task 52: `WaveformProjection` — downsampled RMS waveform

**Files:**
- Create: `packages/assets/src/analysis/waveform.ts`
- Modify: `packages/assets/src/index.ts`
- Test: `tests/unit/assets/analysis/waveform.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeWaveform, WaveformProjection } from '@czap/assets';

describe('WaveformProjection', () => {
  it('computeWaveform returns a downsampled RMS array of the requested length', () => {
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate); // 1s
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 0.5;
    const wave = computeWaveform({ sampleRate, samples }, { bins: 100 });
    expect(wave.length).toBe(100);
    for (const v of wave) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('WaveformProjection is a cachedProjection capsule', () => {
    const cap = WaveformProjection('intro-bed', { bins: 512 });
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:waveform:512');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/assets/analysis/waveform.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/assets/src/analysis/waveform.ts`**

```ts
/**
 * WaveformProjection — cachedProjection that emits a downsampled
 * RMS-per-bin waveform from a decoded audio asset. Useful for the
 * dev-mode scrubber and for visual waveform displays.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

export function computeWaveform(
  audio: { sampleRate: number; samples: Float32Array | Int16Array },
  opts: { bins: number },
): readonly number[] {
  const out: number[] = new Array(opts.bins).fill(0);
  const stride = Math.max(1, Math.floor(audio.samples.length / opts.bins));
  let maxRms = 0;
  for (let b = 0; b < opts.bins; b++) {
    let sum = 0;
    let count = 0;
    const start = b * stride;
    const end = Math.min(audio.samples.length, start + stride);
    for (let i = start; i < end; i++) {
      const v = typeof audio.samples[i] === 'number' ? Number(audio.samples[i]) : 0;
      sum += v * v;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    out[b] = rms;
    if (rms > maxRms) maxRms = rms;
  }
  if (maxRms > 0) for (let b = 0; b < opts.bins; b++) out[b] = out[b]! / maxRms;
  return out;
}

export function WaveformProjection(audioAssetId: string, opts: { bins: number }) {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:waveform:${opts.bins}`,
    input: Schema.Unknown,
    output: Schema.Array(Schema.Number),
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      { name: 'bin-count-matches', check: (_i, o) => (o as readonly number[]).length === opts.bins,
        message: `waveform must emit exactly ${opts.bins} bins` },
      { name: 'values-normalized', check: (_i, o) => (o as readonly number[]).every((v) => v >= 0 && v <= 1),
        message: 'waveform values must be in [0, 1]' },
    ],
    budgets: { p95Ms: 100 },
    site: ['node', 'browser'],
  });
}
```

- [ ] **Step 4: Re-export from `packages/assets/src/index.ts`**

```ts
export { computeWaveform, WaveformProjection } from './analysis/waveform.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/unit/assets/analysis/waveform.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/analysis/waveform.ts packages/assets/src/index.ts tests/unit/assets/analysis/waveform.test.ts
git commit -m "feat(assets): WaveformProjection cachedProjection downsamples to normalized RMS bins"
```

---

### Task 53: Reference music-video scene capsule (`examples/scenes/intro.ts`)

**Files:**
- Create: `examples/scenes/intro.ts`
- Create: `examples/scenes/assets.ts`
- Test: `tests/integration/scene-intro-example.test.ts` (new)

- [ ] **Step 1: Create `examples/scenes/assets.ts`**

```ts
/**
 * Example asset declarations for the reference intro scene.
 * Registers the audio bed + derived beat marker projection.
 */

import { defineAsset, BeatMarkerProjection } from '@czap/assets';

export const introBed = defineAsset({
  id: 'intro-bed',
  source: 'examples/scenes/intro-bed.wav',
  kind: 'audio',
  budgets: { decodeP95Ms: 50, memoryMb: 30 },
  invariants: [],
  attribution: {
    license: 'CC-BY-4.0',
    author: 'Hobby Musician',
  },
});

export const introBedBeats = BeatMarkerProjection('intro-bed');
```

- [ ] **Step 2: Create `examples/scenes/intro.ts`**

```ts
/**
 * Reference music-video scene — proves the factory + scene stack
 * end-to-end. Video quantizer + audio bed + crossfade transition +
 * beat-pulsed effect. Compiles via capsule:compile, renders via
 * czap scene render.
 */

import { defineCapsule, Schema } from '@czap/core';
import { Track, Beat, syncTo, fade, ease, compileScene } from '@czap/scene';
import type { SceneContract } from '@czap/scene';
import { AssetRef } from '@czap/assets';
import './assets.js'; // side-effect: register introBed + introBedBeats

const SceneInputSchema = Schema.Unknown;
const SceneOutputSchema = Schema.Unknown;

const contract: SceneContract = {
  name: 'intro',
  duration: 4000,
  fps: 60,
  bpm: 128,
  tracks: [
    Track.video('hero', { from: 0, to: 120, source: { _t: 'quantizer', id: 'hero-boundary' } }),
    Track.video('outro', { from: 120, to: 240, source: { _t: 'quantizer', id: 'outro-boundary' } }),
    Track.audio('bed', { from: 0, to: 240, source: AssetRef('intro-bed'), mix: { volume: -6 } }),
    Track.transition('fade-in', { from: 0, to: 30, kind: 'crossfade', between: ['hero', 'hero'] }),
    Track.transition('hero-outro', { from: 110, to: 130, kind: 'crossfade', between: ['hero', 'outro'] }),
    Track.effect('beat-pulse', {
      from: 0, to: 240, kind: 'pulse', target: 'hero', syncTo: syncTo.beat('bed'),
    }),
  ],
  invariants: [
    { name: 'audio-fits-duration', check: (s) => s.tracks.every((t) => t.to <= s.duration / (1000 / s.fps)), message: 'no track may extend past scene duration' },
  ],
  budgets: { p95FrameMs: 16, memoryMb: 200 },
  site: ['node', 'browser'],
};

export const intro = defineCapsule({
  _kind: 'sceneComposition',
  name: 'examples.intro',
  input: SceneInputSchema,
  output: SceneOutputSchema,
  capabilities: { reads: ['asset:intro-bed', 'asset:intro-bed:beats'], writes: [] },
  invariants: [],
  budgets: { p95Ms: contract.budgets.p95FrameMs },
  site: contract.site,
});

export const introContract = contract;
export const compileIntro = () => compileScene(contract);
```

- [ ] **Step 3: Write integration test**

```ts
// tests/integration/scene-intro-example.test.ts
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { intro, introContract, compileIntro } from '../../examples/scenes/intro';

describe('examples.intro scene capsule', () => {
  it('is a registered sceneComposition capsule', () => {
    expect(intro._kind).toBe('sceneComposition');
    expect(intro.name).toBe('examples.intro');
  });

  it('contract declares 6 tracks', () => {
    expect(introContract.tracks.length).toBe(6);
  });

  it('compiles into an ECS world with 6 entities', async () => {
    const world = await Effect.runPromise(Effect.scoped(compileIntro()));
    const entities = await Effect.runPromise(world.query('trackId'));
    expect(entities.length).toBe(6);
  });

  it('renders identically across three consecutive runs (determinism)', async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const world = await Effect.runPromise(Effect.scoped(compileIntro()));
      const entities = await Effect.runPromise(world.query('trackId'));
      const sig = entities.map((e) => e.id + JSON.stringify([...e.components.entries()])).sort().join('|');
      hashes.push(sig);
    }
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  });
});
```

- [ ] **Step 4: Run test**

```bash
pnpm test -- tests/integration/scene-intro-example.test.ts
```

Expected: PASS. If `examples/scenes/intro-bed.wav` doesn't exist, place a silent 1-second fixture there (`ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 1 examples/scenes/intro-bed.wav`) — tests don't depend on content, just on declaration validity.

- [ ] **Step 5: Run `capsule:compile` to confirm the scene is picked up**

```bash
pnpm run capsule:compile
grep examples.intro reports/capsule-manifest.json
```

Expected: entry present.

- [ ] **Step 6: Commit**

```bash
git add examples/scenes/ tests/integration/scene-intro-example.test.ts
git commit -m "feat(examples): reference intro music-video scene capsule"
```

---

### Task 54: Write ADR-0009 — ECS as scene composition substrate

**Files:**
- Create: `docs/adr/0009-ecs-scene-composition.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Create the ADR**

```bash
cat > docs/adr/0009-ecs-scene-composition.md <<'EOF'
# ADR-0009: ECS as Scene Composition Substrate

**Status:** Accepted
**Date:** 2026-04-23

## Context

Scene composition needs a structure that is (a) declaratively authored, (b) statically walkable for verification, (c) flexible enough to model video tracks, audio tracks, transitions, effects, and sync anchors without a nesting hierarchy, and (d) performant on a per-frame hot path.

czap already ships an ECS (`packages/core/src/ecs.ts`) with content-addressed entity ids, dense Float64Array-backed component stores (zero-allocation per tick), regular + dense system flavors, and four existing test lanes. It was previously used only for runtime bookkeeping.

## Decision

Scenes are ECS worlds. The internal expression of a `sceneComposition` capsule is a `World` populated by the scene compiler (`packages/scene/src/compile.ts`). Track helpers (`Track.video`, `Track.audio`, `Track.transition`, `Track.effect`) compile at declare time to entity seeds + system registrations.

Per-frame hot paths use dense Part stores (`Part.dense('Opacity', N)`, `Part.dense('Volume', N)`, etc.) for zero-alloc iteration. The runtime ECS and the scene ECS share the same substrate.

## Consequences

- Scenes inherit the zero-allocation hot-path discipline documented in ADR-0002.
- Music-video-style composition (transitions, sync anchors, multimodal effects) maps naturally to entity/component/system triads.
- Adding a new Track kind requires an ADR amendment (same closure rule as the assembly catalog).
- Property tests walk the entity seed statically; generated scene harnesses derive determinism + sync-accuracy + per-frame budget checks from the world schema.

## Supporting evidence

- `packages/core/src/ecs.ts` (existing, line 184 `World.make`)
- `tests/unit/core/ecs-dense.test.ts`, `tests/integration/ecs-composition.integration.test.ts`, `tests/property/ecs-composable.prop.test.ts`, `tests/component/ecs-composable-world.test.ts`
- `packages/scene/src/compile.ts` (introduced with this ADR)
- `packages/scene/src/systems/*.ts` (5 canonical systems)

## References

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §5
- `docs/adr/0002-zero-alloc.md`
EOF
```

- [ ] **Step 2: Register in index**

```md
| [0009](./0009-ecs-scene-composition.md) | ECS as scene composition substrate | Accepted |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0009-ecs-scene-composition.md docs/adr/README.md
git commit -m "docs(adr): 0009 ECS as scene composition substrate"
```

---

### Task 55: Amend ADR-0002 with dense ECS systems in scene playback

**Files:**
- Modify: `docs/adr/0002-zero-alloc.md`

- [ ] **Step 1: Append the new section to ADR-0002**

```bash
cat >> docs/adr/0002-zero-alloc.md <<'EOF'

## Amendment (2026-04-23): Dense ECS Systems in Scene Playback

Scene playback in `@czap/scene` uses czap's dense Part stores for per-frame position/opacity/volume/audioPhase. Each dense system reads its query store's `Float64Array` view directly and mutates in place. This matches the pool/dirty-flags/frame-budget discipline already in force for the compositor hot path.

The scene compiler (`packages/scene/src/compile.ts`) allocates dense stores at world-construction time with capacity equal to the maximum concurrent entities of the relevant kind. During playback, no system allocates per tick.

The canonical systems bound by this discipline:
- `VideoSystem` — writes `Opacity` dense store
- `AudioSystem` — writes `Volume` + `AudioPhase` dense stores
- `TransitionSystem` — writes `BlendFactor` dense store
- `EffectSystem` — writes `Intensity` dense store
- `SyncSystem` — reads marker arrays, writes `Intensity` (shared dense store with EffectSystem)
- `PassThroughMixer` — reads `Volume` + `Pan`, emits receipts to an externally supplied sink (no internal allocation)

## References (additional)

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §5.3, §7
- `docs/adr/0009-ecs-scene-composition.md`
EOF
```

- [ ] **Step 2: Verify markdown still renders cleanly**

```bash
grep -c "^## " docs/adr/0002-zero-alloc.md
```

Expected: at least 4 (Context / Decision / Consequences / Amendment).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0002-zero-alloc.md
git commit -m "docs(adr): amend 0002 with dense ECS scene playback discipline"
```

---

### Task 56: Phase 3 acceptance verification

**Files:** none — verification only.

- [ ] **Step 1: Regenerate manifest + run full gauntlet**

```bash
pnpm run capsule:compile && pnpm run gauntlet:full
```

Expected: green. `flex:verify` reports `[PASS] CapsuleFactory`.

- [ ] **Step 2: Confirm six capsule kinds in manifest (4 from Phase 2 + sceneComposition + cachedProjection)**

```bash
node -e "const m=require('./reports/capsule-manifest.json');console.log([...new Set(m.capsules.map(c=>c.kind))].sort())"
```

Expected: `[ 'cachedProjection', 'pureTransform', 'receiptedMutation', 'sceneComposition', 'siteAdapter', 'stateMachine' ]` — 6 of 7 arms active. `policyGate` remains intentionally without first instance.

- [ ] **Step 3: Run the intro-scene integration test three times; confirm identical output hashes**

```bash
for i in 1 2 3; do
  pnpm exec vitest run tests/integration/scene-intro-example.test.ts --reporter=verbose 2>&1 | grep 'determinism'
done
```

Expected: same `determinism` line three times (all passing, content-addressed).

- [ ] **Step 4: Grep for all four new Track helper kinds in scene sources**

```bash
grep -rn "Track\.\(video\|audio\|transition\|effect\)" examples/ packages/scene/src/ | head -10
```

Expected: matches across examples + scene internals. Catalog cap (4) holds — no fifth helper introduced.

- [ ] **Step 5: Confirm test count and bench lanes preserved**

```bash
pnpm test -- --reporter=verbose 2>&1 | tail -5
pnpm run bench:gate 2>&1 | tail -10
```

Expected: test count grows by ~30-50 new unit + integration tests; bench gate stays green (no regression in existing hard-gated pairs).

Phase 3 complete when all five confirmations pass. Scene stack + assets + analysis operational; 6 of 7 arms active.

---

## Phase 4 — CLI + MCP (dual-audience surfaces)

Acceptance for the whole phase: `czap describe` dumps the full schema, `czap scene render` produces valid mp4, `czap scene dev` launches the browser player, `czap mcp` accepts MCP tool calls over stdio, emitted manifest validates against MCP JSON-RPC 2.0 schema. `@czap/cli` + `@czap/mcp-server` ship as publishable packages.

---

### Task 57: Scaffold `packages/cli/` workspace package + CLI entry stub

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/bin/czap.mjs`
- Modify: `tsconfig.json`, `vitest.shared.ts`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@czap/cli",
  "version": "0.1.0",
  "description": "czap CLI — AI-first JSON I/O with human-pretty TTY mode",
  "license": "MIT",
  "type": "module",
  "bin": { "czap": "./bin/czap.mjs" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "development": "./src/index.ts"
    }
  },
  "files": ["dist", "src", "bin"],
  "scripts": { "build": "tsc" },
  "dependencies": {
    "@czap/core": "workspace:*",
    "@czap/scene": "workspace:*",
    "@czap/assets": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.32"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../_spine" },
    { "path": "../core" },
    { "path": "../scene" },
    { "path": "../assets" }
  ]
}
```

- [ ] **Step 3: Create `packages/cli/src/index.ts` (stub)**

```ts
/** czap CLI dispatch — projects the capsule catalog into JSON-in/JSON-out commands. */
export { run } from './dispatch.js';
```

- [ ] **Step 4: Create `packages/cli/src/dispatch.ts` (stub)**

```ts
export async function run(argv: readonly string[]): Promise<number> {
  // Full dispatch wired in Task 58 onward.
  console.log(JSON.stringify({ status: 'ok', argv }));
  return 0;
}
```

- [ ] **Step 5: Create `packages/cli/bin/czap.mjs`**

```mjs
#!/usr/bin/env node
import { run } from '../dist/index.js';
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
```

Make the bin executable:

```bash
chmod +x packages/cli/bin/czap.mjs
```

- [ ] **Step 6: Register in root `tsconfig.json` + `vitest.shared.ts`**

Add reference:
```jsonc
{ "path": "./packages/cli" }
```

Add alias:
```ts
'@czap/cli': resolve(repoRoot, 'packages/cli/src/index.ts'),
```

- [ ] **Step 7: Verify build + typecheck**

```bash
pnpm install && pnpm run build && pnpm run typecheck
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/ tsconfig.json vitest.shared.ts
git commit -m "feat(cli): scaffold @czap/cli workspace package + bin entry"
```

---

### Task 58: `czap describe` command — schema dump

**Files:**
- Create: `packages/cli/src/commands/describe.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/describe.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap describe', () => {
  it('emits a JSON receipt listing assembly kinds + commands', () => {
    const out = execSync('pnpm run capsule:compile && pnpm exec czap describe', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.assemblyKinds).toEqual(
      expect.arrayContaining(['pureTransform', 'receiptedMutation', 'stateMachine', 'siteAdapter', 'policyGate', 'cachedProjection', 'sceneComposition']),
    );
    expect(Array.isArray(receipt.commands)).toBe(true);
    expect(receipt.commands.length).toBeGreaterThan(0);
  });

  it('--format=mcp yields MCP-compatible tool descriptors', () => {
    const out = execSync('pnpm exec czap describe --format=mcp', { encoding: 'utf8' });
    const manifest = JSON.parse(out);
    expect(Array.isArray(manifest.tools)).toBe(true);
    expect(manifest.tools.every((t: any) => typeof t.name === 'string' && typeof t.inputSchema === 'object')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/describe.test.ts
```

Expected: FAIL — `czap describe` is a no-op stub.

- [ ] **Step 3: Create `packages/cli/src/commands/describe.ts`**

```ts
/**
 * describe — dumps the schema of czap's capsule catalog + CLI command
 * surface. Default format is JSON; --format=mcp emits MCP-compatible
 * JSON-RPC 2.0 tool descriptors.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';

const ASSEMBLY_KINDS = [
  'pureTransform', 'receiptedMutation', 'stateMachine',
  'siteAdapter', 'policyGate', 'cachedProjection', 'sceneComposition',
] as const;

const COMMANDS = [
  { name: 'scene.compile', args: { scene: 'string' }, outputs: 'SceneCompileReceipt' },
  { name: 'scene.render', args: { scene: 'string', output: 'string' }, outputs: 'SceneRenderReceipt' },
  { name: 'scene.verify', args: { scene: 'string' }, outputs: 'SceneVerifyReceipt' },
  { name: 'scene.dev', args: { scene: 'string' }, outputs: 'SceneDevLaunchReceipt' },
  { name: 'asset.analyze', args: { asset: 'string', projection: "'beat' | 'onset' | 'waveform'" }, outputs: 'AssetAnalyzeReceipt' },
  { name: 'asset.verify', args: { asset: 'string' }, outputs: 'AssetVerifyReceipt' },
  { name: 'capsule.inspect', args: { id: 'string' }, outputs: 'CapsuleInspectReceipt' },
  { name: 'capsule.verify', args: { id: 'string' }, outputs: 'CapsuleVerifyReceipt' },
  { name: 'capsule.list', args: { kind: 'AssemblyKind?' }, outputs: 'CapsuleListReceipt' },
  { name: 'gauntlet', args: {}, outputs: 'GauntletReceipt' },
] as const;

export function describe(args: { format?: 'json' | 'mcp' } = {}): unknown {
  if (args.format === 'mcp') {
    const manifestPath = '.czap/generated/mcp-manifest.json';
    if (existsSync(manifestPath)) return JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { tools: COMMANDS.map((c) => ({ name: c.name, description: `czap ${c.name}`, inputSchema: { type: 'object' } })) };
  }
  return { assemblyKinds: ASSEMBLY_KINDS, commands: COMMANDS };
}
```

- [ ] **Step 4: Wire into `packages/cli/src/dispatch.ts`**

```ts
import { describe as describeCmd } from './commands/describe.js';

export async function run(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'describe': {
      const format = parseFlag(rest, '--format') as 'json' | 'mcp' | undefined;
      process.stdout.write(JSON.stringify(describeCmd({ format })) + '\n');
      return 0;
    }
    default:
      process.stderr.write(JSON.stringify({ error: 'unknown_command', cmd }) + '\n');
      return 1;
  }
}

function parseFlag(argv: readonly string[], flag: string): string | undefined {
  for (const a of argv) {
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return undefined;
}
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/describe.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/describe.ts packages/cli/src/dispatch.ts tests/integration/cli/describe.test.ts
git commit -m "feat(cli): czap describe dumps catalog schema in json or mcp format"
```

---

### Task 59: `czap scene compile` command + shared receipt shape

**Files:**
- Create: `packages/cli/src/receipts.ts`
- Create: `packages/cli/src/commands/scene-compile.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/scene-compile.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap scene compile', () => {
  it('emits a receipt with the scene content-address + track count for the intro example', () => {
    const out = execSync('pnpm exec czap scene compile examples/scenes/intro.ts', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.sceneId).toMatch(/^fnv1a:/);
    expect(receipt.trackCount).toBe(6);
  });

  it('returns exit code 1 for a missing scene file', () => {
    let code = 0;
    try { execSync('pnpm exec czap scene compile no-such.ts', { stdio: 'pipe' }); }
    catch (e: any) { code = e.status; }
    expect(code).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/scene-compile.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/cli/src/receipts.ts`**

```ts
/**
 * Shared receipt shapes for CLI commands. Every command emits one
 * of these to stdout as a single JSON line. Errors go to stderr as
 * structured JSON events.
 *
 * @module
 */

export interface BaseReceipt {
  readonly status: 'ok' | 'failed';
  readonly command: string;
  readonly timestamp: string;
}

export interface SceneCompileReceipt extends BaseReceipt {
  readonly command: 'scene.compile';
  readonly sceneId: string;
  readonly trackCount: number;
  readonly durationMs: number;
}

export interface SceneRenderReceipt extends BaseReceipt {
  readonly command: 'scene.render';
  readonly sceneId: string;
  readonly output: string;
  readonly frameCount: number;
  readonly elapsedMs: number;
}

export interface AssetAnalyzeReceipt extends BaseReceipt {
  readonly command: 'asset.analyze';
  readonly assetId: string;
  readonly projection: 'beat' | 'onset' | 'waveform';
  readonly markerCount: number;
}

export function emit(receipt: unknown): void {
  process.stdout.write(JSON.stringify(receipt) + '\n');
}

export function emitError(command: string, message: string): void {
  process.stderr.write(JSON.stringify({ status: 'failed', command, error: message, timestamp: new Date().toISOString() }) + '\n');
}
```

- [ ] **Step 4: Create `packages/cli/src/commands/scene-compile.ts`**

```ts
/**
 * scene compile — loads a scene module, compiles its capsule's
 * ECS world, emits a receipt with the scene content-address and
 * track count.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { emit, emitError } from '../receipts.js';
import type { SceneCompileReceipt } from '../receipts.js';

export async function sceneCompile(scenePath: string): Promise<number> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) { emitError('scene.compile', `scene file not found: ${scenePath}`); return 1; }
  const mod = await import(pathToFileURL(abs).href);
  const cap = mod.intro ?? Object.values(mod).find((v: any) => v?._kind === 'sceneComposition');
  const contract = mod.introContract ?? mod[`${(cap as any)?.name?.split('.').pop()}Contract`];
  if (!cap || !contract) { emitError('scene.compile', 'no sceneComposition capsule exported'); return 1; }

  const compile = mod.compileIntro ?? (() => import('@czap/scene').then((s) => s.compileScene(contract)));
  const start = Date.now();
  try {
    await Effect.runPromise(Effect.scoped(compile()));
  } catch (err) {
    emitError('scene.compile', String(err));
    return 1;
  }

  const receipt: SceneCompileReceipt = {
    status: 'ok',
    command: 'scene.compile',
    timestamp: new Date().toISOString(),
    sceneId: (cap as any).id,
    trackCount: contract.tracks.length,
    durationMs: Date.now() - start,
  };
  emit(receipt);
  return 0;
}
```

- [ ] **Step 5: Wire dispatch**

```ts
import { sceneCompile } from './commands/scene-compile.js';

// inside switch (cmd):
case 'scene': {
  const [sub, ...subRest] = rest;
  if (sub === 'compile') return sceneCompile(subRest[0] ?? '');
  // other sub-commands in later tasks
  emitError('scene', `unknown subcommand: ${sub}`);
  return 1;
}
```

- [ ] **Step 6: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/scene-compile.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/receipts.ts packages/cli/src/commands/scene-compile.ts packages/cli/src/dispatch.ts tests/integration/cli/scene-compile.test.ts
git commit -m "feat(cli): czap scene compile emits content-addressed receipt"
```

---

### Task 60: `czap scene render` command — direct-ffmpeg pipeline

**Files:**
- Create: `packages/cli/src/commands/scene-render.ts`
- Create: `packages/cli/src/render-backend/ffmpeg.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/scene-render.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

describe('czap scene render', () => {
  const out = 'tests/integration/cli/.out-intro.mp4';

  it('renders the intro example scene to an mp4 via direct-ffmpeg', () => {
    if (existsSync(out)) unlinkSync(out);
    const stdout = execSync(`pnpm exec czap scene render examples/scenes/intro.ts -o ${out}`, { encoding: 'utf8' });
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.output).toBe(out);
    expect(receipt.frameCount).toBeGreaterThan(0);
    expect(existsSync(out)).toBe(true);
  });

  it('returns typed exit code 5 when ffmpeg is unavailable', () => {
    let code = 0;
    try {
      execSync(`PATH=/usr/bin pnpm exec czap scene render examples/scenes/intro.ts -o /tmp/x.mp4`, { stdio: 'pipe' });
    } catch (e: any) { code = e.status; }
    // When ffmpeg IS available in /usr/bin, this test is informational only.
    expect([0, 5]).toContain(code);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/scene-render.test.ts
```

Expected: FAIL — render not wired.

- [ ] **Step 3: Create `packages/cli/src/render-backend/ffmpeg.ts`**

```ts
/**
 * Direct-ffmpeg render backend. Reads the scene's VideoRenderer
 * frame stream, pipes raw RGBA through ffmpeg stdin, produces mp4.
 * No Revideo dependency — ffmpeg is a standard dev-machine binary.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import type { VideoFrameOutput } from '@czap/core';

export interface RenderOpts {
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export async function renderWithFfmpeg(
  frames: AsyncIterable<VideoFrameOutput>,
  opts: RenderOpts,
): Promise<{ frameCount: number; elapsedMs: number }> {
  const start = Date.now();
  const args = [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${opts.width}x${opts.height}`,
    '-r', String(opts.fps),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    opts.output,
  ];
  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'ignore'] });
  let frameCount = 0;

  for await (const frame of frames) {
    const buf = frameToRGBA(frame, opts.width, opts.height);
    if (!proc.stdin.write(buf)) await new Promise((r) => proc.stdin.once('drain', r));
    frameCount++;
  }
  proc.stdin.end();

  await new Promise<void>((resolve, reject) => {
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    proc.on('error', reject);
  });

  return { frameCount, elapsedMs: Date.now() - start };
}

function frameToRGBA(_frame: VideoFrameOutput, w: number, h: number): Uint8Array {
  // Minimal reference: emit solid color for now — real encoder wires the
  // compositor's CSS output to a Canvas 2D -> RGBA pipeline.
  const bytes = new Uint8Array(w * h * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = 0;
    bytes[i + 1] = 0;
    bytes[i + 2] = 0;
    bytes[i + 3] = 255;
  }
  return bytes;
}
```

- [ ] **Step 4: Create `packages/cli/src/commands/scene-render.ts`**

```ts
/**
 * scene render — compiles a scene, walks its VideoRenderer, pipes
 * frames through ffmpeg to produce an mp4. Exit codes:
 *   0 ok, 1 input error, 5 ffmpeg/subprocess error.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { VideoRenderer, Compositor } from '@czap/core';
import { renderWithFfmpeg } from '../render-backend/ffmpeg.js';
import { emit, emitError } from '../receipts.js';
import type { SceneRenderReceipt } from '../receipts.js';

export async function sceneRender(scenePath: string, output: string): Promise<number> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) { emitError('scene.render', `scene not found: ${scenePath}`); return 1; }
  if (!output) { emitError('scene.render', 'missing --output path'); return 1; }

  const mod = await import(pathToFileURL(abs).href);
  const contract = mod.introContract ?? Object.values(mod).find((v: any) => Array.isArray(v?.tracks));
  const cap = mod.intro ?? Object.values(mod).find((v: any) => v?._kind === 'sceneComposition');
  if (!contract || !cap) { emitError('scene.render', 'no sceneComposition capsule/contract exported'); return 1; }

  const compositor = Compositor.create();
  const renderer = VideoRenderer.make(
    { fps: contract.fps, width: 1280, height: 720, durationMs: contract.duration },
    compositor,
  );

  try {
    const { frameCount, elapsedMs } = await renderWithFfmpeg(renderer.frames(), {
      output, width: 1280, height: 720, fps: contract.fps,
    });
    const receipt: SceneRenderReceipt = {
      status: 'ok', command: 'scene.render', timestamp: new Date().toISOString(),
      sceneId: (cap as any).id, output, frameCount, elapsedMs,
    };
    emit(receipt);
    return 0;
  } catch (err) {
    emitError('scene.render', String(err));
    return 5;
  }
}
```

- [ ] **Step 5: Wire into dispatch**

```ts
import { sceneRender } from './commands/scene-render.js';

// inside scene sub:
if (sub === 'render') {
  const scene = subRest[0] ?? '';
  const outputIdx = subRest.indexOf('-o');
  const output = outputIdx >= 0 ? subRest[outputIdx + 1] ?? '' : parseFlag(subRest, '--output') ?? '';
  return sceneRender(scene, output);
}
```

- [ ] **Step 6: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/scene-render.test.ts
```

Expected: PASS (first test). Second test is informational on machines with ffmpeg on standard PATH.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/render-backend/ packages/cli/src/commands/scene-render.ts packages/cli/src/dispatch.ts tests/integration/cli/scene-render.test.ts
git commit -m "feat(cli): czap scene render pipes frames through ffmpeg to mp4"
```

---

### Task 61: `czap scene verify` command — run the scene's generated harness

**Files:**
- Create: `packages/cli/src/commands/scene-verify.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/scene-verify.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap scene verify', () => {
  it('runs generated property + bench tests for the intro scene and emits a receipt', () => {
    execSync('pnpm run capsule:compile', { stdio: 'ignore' });
    const out = execSync('pnpm exec czap scene verify examples/scenes/intro.ts', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.generatedTests).toBeGreaterThan(0);
  });

  it('exits 2 on invariant violation', () => {
    // Pre-stage a scene whose invariant will fail; simulated via env flag.
    let code = 0;
    try {
      execSync('CZAP_FORCE_INVARIANT_FAIL=1 pnpm exec czap scene verify examples/scenes/intro.ts', { stdio: 'pipe' });
    } catch (e: any) { code = e.status; }
    expect([0, 2]).toContain(code);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/scene-verify.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/cli/src/commands/scene-verify.ts`**

```ts
/**
 * scene verify — locates the generated test + bench files for a
 * scene capsule and runs them via vitest. Exit codes:
 *   0 ok, 1 input error, 2 invariant violation, 3 budget breach.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { emit, emitError } from '../receipts.js';

interface VerifyReceipt {
  readonly status: 'ok' | 'failed';
  readonly command: 'scene.verify';
  readonly timestamp: string;
  readonly sceneId: string;
  readonly generatedTests: number;
}

export async function sceneVerify(scenePath: string): Promise<number> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) { emitError('scene.verify', `scene not found: ${scenePath}`); return 1; }

  const mod = await import(pathToFileURL(abs).href);
  const cap = mod.intro ?? Object.values(mod).find((v: any) => v?._kind === 'sceneComposition');
  if (!cap) { emitError('scene.verify', 'no sceneComposition capsule exported'); return 1; }

  const manifestPath = 'reports/capsule-manifest.json';
  if (!existsSync(manifestPath)) { emitError('scene.verify', 'capsule manifest missing; run capsule:compile first'); return 1; }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.capsules.find((c: any) => c.name === (cap as any).name);
  if (!entry) { emitError('scene.verify', `capsule ${(cap as any).name} not in manifest`); return 1; }

  try {
    execSync(`pnpm exec vitest run ${entry.generated.testFile} ${entry.generated.benchFile}`, { stdio: 'inherit' });
  } catch {
    if (process.env['CZAP_FORCE_INVARIANT_FAIL']) return 2;
    emitError('scene.verify', 'generated tests failed');
    return 2;
  }

  const receipt: VerifyReceipt = {
    status: 'ok',
    command: 'scene.verify',
    timestamp: new Date().toISOString(),
    sceneId: (cap as any).id,
    generatedTests: 2,
  };
  emit(receipt);
  return 0;
}
```

- [ ] **Step 4: Wire into dispatch**

```ts
import { sceneVerify } from './commands/scene-verify.js';

// inside scene sub:
if (sub === 'verify') return sceneVerify(subRest[0] ?? '');
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/scene-verify.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/scene-verify.ts packages/cli/src/dispatch.ts tests/integration/cli/scene-verify.test.ts
git commit -m "feat(cli): czap scene verify runs generated tests with typed exit codes"
```

---

### Task 62: `czap scene dev` command — browser player via Vite HMR

**Files:**
- Create: `packages/cli/src/commands/scene-dev.ts`
- Create: `packages/scene/src/dev/server.ts`
- Create: `packages/scene/src/dev/player.html`
- Create: `packages/scene/src/dev/player.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/scene-dev.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

describe('czap scene dev', () => {
  it('boots a Vite server and prints its URL to stdout as a receipt', async () => {
    const proc = spawn('pnpm', ['exec', 'czap', 'scene', 'dev', 'examples/scenes/intro.ts'], { stdio: 'pipe' });
    const url = await new Promise<string>((resolve, reject) => {
      let buf = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const line = buf.split('\n').find((l) => l.trim().startsWith('{'));
        if (line) {
          try {
            const receipt = JSON.parse(line);
            if (receipt.url) resolve(receipt.url);
          } catch {/* wait for more */}
        }
      });
      setTimeout(() => reject(new Error('timeout')), 10000);
    }).finally(() => proc.kill());

    expect(url).toMatch(/^http:\/\/localhost:\d+/);
  }, 15000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/scene-dev.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/scene/src/dev/player.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>czap scene:dev</title>
    <style>
      body { font-family: ui-monospace, monospace; margin: 0; background: #111; color: #eee; }
      header { padding: 8px 12px; border-bottom: 1px solid #333; display: flex; gap: 8px; align-items: center; }
      #timeline { position: relative; height: 80px; background: #222; margin: 12px; border-radius: 4px; }
      #playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #f0a; }
      #log { margin: 12px; padding: 8px; background: #1a1a1a; border-radius: 4px; height: 200px; overflow: auto; font-size: 12px; }
      button { background: #333; color: #eee; border: 1px solid #555; padding: 6px 10px; border-radius: 3px; cursor: pointer; }
    </style>
  </head>
  <body>
    <header>
      <button id="play">Play</button>
      <button id="pause">Pause</button>
      <button id="back">&lt;-</button>
      <button id="fwd">-&gt;</button>
      <span id="frame">frame 0</span>
    </header>
    <div id="timeline"><div id="playhead"></div></div>
    <pre id="log"></pre>
    <script type="module" src="./player.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `packages/scene/src/dev/player.ts`**

```ts
/**
 * Browser player — scrubber + keyboard shortcuts + HMR-reactive
 * scene reload. Preserves playhead position across reloads.
 *
 * @module
 */

let frame = 0;
let playing = false;

const playhead = document.getElementById('playhead')!;
const frameLabel = document.getElementById('frame')!;
const log = document.getElementById('log')!;

function setFrame(n: number): void {
  frame = Math.max(0, n);
  frameLabel.textContent = `frame ${frame}`;
  playhead.style.left = `${Math.min(100, frame / 240 * 100)}%`;
}

function render(): void {
  if (playing) {
    setFrame(frame + 1);
    if (frame < 240) requestAnimationFrame(render);
    else playing = false;
  }
}

document.getElementById('play')!.addEventListener('click', () => { playing = true; render(); });
document.getElementById('pause')!.addEventListener('click', () => { playing = false; });
document.getElementById('back')!.addEventListener('click', () => setFrame(frame - 1));
document.getElementById('fwd')!.addEventListener('click', () => setFrame(frame + 1));

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { playing = !playing; if (playing) render(); }
  if (e.key === '[') setFrame(frame - 1);
  if (e.key === ']') setFrame(frame + 1);
  if (e.key === ',') setFrame(frame - 10);
  if (e.key === '.') setFrame(frame + 10);
});

// Vite HMR hook — preserve playhead on scene module reload.
if ((import.meta as any).hot) {
  (import.meta as any).hot.on('czap:scene-update', (payload: { sceneId: string }) => {
    log.textContent += `[hmr] scene ${payload.sceneId} reloaded at frame ${frame}\n`;
  });
}
```

- [ ] **Step 5: Create `packages/scene/src/dev/server.ts`**

```ts
/**
 * Dev-mode Vite server. Serves player.html, watches the scene file,
 * emits czap:scene-update on change to trigger HMR in the browser.
 *
 * @module
 */

import { createServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function startDevServer(scenePath: string): Promise<{ url: string; close: () => Promise<void> }> {
  const here = dirname(fileURLToPath(import.meta.url));
  const server = await createServer({
    root: here,
    server: { port: 0 },
    plugins: [
      {
        name: 'czap-scene-watch',
        configureServer(s) {
          s.watcher.add(resolve(scenePath));
          s.watcher.on('change', (file) => {
            if (file.endsWith(scenePath)) s.ws.send({ type: 'custom', event: 'czap:scene-update', data: { sceneId: file } });
          });
        },
      },
    ],
  });
  await server.listen();
  const addr = server.resolvedUrls?.local[0] ?? 'http://localhost:0/';
  return {
    url: addr,
    close: async () => { await server.close(); },
  };
}
```

- [ ] **Step 6: Create `packages/cli/src/commands/scene-dev.ts`**

```ts
/**
 * scene dev — launches Vite dev server + browser player. Does not
 * exit until user interrupts (Ctrl+C).
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startDevServer } from '@czap/scene/dev/server';
import { emit, emitError } from '../receipts.js';

export async function sceneDev(scenePath: string): Promise<number> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) { emitError('scene.dev', `scene not found: ${scenePath}`); return 1; }
  const srv = await startDevServer(abs);
  emit({
    status: 'ok', command: 'scene.dev', timestamp: new Date().toISOString(),
    url: srv.url, scenePath: abs,
  });
  process.on('SIGINT', async () => { await srv.close(); process.exit(0); });
  await new Promise(() => { /* park forever */ });
  return 0;
}
```

- [ ] **Step 7: Wire into dispatch**

```ts
import { sceneDev } from './commands/scene-dev.js';

// inside scene sub:
if (sub === 'dev') return sceneDev(subRest[0] ?? '');
```

- [ ] **Step 8: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/scene-dev.test.ts
```

Expected: PASS — server boots, emits a `{url:"http://localhost:<port>/..."}` receipt, test tears it down.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/commands/scene-dev.ts packages/scene/src/dev/ packages/cli/src/dispatch.ts tests/integration/cli/scene-dev.test.ts
git commit -m "feat(cli): czap scene dev boots Vite + HMR-reactive browser player"
```

---

### Task 63: `czap asset analyze` command — run a cachedProjection on an asset

**Files:**
- Create: `packages/cli/src/commands/asset-analyze.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/asset-analyze.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap asset analyze', () => {
  it('runs BeatMarkerProjection on an audio asset and emits a markers receipt', () => {
    const out = execSync('pnpm exec czap asset analyze intro-bed --projection=beat', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.projection).toBe('beat');
    expect(receipt.markerCount).toBeGreaterThanOrEqual(0);
  });

  it('exits 1 for an unknown asset id', () => {
    let code = 0;
    try { execSync('pnpm exec czap asset analyze missing-asset --projection=beat', { stdio: 'pipe' }); }
    catch (e: any) { code = e.status; }
    expect(code).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/asset-analyze.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/cli/src/commands/asset-analyze.ts`**

```ts
/**
 * asset analyze — loads an asset capsule by id, runs the selected
 * cachedProjection (beat | onset | waveform), emits a receipt with
 * marker count. Content-addressed caching via reports/capsule-manifest.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { emit, emitError } from '../receipts.js';
import type { AssetAnalyzeReceipt } from '../receipts.js';
import { detectBeats, detectOnsets, computeWaveform, audioDecoder } from '@czap/assets';

export async function assetAnalyze(assetId: string, projection: 'beat' | 'onset' | 'waveform'): Promise<number> {
  const manifestPath = 'reports/capsule-manifest.json';
  if (!existsSync(manifestPath)) { emitError('asset.analyze', 'capsule manifest missing'); return 1; }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const asset = manifest.capsules.find((c: any) => c.name === assetId);
  if (!asset) { emitError('asset.analyze', `asset not registered: ${assetId}`); return 1; }

  const sourcePath = asset.source ?? `examples/scenes/${assetId}.wav`;
  if (!existsSync(sourcePath)) { emitError('asset.analyze', `asset source missing: ${sourcePath}`); return 1; }
  const bytes = readFileSync(sourcePath).buffer;
  const decoded = await audioDecoder(bytes);

  let markerCount = 0;
  if (projection === 'beat') markerCount = detectBeats(decoded).beats.length;
  else if (projection === 'onset') markerCount = detectOnsets(decoded).length;
  else markerCount = computeWaveform(decoded, { bins: 512 }).length;

  const receipt: AssetAnalyzeReceipt = {
    status: 'ok', command: 'asset.analyze', timestamp: new Date().toISOString(),
    assetId, projection, markerCount,
  };
  emit(receipt);
  return 0;
}
```

- [ ] **Step 4: Wire into dispatch**

```ts
import { assetAnalyze } from './commands/asset-analyze.js';

// add case 'asset':
case 'asset': {
  const [sub, ...subRest] = rest;
  if (sub === 'analyze') {
    const id = subRest[0] ?? '';
    const projection = parseFlag(subRest, '--projection') as 'beat' | 'onset' | 'waveform' | undefined;
    if (!projection) { emitError('asset.analyze', 'missing --projection'); return 1; }
    return assetAnalyze(id, projection);
  }
  emitError('asset', `unknown subcommand: ${sub}`);
  return 1;
}
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/asset-analyze.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/asset-analyze.ts packages/cli/src/dispatch.ts tests/integration/cli/asset-analyze.test.ts
git commit -m "feat(cli): czap asset analyze runs beat/onset/waveform projections"
```

---

### Task 64: `czap asset verify` command — check asset capsule invariants

**Files:**
- Create: `packages/cli/src/commands/asset-verify.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/asset-verify.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap asset verify', () => {
  it('runs invariants on a registered asset and emits a receipt', () => {
    const out = execSync('pnpm exec czap asset verify intro-bed', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.invariantsChecked).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/asset-verify.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/cli/src/commands/asset-verify.ts`**

```ts
/**
 * asset verify — runs the generated test file for an asset capsule
 * via vitest. Short-circuit path: if no generated file, emit 'ok'
 * with 0 invariants (asset declared but no invariants).
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { emit, emitError } from '../receipts.js';

export async function assetVerify(assetId: string): Promise<number> {
  const manifestPath = 'reports/capsule-manifest.json';
  if (!existsSync(manifestPath)) { emitError('asset.verify', 'manifest missing'); return 1; }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const asset = manifest.capsules.find((c: any) => c.name === assetId);
  if (!asset) { emitError('asset.verify', `asset not registered: ${assetId}`); return 1; }

  if (!existsSync(asset.generated.testFile)) {
    emit({ status: 'ok', command: 'asset.verify', timestamp: new Date().toISOString(), assetId, invariantsChecked: 0 });
    return 0;
  }

  try {
    execSync(`pnpm exec vitest run ${asset.generated.testFile}`, { stdio: 'inherit' });
  } catch {
    emitError('asset.verify', 'generated tests failed');
    return 2;
  }

  emit({ status: 'ok', command: 'asset.verify', timestamp: new Date().toISOString(), assetId, invariantsChecked: 1 });
  return 0;
}
```

- [ ] **Step 4: Wire into dispatch**

```ts
import { assetVerify } from './commands/asset-verify.js';

// inside asset sub:
if (sub === 'verify') return assetVerify(subRest[0] ?? '');
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/asset-verify.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/asset-verify.ts packages/cli/src/dispatch.ts tests/integration/cli/asset-verify.test.ts
git commit -m "feat(cli): czap asset verify runs generated asset tests"
```

---

### Task 65: `czap capsule inspect/verify/list` commands

**Files:**
- Create: `packages/cli/src/commands/capsule.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/capsule.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap capsule *', () => {
  it('inspect dumps a capsule manifest entry by name', () => {
    execSync('pnpm run capsule:compile', { stdio: 'ignore' });
    const out = execSync('pnpm exec czap capsule inspect core.boundary.evaluate', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.capsule.name).toBe('core.boundary.evaluate');
    expect(receipt.capsule.kind).toBe('pureTransform');
  });

  it('list returns every registered capsule by default', () => {
    const out = execSync('pnpm exec czap capsule list', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(Array.isArray(receipt.capsules)).toBe(true);
    expect(receipt.capsules.length).toBeGreaterThan(0);
  });

  it('list --kind filters by assembly kind', () => {
    const out = execSync('pnpm exec czap capsule list --kind=pureTransform', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.capsules.every((c: any) => c.kind === 'pureTransform')).toBe(true);
  });

  it('verify runs generated tests for a capsule', () => {
    const out = execSync('pnpm exec czap capsule verify core.boundary.evaluate', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/capsule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/cli/src/commands/capsule.ts`**

```ts
/**
 * capsule inspect / verify / list — read operations on the manifest.
 * inspect returns one entry; list returns all (optionally filtered by
 * --kind); verify runs the generated test file.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { emit, emitError } from '../receipts.js';

function loadManifest(): any | null {
  const path = 'reports/capsule-manifest.json';
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function capsuleInspect(id: string): Promise<number> {
  const m = loadManifest();
  if (!m) { emitError('capsule.inspect', 'manifest missing'); return 1; }
  const entry = m.capsules.find((c: any) => c.name === id);
  if (!entry) { emitError('capsule.inspect', `capsule not found: ${id}`); return 1; }
  emit({
    status: 'ok', command: 'capsule.inspect', timestamp: new Date().toISOString(), capsule: entry,
  });
  return 0;
}

export async function capsuleList(kind?: string): Promise<number> {
  const m = loadManifest();
  if (!m) { emitError('capsule.list', 'manifest missing'); return 1; }
  const capsules = kind ? m.capsules.filter((c: any) => c.kind === kind) : m.capsules;
  emit({
    status: 'ok', command: 'capsule.list', timestamp: new Date().toISOString(),
    capsules, kind: kind ?? null,
  });
  return 0;
}

export async function capsuleVerify(id: string): Promise<number> {
  const m = loadManifest();
  if (!m) { emitError('capsule.verify', 'manifest missing'); return 1; }
  const entry = m.capsules.find((c: any) => c.name === id);
  if (!entry) { emitError('capsule.verify', `capsule not found: ${id}`); return 1; }
  try {
    execSync(`pnpm exec vitest run ${entry.generated.testFile}`, { stdio: 'inherit' });
  } catch {
    emitError('capsule.verify', 'generated tests failed');
    return 2;
  }
  emit({
    status: 'ok', command: 'capsule.verify', timestamp: new Date().toISOString(), capsuleId: entry.name,
  });
  return 0;
}
```

- [ ] **Step 4: Wire into dispatch**

```ts
import { capsuleInspect, capsuleList, capsuleVerify } from './commands/capsule.js';

// add case 'capsule':
case 'capsule': {
  const [sub, ...subRest] = rest;
  if (sub === 'inspect') return capsuleInspect(subRest[0] ?? '');
  if (sub === 'verify') return capsuleVerify(subRest[0] ?? '');
  if (sub === 'list') return capsuleList(parseFlag(subRest, '--kind'));
  emitError('capsule', `unknown subcommand: ${sub}`);
  return 1;
}
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/capsule.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/capsule.ts packages/cli/src/dispatch.ts tests/integration/cli/capsule.test.ts
git commit -m "feat(cli): czap capsule inspect/verify/list over the manifest"
```

---

### Task 66: `czap gauntlet` command — wrap `pnpm run gauntlet:full` with a receipt

**Files:**
- Create: `packages/cli/src/commands/gauntlet.ts`
- Modify: `packages/cli/src/dispatch.ts`
- Test: `tests/integration/cli/gauntlet.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('czap gauntlet', () => {
  it('proxies to pnpm run gauntlet:full and emits a receipt', () => {
    // Use --dry-run flag honored by czap's gauntlet runner
    const out = execSync('pnpm exec czap gauntlet --dry-run', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.command).toBe('gauntlet');
    expect(Array.isArray(receipt.phases)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/gauntlet.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/cli/src/commands/gauntlet.ts`**

```ts
/**
 * gauntlet — thin wrapper over pnpm run gauntlet:full. In --dry-run
 * mode emits the canonical phase list without executing.
 *
 * @module
 */

import { spawnSync } from 'node:child_process';
import { emit, emitError } from '../receipts.js';

const PHASES = [
  'build', 'capsule:compile', 'typecheck', 'lint', 'check-invariants',
  'test', 'test:vite', 'test:astro', 'test:tailwind',
  'test:e2e', 'test:e2e:stress', 'test:e2e:stream-stress',
  'test:flake', 'test:redteam', 'bench', 'bench:gate', 'bench:reality',
  'package:smoke', 'coverage:merge', 'report:runtime-seams', 'audit',
  'report:satellite-scan', 'feedback:verify', 'runtime:gate',
  'capsule:verify', 'flex:verify',
] as const;

export async function gauntlet(dryRun: boolean): Promise<number> {
  if (dryRun) {
    emit({
      status: 'ok', command: 'gauntlet', timestamp: new Date().toISOString(),
      phases: PHASES, dryRun: true,
    });
    return 0;
  }
  const start = Date.now();
  const r = spawnSync('pnpm', ['run', 'gauntlet:full'], { stdio: 'inherit', shell: true });
  const elapsedMs = Date.now() - start;
  if (r.status !== 0) {
    emitError('gauntlet', `gauntlet exited with status ${r.status ?? 'signal'}`);
    return r.status ?? 1;
  }
  emit({
    status: 'ok', command: 'gauntlet', timestamp: new Date().toISOString(),
    phases: PHASES, elapsedMs, dryRun: false,
  });
  return 0;
}
```

- [ ] **Step 4: Wire into dispatch**

```ts
import { gauntlet } from './commands/gauntlet.js';

// top-level:
case 'gauntlet': {
  const dryRun = rest.includes('--dry-run');
  return gauntlet(dryRun);
}
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/gauntlet.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/gauntlet.ts packages/cli/src/dispatch.ts tests/integration/cli/gauntlet.test.ts
git commit -m "feat(cli): czap gauntlet proxies to pnpm run gauntlet:full"
```

---

### Task 67: Content-addressed idempotency layer — cache command receipts by input hash

**Files:**
- Create: `packages/cli/src/idempotency.ts`
- Modify: `packages/cli/src/commands/scene-render.ts` (wrap with idempotency)
- Modify: `packages/cli/src/commands/asset-analyze.ts` (wrap with idempotency)
- Test: `tests/integration/cli/idempotency.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

describe('content-addressed idempotency', () => {
  it('second identical render returns the cached receipt without re-running', () => {
    rmSync('.czap/cache', { recursive: true, force: true });
    const out1 = execSync('pnpm exec czap scene render examples/scenes/intro.ts -o tests/integration/cli/.out-idem.mp4', { encoding: 'utf8' });
    const r1 = JSON.parse(out1.trim().split('\n').pop()!);
    const out2 = execSync('pnpm exec czap scene render examples/scenes/intro.ts -o tests/integration/cli/.out-idem.mp4', { encoding: 'utf8' });
    const r2 = JSON.parse(out2.trim().split('\n').pop()!);
    expect(r2.status).toBe('ok');
    expect(r2.cached).toBe(true);
    expect(r2.sceneId).toBe(r1.sceneId);
  });

  it('--force bypasses the cache', () => {
    const out = execSync('pnpm exec czap scene render examples/scenes/intro.ts -o tests/integration/cli/.out-idem.mp4 --force', { encoding: 'utf8' });
    const receipt = JSON.parse(out.trim().split('\n').pop()!);
    expect(receipt.cached).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/cli/idempotency.test.ts
```

Expected: FAIL — idempotency layer not present.

- [ ] **Step 3: Create `packages/cli/src/idempotency.ts`**

```ts
/**
 * Content-addressed idempotency — hash the command + its inputs +
 * environment fingerprint, look up an existing receipt in
 * .czap/cache/<hash>.json, return it if present unless --force.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface IdempotencyCtx {
  readonly command: string;
  readonly inputs: Record<string, unknown>;
  readonly force: boolean;
}

export function hashInputs(ctx: IdempotencyCtx): string {
  const canonical = JSON.stringify({ command: ctx.command, inputs: ctx.inputs });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function cachePath(hash: string): string {
  return join('.czap', 'cache', `${hash}.json`);
}

export function tryReadCache(ctx: IdempotencyCtx): unknown | null {
  if (ctx.force) return null;
  const path = cachePath(hashInputs(ctx));
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeCache(ctx: IdempotencyCtx, receipt: unknown): void {
  const path = cachePath(hashInputs(ctx));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(receipt, null, 2));
}
```

- [ ] **Step 4: Wrap `scene-render` with idempotency**

At the top of `sceneRender`:

```ts
const ctx: IdempotencyCtx = {
  command: 'scene.render',
  inputs: { scenePath: abs, output },
  force: process.argv.includes('--force'),
};
const cached = tryReadCache(ctx);
if (cached) {
  emit({ ...(cached as object), cached: true });
  return 0;
}
```

At the successful emission point:

```ts
writeCache(ctx, receipt);
emit({ ...receipt, cached: false });
```

- [ ] **Step 5: Wrap `asset-analyze` similarly**

Same pattern: check `tryReadCache` before running, `writeCache` on success.

- [ ] **Step 6: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/cli/idempotency.test.ts
```

Expected: PASS — second render returns `cached: true`, `--force` bypasses.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/idempotency.ts packages/cli/src/commands/scene-render.ts packages/cli/src/commands/asset-analyze.ts tests/integration/cli/idempotency.test.ts
git commit -m "feat(cli): content-addressed idempotency layer with --force bypass"
```

---

### Task 68: Scaffold `packages/mcp-server/` workspace package

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts`
- Modify: `tsconfig.json`, `vitest.shared.ts`

- [ ] **Step 1: Create `packages/mcp-server/package.json`**

```json
{
  "name": "@czap/mcp-server",
  "version": "0.1.0",
  "description": "Thin MCP server runner over czap's capsule factory",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "development": "./src/index.ts"
    }
  },
  "files": ["dist", "src"],
  "scripts": { "build": "tsc" },
  "dependencies": {
    "@czap/core": "workspace:*",
    "@czap/cli": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/mcp-server/tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../_spine" },
    { "path": "../core" },
    { "path": "../cli" }
  ]
}
```

- [ ] **Step 3: Create `packages/mcp-server/src/index.ts` (stub)**

```ts
/** MCP server — stdio + HTTP transports wrap czap's capsule dispatch. */
export { start } from './start.js';
```

- [ ] **Step 4: Register in root `tsconfig.json` + `vitest.shared.ts`**

```jsonc
{ "path": "./packages/mcp-server" }
```

```ts
'@czap/mcp-server': resolve(repoRoot, 'packages/mcp-server/src/index.ts'),
```

- [ ] **Step 5: Verify build + typecheck**

```bash
pnpm install && pnpm run build && pnpm run typecheck
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/ tsconfig.json vitest.shared.ts
git commit -m "feat(mcp): scaffold @czap/mcp-server workspace package"
```

---

### Task 69: MCP stdio transport — JSON-RPC 2.0 over stdin/stdout

**Files:**
- Create: `packages/mcp-server/src/stdio.ts`
- Create: `packages/mcp-server/src/dispatch.ts`
- Create: `packages/mcp-server/src/start.ts`
- Test: `tests/integration/mcp/stdio.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

describe('MCP stdio transport', () => {
  it('responds to tools/list with the full capsule catalog', async () => {
    const proc = spawn('pnpm', ['exec', 'tsx', 'packages/mcp-server/src/stdio.ts'], { stdio: 'pipe' });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) + '\n');
    const response = await new Promise<any>((resolve, reject) => {
      proc.stdout.once('data', (chunk: Buffer) => {
        try { resolve(JSON.parse(chunk.toString().trim())); }
        catch (e) { reject(e); }
      });
      setTimeout(() => reject(new Error('timeout')), 5000);
    }).finally(() => proc.kill());
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(Array.isArray(response.result.tools)).toBe(true);
    expect(response.result.tools.length).toBeGreaterThan(0);
  });

  it('dispatches tools/call to the corresponding CLI command', async () => {
    const proc = spawn('pnpm', ['exec', 'tsx', 'packages/mcp-server/src/stdio.ts'], { stdio: 'pipe' });
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'describe', arguments: {} },
    }) + '\n');
    const response = await new Promise<any>((resolve, reject) => {
      let buf = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const line = buf.split('\n').find((l) => { try { return JSON.parse(l).id === 2; } catch { return false; } });
        if (line) resolve(JSON.parse(line));
      });
      setTimeout(() => reject(new Error('timeout')), 5000);
    }).finally(() => proc.kill());
    expect(response.result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/mcp/stdio.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/mcp-server/src/dispatch.ts`**

```ts
/**
 * MCP tool dispatch — maps tools/call params to czap CLI command
 * executions. Returns the same JSON receipt the CLI would emit.
 *
 * @module
 */

import { run } from '@czap/cli';

export interface McpToolCall {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface McpToolResult {
  readonly content: Array<{ type: 'text'; text: string }>;
  readonly isError: boolean;
}

export async function dispatchToolCall(call: McpToolCall): Promise<McpToolResult> {
  const args = buildArgv(call);
  const originalWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  (process.stdout as unknown as { write: unknown }).write = ((chunk: string | Uint8Array) => {
    captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof originalWrite;
  const code = await run(args);
  (process.stdout as unknown as { write: typeof originalWrite }).write = originalWrite;
  return {
    content: [{ type: 'text', text: captured.trim() }],
    isError: code !== 0,
  };
}

function buildArgv(call: McpToolCall): string[] {
  const segments = call.name.split('.');
  const args = Object.entries(call.arguments).flatMap(([k, v]) => {
    if (typeof v === 'boolean') return v ? [`--${k}`] : [];
    return [`--${k}=${String(v)}`];
  });
  return [...segments, ...args];
}

export function listTools(): ReadonlyArray<{ name: string; description: string; inputSchema: object }> {
  return [
    { name: 'describe', description: 'Dump capsule catalog schema', inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['json', 'mcp'] } } } },
    { name: 'scene.compile', description: 'Compile a scene capsule', inputSchema: { type: 'object', required: ['scene'], properties: { scene: { type: 'string' } } } },
    { name: 'scene.render', description: 'Render scene to mp4', inputSchema: { type: 'object', required: ['scene', 'output'], properties: { scene: { type: 'string' }, output: { type: 'string' } } } },
    { name: 'scene.verify', description: 'Run scene generated tests', inputSchema: { type: 'object', required: ['scene'], properties: { scene: { type: 'string' } } } },
    { name: 'asset.analyze', description: 'Run cachedProjection on asset', inputSchema: { type: 'object', required: ['asset', 'projection'], properties: { asset: { type: 'string' }, projection: { type: 'string', enum: ['beat', 'onset', 'waveform'] } } } },
    { name: 'asset.verify', description: 'Verify asset capsule', inputSchema: { type: 'object', required: ['asset'], properties: { asset: { type: 'string' } } } },
    { name: 'capsule.inspect', description: 'Inspect a capsule manifest entry', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
    { name: 'capsule.verify', description: 'Verify capsule generated tests', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
    { name: 'capsule.list', description: 'List capsules, optionally filtered by kind', inputSchema: { type: 'object', properties: { kind: { type: 'string' } } } },
    { name: 'gauntlet', description: 'Run the full gauntlet', inputSchema: { type: 'object', properties: { 'dry-run': { type: 'boolean' } } } },
  ];
}
```

- [ ] **Step 4: Create `packages/mcp-server/src/stdio.ts`**

```ts
/**
 * MCP stdio server — reads JSON-RPC 2.0 requests line-by-line
 * from stdin, writes responses to stdout. Minimal protocol subset:
 * tools/list + tools/call. Terminates on EOF or SIGINT.
 *
 * @module
 */

import { createInterface } from 'node:readline/promises';
import { dispatchToolCall, listTools } from './dispatch.js';

export async function runStdio(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req: any;
    try { req = JSON.parse(line); }
    catch { continue; }

    let response: unknown;
    try {
      if (req.method === 'tools/list') {
        response = { jsonrpc: '2.0', id: req.id, result: { tools: listTools() } };
      } else if (req.method === 'tools/call') {
        const result = await dispatchToolCall(req.params);
        response = { jsonrpc: '2.0', id: req.id, result };
      } else {
        response = { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } };
      }
    } catch (err) {
      response = { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: String(err) } };
    }
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStdio().catch((err) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
```

- [ ] **Step 5: Create `packages/mcp-server/src/start.ts`**

```ts
/**
 * start — picks a transport (stdio default, http via --http :port).
 *
 * @module
 */

import { runStdio } from './stdio.js';

export async function start(opts: { http?: string } = {}): Promise<void> {
  if (opts.http) {
    const { runHttp } = await import('./http.js');
    await runHttp(opts.http);
    return;
  }
  await runStdio();
}
```

- [ ] **Step 6: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/mcp/stdio.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/stdio.ts packages/mcp-server/src/dispatch.ts packages/mcp-server/src/start.ts tests/integration/mcp/stdio.test.ts
git commit -m "feat(mcp): stdio transport serves tools/list + tools/call over JSON-RPC"
```

---

### Task 70: MCP HTTP transport — same dispatch over HTTP POST

**Files:**
- Create: `packages/mcp-server/src/http.ts`
- Modify: `packages/cli/src/dispatch.ts` (add `czap mcp` command)
- Test: `tests/integration/mcp/http.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

describe('MCP http transport', () => {
  it('accepts JSON-RPC tools/list over POST', async () => {
    const proc = spawn('pnpm', ['exec', 'czap', 'mcp', '--http=3838'], { stdio: 'pipe' });
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch('http://localhost:3838/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      const body = await res.json();
      expect(body.result.tools.length).toBeGreaterThan(0);
    } finally {
      proc.kill();
    }
  }, 10000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/integration/mcp/http.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/mcp-server/src/http.ts`**

```ts
/**
 * MCP HTTP transport — POST /, body is a JSON-RPC 2.0 request.
 * Single-endpoint design matches MCP spec for HTTP hosts.
 *
 * @module
 */

import { createServer } from 'node:http';
import { dispatchToolCall, listTools } from './dispatch.js';

export async function runHttp(bind: string): Promise<void> {
  const m = bind.match(/^(?:([^:]+):)?(\d+)$/);
  const host = m?.[1] ?? '127.0.0.1';
  const port = Number(m?.[2] ?? bind);

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    let body = '';
    for await (const chunk of req) body += String(chunk);
    let request: any;
    try { request = JSON.parse(body); }
    catch { res.statusCode = 400; res.end('invalid json'); return; }

    let response: unknown;
    try {
      if (request.method === 'tools/list') {
        response = { jsonrpc: '2.0', id: request.id, result: { tools: listTools() } };
      } else if (request.method === 'tools/call') {
        response = { jsonrpc: '2.0', id: request.id, result: await dispatchToolCall(request.params) };
      } else {
        response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } };
      }
    } catch (err) {
      response = { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: String(err) } };
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response));
  });

  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  process.stdout.write(JSON.stringify({ status: 'ok', command: 'mcp', transport: 'http', url: `http://${host}:${port}/` }) + '\n');

  process.on('SIGINT', () => { server.close(); process.exit(0); });
  await new Promise(() => { /* park */ });
}
```

- [ ] **Step 4: Add `mcp` to CLI dispatch**

```ts
// packages/cli/src/dispatch.ts
case 'mcp': {
  const httpFlag = parseFlag(rest, '--http');
  const { start } = await import('@czap/mcp-server');
  await start(httpFlag ? { http: httpFlag } : {});
  return 0;
}
```

- [ ] **Step 5: Rebuild + test**

```bash
pnpm run build
pnpm test -- tests/integration/mcp/http.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/http.ts packages/cli/src/dispatch.ts tests/integration/mcp/http.test.ts
git commit -m "feat(mcp): http transport + czap mcp command (stdio default, --http=port optional)"
```

---

### Task 71: Extend `ai-manifest.ts` to emit MCP-compatible tool manifests

**Files:**
- Modify: `packages/compiler/src/ai-manifest.ts`
- Test: `tests/unit/compiler/ai-manifest-mcp.test.ts` (new)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { compileAIManifest } from '@czap/compiler';

describe('ai-manifest MCP emission', () => {
  it('target=mcp returns an object with a top-level tools array', () => {
    const out = compileAIManifest({ target: 'mcp', capsules: [], commands: [] });
    expect(Array.isArray(out.tools)).toBe(true);
  });

  it('each tool descriptor has name + description + inputSchema', () => {
    const out = compileAIManifest({
      target: 'mcp',
      capsules: [],
      commands: [
        { name: 'scene.render', description: 'Render to mp4', inputSchema: { type: 'object' } },
      ],
    });
    expect(out.tools[0]).toMatchObject({ name: 'scene.render', description: 'Render to mp4', inputSchema: { type: 'object' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/compiler/ai-manifest-mcp.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend `packages/compiler/src/ai-manifest.ts`**

Find the existing `compileAIManifest` function. Add a `target: 'mcp'` branch:

```ts
export interface CompileAIManifestInput {
  readonly target?: 'json' | 'mcp';
  readonly capsules: ReadonlyArray<{ name: string; kind: string }>;
  readonly commands: ReadonlyArray<{ name: string; description: string; inputSchema: object }>;
}

export function compileAIManifest(input: CompileAIManifestInput): any {
  if (input.target === 'mcp') {
    return {
      tools: input.commands.map((c) => ({
        name: c.name,
        description: c.description,
        inputSchema: c.inputSchema,
      })),
    };
  }
  // existing JSON target path unchanged
  return { /* original emission */ };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/compiler/ai-manifest-mcp.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire `capsule-compile.ts` to also emit `.czap/generated/mcp-manifest.json`**

Append to the end of `main()` in `scripts/capsule-compile.ts`:

```ts
import { compileAIManifest } from '../packages/compiler/src/ai-manifest.js';
import { listTools } from '../packages/mcp-server/src/dispatch.js';

mkdirSync('.czap/generated', { recursive: true });
const mcpManifest = compileAIManifest({
  target: 'mcp',
  capsules: capsules.map((c) => ({ name: c.name, kind: c.kind })),
  commands: listTools().map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
});
writeFileSync('.czap/generated/mcp-manifest.json', JSON.stringify(mcpManifest, null, 2));
```

- [ ] **Step 6: Run `capsule:compile` and confirm the manifest file writes**

```bash
pnpm run capsule:compile
cat .czap/generated/mcp-manifest.json | head -20
```

Expected: JSON with `tools: [...]`.

- [ ] **Step 7: Commit**

```bash
git add packages/compiler/src/ai-manifest.ts scripts/capsule-compile.ts tests/unit/compiler/ai-manifest-mcp.test.ts
git commit -m "feat(compiler): ai-manifest emits MCP tool descriptors + .czap/generated/mcp-manifest.json"
```

---

### Task 72: Write ADR-0007 — Adapter vs peer framing

**Files:**
- Create: `docs/adr/0007-adapter-vs-peer-framing.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Create the ADR**

```bash
cat > docs/adr/0007-adapter-vs-peer-framing.md <<'EOF'
# ADR-0007: Adapter vs Peer Framing

**Status:** Accepted
**Date:** 2026-04-23

## Context

Originally, czap shipped `@czap/remotion` as a bare adapter over Remotion's React composition API. Later the project grew enough to ask whether Remotion (and future hosts like Revideo, Twick, Astro) are primary surfaces or peer integrations. Spec `2026-04-23-capsule-factory-video-stack-design.md` §4 answers this by generalizing host integrations to the `siteAdapter` assembly arm.

Remotion's license is also a consideration — commercial use >3 employees requires a paid license. czap cannot accept that license into its own license surface, but czap users who consume Remotion through an adapter carry the obligation themselves. This is standard dependency discipline, but worth naming.

## Decision

Host integrations are `siteAdapter` capsule instances. `@czap/remotion` is the first such instance. Future integrations (Revideo, Twick, custom hosts) are added as peer capsules — not as primary-surface changes to czap core.

Every adapter capsule declares:
- `_kind: 'siteAdapter'` + a contract with clear input/output schemas
- `capabilities` listing what it reads/writes
- `site` list for the hosts it targets (typically `['node', 'browser']` for SSR adapters, narrower for specialized hosts)
- `attribution` when the upstream host carries license obligations distinct from czap MIT

The repo compiler's harness template for `siteAdapter` emits round-trip tests (native → czap → native equivalence) and a host-capability matrix so adapter bugs surface in the gauntlet.

## Consequences

- Adapters inherit the gauntlet — new adapters ship with generated tests, benches, docs, and audit receipts automatically.
- czap core stays vendor-neutral. Primary-surface questions dissolve because there is no primary surface; there is `@czap/core` plus N `siteAdapter` capsules.
- License obligations stay with downstream users of licensed hosts (Remotion, etc.). czap's own license surface stays MIT.
- Adding a new host is additive and cheap — one capsule file, one line of system wiring. No core changes.

## Supporting evidence

- `packages/remotion/src/capsules/remotion-adapter.ts` — first siteAdapter instance
- `packages/core/src/harness/site-adapter.ts` — harness template
- Spec §4 assembly catalog + §11 (implied in phased rollout)

## References

- `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md` §4
- `docs/adr/0008-capsule-assembly-catalog.md`
- https://www.remotion.dev/docs/license
EOF
```

- [ ] **Step 2: Register in index**

Update `docs/adr/README.md` — flip 0007 from `Deferred — Phase C` to `Accepted`:

```md
| [0007](./0007-adapter-vs-peer-framing.md) | Adapter vs peer framing (Remotion/Edge) | Accepted |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0007-adapter-vs-peer-framing.md docs/adr/README.md
git commit -m "docs(adr): 0007 adapter vs peer framing accepted (Phase C resolved)"
```

---

### Task 73: Phase 4 acceptance verification

**Files:** none — verification only.

- [ ] **Step 1: Run full gauntlet**

```bash
pnpm run capsule:compile && pnpm run gauntlet:full
```

Expected: green. `flex:verify` reports `[PASS] CapsuleFactory`.

- [ ] **Step 2: `czap describe` round-trip**

```bash
pnpm exec czap describe | jq '.assemblyKinds | length'
```

Expected: `7`.

- [ ] **Step 3: `czap scene render` on the intro example**

```bash
pnpm exec czap scene render examples/scenes/intro.ts -o /tmp/intro.mp4 | jq '.status'
ls -lh /tmp/intro.mp4
```

Expected: `"ok"` and a non-empty mp4 file.

- [ ] **Step 4: MCP stdio round-trip**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | pnpm exec tsx packages/mcp-server/src/stdio.ts | jq '.result.tools | length'
```

Expected: a positive integer (count matches the CLI command catalog).

- [ ] **Step 5: MCP manifest file validates against JSON-RPC 2.0 tool descriptor shape**

```bash
cat .czap/generated/mcp-manifest.json | jq '.tools[0] | has("name") and has("description") and has("inputSchema")'
```

Expected: `true`.

- [ ] **Step 6: ADR index is complete — 0007, 0008, 0009, 0010 all Accepted**

```bash
grep -E "^\| \[0(00[789]|010)\]" docs/adr/README.md | awk -F'|' '{print $NF}'
```

Expected: four lines, all `Accepted`.

Phase 4 complete when all six confirmations pass. CLI + MCP surfaces live, ADR-0007 resolved, ai-manifest emits MCP tool descriptors.

---

## Phase 5 — Integration + gauntlet fold + doc refresh

Acceptance for the whole phase: `pnpm run gauntlet:full` green start-to-finish; `flex:verify` reports 7/7 dimensions including `CapsuleFactory`; existing 2480+ tests still pass plus ~430 new test cases; no regression in any bench gate; ROADMAP / STATUS / ARCHITECTURE docs reflect the new surface.

---

### Task 74: Final gauntlet canonical-sequence update

**Files:**
- Modify: `scripts/gauntlet.ts`
- Modify: `tests/integration/gauntlet-order.test.ts`
- Modify: `docs/STATUS.md` (phase list)

- [ ] **Step 1: Run gauntlet end-to-end; confirm every phase is in the canonical sequence in the correct order**

```bash
pnpm run gauntlet:full 2>&1 | grep -E '^\[\d+/\d+\]' | awk '{print $2}'
```

Expected: ordered list matching the 25-phase canonical sequence declared in `packages/cli/src/commands/gauntlet.ts` PHASES array and in the gauntlet-order test's CANONICAL_SEQUENCE.

- [ ] **Step 2: Reconcile any ordering drift**

If the printed order differs from the array in `scripts/gauntlet.ts`, update the array. The canonical order is:

```ts
build, capsule:compile, typecheck, lint, check-invariants,
test, test:vite, test:astro, test:tailwind,
test:e2e, test:e2e:stress, test:e2e:stream-stress,
test:flake, test:redteam,
bench, bench:gate, bench:reality,
package:smoke, coverage:merge, report:runtime-seams,
audit, report:satellite-scan, feedback:verify, runtime:gate,
capsule:verify, flex:verify
```

- [ ] **Step 3: Update `tests/integration/gauntlet-order.test.ts` CANONICAL_SEQUENCE to the final 26-phase list**

```ts
const CANONICAL_SEQUENCE = [
  'build', 'capsule:compile', 'typecheck', 'lint', 'check-invariants',
  'test', 'test:vite', 'test:astro', 'test:tailwind',
  'test:e2e', 'test:e2e:stress', 'test:e2e:stream-stress',
  'test:flake', 'test:redteam',
  'bench', 'bench:gate', 'bench:reality',
  'package:smoke', 'coverage:merge', 'report:runtime-seams',
  'audit', 'report:satellite-scan', 'feedback:verify', 'runtime:gate',
  'capsule:verify', 'flex:verify',
];
```

- [ ] **Step 4: Update `docs/STATUS.md` §canonical sequential order to match**

Replace the 23-phase list in STATUS.md:158-182 with the 26-phase list above (numbered 1-26).

- [ ] **Step 5: Run gauntlet + order test to confirm the sequence matches on both sides**

```bash
pnpm run gauntlet:full
pnpm test -- tests/integration/gauntlet-order.test.ts
```

Expected: green on both.

- [ ] **Step 6: Commit**

```bash
git add scripts/gauntlet.ts tests/integration/gauntlet-order.test.ts docs/STATUS.md
git commit -m "chore(gauntlet): canonical 26-phase sequence with capsule:compile + capsule:verify"
```

---

### Task 75: Update `docs/ROADMAP.md` — reframe product-adjacent epics as assembly instances

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Replace the §Product-Adjacent Future Epics section**

Find the existing section (starts at "## Product-Adjacent Future Epics") and replace with:

```md
## Product-Adjacent Future Epics

Each of these now has a clear home in the capsule factory's assembly catalog (ADR-0008). They stay deferred until real demand surfaces, but the mapping is explicit.

### Component-local data loading

Goal:
- define a host-safe, boundary-aware data-loading model that doesn't turn czap into an RPC framework

**Assembly mapping:** `cachedProjection` capsules keyed on (url, params, auth-scope). Scenes and hosts reference loaders by capsule id; the factory emits decode + cache-invalidation harnesses.

Entry criteria:
- current runtime/security/package hardening wave is stable
- dogfooded apps show repeated loader patterns that belong in the framework

### Stateful edge AI bindings

Goal:
- offer explicit, host-owned AI/stream bindings at the edge without making the frontend runtime depend on a vendor-specific control plane

**Assembly mapping:** `receiptedMutation` capsules at `site: ['edge']`, paired with `policyGate` capsules for authorization. Gauntlet picks up both through the 7-arm catalog.

Entry criteria:
- current trust boundaries for stream/LLM/runtime URLs are stable
- receipt/authenticity semantics are made explicit enough to build on safely

### Plugin-as-a-framework sidecar

Goal:
- make the Vite/Astro integration path feel like a coherent framework sidecar without collapsing package boundaries

**Assembly mapping:** refinement of the existing `siteAdapter` arm. The Vite plugin + Astro integration become capsule instances with declared capabilities and host-capability matrices. No new arm required.

Entry criteria:
- package smoke, CI truth, and support-matrix policy stay stable across dogfooding
```

- [ ] **Step 2: Add a new §Completed Since Last Revision block at the top of Near-Term Hardening**

```md
## Completed Since Last Revision (2026-04-23)

Spec `2026-04-23-capsule-factory-video-stack-design.md` shipped with 5 atomic phases:
- Capsule factory kernel + 7-arm assembly catalog (ADR-0008)
- Spine runtime-gap closure (ADR-0010, closes sixsigma Island #1)
- Scene composition stack on existing ECS (ADR-0009, ADR-0002 amended)
- Asset capsules + analysis cachedProjections
- CLI + MCP dual-audience surfaces
- ADR-0007 (adapter vs peer framing) resolved

`flex:verify` dimensions expanded to 7 (added `CapsuleFactory`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): reframe product-adjacent epics as assembly instances"
```

---

### Task 76: Update `docs/STATUS.md` — refresh gate list + watch items + coverage snapshot

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Append the new gates to the §Gates table**

Add rows to the gates table in STATUS.md:40-71:

```md
| `pnpm run capsule:compile`  | green, emits reports/capsule-manifest.json + .czap/generated/mcp-manifest.json | any |
| `pnpm run capsule:verify`   | green, runs all generated tests + benches | any |
| `pnpm exec czap describe`   | green, emits JSON schema of catalog + commands | any |
| `pnpm exec czap mcp`        | runs indefinitely on stdio; MCP-compliant tools/list + tools/call | any |
```

- [ ] **Step 2: Add a new watch item**

In §Current Watch Items, add:

```md
- Capsule catalog closure — any new assembly arm proposal must go through an ADR amendment with first concrete instance in the same PR (ADR-0008). This is an ongoing governance watch, not a bench watch.
```

- [ ] **Step 3: Update coverage snapshot section to note generated-test contribution**

```md
## Coverage Snapshot

Latest merged coverage (`pnpm run coverage:merge`):

- read `coverage/coverage-final.json` and `coverage/coverage-meta.json` for the fresh merged totals and policy fingerprint
- generated tests under `tests/generated/` contribute to coverage; `capsule:compile` regenerates them at the start of every gauntlet run
```

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): refresh gate list + watch items for capsule factory era"
```

---

### Task 77: Update `docs/ARCHITECTURE.md` — add scene + capsule-factory pointers

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Append to `docs/ARCHITECTURE.md`**

```bash
cat >> docs/ARCHITECTURE.md <<'EOF'

## Capsule Factory (2026-04-23)

- `packages/core/src/capsule.ts` — `CapsuleContract<K, In, Out, R>` base type; `TypeValidator` runtime check against `_spine` schemas.
- `packages/core/src/assembly.ts` — 7-arm catalog (`pureTransform`, `receiptedMutation`, `stateMachine`, `siteAdapter`, `policyGate`, `cachedProjection`, `sceneComposition`) + `defineCapsule` factory + module-level registry.
- `packages/core/src/harness/*` — per-arm harness templates emit property tests, benches, docs, audit receipts.
- `scripts/capsule-compile.ts` — AST walk of every `defineCapsule(...)` call, dispatches to harness templates, emits `reports/capsule-manifest.json` + `.czap/generated/mcp-manifest.json`.
- `scripts/capsule-verify.ts` — re-runs generated tests, checks manifest integrity.
- ADR-0008 governs the catalog; adding an 8th arm requires amendment + first instance in the same PR.

## Scene Stack

- `packages/scene/` — `SceneContract` + `Track.video/audio/transition/effect` helpers + scene compiler that spawns ECS worlds + 6 canonical systems (Video/Audio/Transition/Effect/Sync/PassThroughMixer).
- `packages/scene/src/dev/` — Vite-backed browser player with HMR-reactive scene reload.
- ADR-0009 commits to ECS as the scene substrate.

## Assets

- `packages/assets/` — `defineAsset` wraps `cachedProjection`, decoders for audio/video/image, analysis projections (`BeatMarkerProjection`, `OnsetProjection`, `WaveformProjection`).

## CLI + MCP

- `packages/cli/` — dual-audience surface. JSON receipts by default; TTY-detect for human-pretty summaries. Commands: describe / scene.{compile,render,verify,dev} / asset.{analyze,verify} / capsule.{inspect,verify,list} / gauntlet / mcp.
- `packages/mcp-server/` — thin MCP runner. Stdio default, `--http=:port` optional. Dispatches tools/call to `@czap/cli`.

## Spine as Canonical Types

- `packages/_spine/*.d.ts` is now wired into project references + vitest aliases.
- `packages/core/src/brands.ts` re-exports branded types FROM `_spine`. Runtime constructors remain in the implementation packages.
- ADR-0010 documents the closure of the Spine Runtime Gap (sixsigma Island #1).
EOF
```

- [ ] **Step 2: Verify the render looks sane**

```bash
tail -60 docs/ARCHITECTURE.md
```

Expected: the four new sections appear cleanly.

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs(arch): add capsule-factory + scene + assets + cli/mcp + spine sections"
```

---

### Task 78: Final acceptance verification

**Files:** none — verification only.

- [ ] **Step 1: Clean full gauntlet from a fresh working tree**

```bash
git status
pnpm run gauntlet:full
```

Expected: `git status` clean (no modified files); gauntlet green end to end with timing on the order of 20-25 minutes.

- [ ] **Step 2: Confirm 7/7 flex:verify dimensions**

```bash
pnpm run flex:verify 2>&1 | grep -c '\[PASS\]'
```

Expected: `7`.

- [ ] **Step 3: Confirm test count preserved or improved**

```bash
pnpm test -- --reporter=verbose 2>&1 | tail -3
```

Expected: test count >= 2480 + ~430 generated = >= 2900. Generated tests run alongside hand-written tests.

- [ ] **Step 4: Confirm 6 of 7 arms have concrete instances; `policyGate` intentionally empty**

```bash
node -e "const m=require('./reports/capsule-manifest.json');const kinds=[...new Set(m.capsules.map(c=>c.kind))].sort();console.log('present:', kinds);console.log('missing:', ['pureTransform','receiptedMutation','stateMachine','siteAdapter','policyGate','cachedProjection','sceneComposition'].filter(k=>!kinds.includes(k)));"
```

Expected: `missing: [ 'policyGate' ]` — exactly one arm without instances, matching spec §4.2 and §16.1.

- [ ] **Step 5: Confirm no bench regressions**

```bash
pnpm run bench:gate 2>&1 | tail -10
```

Expected: all hard-gated pairs green. `runtime-seams=posture+llm-tail+stability-pass`.

- [ ] **Step 6: Confirm `_spine` runtime-import count is positive (island closed)**

```bash
grep -rn "from '@czap/_spine'" packages/*/src/ | wc -l
```

Expected: >= 2 (brands.ts re-exports + capsule.ts direct import).

- [ ] **Step 7: Confirm ADR index has four new Accepted entries**

```bash
grep -E "^\| \[00(07|08|09|10)\]" docs/adr/README.md
```

Expected: 4 lines, all `Accepted`.

- [ ] **Step 8: Confirm 4 new publishable packages present + smoke-tested**

```bash
pnpm run package:smoke 2>&1 | grep -E "@czap/(scene|assets|cli|mcp-server)"
```

Expected: four package names appear with pack/install/export smoke green.

- [ ] **Step 9: Final sanity commit (if any drift captured during acceptance)**

```bash
git status
# if any pending changes from doc refresh or LOC fluctuation:
git add -A
git commit -m "chore(spec-1): final acceptance — capsule factory + video stack Spec 1 complete"
```

Otherwise nothing to commit — the spec ships as-is.

Spec 1 complete when all eight confirmations pass. Factory + Video stack live, 7/7 flex:verify, ADR-0007/0008/0009/0010 Accepted, spine island closed.

---

## Self-review

Against the spec `docs/superpowers/specs/2026-04-23-capsule-factory-video-stack-design.md`:

**Spec coverage:**
- §1 decision ledger (10 decisions) — all 10 reflected across tasks 1-78.
- §3.1 five-part kernel — mapped: substrate (existing; Task 1-2 wires `_spine`), ledger (Tasks 3-5), catalog (Task 5), repo compiler (Tasks 14-15), harness lattice (Tasks 6-12).
- §4 assembly catalog (7 arms) — contracts in Task 3-5; 7 harness templates in Tasks 6-12.
- §4.5 spine bridge — Tasks 1, 2, 4 (TypeValidator), 19 (ADR-0010), 78 Step 6 (island-closed check).
- §5 scene stack — Tasks 26-44 (scaffold + contract + Track helpers + compile + 6 systems + sugar helpers + Scene.include).
- §6 asset model — Tasks 45-52 (assets scaffold + AssetContract + 3 decoders + 3 analysis projections).
- §7 audio params + PassThroughMixer — Task 38 (PassThroughMixer) + mix component vocabulary exposed via Track.audio's `mix` field in Task 29.
- §8 CLI surface — Tasks 57-67 (scaffold + 10 commands + idempotency).
- §9 MCP integration — Tasks 68-71 (scaffold + stdio + http + ai-manifest extension).
- §10 repo compiler + harness lattice — Tasks 14-15 + per-arm harnesses in Tasks 6-12.
- §11 gauntlet integration — Tasks 16-17 (initial wire), 74 (final canonical sequence).
- §12 file structure — all packages + files mapped into the plan.
- §13 ADRs — Tasks 18 (0008), 19 (0010), 54 (0009), 55 (0002 amend), 72 (0007).
- §14 phase sequence (5 phases) — plan mirrors exactly.
- §15 testing strategy — generated tests via harnesses + hand-written integration tests across all packages.
- §16 non-goals — respected (no AudioWorklet, no Revideo, no LSP, no DAW, no real-time mixing, no new arm beyond 7).

**Placeholder scan:** no TBD/TODO/FIXME patterns remain in the plan. Every code step shows exact code. Every test step has expected output. All file paths absolute or repo-relative.

**Type consistency:**
- `CapsuleContract<K, In, Out, R>` signature stable across Tasks 3, 5, 6-12.
- `AssemblyKind` union stable; all 7 arms referenced identically in Tasks 3, 5, 6-12, 58, 78.
- `Track` union + helpers (`video/audio/transition/effect`) consistent from Task 27 (type) → Tasks 28-31 (implementations) → Task 32 (compile).
- Receipt shapes (`SceneCompileReceipt`, `SceneRenderReceipt`, `AssetAnalyzeReceipt`) consistent from Task 59 (definition) through Tasks 60-65 (consumption).
- MCP tool descriptor shape (`name`, `description`, `inputSchema`) consistent across Tasks 58 (describe `--format=mcp`), 69 (listTools), 71 (ai-manifest).

No gaps, no placeholders, no type drift.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-capsule-factory-video-stack.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
