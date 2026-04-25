/**
 * Asset capsule — first concrete cachedProjection instance pattern.
 * Each asset declares source path + kind + decoder budget; the factory
 * emits decode benches + loader property tests from it. Scenes
 * reference assets by id via AssetRef().
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { AttributionDecl, Invariant, CapsuleDef } from '@czap/core';

/** Supported asset kinds. */
export type AssetKind = 'audio' | 'video' | 'image' | 'beat-markers' | 'onsets' | 'waveform';

/** Asset declaration shape consumed by `defineAsset`. */
export interface AssetDecl<K extends AssetKind> {
  readonly id: string;
  readonly source: string;
  readonly kind: K;
  readonly decoder?: (bytes: ArrayBuffer) => Promise<unknown>;
  readonly budgets: { readonly decodeP95Ms: number; readonly memoryMb?: number };
  readonly invariants: readonly Invariant<unknown, unknown>[];
  readonly attribution?: AttributionDecl;
}

type AnyAssetCapsule = CapsuleDef<'cachedProjection', unknown, unknown, unknown>;

const registry = new Map<string, AnyAssetCapsule>();

/** Declare an asset as a cachedProjection capsule + register in the module-level asset registry. */
export function defineAsset<K extends AssetKind>(decl: AssetDecl<K>): AnyAssetCapsule {
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

/** Resolve an asset id to itself after confirming it's registered. Throws on unknown ids. */
export function AssetRef(id: string): string {
  if (!registry.has(id)) {
    throw new Error(`AssetRef('${id}') not registered — did you call defineAsset?`);
  }
  return id;
}

/** Read-only snapshot of the asset registry. */
export function getAssetRegistry(): ReadonlyMap<string, AnyAssetCapsule> {
  return registry;
}

/** Clear the registry. Intended for tests only. */
export function resetAssetRegistry(): void {
  registry.clear();
}
