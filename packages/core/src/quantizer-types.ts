/**
 * Quantizer interface -- the base contract for quantizer implementations.
 *
 * The canonical implementation lives in `@czap/quantizer` (`Q.from()` builder API).
 *
 * @module
 */

import type { Effect, Stream } from 'effect';
import type { Boundary } from './boundary.js';
import type { StateUnion, BoundaryCrossing } from './type-utils.js';

/**
 * Quantizer contract — the live evaluator that binds a {@link Boundary} to a signal source.
 *
 * A quantizer holds a boundary definition plus the reactive machinery to observe
 * its current state and emit crossings when the underlying signal moves between
 * bands. The concrete implementation is produced by `@czap/quantizer`'s `Q.from()`
 * builder; consumers interact only via this structural interface.
 */
export interface Quantizer<B extends Boundary.Shape = Boundary.Shape> {
  readonly _tag: 'Quantizer';
  readonly boundary: B;
  readonly state: Effect.Effect<StateUnion<B>>;
  /** Synchronous state accessor for hot paths (avoids Effect overhead). */
  readonly stateSync?: () => StateUnion<B>;
  readonly changes: Stream.Stream<BoundaryCrossing<StateUnion<B> & string>>;
  evaluate(value: number): StateUnion<B>;
}
