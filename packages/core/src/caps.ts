/**
 * CapSet -- capability lattice.
 *
 * Re-parameterized from `@kit`: `pure < read < ... < system` becomes `static < styled < reactive < animated < gpu`.
 *
 * @module
 */

/**
 * Rung on the rendering-capability ladder. Higher levels imply lower ones:
 * `gpu > animated > reactive > styled > static`.
 */
export type CapLevel = 'static' | 'styled' | 'reactive' | 'animated' | 'gpu';

const LEVEL_ORD: Record<CapLevel, number> = {
  static: 0,
  styled: 1,
  reactive: 2,
  animated: 3,
  gpu: 4,
};

/** Immutable set of {@link CapLevel}s — the tagged value returned by {@link Cap} combinators. */
export interface CapSet {
  readonly _tag: 'CapSet';
  readonly levels: ReadonlySet<CapLevel>;
}

const _empty = (): CapSet => ({ _tag: 'CapSet', levels: new Set() });

const _from = (levels: ReadonlyArray<CapLevel>): CapSet => ({
  _tag: 'CapSet',
  levels: new Set(levels),
});

const _grant = (caps: CapSet, level: CapLevel): CapSet => ({
  _tag: 'CapSet',
  levels: new Set([...caps.levels, level]),
});

const _revoke = (caps: CapSet, level: CapLevel): CapSet => ({
  _tag: 'CapSet',
  levels: new Set([...caps.levels].filter((l) => l !== level)),
});

const _has = (caps: CapSet, level: CapLevel): boolean => caps.levels.has(level);

const _superset = (a: CapSet, b: CapSet): boolean => {
  for (const level of b.levels) {
    if (!a.levels.has(level)) return false;
  }
  return true;
};

const _union = (a: CapSet, b: CapSet): CapSet => ({
  _tag: 'CapSet',
  levels: new Set([...a.levels, ...b.levels]),
});

const _intersection = (a: CapSet, b: CapSet): CapSet => ({
  _tag: 'CapSet',
  levels: new Set([...a.levels].filter((l) => b.levels.has(l))),
});

const _atLeast = (a: CapLevel, b: CapLevel): boolean => LEVEL_ORD[a] >= LEVEL_ORD[b];

const _ordinal = (level: CapLevel): number => LEVEL_ORD[level];

/**
 * Cap — algebra over {@link CapSet}.
 * Pure, immutable helpers for building, combining, and comparing capability
 * sets; the underlying `CapLevel` lattice is totally ordered via {@link Cap.ordinal}.
 */
export const Cap = {
  /** The empty {@link CapSet}. */
  empty: _empty,
  /** Build a {@link CapSet} from an array of {@link CapLevel}s. */
  from: _from,
  /** Return a new {@link CapSet} with the given level added. */
  grant: _grant,
  /** Return a new {@link CapSet} with the given level removed. */
  revoke: _revoke,
  /** Whether a {@link CapSet} contains the given level. */
  has: _has,
  /** Whether `a` contains every level of `b` (i.e. `a ⊇ b`). */
  superset: _superset,
  /** Set union of two {@link CapSet}s. */
  union: _union,
  /** Set intersection of two {@link CapSet}s. */
  intersection: _intersection,
  /** Whether `a` ranks `>=` `b` on the underlying ordered ladder. */
  atLeast: _atLeast,
  /** Integer ordinal for a {@link CapLevel} — useful for sorting / comparison. */
  ordinal: _ordinal,
};

export declare namespace Cap {
  /** Alias for {@link CapSet}. */
  export type Shape = CapSet;
}
