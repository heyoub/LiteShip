/**
 * Harness template for the `sceneComposition` assembly arm.
 *
 * Scene composition tests need a deterministic frame-stream channel
 * (`compileScene` + `renderFrame`) on the capsule contract to drive
 * determinism, sync-accuracy, per-frame budget, and invariant
 * preservation. Without that channel each case is emitted as `it.skip`.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

/**
 * Generate the test + bench file contents for a `sceneComposition` capsule.
 * Emits `it.skip` placeholders for determinism, sync, budget, and
 * invariant-preservation cases.
 */
export function generateSceneComposition(
  cap: CapsuleDef<'sceneComposition', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('determinism: identical seed produces identical frame stream across 3 runs', () => {
    // TODO(harness): needs cap.compile + cap.renderFrame on the contract.
  });

  it.skip('sync accuracy: audio and video frame timestamps align within +/- 1ms', () => {
    // TODO(harness): same — needs typed frame stream.
  });

  it.skip('per-frame budget: p95 frame time below declared budget (${cap.budgets.p95Ms ?? 'n/a'}ms)', () => {
    // TODO(harness): needs cap.renderFrame to time individual frames.
  });

  it.skip('invariant preservation: every declared scene invariant holds across playback', () => {
    // TODO(harness): same — needs frame walker.
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name} — full playback', () => {
  // render full scene duration, measure total wall-clock
}, { time: 2000 });
`;

  return { testFile, benchFile };
}
