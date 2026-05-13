/**
 * Branded type factories for `@czap/core`.
 *
 * All custom brands use unique symbols for nominal typing safety.
 * Brand helpers produce branded wrappers at zero runtime cost.
 *
 * Types are re-anchored from `@czap/_spine` (the canonical source) via local
 * type aliases so the names remain valid value exports (runtime constructors)
 * in the same module without triggering `isolatedModules` conflicts.
 *
 * @module
 */

import type {
  SignalInput as _SignalInput,
  ThresholdValue as _ThresholdValue,
  StateName as _StateName,
  ContentAddress as _ContentAddress,
  IntegrityDigest as _IntegrityDigest,
  AddressedDigest as _AddressedDigest,
  TokenRef as _TokenRef,
  Millis as _Millis,
} from '@czap/_spine';

// Re-anchor types from the canonical source (_spine).
// Using local type aliases preserves declaration-merging with the const constructors below.

/** Branded input signal name. Dot-notation signal path (e.g. viewport.width, prefers-color-scheme). */
export type SignalInput<I extends string = string> = _SignalInput<I>;

/** Branded threshold number on a boundary. Finite number on the signal's continuous range. */
export type ThresholdValue = _ThresholdValue;

/** Branded state name -- e.g. 'mobile', 'tablet', 'desktop' */
export type StateName<S extends string = string> = _StateName<S>;

/**
 * Content-addressed hash.
 * Format: fnv1a:XXXXXXXX (8 hex digits). Computed from CBOR-canonical payload via FNV-1a hash.
 */
export type ContentAddress = _ContentAddress;

/**
 * Cryptographic content digest brand. Format: `sha256:<64-hex>` or `blake3:<64-hex>`.
 * The algorithmic complement to ContentAddress for external/release artifacts (ADR-0011).
 */
export type IntegrityDigest = _IntegrityDigest;

/** Pair of identity hash + cryptographic digest over the same canonical bytes (ADR-0011). */
export type AddressedDigest = _AddressedDigest;

/** Branded token reference name */
export type TokenRef<N extends string = string> = _TokenRef<N>;

/**
 * Branded millisecond duration -- forces explicit wrapping of raw numbers at temporal API boundaries.
 * Non-negative millisecond duration. Fractional values allowed. Use Millis(0) for immediate.
 */
export type Millis = _Millis;

/** Hybrid Logical Clock */
export interface HLC {
  readonly wall_ms: number;
  readonly counter: number;
  readonly node_id: string;
}

/** Generic brand factory */
export function brand<T, B extends symbol>(value: T): T & { readonly [K in B]: true } {
  return value as T & { readonly [K in B]: true };
}

/** Wrap a plain string as a {@link SignalInput} — the one sanctioned cast site for this brand. */
export const SignalInput = <I extends string>(value: I): SignalInput<I> => value as SignalInput<I>;
/** Wrap a plain number as a {@link ThresholdValue} — the one sanctioned cast site for this brand. */
export const ThresholdValue = (value: number): ThresholdValue => value as ThresholdValue;
/** Wrap a plain string as a {@link StateName} — the one sanctioned cast site for this brand. */
export const StateName = <S extends string>(value: S): StateName<S> => value as StateName<S>;
/** Wrap a plain string as a {@link ContentAddress} — the one sanctioned cast site for this brand. */
export const ContentAddress = (value: string): ContentAddress => value as ContentAddress;
/** Wrap a plain string as an {@link IntegrityDigest} — the one sanctioned cast site for this brand. */
export const IntegrityDigest = (value: string): IntegrityDigest => value as IntegrityDigest;
/** Wrap a plain string as a {@link TokenRef} — the one sanctioned cast site for this brand. */
export const TokenRef = <N extends string>(value: N): TokenRef<N> => value as TokenRef<N>;
/** Wrap a plain number as a {@link Millis} — the one sanctioned cast site for this brand. */
export const Millis = (value: number): Millis => value as Millis;
