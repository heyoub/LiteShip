/**
 * Harness template for the `stateMachine` assembly arm.
 *
 * State machines need a typed `step(state, event)` channel to drive
 * randomized event sequences and check invariants at every step. The
 * capsule contract doesn't yet expose one, so each case is emitted as
 * `it.skip` rather than a vacuous `() => true` placeholder.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

/**
 * Generate the test + bench file contents for a `stateMachine` capsule.
 * Emits `it.skip` placeholders covering illegal transitions, replay, and
 * invariant preservation — each carries a TODO naming the missing handler.
 */
export function generateStateMachine(cap: CapsuleDef<'stateMachine', unknown, unknown, unknown>): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('rejects every illegal transition', () => {
    // TODO(harness): needs cap.transitions table + cap.step handler.
  });

  it.skip('replays deterministically from an event log', () => {
    // TODO(harness): needs cap.step + cap.initialState.
  });

  it.skip('invariant holds across random event paths', () => {
    // TODO(harness): same — schemaToArbitrary on cap.input would feed
    // events, but invariants need (state, event) → state to be checkable.
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // state-machine step with a canonical event
}, { time: 500 });
`;

  return { testFile, benchFile };
}
