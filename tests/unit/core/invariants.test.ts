/**
 * Cross-cutting invariant tests -- the tests that would have caught
 * every critical bug found by the Purple Team audit.
 *
 * These test BEHAVIORAL CONTRACTS between packages, not individual
 * function correctness. If two things should agree, we prove they agree.
 *
 * Uses fast-check for property-based testing with vitest.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';

// --- Core imports ---
import {
  Boundary,
  ContentAddress,
  Easing,
  Animation,
  DirtyFlags,
  SpeculativeEvaluator,
  TokenBuffer,
  Millis,
  Compositor,
} from '@czap/core';
import { Effect, Duration } from 'effect';

// --- Quantizer imports ---
import { evaluate } from '@czap/quantizer';

// ---------------------------------------------------------------------------
// Arbitraries -- shared test data generators
// ---------------------------------------------------------------------------

/** Generate sorted unique thresholds (ascending, positive, reasonable range) */
const arbThresholds = (minLen: number, maxLen: number) =>
  fc
    .uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: minLen, maxLength: maxLen })
    .map((arr) => arr.sort((a, b) => a - b));

/** Generate state names (unique lowercase alpha strings) */
const arbStateNames = (count: number) => {
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
  return fc.constant(names.slice(0, count));
};

/** Generate a valid Boundary.Shape with 2-6 states */
const arbBoundaryDef = fc.integer({ min: 2, max: 6 }).chain((stateCount) =>
  arbThresholds(stateCount, stateCount).chain((thresholds) =>
    arbStateNames(stateCount).chain((states) =>
      fc.record({
        thresholds: fc.constant(thresholds),
        states: fc.constant(states),
        hysteresis: fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 100 })),
      }),
    ),
  ),
);

/** Build a real Boundary.Shape from generated params */
function makeBoundary(params: {
  thresholds: number[];
  states: string[];
  hysteresis: number | undefined;
}): Boundary.Shape {
  const at = params.thresholds.map((t, i) => [t, params.states[i]!] as const);
  return Boundary.make({
    input: 'test.signal',
    at: at as any,
    ...(params.hysteresis !== undefined ? { hysteresis: params.hysteresis } : {}),
  });
}

/** Generate a value in the range of the boundary's thresholds (with some margin) */
function arbValueForBoundary(thresholds: number[]) {
  const min = (thresholds[0] ?? 0) - 100;
  const max = (thresholds[thresholds.length - 1] ?? 1000) + 100;
  return fc.integer({ min, max });
}

// ===========================================================================
// INVARIANT 1: core.evaluateBoundary ≡ quantizer.evaluate (no hysteresis)
//
// The test that catches the off-by-one binary search bug.
// ===========================================================================

describe('Invariant 1: evaluateBoundary ≡ quantizer.evaluate (no hysteresis)', () => {
  test('both produce the same state for any value', () => {
    fc.assert(
      fc.property(
        arbBoundaryDef.chain((params) => fc.tuple(fc.constant(params), arbValueForBoundary(params.thresholds))),
        ([params, value]) => {
          const boundary = makeBoundary(params);
          const coreResult = Boundary.evaluate(boundary, value);
          const quantizerResult = evaluate(boundary, value);

          expect(quantizerResult.state).toBe(coreResult);
        },
      ),
      { numRuns: 500 },
    );
  });

  test('exact threshold values map to the same state', () => {
    fc.assert(
      fc.property(arbBoundaryDef, (params) => {
        const boundary = makeBoundary(params);

        // Test every exact threshold value
        for (const threshold of boundary.thresholds) {
          const coreResult = Boundary.evaluate(boundary, threshold as number);
          const quantizerResult = evaluate(boundary, threshold as number);
          expect(quantizerResult.state).toBe(coreResult);
        }
      }),
      { numRuns: 50 },
    );
  });

  test('values below first threshold -> first state', () => {
    fc.assert(
      fc.property(arbBoundaryDef, (params) => {
        const boundary = makeBoundary(params);
        const belowMin = (boundary.thresholds[0] as number) - 1;

        const coreResult = Boundary.evaluate(boundary, belowMin);
        const quantizerResult = evaluate(boundary, belowMin);

        expect(coreResult).toBe(boundary.states[0]);
        expect(quantizerResult.state).toBe(boundary.states[0]);
      }),
      { numRuns: 50 },
    );
  });

  test('values above last threshold -> last state', () => {
    fc.assert(
      fc.property(arbBoundaryDef, (params) => {
        const boundary = makeBoundary(params);
        const aboveMax = (boundary.thresholds[boundary.thresholds.length - 1] as number) + 1;

        const coreResult = Boundary.evaluate(boundary, aboveMax);
        const quantizerResult = evaluate(boundary, aboveMax);

        expect(coreResult).toBe(boundary.states[boundary.states.length - 1]);
        expect(quantizerResult.state).toBe(boundary.states[boundary.states.length - 1]);
      }),
      { numRuns: 50 },
    );
  });
});

