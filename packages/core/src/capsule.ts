/**
 * Capsule — typed declaration of a business-logic unit that emits
 * runtime behavior plus generated tests, benches, docs, and audit
 * receipts through the czap factory.
 *
 * @module
 */

import { type Effect, Schema } from 'effect';
import type { ContentAddress } from '@czap/_spine';

/** Closed seven-arm catalog of capsule kinds. Adding an eighth requires ADR amendment. */
export type AssemblyKind =
  | 'pureTransform'
  | 'receiptedMutation'
  | 'stateMachine'
  | 'siteAdapter'
  | 'policyGate'
  | 'cachedProjection'
  | 'sceneComposition';

/** Where a capsule may run. */
export type Site = 'node' | 'browser' | 'worker' | 'edge';

/** What services a capsule reads / writes. `_R` parameter carried for type-level inference. */
export interface CapabilityDecl<_R> {
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly effects?: readonly string[];
}

/** Performance + memory budgets a capsule promises to honor. */
export interface BudgetDecl {
  readonly p95Ms?: number;
  readonly memoryMb?: number;
  readonly allocClass?: 'zero' | 'bounded' | 'unbounded';
}

/** A typed invariant over input and output that the harness will check. */
export interface Invariant<In, Out> {
  readonly name: string;
  readonly check: (input: In, output: Out) => boolean;
  readonly message: string;
}

/** License and authorship metadata carried for audit receipts. */
export interface AttributionDecl {
  readonly license: string;
  readonly author: string;
  readonly url?: string;
}

/**
 * The contract shape a capsule declaration must satisfy. The factory
 * uses this to generate tests, benches, docs, and audit receipts.
 *
 * `run` is optional: when present, the harness invokes it inside generated
 * property tests so each declared {@link Invariant} is checked against
 * real (input, output) pairs sampled from the input schema. Without `run`
 * the harness emits an `it.skip` honest-placeholder so vacuous tests can't
 * masquerade as proof.
 */
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
  /**
   * Optional pure-transform handler: takes a decoded input and returns a
   * decoded output. Used by the harness to drive generated property tests
   * end-to-end. Only meaningful for `pureTransform` arms today.
   */
  readonly run?: (input: In) => Out;
}

/**
 * Runtime validator that verifies values against _spine-derived schemas.
 * Used by capsule dispatchers to check inputs before invoking handlers.
 */
export const TypeValidator = {
  validate<T>(schema: Schema.Codec<T, T, never>, value: unknown): Effect.Effect<T, Schema.SchemaError> {
    return Schema.decodeUnknownEffect(schema)(value);
  },
} as const;

export declare namespace TypeValidator {
  /** Effect returned by {@link TypeValidator.validate} on a successful decode. */
  export type Result<T> = Effect.Effect<T, Schema.SchemaError>;
}
