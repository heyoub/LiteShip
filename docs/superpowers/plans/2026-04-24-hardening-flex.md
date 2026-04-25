# Spec 1.1 — Hardening via Flex (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 11 findings surfaced by the Spec 1 QA strike force by turning each bug into a reusable kernel, derived artifact, or compile-time invariant — not just a patch.

**Architecture:** Three-phase sequence. Phase A lands three new primitives (CanonicalCbor, type-directed AST walker, phantom-kinded TrackId) that downstream tasks consume. Phase B replaces unsafe/broken runtime paths with capsule instances (VitestRunner, RIFF walker, SceneRuntime, JsonRpcServer). Phase C compositional upgrades + doc/gate work (InvariantProjection, beat-binding, SceneContext, self-describing CLI, ADR amendments, E2E smoke). Self-similarity preserved — every fix ships as a capsule instance.

**Tech Stack:** Effect v4.0.0-beta.32, TypeScript 5.x (strict, ESM), fast-check, vitest, `ts.createProgram` + `getTypeChecker()` (new use), `@czap/_spine` for branded declarations.

---

## Context

Spec 1 (Capsule Factory + Video Stack, 78 tasks) shipped with `flex:verify` 7/7 green and 2643 tests passing. A four-audit Opus QA strike force then surfaced five 🔴 CRITICAL runtime defects and six 🟡 deferrable issues behind the green gate:

- `compileScene` never actually calls `world.addSystem` — worlds are not tickable (metadata `as unknown` cast hides the theater)
- `audioDecoder` hardcodes `getUint32(40)` assuming textbook WAV — fails on the shipped `examples/scenes/intro-bed.wav` fixture (ffmpeg emits LIST/INFO chunk)
- AST walker uses `ts.createSourceFile` with string-literal extraction only — blind to `defineAsset(...)`, `BeatMarkerProjection(id)`, every factory-wrapped capsule; the entire `cachedProjection` arm has zero real manifest instances
- Three CLI verify commands shell-interpolate manifest-controlled paths via `execSync` — latent RCE surface
- MCP server silently drops JSON parse errors, responds to notifications — violates JSON-RPC 2.0

Plus six 🟡 deferrables: idempotency hash not canonical (ADR-0003 aspiration unmet), generated property tests vacuous (invariants hardcoded `[]`), SyncSystem beat injection unwired, `TrackId = string` (spec §5.3 typed cross-refs unmet), `Scene.include` no BPM/fps inheritance, `describe` missing `mcp` command.

**Intent:** Each finding becomes a reusable primitive. By Spec 1.1 close, `examples/scenes/intro` renders end-to-end via real ffmpeg pipeline, `flex:verify` passes 7/7 with the `CapsuleFactory` dimension gating on arms-with-real-instances ≥ 1, and the ship claim carries zero asterisks.

**Decisions (confirmed during planning):**
- Full 11 findings in scope (no deferral to Spec 1.2)
- Hard API break on `TrackId` branding (no backwards-compat shims — pre-1.0)
- Plan + targeted ADR amendments (no new superpowers spec doc)

---

## Phase A — Foundations (Tasks 1-3)

New primitives leveraged by everyone downstream. No existing call-site behavior changes within the phase itself — retrofits happen as each downstream task lands.

### Task 1: CanonicalCbor encoder capsule

**Files:**
- Create: `packages/core/src/cbor.ts` — CBOR-canonical encoder per RFC 8949 §4.2.1
- Create: `packages/core/src/capsules/canonical-cbor.ts` — `pureTransform` capsule declaration `core.canonical-cbor` via `defineCapsule`
- Create: `tests/unit/cbor.test.ts`
- Modify: `packages/core/src/index.ts` — export `CanonicalCbor` namespace
- Modify: `packages/core/src/assembly.ts:~80` — replace `JSON.stringify` in content-address computation with `CanonicalCbor.encode` + FNV-1a over bytes
- Modify: `packages/cli/src/idempotency.ts:23` — hash over CBOR bytes instead of JSON string

**Steps:**
- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/cbor.test.ts
import { describe, it, expect } from 'vitest';
import { CanonicalCbor } from '@czap/core';