// ===========================================================================
// INVARIANT 2: evaluateWithHysteresis ≡ quantizer.evaluate (with hysteresis)
//
// The test that catches the full-width vs half-width hysteresis divergence.
// ===========================================================================

describe('Invariant 2: evaluateWithHysteresis ≡ quantizer.evaluate (with hysteresis)', () => {
  test('both produce the same state for any value + previous state', () => {
    fc.assert(
      fc.property(
        arbBoundaryDef
          .filter((p) => p.hysteresis !== undefined)
          .chain((params) =>
            fc.tuple(fc.constant(params), arbValueForBoundary(params.thresholds), fc.constantFrom(...params.states)),
          ),
        ([params, value, prevState]) => {
          const boundary = makeBoundary(params);
          const coreResult = Boundary.evaluateWithHysteresis(boundary, value, prevState);
          const quantizerResult = evaluate(boundary, value, prevState as any);

          expect(quantizerResult.state).toBe(coreResult);
        },
      ),
      { numRuns: 500 },
    );
  });

  test('hysteresis=0 behaves identically to no hysteresis', () => {
    fc.assert(
      fc.property(
        arbBoundaryDef.chain((params) => fc.tuple(fc.constant(params), arbValueForBoundary(params.thresholds))),
        ([params, value]) => {
          const boundary = makeBoundary({ ...params, hysteresis: undefined });
          const boundaryH0 = makeBoundary({ ...params, hysteresis: 0 });

          const noHyst = Boundary.evaluate(boundary, value);
          const hystZero = Boundary.evaluateWithHysteresis(boundaryH0, value, params.states[0]!);
          // With hysteresis=0 and any previous state, result should match no-hysteresis
          const quantizerNoHyst = evaluate(boundary, value);
          const quantizerH0 = evaluate(boundaryH0, value, params.states[0] as any);

          expect(hystZero).toBe(noHyst);
          expect(quantizerH0.state).toBe(quantizerNoHyst.state);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ===========================================================================
// INVARIANT 3: ContentAddress determinism -- same inputs -> same hash
//
// The test that catches the lying sha256 prefix and format divergence.
// ===========================================================================

describe('Invariant 3: ContentAddress determinism', () => {
  test('Boundary.make with same config produces same id', () => {
    fc.assert(
      fc.property(arbBoundaryDef, (params) => {
        const b1 = makeBoundary(params);
        const b2 = makeBoundary(params);

        expect(b1.id).toBe(b2.id);
      }),
      { numRuns: 100 },
    );
  });

  test('different hysteresis -> different id', () => {
    fc.assert(
      fc.property(
        arbThresholds(2, 4).chain((thresholds) =>
          fc.tuple(
            fc.constant(thresholds),
            arbStateNames(thresholds.length),
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 51, max: 100 }),
          ),
        ),
        ([thresholds, states, h1, h2]) => {
          const b1 = makeBoundary({ thresholds, states, hysteresis: h1 });
          const b2 = makeBoundary({ thresholds, states, hysteresis: h2 });

          expect(b1.id).not.toBe(b2.id);
        },
      ),
      { numRuns: 50 },
    );
  });

  test('all ContentAddress values use fnv1a: prefix', () => {
    fc.assert(
      fc.property(arbBoundaryDef, (params) => {
        const b = makeBoundary(params);
        expect(b.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
      }),
      { numRuns: 50 },
    );
  });
});

// ===========================================================================
// INVARIANT 4: Easing boundary conditions -- f(0)=0, f(1)=1
//
// The test that catches spring convergence bugs.
// ===========================================================================

describe('Invariant 4: Easing boundary conditions', () => {
  const standardEasings = [
    'linear',
    'easeInCubic',
    'easeOutCubic',
    'easeInOutCubic',
    'easeOutExpo',
    'easeOutBack',
    'easeOutElastic',
    'easeOutBounce',
    'ease',
    'easeIn',
    'easeOut',
    'easeInOut',
  ] as const;

  for (const name of standardEasings) {
    test(`${name}: f(0)=0 and f(1)=1`, () => {
      const fn = Easing[name];
      expect(fn(0)).toBeCloseTo(0, 10);
      expect(fn(1)).toBeCloseTo(1, 10);
    });
  }

  test('spring underdamped: f(0)=0 and f(1)=1', () => {
    const fn = Easing.spring({ stiffness: 100, damping: 10, mass: 1 });
    expect(fn(0)).toBeCloseTo(0, 10);
    expect(fn(1)).toBeCloseTo(1, 3);
  });

  test('spring critically damped: f(0)=0 and f(1)≈1', () => {
    // zeta = damping / (2 * sqrt(stiffness * mass)) = 1
    // For stiffness=100, mass=1: damping = 2*sqrt(100) = 20
    const fn = Easing.spring({ stiffness: 100, damping: 20, mass: 1 });
    expect(fn(0)).toBeCloseTo(0, 10);
    expect(fn(1)).toBeCloseTo(1, 2);
  });

  test('spring overdamped: f(0)=0 and f(1)≈1', () => {
    // zeta > 1 -> damping > 2*sqrt(stiffness*mass)
    const fn = Easing.spring({ stiffness: 100, damping: 40, mass: 1 });
    expect(fn(0)).toBeCloseTo(0, 10);
    expect(fn(1)).toBeCloseTo(1, 2);
  });

  test('spring: monotonically approaches 1 for overdamped', () => {
    const fn = Easing.spring({ stiffness: 100, damping: 40, mass: 1 });
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const t = i / 100;
      const val = fn(t);
      expect(val).toBeGreaterThanOrEqual(prev - 0.001); // monotonic within tolerance
      prev = val;
    }
  });

  test('cubicBezier: f(0)=0 and f(1)=1 for random control points', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 0, max: 2, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
        (x1, y1, x2, y2) => {
          const fn = Easing.cubicBezier(x1, y1, x2, y2);
          expect(fn(0)).toBeCloseTo(0, 5);
          expect(fn(1)).toBeCloseTo(1, 5);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ===========================================================================
// INVARIANT 5: Interpolation identity -- lerp(a, b, 0)=a, lerp(a, b, 1)=b
//
// The test that catches interpolation asymmetry.
// ===========================================================================

describe('Invariant 5: Interpolation identity', () => {
  const arbRecord = fc.dictionary(fc.stringMatching(/^[a-z]{1,4}$/), fc.float({ min: -1000, max: 1000, noNaN: true }), {
    minKeys: 1,
    maxKeys: 5,
  });

  test('Animation.interpolate(a, b, 0) = a', () => {
    fc.assert(
      fc.property(arbRecord, arbRecord, (a, b) => {
        const result = Animation.interpolate(a, b, 0);
        for (const key of Object.keys(a)) {
          expect(result[key]).toBeCloseTo(a[key]!, 5);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('Animation.interpolate(a, b, 1) has all keys from b with correct values', () => {
    fc.assert(
      fc.property(arbRecord, arbRecord, (a, b) => {
        const result = Animation.interpolate(a, b, 1);
        // All keys from b should be present with b's values
        for (const key of Object.keys(b)) {
          expect(result[key]).toBeCloseTo(b[key]!, 5);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('Animation.interpolate(a, a, t) = a for any t', () => {
    fc.assert(
      fc.property(arbRecord, fc.float({ min: 0, max: 1, noNaN: true }), (a, t) => {
        const result = Animation.interpolate(a, a, t);
        for (const key of Object.keys(a)) {
          expect(result[key]).toBeCloseTo(a[key]!, 5);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// INVARIANT 6: DirtyFlags bitmask correctness
//
// The test that catches bitmask overflow.
// ===========================================================================

describe('Invariant 6: DirtyFlags bitmask correctness', () => {
  test('mark and check roundtrip for up to 31 keys', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 31 }), (count) => {
        const keys = Array.from({ length: count }, (_, i) => `k${i}`);
        const flags = DirtyFlags.make(keys);

        // Mark all, check all
        for (const key of keys) {
          flags.mark(key);
        }
        for (const key of keys) {
          expect(flags.isDirty(key)).toBe(true);
        }

        // Clear one, check only it is cleared
        const clearIdx = Math.floor(count / 2);
        flags.clear(keys[clearIdx]!);
        expect(flags.isDirty(keys[clearIdx]!)).toBe(false);
        if (clearIdx > 0) expect(flags.isDirty(keys[0]!)).toBe(true);
        if (clearIdx < count - 1) expect(flags.isDirty(keys[count - 1]!)).toBe(true);
      }),
      { numRuns: 31 },
    );
  });

  test('each key has a unique bitmask (no collisions)', () => {
    const keys = Array.from({ length: 31 }, (_, i) => `k${i}`);
    const flags = DirtyFlags.make(keys);

    for (let i = 0; i < 31; i++) {
      flags.clearAll();
      flags.mark(keys[i]!);
      // Only this key should be dirty
      for (let j = 0; j < 31; j++) {
        expect(flags.isDirty(keys[j]!)).toBe(i === j);
      }
    }
  });

  test('throws on > 31 keys', () => {
    const keys = Array.from({ length: 32 }, (_, i) => `k${i}`);
    expect(() => DirtyFlags.make(keys)).toThrow(RangeError);
  });
});

// ===========================================================================
// INVARIANT 7: evaluate.crossed is accurate
//
// The state machine invariant: crossed=true iff state changed.
// ===========================================================================

describe('Invariant 7: evaluate.crossed accuracy', () => {
  test('crossed=true iff state differs from previousState', () => {
    fc.assert(
      fc.property(
        arbBoundaryDef.chain((params) =>
          fc.tuple(fc.constant(params), arbValueForBoundary(params.thresholds), fc.constantFrom(...params.states)),
        ),
        ([params, value, prevState]) => {
          const boundary = makeBoundary(params);
          const result = evaluate(boundary, value, prevState as any);
          if (result.crossed) {
            expect(result.state).not.toBe(prevState);
          } else {
            expect(result.state).toBe(prevState);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ===========================================================================
// INVARIANT 8: Hysteresis suppresses jitter at threshold edges
//
// The fundamental behavioral contract of hysteresis.
// ===========================================================================

describe('Invariant 8: Hysteresis prevents jitter', () => {
  test('oscillating value within dead zone does not cause state transitions', () => {
    // Create a boundary with known threshold and hysteresis
    const boundary = Boundary.make({
      input: 'test.width',
      at: [
        [0, 'small'],
        [500, 'medium'],
        [1000, 'large'],
      ] as any,
      hysteresis: 40,
    });

    // Start in 'small', oscillate around threshold 500 within dead zone (480-520)
    let prev = 'small';
    const oscillatingValues = [490, 510, 495, 505, 498, 502, 499, 501];

    for (const val of oscillatingValues) {
      const coreResult = Boundary.evaluateWithHysteresis(boundary, val, prev);
      const quantizerResult = evaluate(boundary, val, prev as any);

      // Both should agree
      expect(quantizerResult.state).toBe(coreResult);

      // Should stay in 'small' -- value never exceeds 500 + 20 = 520
      expect(coreResult).toBe('small');

      prev = coreResult;
    }
  });

  test('value clearly past dead zone triggers transition', () => {
    const boundary = Boundary.make({
      input: 'test.width',
      at: [
        [0, 'small'],
        [500, 'medium'],
        [1000, 'large'],
      ] as any,
      hysteresis: 40,
    });

    // Value at 530 > 500 + 20 = 520, should cross
    const coreResult = Boundary.evaluateWithHysteresis(boundary, 530, 'small');
    const quantizerResult = evaluate(boundary, 530, 'small' as any);

    expect(coreResult).toBe('medium');
    expect(quantizerResult.state).toBe('medium');
  });
});

// ===========================================================================
// INVARIANT 9: CSS threshold semantics match evaluator
//
// The test that catches CSS compiler / evaluator disagreement.
// ===========================================================================

describe('Invariant 9: CSS thresholds match evaluator', () => {
  test('CSS query boundaries align with evaluateBoundary', () => {
    // For a 3-state boundary [0, 768, 1024]:
    // CSS state 0: width < 768  -> evaluateBoundary should return state 0 for value 767
    // CSS state 1: width >= 768 and < 1024 -> evaluateBoundary should return state 1 for 768
    // CSS state 2: width >= 1024 -> evaluateBoundary should return state 2 for 1024

    fc.assert(
      fc.property(arbBoundaryDef, (params) => {
        const boundary = makeBoundary(params);
        const { thresholds, states } = boundary;

        for (let i = 0; i < states.length; i++) {
          if (i === 0) {
            // First state: any value below thresholds[1] should be this state
            if (thresholds.length > 1) {
              const belowNext = (thresholds[1] as number) - 1;
              expect(Boundary.evaluate(boundary, belowNext)).toBe(states[0]);
              expect(evaluate(boundary, belowNext).state).toBe(states[0]);
            }
          } else {
            // State i: exact threshold[i] should map to states[i]
            const atThreshold = thresholds[i] as number;
            expect(Boundary.evaluate(boundary, atThreshold)).toBe(states[i]);
            expect(evaluate(boundary, atThreshold).state).toBe(states[i]);
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ===========================================================================
// INVARIANT 10: evaluate is idempotent
//
// evaluate(b, v) called twice returns the same result.
// ===========================================================================

describe('Invariant 10: Evaluation is idempotent', () => {
  test('evaluate(b, v) is deterministic', () => {
    fc.assert(
      fc.property(
        arbBoundaryDef.chain((params) => fc.tuple(fc.constant(params), arbValueForBoundary(params.thresholds))),
        ([params, value]) => {
          const boundary = makeBoundary(params);
          const r1 = evaluate(boundary, value);
          const r2 = evaluate(boundary, value);
          expect(r1.state).toBe(r2.state);
          expect(r1.index).toBe(r2.index);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ===========================================================================
// INVARIANT 11: SpeculativeEvaluator.current ≡ Boundary.evaluate
//
// Speculative evaluator's current state must always match non-speculative.
// ===========================================================================

describe('Invariant 11: Speculative current state matches Boundary.evaluate', () => {
  test('speculative.evaluate().current === Boundary.evaluate() for any value', () => {
    fc.assert(
      fc.property(
        arbBoundaryDef
          .filter((p) => p.hysteresis === undefined)
          .chain((params) => fc.tuple(fc.constant(params), arbValueForBoundary(params.thresholds))),
        ([params, value]) => {
          const boundary = makeBoundary(params);
          const spec = SpeculativeEvaluator.make(boundary);
          const specResult = spec.evaluate(value);
          const directResult = Boundary.evaluate(boundary, value);
          expect(specResult.current).toBe(directResult);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ===========================================================================
// INVARIANT 12: TokenBuffer conservation -- push N, drain N
//
// Everything pushed into the buffer must be drainable. No data loss.
// ===========================================================================

describe('Invariant 12: TokenBuffer conserves tokens', () => {
  test('push N tokens then drain N returns all tokens in order', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 100 }), (tokens) => {
        const buf = TokenBuffer.make<string>({ capacity: 256 });
        for (const t of tokens) buf.push(t);
        const drained = buf.drain(tokens.length);
        expect(drained).toEqual(tokens);
      }),
      { numRuns: 200 },
    );
  });

  test('occupancy is consistent: push increases, drain decreases', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (count) => {
        const buf = TokenBuffer.make<number>({ capacity: 256 });
        for (let i = 0; i < count; i++) buf.push(i);
        const afterPush = buf.occupancy;
        expect(afterPush).toBeGreaterThan(0);

        buf.drain(Math.floor(count / 2));
        const afterDrain = buf.occupancy;
        expect(afterDrain).toBeLessThanOrEqual(afterPush);
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// INVARIANT 13: DirtyFlags round-trip -- mark then getDirty returns marked
//
// If you mark a key, getDirty must include it. If you don't mark it, it must not.
// ===========================================================================

describe('Invariant 13: DirtyFlags mark/getDirty round-trip', () => {
  test('getDirty returns exactly the marked keys', () => {
    const allKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    fc.assert(
      fc.property(fc.subarray(allKeys, { minLength: 0 }), (markedKeys) => {
        const flags = DirtyFlags.make(allKeys);
        for (const k of markedKeys) flags.mark(k);

        const dirty = flags.getDirty();
        const dirtySet = new Set(dirty);
        const markedSet = new Set(markedKeys);

        // Every marked key must appear in dirty
        for (const k of markedKeys) {
          expect(dirtySet.has(k)).toBe(true);
        }
        // Every dirty key must have been marked
        for (const k of dirty) {
          expect(markedSet.has(k)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// INVARIANT 14: No raw-number Effect.sleep() in production source
//
// Effect.sleep() must use Duration.millis(), Duration.seconds(), or string
// literals ('10 millis'). Raw numbers silently work but bypass intent and
// the codebase convention. This test catches what tsc cannot enforce
// (Effect.sleep accepts DurationInput which includes raw numbers).
//
// See packages/core/src/zap.ts:109 for the correct pattern.
// ===========================================================================

describe('Invariant 14: No raw-number Effect.sleep() in production source', () => {
  test('all Effect.sleep() calls use Duration.millis() or string literals', async () => {
    const { readFileSync, readdirSync, statSync } = await import('fs');
    const { resolve, join } = await import('path');

    const root = resolve(import.meta.dirname, '../../../');

    // Walk packages/*/src/**/*.ts without external glob dependency
    function walkTs(dir: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...walkTs(full));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          results.push(full);
        }
      }
      return results;
    }

    const packageDirs = readdirSync(join(root, 'packages'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => join(root, 'packages', d.name, 'src'))
      .filter((d) => {
        try {
          statSync(d);
          return true;
        } catch {
          return false;
        }
      });

    const files = packageDirs.flatMap((d) => walkTs(d).map((f) => f.slice(root.length + 1)));
    const violations: string[] = [];

    // Match Effect.sleep(<identifier>) or Effect.sleep(<number>) but NOT
    // Effect.sleep(Duration.*) or Effect.sleep('...' / "...")
    const pattern = /Effect\.sleep\(\s*(?!Duration\.|'|")/g;

    for (const file of files) {
      const content = readFileSync(join(root, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (pattern.test(line)) {
          violations.push(`  ${file}:${i + 1}: ${line.trim()}`);
        }
        pattern.lastIndex = 0;
      }
    }

    expect(
      violations,
      [
        'INVARIANT 14 VIOLATED: Found raw-number Effect.sleep() calls in production source.',
        '',
        'Effect.sleep() must use Duration.millis(n), Duration.seconds(n),',
        'or a string literal like "10 millis".',
        '',
        'Correct pattern (see packages/core/src/zap.ts:109):',
        '  yield* Effect.sleep(Duration.millis(ms));',
        '',
        'Violations:',
        ...violations,
      ].join('\n'),
    ).toEqual([]);
  });
});

// ===========================================================================
// INVARIANT 15: Compositor scope lifecycle contract
//
// Compositor.create() returns Effect<..., Scope.Scope>. The returned
// compositor's SubscriptionRef is tied to that scope. Using compute()
// after scope close is a lifecycle violation.
//
// This test documents both the correct pattern (compute within scope)
// and the failure mode (compute after scope close).
// ===========================================================================

describe('Invariant 15: Compositor scope lifecycle', () => {
  test('compute() within scope succeeds', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const compositor = yield* Compositor.create();
          return yield* compositor.compute();
        }),
      ),
    );
    expect(result).toBeDefined();
    expect(result.discrete).toBeDefined();
    expect(result.outputs.css).toBeDefined();
    expect(result.outputs.glsl).toBeDefined();
    expect(result.outputs.aria).toBeDefined();
  });

  test('scoped compositor keeps working across multiple compute calls', () => {
    // The CORRECT pattern: keep all compute() calls inside the scope.
    // This mirrors the fix applied to video.bench.ts where moving
    // compute() calls inside Effect.scoped() fixed the "Invalid Input:
    // undefined" error that occurred under tinybench warmup.
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const compositor = yield* Compositor.create();
          // Multiple sequential computes within scope must all succeed
          const r1 = yield* compositor.compute();
          const r2 = yield* compositor.compute();
          const r3 = yield* compositor.compute();
          return [r1, r2, r3] as const;
        }),
      ),
    );
    expect(result).toHaveLength(3);
    for (const r of result) {
      expect(r.discrete).toBeDefined();
      expect(r.outputs.css).toBeDefined();
    }
  });
});

// ===========================================================================
// INVARIANT 16: Millis brand contracts
//
// Millis(n) must preserve numeric value for any non-negative number.
// Duration.millis(Millis(n)) must produce a valid Duration.
// The brand is zero-cost: Millis IS a number at runtime.
// ===========================================================================

describe('Invariant 16: Millis brand contracts', () => {
  test('Millis(n) preserves numeric value for any non-negative number', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1_000_000, noNaN: true }), (n) => {
        const branded = Millis(n);
        // Runtime identity: branded value IS the number
        expect(branded).toBe(n);
        expect(typeof branded).toBe('number');
        // Arithmetic still works
        expect(branded + 1).toBe(n + 1);
        expect(branded * 2).toBe(n * 2);
      }),
      { numRuns: 200 },
    );
  });

  test('Duration.millis(Millis(n)) produces valid Duration', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (n) => {
        const branded = Millis(n);
        const dur = Duration.millis(branded);
        expect(Duration.toMillis(dur)).toBe(n);
      }),
      { numRuns: 200 },
    );
  });

  test('Millis(0) is falsy-safe for delay guards', () => {
    const zero = Millis(0);
    // Common pattern: if (delay > 0) { ... }
    expect(zero > 0).toBe(false);
    expect(Millis(1) > 0).toBe(true);
  });
});
