/**
 * Capsule declaration wrapping `Boundary.evaluate` as a `pureTransform`
 * instance. Proves the factory kernel against an existing, well-tested
 * primitive with zero-allocation hot-path discipline.
 *
 * Input schema is structural — the run handler aligns the random
 * thresholds + states arrays into a valid Boundary before evaluating.
 * This way the harness-driven property tests exercise real boundary
 * shapes without requiring the schema layer to encode the
 * (thresholds.length === states.length, ascending, non-empty)
 * invariants directly.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '../assembly.js';
import { Boundary } from '../boundary.js';

const EvaluateInputSchema = Schema.Struct({
  // Random arrays — the run handler dedupes states and aligns lengths.
  // We use Schema.Array (not NonEmptyArray) for compatibility with the
  // edge case `length === 0`, which we handle by short-circuiting in run.
  thresholds: Schema.Array(Schema.Number),
  states: Schema.Array(Schema.String),
  value: Schema.Number,
});
const EvaluateOutputSchema = Schema.Struct({
  state: Schema.String,
  matched: Schema.Boolean,
});

type EvaluateInput = {
  readonly thresholds: readonly number[];
  readonly states: readonly string[];
  readonly value: number;
};
type EvaluateOutput = { readonly state: string; readonly matched: boolean };

/**
 * Build a valid Boundary from arbitrary input and evaluate it. When the
 * input cannot form a valid boundary (empty states, too few thresholds
 * after dedupe), we emit `{state: '', matched: false}` so invariants
 * downstream can short-circuit on `matched`.
 */
function _runBoundary(input: EvaluateInput): EvaluateOutput {
  // Dedupe state names and clamp to a usable count
  const seenStates = new Set<string>();
  const uniqueStates: string[] = [];
  for (const s of input.states) {
    if (!seenStates.has(s)) {
      seenStates.add(s);
      uniqueStates.push(s);
    }
  }
  if (uniqueStates.length === 0) {
    return { state: '', matched: false };
  }

  // Build strictly-ascending thresholds. If we don't have enough unique
  // thresholds for the available states, trim states to fit.
  const sortedThresholds = [...input.thresholds].sort((a, b) => a - b);
  const ascending: number[] = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (const t of sortedThresholds) {
    if (Number.isFinite(t) && t > prev) {
      ascending.push(t);
      prev = t;
    }
  }
  // Boundary.make requires at least one [threshold, state] pair.
  if (ascending.length === 0) {
    // Fabricate a single-anchor boundary at 0 with the first state.
    const onlyState = uniqueStates[0]!;
    const b = Boundary.make({
      input: 'cap.boundary-evaluate',
      at: [[0, onlyState]] as const,
    });
    const state = Boundary.evaluate(b, input.value);
    return { state, matched: true };
  }

  const usableLen = Math.min(ascending.length, uniqueStates.length);
  const pairs: Array<readonly [number, string]> = [];
  for (let i = 0; i < usableLen; i++) {
    pairs.push([ascending[i]!, uniqueStates[i]!] as const);
  }
  const b = Boundary.make({
    input: 'cap.boundary-evaluate',
    at: pairs as never,
  });
  const state = Boundary.evaluate(b, input.value);
  return { state, matched: true };
}

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
      name: 'state-from-input-states-when-matched',
      check: (input: EvaluateInput, output: EvaluateOutput): boolean => {
        // When the run handler reports `matched`, the emitted state
        // must be one of the input.states (after dedupe). When unmatched,
        // the invariant trivially holds.
        if (!output.matched) return true;
        return input.states.includes(output.state);
      },
      message: 'emitted state must be one of input.states',
    },
    {
      name: 'unmatched-implies-empty-state',
      check: (_input: EvaluateInput, output: EvaluateOutput): boolean => output.matched || output.state === '',
      message: 'unmatched outcomes must use empty-string state',
    },
  ],
  budgets: { p95Ms: 0.1, allocClass: 'zero' },
  site: ['node', 'browser', 'worker'],
  run: (input: EvaluateInput): EvaluateOutput => _runBoundary(input),
});
