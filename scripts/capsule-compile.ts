#!/usr/bin/env tsx
/**
 * capsule-compile — walks every capsule call site (direct `defineCapsule(...)`
 * or factory wrappers like `defineAsset(...)`, `BeatMarkerProjection(id)`,
 * `OnsetProjection(id)`, `WaveformProjection(id, opts)`) under
 * `packages/**\/src/**` and `examples/**`, dispatches each to its arm-specific
 * harness generator, writes generated test + bench files under
 * `tests/generated/`, and emits `reports/capsule-manifest.json` listing every
 * capsule found.
 *
 * Capsule detection is type-directed (see `./lib/capsule-detector.ts`): a
 * `ts.Program` + `getTypeChecker()` resolves every CallExpression's return
 * type and matches anything that extends `CapsuleContract<K, ...>` /
 * `CapsuleDef<K, ...>`. Replaces the syntax-only ts.createSourceFile walker
 * that was blind to factory wrappers.
 *
 * This script is the factory compiler — the `capsule:compile` gauntlet phase.
 *
 * @module
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import fastGlob from 'fast-glob';
import {
  generatePureTransform,
  generateReceiptedMutation,
  generateStateMachine,
  generateSiteAdapter,
  generatePolicyGate,
  generateCachedProjection,
  generateSceneComposition,
  type HarnessOutput,
  type HarnessContext,
} from '../packages/core/src/harness/index.js';
import type { CapsuleDef } from '../packages/core/src/assembly.js';
import type { AssemblyKind } from '../packages/core/src/capsule.js';
import type { ContentAddress } from '../packages/core/src/brands.js';
import { detectCapsuleCalls } from './lib/capsule-detector.js';

/** A single entry in the capsule manifest. */
interface ManifestEntry {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly generated: { testFile: string; benchFile: string };
  /** Set when the call site uses a factory wrapper instead of `defineCapsule` directly. */
  readonly factory?: string;
  /** Literal arguments captured at the factory call site. */
  readonly args?: readonly unknown[];
}

/** The shape written to reports/capsule-manifest.json. */
interface CapsuleManifest {
  readonly generatedAt: string;
  readonly capsules: readonly ManifestEntry[];
}

/**
 * Build a stub `CapsuleDef` sufficient for harness generator dispatch.
 * Generators only use `name`, `_kind`, and `invariants` from the def — all
 * other fields are safe to stub with structural defaults.
 */
function buildStubDef(
  kind: AssemblyKind,
  name: string,
): CapsuleDef<AssemblyKind, unknown, unknown, unknown> {
  return {
    _kind: kind,
    name,
    id: `fnv1a:00000000` as ContentAddress,
    input: null as unknown,
    output: null as unknown,
    invariants: [],
    budgets: {},
    capabilities: { reads: [], writes: [] },
    site: ['node'],
  } as unknown as CapsuleDef<AssemblyKind, unknown, unknown, unknown>;
}

/** Dispatch to the correct harness generator based on assembly kind. */
function dispatchHarness(
  kind: AssemblyKind,
  cap: CapsuleDef<AssemblyKind, unknown, unknown, unknown>,
  ctx?: HarnessContext,
): HarnessOutput {
  switch (kind) {
    case 'pureTransform':
      return generatePureTransform(
        cap as CapsuleDef<'pureTransform', unknown, unknown, unknown>,
        ctx,
      );
    case 'receiptedMutation':
      return generateReceiptedMutation(
        cap as CapsuleDef<'receiptedMutation', unknown, unknown, unknown>,
      );
    case 'stateMachine':
      return generateStateMachine(
        cap as CapsuleDef<'stateMachine', unknown, unknown, unknown>,
      );
    case 'siteAdapter':
      return generateSiteAdapter(
        cap as CapsuleDef<'siteAdapter', unknown, unknown, unknown>,
      );
    case 'policyGate':
      return generatePolicyGate(
        cap as CapsuleDef<'policyGate', unknown, unknown, unknown>,
      );
    case 'cachedProjection':
      return generateCachedProjection(
        cap as CapsuleDef<'cachedProjection', unknown, unknown, unknown>,
      );
    case 'sceneComposition':
      return generateSceneComposition(
        cap as CapsuleDef<'sceneComposition', unknown, unknown, unknown>,
      );
    default: {
      const exhaustive: never = kind;
      throw new Error(`[capsule-compile] Unknown assembly kind: ${String(exhaustive)}`);
    }
  }
}

/** Checks whether a string is a valid AssemblyKind. */
const VALID_KINDS = new Set<string>([
  'pureTransform',
  'receiptedMutation',
  'stateMachine',
  'siteAdapter',
  'policyGate',
  'cachedProjection',
  'sceneComposition',
]);

function isAssemblyKind(k: string): k is AssemblyKind {
  return VALID_KINDS.has(k);
}

/**
 * Naming-convention map for known capsule factories. Source of truth lives
 * in the factory's `defineCapsule({ name: ... })` template literal — we
 * mirror it here so the manifest's surface name matches what the runtime
 * registers. Keep this in sync with the factories in
 * `packages/assets/src/analysis/*.ts`.
 */
const FACTORY_NAMING: Readonly<Record<string, (args: readonly unknown[]) => string | undefined>> = {
  BeatMarkerProjection: (args) => (typeof args[0] === 'string' ? `${args[0]}:beats` : undefined),
  OnsetProjection: (args) => (typeof args[0] === 'string' ? `${args[0]}:onsets` : undefined),
  WaveformProjection: (args) =>
    typeof args[0] === 'string' && typeof args[1] === 'number'
      ? `${args[0]}:waveform:${args[1]}`
      : undefined,
  WavMetadataProjection: (args) =>
    typeof args[0] === 'string' ? `${args[0]}:wav-metadata` : undefined,
};

