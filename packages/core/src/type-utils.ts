/**
 * Type-level utilities for `@czap/core`.
 *
 * Mapped types, conditional helpers, and structural utilities
 * used across boundary definitions and compositor outputs.
 *
 * @module
 */

import type { Boundary } from './boundary.js';
import type { StateName, HLC } from './brands.js';
import type { Effect as EffectType } from 'effect';

/** Flatten branded intersections for clean IDE hints */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Extract literal union of state names from a Boundary.Shape */
export type StateUnion<B extends Boundary.Shape> = B['states'][number];

/** Resolve which state a value falls into at the type level (runtime only) */
export type StateAt<_Value extends number, _Boundary extends Boundary.Shape> = string;

/** Generate valid output shapes per state */
export type OutputsFor<B extends Boundary.Shape, T> = {
  readonly [S in StateUnion<B>]: T;
};

/** Discriminated union of boundary crossings */
export type BoundaryCrossing<S extends string = string> = {
  readonly from: StateName<S>;
  readonly to: StateName<S>;
  readonly timestamp: HLC;
  readonly value: number;
};

/** Extract the value type from an Effect */
export type EffectValue<T> = T extends EffectType.Effect<infer A, unknown, unknown> ? A : never;

/** Extract the error type from an Effect */
export type EffectError<T> = T extends EffectType.Effect<unknown, infer E, unknown> ? E : never;

/** Require at least one key of T */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

/** Deep readonly */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends Record<string, unknown>
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