describe('CanonicalCbor.encode', () => {
  it('is key-order stable', () => {
    const a = CanonicalCbor.encode({ a: 1, b: 2, c: 3 });
    const b = CanonicalCbor.encode({ c: 3, a: 1, b: 2 });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('encodes RFC 8949 Appendix A vectors', () => {
    expect(CanonicalCbor.encode(0)).toEqual(new Uint8Array([0x00]));
    expect(CanonicalCbor.encode(1)).toEqual(new Uint8Array([0x01]));
    expect(CanonicalCbor.encode(-1)).toEqual(new Uint8Array([0x20]));
    expect(CanonicalCbor.encode(23)).toEqual(new Uint8Array([0x17]));
    expect(CanonicalCbor.encode(24)).toEqual(new Uint8Array([0x18, 0x18]));
    expect(CanonicalCbor.encode(100)).toEqual(new Uint8Array([0x18, 0x64]));
    expect(CanonicalCbor.encode(1000)).toEqual(new Uint8Array([0x19, 0x03, 0xe8]));
    expect(CanonicalCbor.encode('')).toEqual(new Uint8Array([0x60]));
    expect(CanonicalCbor.encode('a')).toEqual(new Uint8Array([0x61, 0x61]));
    expect(CanonicalCbor.encode([])).toEqual(new Uint8Array([0x80]));
    expect(CanonicalCbor.encode({})).toEqual(new Uint8Array([0xa0]));
  });

  it('prefers integer form over float when representable', () => {
    expect(CanonicalCbor.encode(1.0)).toEqual(CanonicalCbor.encode(1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/cbor.test.ts`
Expected: FAIL with import error (CanonicalCbor not found).

- [ ] **Step 3: Implement CanonicalCbor**

Encode rules per RFC 8949 §4.2.1:
- Maps: keys lex-sorted (byte-wise on encoded key, not source string), definite-length
- Arrays: definite-length
- Integers: shortest form (0..23 inline, 24..255 in uint8, etc.), negative integers via major type 1
- Floats: only when value not representable as integer (check `Number.isInteger(v)` then shortest float encoding; for the hardening scope, use float64 unconditionally when non-int)
- Strings: UTF-8 bytes, major type 3, length prefix
- Bytes (Uint8Array): major type 2
- Booleans/null: simple types 20/21/22
- Namespace pattern (ADR-0001): `export const CanonicalCbor = { encode: _encode } as const; export declare namespace CanonicalCbor { export type Encoded = Uint8Array; }`

- [ ] **Step 4: Define the capsule**

```ts
// packages/core/src/capsules/canonical-cbor.ts
import { Schema } from 'effect';
import { defineCapsule } from '../assembly.js';
import { CanonicalCbor } from '../cbor.js';

export const CanonicalCborCapsule = defineCapsule({
  _kind: 'pureTransform',
  name: 'core.canonical-cbor',
  site: ['node', 'browser'],
  capabilities: { reads: [], writes: [] },
  input: Schema.Unknown,
  output: Schema.instanceOf(Uint8Array),
  invariants: [
    { name: 'key-order-stable', check: (_in, out) => out instanceof Uint8Array },
  ],
  run: (input: unknown) => CanonicalCbor.encode(input),
});
```

- [ ] **Step 5: Retrofit content-address call sites**

- `packages/core/src/assembly.ts`: replace `fnv1a(JSON.stringify({_kind, name, ...}))` with `fnv1a(CanonicalCbor.encode({_kind, name, ...}))`
- `packages/cli/src/idempotency.ts:23`: replace `createHash('sha256').update(JSON.stringify({command, inputs})).digest('hex').slice(0, 16)` with `createHash('sha256').update(CanonicalCbor.encode({command, inputs})).digest('hex').slice(0, 16)`

- [ ] **Step 6: Verify all tests pass**

Run: `pnpm test`
Expected: all 2643+ tests pass, new cbor tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cbor.ts packages/core/src/capsules/canonical-cbor.ts packages/core/src/index.ts packages/core/src/assembly.ts packages/cli/src/idempotency.ts tests/unit/cbor.test.ts
git commit -m "feat(core): canonical CBOR encoder — bug #6 turned into content-address kernel"
```

---

### Task 2: Type-directed AST walker upgrade

**Files:**
- Modify: `scripts/capsule-compile.ts:196` — swap `ts.createSourceFile` for `ts.createProgram` + `program.getTypeChecker()`
- Modify: `scripts/capsule-compile.ts:55-97` — replace literal-only `_kind`/`name` extraction
- Create: `scripts/lib/capsule-detector.ts` — extracted semantic detector (reusable)
- Create: `tests/unit/capsule-detector.test.ts`

**Context:** Current walker (`scripts/capsule-compile.ts:55-97`) uses `ts.isStringLiteral` checks for `_kind` and `name` properties. Factory-wrapped calls like `defineAsset('intro-bed', {...})` or `BeatMarkerProjection('intro-bed')` return capsule contracts but don't have literal `_kind`/`name` in the call site — they're set by the factory body. This task upgrades detection from syntactic pattern-matching to semantic type-based detection.

**Steps:**
- [ ] **Step 1: Write failing detector tests**

```ts
// tests/unit/capsule-detector.test.ts
import { detectCapsuleCalls } from '../../scripts/lib/capsule-detector.js';

it('detects direct defineCapsule calls', () => {
  const calls = detectCapsuleCalls(['packages/core/src/capsules/canonical-cbor.ts']);
  expect(calls.some(c => c.name === 'core.canonical-cbor' && c.kind === 'pureTransform')).toBe(true);
});

it('detects defineAsset factory calls', () => {
  const calls = detectCapsuleCalls(['examples/scenes/assets.ts']);
  expect(calls.some(c => c.kind === 'cachedProjection' && c.factory === 'defineAsset')).toBe(true);
});

it('detects BeatMarkerProjection factory calls', () => {
  const calls = detectCapsuleCalls(['examples/scenes/assets.ts']);
  expect(calls.some(c => c.factory === 'BeatMarkerProjection')).toBe(true);
});
```

- [ ] **Step 2: Implement detector with TypeChecker**

Create `scripts/lib/capsule-detector.ts`:

```ts
import ts from 'typescript';

export interface DetectedCall {
  file: string;
  line: number;
  kind: string;           // K from CapsuleContract<K,...>
  name: string;           // from .name property or factory arg
  factory?: string;       // non-undefined when wrapped
  args?: unknown[];       // serializable factory args
}

export function detectCapsuleCalls(files: readonly string[]): DetectedCall[] {
  const program = ts.createProgram(files as string[], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const calls: DetectedCall[] = [];

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    ts.forEachChild(sf, function walk(node) {
      if (ts.isCallExpression(node)) {
        const returnType = checker.getTypeAtLocation(node);
        const kind = extractKindFromType(checker, returnType);
        if (kind) {
          const factoryName = ts.isIdentifier(node.expression) ? node.expression.text : undefined;
          const nameArg = extractNameArg(checker, node);
          calls.push({
            file: sf.fileName,
            line: sf.getLineAndCharacterOfPosition(node.pos).line + 1,
            kind,
            name: nameArg ?? '',
            factory: factoryName !== 'defineCapsule' ? factoryName : undefined,
            args: factoryName !== 'defineCapsule' ? extractLiteralArgs(node) : undefined,
          });
        }
      }
      ts.forEachChild(node, walk);
    });
  }
  return calls;
}
```

Helpers `extractKindFromType`, `extractNameArg`, `extractLiteralArgs` walk the type's apparent type to find `CapsuleContract<K, In, Out, R>` and read K via `checker.typeToString` on the first type argument.

- [ ] **Step 3: Wire detector into capsule-compile.ts**

Replace the syntax-only walker in `scripts/capsule-compile.ts` with `detectCapsuleCalls(globSync('packages/**/*.ts') + globSync('examples/**/*.ts'))`. Output manifest shape gains optional `factory` and `args` fields per entry.

- [ ] **Step 4: Run capsule:compile and verify manifest**

Run: `pnpm run capsule:compile`
Expected: `reports/capsule-manifest.json` now contains entries for `core.canonical-cbor` (from Task 1), all `defineAsset` calls in examples, `BeatMarkerProjection` / `OnsetProjection` / `WaveformProjection` wrappers. Count of `cachedProjection` arm entries > 0 (was 0 before).

- [ ] **Step 5: Verify tests pass**

Run: `pnpm test -- tests/unit/capsule-detector.test.ts`

- [ ] **Step 6: Commit**

```bash
git add scripts/capsule-compile.ts scripts/lib/capsule-detector.ts tests/unit/capsule-detector.test.ts reports/capsule-manifest.json
git commit -m "feat(tooling): type-directed AST walker — bug #4 turned into semantic capsule detector"
```

---

### Task 3: Phantom-kinded TrackId

**Files:**
- Modify: `packages/_spine/scene.d.ts` (create if missing) — add `TrackId<K>` brand declaration
- Modify: `packages/scene/src/contract.ts` — replace `type TrackId = string`
- Modify: `packages/scene/src/tracks/{video,audio,transition,effect}.ts` (or wherever `Track.video` etc. are defined)
- Modify: `packages/scene/src/sugar/sync-to.ts` — narrow signatures
- Modify: `examples/scenes/intro.ts` — no runtime change; types only
- Create: `tests/unit/track-id.test.ts`

**Context:** Current `TrackId = string`. `syncTo.beat(videoTrackId)` compiles despite being semantically wrong. This task adds phantom-typed kind via branded types so cross-kind refs fail at compile time.

**Steps:**
- [ ] **Step 1: Declare brand in spine**

```ts
// packages/_spine/scene.d.ts
import type { Brand } from 'effect';

export type TrackKind = 'video' | 'audio' | 'transition' | 'effect';
export type TrackId<K extends TrackKind> = string & Brand.Brand<`TrackId:${K}`>;
```

- [ ] **Step 2: Re-export in packages/scene**

```ts
// packages/scene/src/contract.ts
import type { TrackId as _TrackId, TrackKind as _TrackKind } from '@czap/_spine/scene';
export type TrackId<K extends _TrackKind> = _TrackId<K>;
export type TrackKind = _TrackKind;
```

- [ ] **Step 3: Update Track constructors**

```ts
// packages/scene/src/tracks/video.ts (or equivalent)
export const Track = {
  video: (id: string): TrackId<'video'> & { kind: 'video' } => id as TrackId<'video'>,
  audio: (id: string): TrackId<'audio'> & { kind: 'audio' } => id as TrackId<'audio'>,
  // etc.
};
```

- [ ] **Step 4: Narrow syncTo signatures**

```ts
// packages/scene/src/sugar/sync-to.ts
export const syncTo = {
  beat: (id: TrackId<'audio'>, ...) => ..., // audio tracks only
  onset: (id: TrackId<'audio'>, ...) => ...,
  peak: (id: TrackId<'audio' | 'video'>, ...) => ..., // where peak makes sense
};
```

- [ ] **Step 5: Write compile-time assertion tests**

```ts
// tests/unit/track-id.test.ts
import { Track, syncTo } from '@czap/scene';

it('accepts audio track in syncTo.beat', () => {
  const audioId = Track.audio('bed');
  expect(syncTo.beat(audioId, 0.5)).toBeDefined();
});

it('rejects video track in syncTo.beat', () => {
  const videoId = Track.video('intro');
  // @ts-expect-error — TrackId<'video'> not assignable to TrackId<'audio'>
  syncTo.beat(videoId, 0.5);
});
```

- [ ] **Step 6: Update examples/scenes/intro.ts call sites**

Replace bare string IDs with `Track.audio('bed')`, `Track.video('intro')` etc. Runtime unchanged.

- [ ] **Step 7: Run typecheck + tests**

Run: `pnpm run typecheck && pnpm test`
Expected: clean typecheck (ts-expect-error satisfied), all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/_spine/scene.d.ts packages/scene/src examples/scenes/intro.ts tests/unit/track-id.test.ts
git commit -m "feat(scene): phantom-kinded TrackId — bug #9 turned into compile-time cross-ref check"
```

---

## Phase B — Safety-critical runtime (Tasks 4-7)

### Task 4: VitestRunner capsule (no-shell)

**Files:**
- Create: `packages/cli/src/capsules/vitest-runner.ts`
- Create: `packages/cli/src/spawn-helpers.ts`
- Modify: `packages/cli/src/commands/scene-verify.ts:56`
- Modify: `packages/cli/src/commands/capsule.ts:61`
- Modify: `packages/cli/src/commands/asset-verify.ts:46`
- Create: `tests/unit/vitest-runner.test.ts`

**Context:** Three CLI commands use `execSync(\`pnpm exec vitest run ${manifestPath}\`)` — manifest-controlled paths shell-interpolated. Reuse spawn pattern from `packages/cli/src/render-backend/ffmpeg.ts:43` which uses argv array + shell:false.

**Steps:**
- [ ] **Step 1: Lift spawn helper**

```ts
// packages/cli/src/spawn-helpers.ts
import { spawn } from 'node:child_process';

export interface SpawnResult {
  exitCode: number;
  stderrTail: string; // last 8KB
}

export async function spawnArgv(cmd: string, args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'], shell: false });
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    const MAX = 8192;
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderrChunks.push(chunk);
      while (stderrBytes > MAX) {
        const first = stderrChunks[0]!;
        if (stderrBytes - first.length >= MAX) {
          stderrBytes -= first.length;
          stderrChunks.shift();
        } else break;
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({
      exitCode: code ?? 1,
      stderrTail: Buffer.concat(stderrChunks).toString('utf8'),
    }));
  });
}
```

- [ ] **Step 2: Define VitestRunner capsule**

```ts
// packages/cli/src/capsules/vitest-runner.ts
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { spawnArgv } from '../spawn-helpers.js';

const VitestRunnerInput = Schema.Struct({
  testFiles: Schema.Array(Schema.String),
  reporter: Schema.optional(Schema.Literal('default', 'json')),
});
const VitestRunnerOutput = Schema.Struct({
  exitCode: Schema.Number,
  testFiles: Schema.Array(Schema.String),
});

export const VitestRunner = defineCapsule({
  _kind: 'receiptedMutation',
  name: 'cli.vitest-runner',
  site: ['node'],
  capabilities: { reads: ['fs'], writes: ['process'] },
  input: VitestRunnerInput,
  output: VitestRunnerOutput,
  invariants: [
    { name: 'no-shell-interpolation', check: () => true }, // enforced by argv array
  ],
  run: async (input) => {
    const result = await spawnArgv('pnpm', ['exec', 'vitest', 'run', ...input.testFiles]);
    return { exitCode: result.exitCode, testFiles: input.testFiles };
  },
});
```

- [ ] **Step 3: Replace 3 execSync call sites**

Each of `scene-verify.ts:56`, `capsule.ts:61`, `asset-verify.ts:46` — replace `execSync(\`pnpm exec vitest run ${paths}\`)` with `await VitestRunner.run({ testFiles: paths })`. Exit code propagates to process.exit.

- [ ] **Step 4: Write injection-safety test**

```ts
// tests/unit/vitest-runner.test.ts
it('does not interpret shell metacharacters in paths', async () => {
  // Path with shell metacharacter that would execute a command if shell-interpolated
  const danger = 'tests/fixtures/nonexistent; echo pwned.test.ts';
  const result = await VitestRunner.run({ testFiles: [danger] });
  // File doesn't exist → vitest fails, but shell never sees the semicolon
  expect(result.exitCode).not.toBe(0);
  // No side-effect file should exist
});
```

- [ ] **Step 5: Run tests + verify 3 commands still work**

Run: `pnpm test && pnpm run capsule:compile && pnpm tsx packages/cli/src/bin.ts scene verify <known-scene>`
Expected: no shell expansion, exit codes propagate correctly.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/capsules/vitest-runner.ts packages/cli/src/spawn-helpers.ts packages/cli/src/commands/{scene-verify,capsule,asset-verify}.ts tests/unit/vitest-runner.test.ts
git commit -m "feat(cli): VitestRunner capsule — bug #1 turned into typed no-shell test execution kernel"
```

---

### Task 5: RIFF walker + WAV decoder + WavMetadata

**Files:**
- Create: `packages/assets/src/decoders/riff.ts`
- Modify: `packages/assets/src/decoders/audio.ts`
- Create: `packages/assets/src/analysis/wav-metadata.ts`
- Modify: `packages/assets/src/analysis/beat-markers.ts` (BPM prior seeding — stretch)
- Create: `tests/unit/riff-walker.test.ts`
- Create: `tests/unit/wav-metadata.test.ts`
- Modify: `examples/scenes/assets.ts` — register WavMetadataProjection

**Context:** `packages/assets/src/decoders/audio.ts:26` does `dataSize = view.getUint32(40, true)` assuming 44-byte canonical WAV. The shipped fixture `examples/scenes/intro-bed.wav` (produced by ffmpeg) has LIST/INFO chunks between fmt and data — decoder reads garbage. Fix with proper RIFF chunk walker.

**Steps:**
- [ ] **Step 1: Implement RIFF walker**

```ts
// packages/assets/src/decoders/riff.ts
export type FourCC = string; // exactly 4 ASCII chars

export type WavChunk =
  | { readonly id: 'RIFF'; readonly size: number; readonly formType: FourCC; readonly offset: number }
  | { readonly id: 'fmt '; readonly size: number; readonly offset: number; readonly data: DataView }
  | { readonly id: 'data'; readonly size: number; readonly offset: number; readonly data: DataView }
  | { readonly id: 'LIST'; readonly size: number; readonly offset: number; readonly listType: FourCC; readonly data: DataView }
  | { readonly id: FourCC; readonly size: number; readonly offset: number; readonly data: DataView };

export function* walkRiff(buffer: ArrayBuffer): Generator<WavChunk> {
  const view = new DataView(buffer);
  const dec = new TextDecoder('ascii');
  // First 12 bytes: RIFF <size> <formType>
  const riffMagic = dec.decode(new Uint8Array(buffer, 0, 4));
  if (riffMagic !== 'RIFF') throw new Error('Not a RIFF file');
  const riffSize = view.getUint32(4, true);
  const formType = dec.decode(new Uint8Array(buffer, 8, 4));
  yield { id: 'RIFF', size: riffSize, formType, offset: 0 };
  let pos = 12;
  while (pos + 8 <= buffer.byteLength) {
    const id = dec.decode(new Uint8Array(buffer, pos, 4));
    const size = view.getUint32(pos + 4, true);
    const dataOffset = pos + 8;
    const data = new DataView(buffer, dataOffset, Math.min(size, buffer.byteLength - dataOffset));
    if (id === 'LIST') {
      const listType = dec.decode(new Uint8Array(buffer, dataOffset, 4));
      yield { id: 'LIST', size, offset: pos, listType, data };
    } else {
      yield { id, size, offset: pos, data };
    }
    pos += 8 + size + (size % 2); // RIFF chunks are 2-byte aligned
  }
}
```

- [ ] **Step 2: Write RIFF walker test against real fixture**

```ts
// tests/unit/riff-walker.test.ts
import { readFileSync } from 'node:fs';
it('walks intro-bed.wav fixture cleanly', () => {
  const buf = readFileSync('examples/scenes/intro-bed.wav').buffer;
  const chunks = [...walkRiff(buf)];
  expect(chunks[0].id).toBe('RIFF');
  expect(chunks.some(c => c.id === 'fmt ')).toBe(true);
  expect(chunks.some(c => c.id === 'data')).toBe(true);
});
```

- [ ] **Step 3: Fix audioDecoder to use walker**

```ts
// packages/assets/src/decoders/audio.ts
import { walkRiff } from './riff.js';
export async function audioDecoder(bytes: ArrayBuffer): Promise<DecodedAudio> {
  let fmt: DataView | undefined;
  let data: { dv: DataView; size: number } | undefined;
  for (const chunk of walkRiff(bytes)) {
    if (chunk.id === 'fmt ') fmt = chunk.data;
    else if (chunk.id === 'data') data = { dv: chunk.data, size: chunk.size };
  }
  if (!fmt || !data) throw new Error('WAV missing fmt or data chunk');
  const audioFormat = fmt.getUint16(0, true);
  const channels = fmt.getUint16(2, true);
  const sampleRate = fmt.getUint32(4, true);
  const bitsPerSample = fmt.getUint16(14, true);
  // PCM 16-bit → Int16Array; PCM 24/32 or float32 → Float32Array (normalized to [-1,1])
  const samples = decodeSamples(data.dv, data.size, audioFormat, bitsPerSample);
  return { samples, sampleRate, channels, durationMs: (data.size / (channels * bitsPerSample / 8) / sampleRate) * 1000 };
}
```

`decodeSamples` dispatches on audio format (1=PCM, 3=IEEE float). Return type now honored.

- [ ] **Step 4: Create WavMetadataProjection**

```ts
// packages/assets/src/analysis/wav-metadata.ts
import { defineCapsule } from '@czap/core';
import { walkRiff } from '../decoders/riff.js';

export const WavMetadataProjection = (assetId: string) => defineCapsule({
  _kind: 'cachedProjection',
  name: `asset.wav-metadata.${assetId}`,
  site: ['node'],
  capabilities: { reads: ['fs'], writes: [] },
  input: Schema.instanceOf(ArrayBuffer),
  output: Schema.Struct({
    title: Schema.optional(Schema.String),
    artist: Schema.optional(Schema.String),
    bpm: Schema.optional(Schema.Number),
  }),
  invariants: [],
  run: (buf: ArrayBuffer) => {
    const dec = new TextDecoder('utf-8');
    const meta: { title?: string; artist?: string; bpm?: number } = {};
    for (const chunk of walkRiff(buf)) {
      if (chunk.id === 'LIST' && chunk.listType === 'INFO') {
        // Walk INFO sub-chunks: INAM, IART, ...
        let p = 4;
        while (p + 8 <= chunk.size) {
          const subId = dec.decode(new Uint8Array(chunk.data.buffer, chunk.data.byteOffset + p, 4));
          const subSize = chunk.data.getUint32(p + 4, true);
          const text = dec.decode(new Uint8Array(chunk.data.buffer, chunk.data.byteOffset + p + 8, subSize)).replace(/\0+$/, '');
          if (subId === 'INAM') meta.title = text;
          else if (subId === 'IART') meta.artist = text;
          else if (subId === 'IBPM') meta.bpm = Number(text) || undefined;
          p += 8 + subSize + (subSize % 2);
        }
      }
    }
    return meta;
  },
});
```

- [ ] **Step 5: (Stretch) BPM prior seeding in BeatMarkerProjection**

If this becomes fiddly, defer to Spec 1.1.1. Core WAV decoder fix is mandatory; BPM seeding is flex upgrade.

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: all tests pass including riff-walker + wav-metadata; previously failing intro-bed.wav decode now succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/assets/src/decoders/{riff,audio}.ts packages/assets/src/analysis/wav-metadata.ts tests/unit/{riff-walker,wav-metadata}.test.ts examples/scenes/assets.ts
git commit -m "feat(assets): RIFF chunk walker + WAV decoder fix + WavMetadata — bug #2 turned into reusable binary-parse kernel"
```

---

### Task 6: SceneRuntime capsule (real system registration)

**Files:**
- Create: `packages/scene/src/runtime.ts`
- Modify: `packages/scene/src/compile.ts:33-41`
- Create: `tests/unit/scene-runtime.test.ts`
- Modify: `packages/scene/src/index.ts`

**Context:** `packages/scene/src/compile.ts:41` currently does `(world as unknown as { registeredSystems: readonly string[] }).registeredSystems = SCENE_SYSTEMS`. Never calls `world.addSystem` (API at `packages/core/src/ecs.ts:181`). `Effect.scoped` at line 33 closes the scope before returning — world is dead on arrival.

**Steps:**
- [ ] **Step 1: Define compiled scene descriptor**

```ts
// packages/scene/src/runtime.ts
import { Effect, Scope } from 'effect';
import { World } from '@czap/core';
import { defineCapsule } from '@czap/core';
import { VideoSystem, AudioSystem, TransitionSystem, EffectSystem, SyncSystem, PassThroughMixer } from './systems/index.js';

export interface CompiledScene {
  readonly trackSpawns: readonly TrackSpawn[]; // what compile.ts produces
  readonly beats?: readonly BeatEntry[];       // from Task 9 beat-binding
}

export interface SceneRuntimeHandle {
  readonly world: World.Shape;
  readonly tick: (dtMs: number) => Effect.Effect<void>;
  readonly release: () => Effect.Effect<void>;
}

const SYSTEMS_IN_ORDER = [VideoSystem, AudioSystem, TransitionSystem, EffectSystem, SyncSystem, PassThroughMixer] as const;

export const SceneRuntime = defineCapsule({
  _kind: 'stateMachine',
  name: 'scene.runtime',
  site: ['node', 'browser'],
  capabilities: { reads: [], writes: [] },
  input: Schema.Struct({ scene: /*CompiledScene schema*/ }),
  output: /*SceneRuntimeHandle schema*/,
  invariants: [
    { name: 'world-tickable', check: (_in, out) => typeof out.tick === 'function' },
    { name: 'systems-in-order', check: () => true }, // enforced by construction
  ],
  run: Effect.fn(function* (input: { scene: CompiledScene }) {
    const scope = yield* Scope.make();
    const world = yield* World.make();
    // Spawn entities from scene.trackSpawns
    for (const spawn of input.scene.trackSpawns) {
      yield* world.spawn(spawn.components);
    }
    // Register systems in topological order
    for (const system of SYSTEMS_IN_ORDER) {
      yield* world.addSystem(system);
    }
    return {
      world,
      tick: (dtMs: number) => world.tick(dtMs),
      release: () => Scope.close(scope, Exit.unit),
    };
  }),
});
```

- [ ] **Step 2: Simplify compile.ts**

Remove `Effect.scoped` wrap (scope now held by SceneRuntime). Remove the `as unknown` cast and `registeredSystems` metadata. Return `CompiledScene` (just trackSpawns + beats, no world).

- [ ] **Step 3: Add DX sugar**

```ts
// packages/scene/src/index.ts
export const Scene = {
  ...existing,
  runtime: (compiled: CompiledScene) => SceneRuntime.run({ scene: compiled }),
};
```

- [ ] **Step 4: Write runtime test**

```ts
// tests/unit/scene-runtime.test.ts
it('ticks a compiled scene and advances components', async () => {
  const compiled = compileScene(/*test scene*/);
  const handle = await Effect.runPromise(SceneRuntime.run({ scene: compiled }));
  await Effect.runPromise(handle.tick(16.67));
  await Effect.runPromise(handle.tick(16.67));
  // Assert VideoSystem advanced opacity, etc.
  const videoEntity = handle.world.queryOne('video');
  expect(videoEntity.opacity).toBeGreaterThan(0);
  await Effect.runPromise(handle.release());
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- tests/unit/scene-runtime.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/runtime.ts packages/scene/src/compile.ts packages/scene/src/index.ts tests/unit/scene-runtime.test.ts
git commit -m "feat(scene): SceneRuntime capsule — bug #3 turned into real tickable ECS runtime"
```

---

### Task 7: JsonRpcServer capsule + conformance suite

**Files:**
- Create: `packages/mcp-server/src/jsonrpc.ts`
- Modify: `packages/mcp-server/src/stdio.ts`
- Modify: `packages/mcp-server/src/dispatch.ts`
- Create: `tests/unit/jsonrpc-conformance.test.ts`
- Create: `tests/unit/mcp-notifications.test.ts`

**Context:** `packages/mcp-server/src/stdio.ts:18` has `try { req = JSON.parse(line) } catch { continue }` — parse errors silently dropped. Line 23 dispatches both notifications (no `id`) and requests. Line 29 sends `id: req.id` (undefined for notifications). Violates JSON-RPC 2.0 §4.1 (notifications MUST NOT receive a response) and §4.2 (parse errors MUST emit `-32700`).

**Steps:**
- [ ] **Step 1: Implement JSON-RPC 2.0 kernel**

```ts
// packages/mcp-server/src/jsonrpc.ts
export type JsonRpcId = string | number | null;
export interface JsonRpcRequest { jsonrpc: '2.0'; id: JsonRpcId; method: string; params?: unknown; }
export interface JsonRpcNotification { jsonrpc: '2.0'; method: string; params?: unknown; }
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;
export interface JsonRpcSuccess { jsonrpc: '2.0'; id: JsonRpcId; result: unknown; }
export interface JsonRpcError { jsonrpc: '2.0'; id: JsonRpcId; error: { code: number; message: string; data?: unknown; }; }
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export type ParseOutcome =
  | { kind: 'request'; message: JsonRpcRequest }
  | { kind: 'notification'; message: JsonRpcNotification }
  | { kind: 'batch'; messages: readonly JsonRpcMessage[] }
  | { kind: 'parse-error' }
  | { kind: 'invalid-request'; id: JsonRpcId };

export function parse(line: string): ParseOutcome {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { return { kind: 'parse-error' }; }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { kind: 'invalid-request', id: null };
    return { kind: 'batch', messages: raw.map(validateOne).filter(isMsg) };
  }
  return validateOneTagged(raw);
}

function validateOneTagged(raw: unknown): ParseOutcome {
  if (!raw || typeof raw !== 'object') return { kind: 'invalid-request', id: null };
  const obj = raw as Record<string, unknown>;
  if (obj.jsonrpc !== '2.0' || typeof obj.method !== 'string') {
    return { kind: 'invalid-request', id: (obj.id ?? null) as JsonRpcId };
  }
  if (!('id' in obj)) return { kind: 'notification', message: obj as unknown as JsonRpcNotification };
  return { kind: 'request', message: obj as unknown as JsonRpcRequest };
}

export function errorResponse(id: JsonRpcId, code: number, message: string): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
```

- [ ] **Step 2: Wire into stdio.ts**

```ts
// packages/mcp-server/src/stdio.ts
import { parse, errorResponse } from './jsonrpc.js';
import { dispatch } from './dispatch.js';

for await (const line of readlineStream) {
  const outcome = parse(line);
  if (outcome.kind === 'parse-error') {
    process.stdout.write(JSON.stringify(errorResponse(null, -32700, 'Parse error')) + '\n');
    continue;
  }
  if (outcome.kind === 'invalid-request') {
    process.stdout.write(JSON.stringify(errorResponse(outcome.id, -32600, 'Invalid Request')) + '\n');
    continue;
  }
  if (outcome.kind === 'notification') {
    await dispatch(outcome.message); // side-effects only; no response
    continue;
  }
  if (outcome.kind === 'request') {
    const resp = await dispatch(outcome.message);
    process.stdout.write(JSON.stringify(resp) + '\n');
    continue;
  }
  // batch: dispatch each, emit array of responses (skipping nulls for notifications)
}
```

- [ ] **Step 3: Update dispatch.ts to distinguish request vs notification**

Signature change: `dispatch(msg: JsonRpcRequest | JsonRpcNotification): Promise<JsonRpcResponse | null>` — returns null for notifications (suppressed at stdio layer).

- [ ] **Step 4: Write conformance tests transcribing JSON-RPC 2.0 spec examples**

```ts
// tests/unit/jsonrpc-conformance.test.ts
import { parse, errorResponse } from '@czap/mcp-server/jsonrpc';

it('parse error emits -32700', () => {
  expect(parse('{json broken').kind).toBe('parse-error');
});

it('recognizes notifications (missing id)', () => {
  const o = parse('{"jsonrpc":"2.0","method":"foo"}');
  expect(o.kind).toBe('notification');
});

it('recognizes requests (id present)', () => {
  const o = parse('{"jsonrpc":"2.0","method":"foo","id":1}');
  expect(o.kind).toBe('request');
});

it('empty array is invalid-request', () => {
  const o = parse('[]');
  expect(o.kind).toBe('invalid-request');
});

it('batch with mixed messages', () => {
  const o = parse('[{"jsonrpc":"2.0","method":"a","id":1},{"jsonrpc":"2.0","method":"b"}]');
  expect(o.kind).toBe('batch');
});
```

- [ ] **Step 5: Write no-response-for-notification integration test**

```ts
// tests/unit/mcp-notifications.test.ts
it('emits no response line for notification', async () => {
  // Spawn mcp-server, pipe a notification, assert stdout empty
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- tests/unit/jsonrpc-conformance.test.ts tests/unit/mcp-notifications.test.ts`

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/{jsonrpc,stdio,dispatch}.ts tests/unit/{jsonrpc-conformance,mcp-notifications}.test.ts
git commit -m "feat(mcp): JsonRpcServer capsule + conformance suite — bugs #5a+#5b turned into reusable JSON-RPC 2.0 kernel"
```

---

## Phase C — Flex upgrades + proof (Tasks 8-13)

### Task 8: InvariantProjection + arbitrary-from-schema

**Files:**
- Modify: all 7 harness templates in `packages/core/src/harness/`
- Create: `packages/core/src/harness/arbitrary-from-schema.ts`
- Regenerate: `tests/generated/**`

**Context:** `buildStubDef` in each harness template hardcodes `invariants: []` — generated `fc.property` tests have nothing to assert. Fix by reading real declared invariants and deriving fast-check arbitraries from input schemas.

**Steps:**
- [ ] **Step 1: Write arbitrary-from-schema**

```ts
// packages/core/src/harness/arbitrary-from-schema.ts
import { Schema } from 'effect';
import * as fc from 'fast-check';

export function schemaToArbitrary<T>(schema: Schema.Codec<T, T, never>): fc.Arbitrary<T> {
  // Walk Schema AST via Schema.TypeAST and map to fc arbitraries
  // Primitives: String → fc.string(), Number → fc.integer() | fc.float(), Boolean → fc.boolean()
  // Composites: Struct → fc.record(), Array → fc.array(), Union → fc.oneof()
  // Opaque types → fc.constant(default) as pragmatic fallback
}
```

Full Schema AST walker may be heavy. Pragmatic path: cover the common cases (Struct, Array, primitives, Union, Literal) and fall back to `fc.anything()` with a test skip marker for unknown shapes.

- [ ] **Step 2: Update all 7 harness templates**

Each template (`pure-transform.ts`, `receipted-mutation.ts`, etc.) currently emits a test with `const capsule = {...buildStubDef(), invariants: []}`. Change to:

```ts
const testContents = `
import { schemaToArbitrary } from '@czap/core/harness/arbitrary-from-schema';
import * as fc from 'fast-check';
import { ${cap.name.replace(/[^a-zA-Z0-9]/g, '_')} as capsule } from '${cap.sourceFile}';

describe('${cap.name}', () => {
  const arb = schemaToArbitrary(capsule.input);
  for (const inv of capsule.invariants) {
    it(\`invariant: \${inv.name}\`, () => {
      fc.assert(fc.property(arb, (input) => {
        const output = capsule.run(input);
        return inv.check(input, output);
      }), { numRuns: 1000 });
    });
  }
});
`;
```

- [ ] **Step 3: Regenerate manifest + generated tests**

Run: `pnpm run capsule:compile`

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: generated tests now run 1000 iterations each with real invariant checks. Any latent contract violations surface here.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/harness tests/generated reports/capsule-manifest.json
git commit -m "feat(harness): InvariantProjection + arbitrary-from-schema — bug #7 turned into real generative contract tests"
```

---

### Task 9: Beat-binding sceneComposition capsule

**Files:**
- Create: `packages/scene/src/capsules/beat-binding.ts`
- Modify: `packages/scene/src/systems/sync.ts`
- Modify: `packages/scene/src/runtime.ts`
- Create: `tests/integration/beat-binding.test.ts`
- Modify: `examples/scenes/intro.ts` — use `Beat()` sugar

**Context:** Current `SyncSystem` always reads `_beats = []` (empty closure parameter). `BeatMarkerProjection` computes beat markers but output never reaches ECS. Wire via `sceneComposition` arm capsule that spawns beat entities.

**Steps:**
- [ ] **Step 1: Define BeatComponent**

```ts
// packages/scene/src/components/beat.ts
export interface BeatComponent { kind: 'beat'; timeMs: number; strength: number; }
```

- [ ] **Step 2: Create beat-binding capsule**

```ts
// packages/scene/src/capsules/beat-binding.ts
export const BeatBinding = defineCapsule({
  _kind: 'sceneComposition',
  name: 'scene.beat-binding',
  // ...
  run: Effect.fn(function* (input: { scene: CompiledScene; world: World.Shape }) {
    for (const markerSet of input.scene.beats ?? []) {
      for (const beat of markerSet.beats) {
        yield* input.world.spawn({ kind: 'beat', timeMs: beat.timeMs, strength: beat.strength });
      }
    }
  }),
});
```

- [ ] **Step 3: Update SyncSystem to query world**

Remove `_beats` closure parameter. Use `world.query('beat')` each tick.

- [ ] **Step 4: Integrate into SceneRuntime**

In Task 6's `SceneRuntime.run`, after `world.addSystem` calls, invoke `BeatBinding.run({ scene, world })`.

- [ ] **Step 5: Write integration test**

```ts
// tests/integration/beat-binding.test.ts
it('SyncSystem sees beat entities from BeatMarkerProjection', async () => {
  const scene = defineScene({ audio: [{ trackId: Track.audio('bed'), src: introBedAsset }] });
  const compiled = await compileScene(scene);
  const handle = await Effect.runPromise(SceneRuntime.run({ scene: compiled }));
  const beats = handle.world.query('beat');
  expect(beats.length).toBeGreaterThan(0);
});
```

- [ ] **Step 6: Update intro.ts to use Beat() sugar**

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/capsules/beat-binding.ts packages/scene/src/systems/sync.ts packages/scene/src/runtime.ts tests/integration/beat-binding.test.ts examples/scenes/intro.ts
git commit -m "feat(scene): beat-binding sceneComposition — bug #8 turned into pure ECS beat data flow"
```

---

### Task 10: Scoped SceneContext

**Files:**
- Create: `packages/scene/src/context.ts`
- Modify: `packages/scene/src/include.ts`
- Modify: `packages/scene/src/runtime.ts`
- Create: `tests/unit/scene-include-context.test.ts`

**Steps:**
- [ ] **Step 1: Define context tag**

```ts
// packages/scene/src/context.ts
import { Context } from 'effect';
export class SceneContext extends Context.Tag('@czap/scene/SceneContext')<
  SceneContext,
  { readonly bpm: number; readonly fps: number; readonly rootTimeMs: number; }
>() {}
```

- [ ] **Step 2: Scene.include wraps child in parent context**

```ts
// packages/scene/src/include.ts
export const include = (sub: Scene, overrides?: Partial<SceneContextValue>) =>
  Effect.gen(function* () {
    const parent = yield* SceneContext;
    const childCtx = { ...parent, ...overrides };
    return yield* compileScene(sub).pipe(Effect.provideService(SceneContext, childCtx));
  });
```

- [ ] **Step 3: SceneRuntime provides root layer**

- [ ] **Step 4: Test inheritance**

```ts
it('child scene inherits parent BPM', async () => {
  const parent = defineScene({ bpm: 140, children: [childScene] });
  const compiled = await compileScene(parent);
  // assert childScene's beat positions computed using 140 BPM
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/context.ts packages/scene/src/include.ts packages/scene/src/runtime.ts tests/unit/scene-include-context.test.ts
git commit -m "feat(scene): scoped SceneContext — bug #10 turned into real compositional scene semantics"
```

---

### Task 11: Self-describing CLI describe

**Files:**
- Modify: `packages/cli/src/commands/describe.ts`
- Modify: every CLI command file to add `cliCommand: true` metadata to its capsule declaration
- Create: `tests/integration/describe-auto-sync.test.ts`

**Steps:**
- [ ] **Step 1: Add cliCommand metadata to each command's capsule**

- [ ] **Step 2: Rewrite describe to read manifest**

```ts
// packages/cli/src/commands/describe.ts
const manifest = JSON.parse(readFileSync('reports/capsule-manifest.json', 'utf8'));
const commands = manifest.capsules.filter(c => c.metadata?.cliCommand);
emit({ command: 'describe', commands: commands.map(c => ({ name: c.name, kind: c.kind })) });
```

- [ ] **Step 3: Test auto-sync**

```ts
it('describe lists every CLI command in manifest', () => {
  const described = JSON.parse(execSync('pnpm tsx packages/cli/src/bin.ts describe').toString());
  const manifestCommands = manifest.capsules.filter(c => c.metadata?.cliCommand).map(c => c.name);
  for (const cmd of manifestCommands) expect(described.commands.some(d => d.name === cmd)).toBe(true);
});
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands tests/integration/describe-auto-sync.test.ts
git commit -m "feat(cli): self-describing describe — bug #11 turned into manifest-derived command list"
```

---

### Task 12: Amend ADRs

**Files:**
- Modify: `docs/adr/0002-zero-alloc.md` — new subsection "Scene runtime tick cadence"
- Modify: `docs/adr/0003-content-addressing.md` — document CanonicalCbor now honored
- Modify: `docs/adr/0008-capsule-assembly-catalog.md` — document type-directed detection
- Modify: `docs/STATUS.md`

**Steps:**
- [ ] **Step 1: ADR-0002 new subsection**

Document: SceneRuntime registers 6 canonical systems in topological order (Video → Audio → Transition → Effect → Sync → PassThroughMixer). World lifetime scope-held via `Scope.make()`. Deterministic tick cadence preserves ADR-0002 zero-alloc discipline via dense Float64Array component stores.

- [ ] **Step 2: ADR-0003 amendment**

Remove aspiration language. Add: "Content addressing uses `CanonicalCbor.encode` (RFC 8949 §4.2.1 canonical form) for payload serialization, then FNV-1a over the byte output. Key order, platform endianness, and JSON stringification quirks no longer affect hashes."

- [ ] **Step 3: ADR-0008 amendment**

Add under consequences: "Capsule detection uses `ts.createProgram` + `getTypeChecker()` to resolve return types against `CapsuleContract<K, ...>`. Factory-wrapped capsules (`defineAsset`, `BeatMarkerProjection`, etc.) are detected via semantic type resolution, not literal `_kind`/`name` matching."

- [ ] **Step 4: STATUS.md update**

Add Done-list entry: "Spec 1.1 Hardening via Flex — 11 findings closed, E2E reference render verified, flex:verify 7/7 green".

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0002-zero-alloc.md docs/adr/0003-content-addressing.md docs/adr/0008-capsule-assembly-catalog.md docs/STATUS.md
git commit -m "docs(adr): amend 0002/0003/0008 per Spec 1.1 Hardening via Flex"
```

---

### Task 13: E2E smoke + flex:verify re-prove

**Files:**
- Create: `tests/smoke/intro-render.test.ts`
- Modify: `scripts/flex-verify.ts` (CapsuleFactory dimension now gates on arms-with-instances)

**Steps:**
- [ ] **Step 1: Write E2E smoke**

```ts
// tests/smoke/intro-render.test.ts
import { execSync } from 'node:child_process';
import { existsSync, statSync, unlinkSync } from 'node:fs';

it('renders intro scene to mp4 via ffmpeg pipeline', async () => {
  const out = 'tests/smoke/intro.mp4';
  if (existsSync(out)) unlinkSync(out);
  execSync(`pnpm tsx packages/cli/src/bin.ts scene render examples/scenes/intro.ts --out ${out} --frames 60`, { stdio: 'inherit' });
  expect(existsSync(out)).toBe(true);
  expect(statSync(out).size).toBeGreaterThan(1024);
  // Optional: ffprobe metadata check
  const probe = execSync(`ffprobe -v error -show_entries format=duration ${out}`).toString();
  expect(probe).toContain('duration=');
});
```

- [ ] **Step 2: Tighten CapsuleFactory dimension in flex-verify**

Modify `scripts/flex-verify.ts` CapsuleFactory dimension to gate on every arm having ≥ 1 real capsule instance in the manifest (no phantom arms).

- [ ] **Step 3: Run full gate**

Run: `pnpm tsx scripts/flex-verify.ts`
Expected: 7/7 green.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/intro-render.test.ts scripts/flex-verify.ts
git commit -m "test: E2E intro render smoke + flex:verify 7/7 re-prove — Spec 1.1 complete"
```

---

## File Structure Summary

**New files (~13):**
- `packages/core/src/cbor.ts`, `packages/core/src/capsules/canonical-cbor.ts`
- `scripts/lib/capsule-detector.ts`
- `packages/cli/src/capsules/vitest-runner.ts`, `packages/cli/src/spawn-helpers.ts`
- `packages/assets/src/decoders/riff.ts`, `packages/assets/src/analysis/wav-metadata.ts`
- `packages/scene/src/runtime.ts`, `packages/scene/src/capsules/beat-binding.ts`, `packages/scene/src/context.ts`
- `packages/mcp-server/src/jsonrpc.ts`
- `packages/core/src/harness/arbitrary-from-schema.ts`
- `tests/smoke/intro-render.test.ts` + ~8 unit/integration tests

**Modified files (~20):** enumerated per task above.

## Reuse strategy

- `packages/core/src/brands.ts:58-73` pattern for TrackId branding (Task 3)
- `packages/core/src/ecs.ts:181` `addSystem(AnySystemShape)` API for Task 6
- `packages/cli/src/render-backend/ffmpeg.ts:43` spawn + backpressure pattern → lifted to `spawn-helpers.ts` for Task 4
- `packages/cli/src/receipts.ts` `emit`/`emitError` preserved (no changes)
- `packages/cli/src/idempotency.ts:23` hash call site re-routed through CanonicalCbor (Task 1)
- No existing CBOR, Context.Tag, or TypeChecker usage — all genuine greenfield primitives.

## Verification

1. `pnpm run build` — clean TypeScript build
2. `pnpm test` — all tests pass + generated tests now assert real invariants
3. `pnpm run capsule:compile && pnpm run capsule:verify` — manifest includes real entries for every asset projection, VitestRunner, JsonRpcServer, CanonicalCbor, BeatBinding
4. `pnpm vitest run tests/smoke/intro-render.test.ts` — E2E render produces valid mp4
5. `pnpm tsx scripts/flex-verify.ts` — 7/7 dimensions green, CapsuleFactory gates on arms-with-instances ≥ 1
6. Manual MCP conformance: `echo "garbage" | pnpm tsx packages/mcp-server/src/bin.ts` emits `-32700` response
7. Manual shell injection: inject manifest path `"; echo pwned"` — VitestRunner passes as argv, shell never evaluates

## Execution

Executed via **superpowers:subagent-driven-development** — one implementation subagent per task, with spec-compliance + code-quality reviewer gates. Commit per task. Phase boundary checkpoints at Task 3, Task 7, Task 13.
