/**
 * Capsule declaration wrapping `Boundary.evaluate` as a `pureTransform`
 * instance. Proves the factory kernel against an existing, well-tested
 * primitive with zero-allocation hot-path discipline.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '../assembly.js';
import type { Boundary } from '../boundary.js';

// Boundary.Shape is structural + non-trivial; wrap it as Schema.Unknown
// at the schema level. Runtime enforcement of boundary shape comes from
// the existing Boundary.make() validation path.
const BoundaryShapeSchema = Schema.Unknown as Schema.Schema<Boundary.Shape>;
const EvaluateInputSchema = Schema.Struct({
  boundary: BoundaryShapeSchema,
  input: Schema.Number,
});
const EvaluateOutputSchema = Schema.Struct({
  state: Schema.String,
  progress: Schema.Number,
});

/**
 * Declared capsule for `Boundary.evaluate`. Registered in the module-level
 * catalog at import time; walked by `scripts/capsule-compile.ts` during
 * the gauntlet's `capsule:compile` phase.
 */
export const boundaryEvaluateCapsule = defineCapsule({
  _kind: 'pureTransform',
  name: 'core.boundary.evaluate',
  input: EvaluateInputSchema,
  output: EvaluateOutputSchema,
  capabilities: { reads: [], writes: [] },
  invariants: [
    {
      name: 'progress-in-unit-range',
      check: (
        _input: { boundary: Boundary.Shape; input: number },
        output: { state: string; progress: number },
      ): boolean => output.progress >= 0 && output.progress <= 1,
      message: 'progress must be in [0, 1]',
    },
    {
      name: 'state-from-boundary-spec',
      check: (
        input: { boundary: Boundary.Shape; input: number },
        output: { state: string; progress: number },
      ): boolean => {
        const states = (input.boundary as unknown as { states?: readonly string[] }).states ?? [];
        return states.includes(output.state);
      },
      message: 'emitted state must be declared in boundary.states',
    },
  ],
  budgets: { p95Ms: 0.1, allocClass: 'zero' },
  site: ['node', 'browser', 'worker'],
});