/** Resolve the capsule's runtime-registered name from a detected call site. */
function resolveCapsuleName(
  detectedName: string,
  factory: string | undefined,
  args: readonly unknown[] | undefined,
): string {
  if (factory && args && FACTORY_NAMING[factory]) {
    const resolved = FACTORY_NAMING[factory](args);
    if (resolved !== undefined) return resolved;
  }
  return detectedName;
}

async function main(): Promise<void> {
  const cwd = resolve(process.cwd());
  const allFiles = await fastGlob(
    ['packages/**/src/**/*.ts', 'examples/**/*.ts'],
    {
      ignore: ['**/*.d.ts', '**/node_modules/**', '**/dist/**'],
      absolute: true,
      cwd,
    },
  );

  // Pre-filter to files that mention `defineCapsule` or a known capsule
  // factory. The detector's ts.createProgram pulls in transitive
  // dependencies anyway, so we don't need to feed it every source file.
  // Derives the factory list from FACTORY_NAMING + the two base factories
  // so a new naming rule auto-extends the hint list.
  // Assumption: every capsule call site includes one of these bare tokens
  // in its source text. Holds for all current invocation patterns
  // (defineCapsule({...}), defineAsset(id, {...}), Factory(args)).
  const FACTORY_HINTS = ['defineCapsule', 'defineAsset', ...Object.keys(FACTORY_NAMING)];
  const files = allFiles.filter((f) => {
    try {
      const src = readFileSync(f, 'utf8');
      return FACTORY_HINTS.some((h) => src.includes(h));
    } catch {
      return false;
    }
  });

  // Single program creation across all candidate files — the type
  // checker resolves CapsuleContract / CapsuleDef return types
  // through factory wrappers (defineAsset, BeatMarkerProjection, ...).
  const detected = detectCapsuleCalls(files);

  // Resolve runtime names (factory-aware) and dedupe by (kind, resolvedName).
  // Skip the inner `defineCapsule` call sites inside factory bodies where the
  // detector can't extract a name — those are not concrete instances, just
  // factory definitions. The outer factory call IS the instance.
  type ResolvedHit = (typeof detected)[number] & { resolvedName: string };
  const byKey = new Map<string, ResolvedHit>();
  for (const d of detected) {
    const resolvedName = resolveCapsuleName(d.name, d.factory, d.args);
    const key = `${d.kind}::${resolvedName}`;
    if (!byKey.has(key)) byKey.set(key, { ...d, resolvedName });
  }

  const capsules: ManifestEntry[] = [];

  for (const d of byKey.values()) {
    if (!isAssemblyKind(d.kind)) {
      console.warn(
        `[capsule-compile] ${d.file}: unknown kind "${d.kind}" for capsule "${d.resolvedName}" — skipped`,
      );
      continue;
    }

    const stub = buildStubDef(d.kind, d.resolvedName);

    const slug = d.resolvedName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const testPath = resolve('tests/generated', `${slug}.test.ts`);
    const benchPath = resolve('tests/generated', `${slug}.bench.ts`);

    // Build a HarnessContext only when we have a binding name AND the call
    // is direct (`defineCapsule`, no factory wrapper). Factory wrappers
    // return a contract value but don't expose a stable importable binding
    // for the harness to reach — fall back to skip.
    let harnessCtx: HarnessContext | undefined;
    if (d.binding !== undefined && d.factory === undefined) {
      const sourceModule = relative(dirname(testPath), d.file)
        .replace(/\\/g, '/')
        .replace(/\.ts$/, '.js');
      const arbitraryAbs = resolve(
        'packages/core/src/harness/arbitrary-from-schema.ts',
      );
      const arbitraryModule = relative(dirname(testPath), arbitraryAbs)
        .replace(/\\/g, '/')
        .replace(/\.ts$/, '.js');
      harnessCtx = {
        bindingImport: sourceModule.startsWith('.')
          ? sourceModule
          : `./${sourceModule}`,
        bindingName: d.binding,
        arbitraryImport: arbitraryModule.startsWith('.')
          ? arbitraryModule
          : `./${arbitraryModule}`,
      };
    }
    const { testFile, benchFile } = dispatchHarness(d.kind, stub, harnessCtx);

    mkdirSync(dirname(testPath), { recursive: true });
    writeFileSync(testPath, testFile, 'utf8');
    writeFileSync(benchPath, benchFile, 'utf8');

    const sourceRel = relative(cwd, d.file).replace(/\\/g, '/');
    const testRel = relative(cwd, testPath).replace(/\\/g, '/');
    const benchRel = relative(cwd, benchPath).replace(/\\/g, '/');

    const entry: ManifestEntry =
      d.factory !== undefined
        ? d.args !== undefined && d.args.length > 0
          ? {
              name: d.resolvedName,
              kind: d.kind,
              source: sourceRel,
              generated: { testFile: testRel, benchFile: benchRel },
              factory: d.factory,
              args: d.args,
            }
          : {
              name: d.resolvedName,
              kind: d.kind,
              source: sourceRel,
              generated: { testFile: testRel, benchFile: benchRel },
              factory: d.factory,
            }
        : {
            name: d.resolvedName,
            kind: d.kind,
            source: sourceRel,
            generated: { testFile: testRel, benchFile: benchRel },
          };
    capsules.push(entry);
  }

  // Stable ordering by (kind, name) — keeps the manifest deterministic
  // across runs (program ordering is not guaranteed file-order).
  capsules.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });

  const manifest: CapsuleManifest = {
    generatedAt: new Date().toISOString(),
    capsules,
  };

  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/capsule-manifest.json', JSON.stringify(manifest, null, 2), 'utf8');

  console.log(JSON.stringify({ status: 'ok', capsuleCount: capsules.length }));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
