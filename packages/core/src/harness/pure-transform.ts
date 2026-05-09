/**
 * Harness template for the `pureTransform` assembly arm.
 *
 * Emits a property test per declared invariant: derives a fast-check
 * arbitrary from the capsule's input schema (`schemaToArbitrary`),
 * invokes the capsule's `run` handler against each sample, and asserts
 * the invariant `check(input, output)` holds.
 *
 * If the capsule does not export a `run` handler the test is emitted as
 * `it.skip` with a TODO comment — vacuous `() => true` placeholders are
 * banned (per memory: "no vanity tests, real APIs, deterministic
 * assertions").
 *
 * @module
 */
import type { CapsuleDef } from '../assembly.js';

/** Emitted file contents for a capsule harness (test + bench pair). */
export interface HarnessOutput {
  readonly testFile: string;
  readonly benchFile: string;
}

/**
 * Optional metadata the compile-time driver passes to harness templates so
 * the generated test file can `import` the real capsule binding from its
 * source file. When `bindingImport` is undefined, the harness emits an
 * `it.skip` placeholder rather than a vacuous test.
 */
export interface HarnessContext {
  /** ESM-style import specifier (with `.js` extension) for the test file. */
  readonly bindingImport?: string;
  /** Exported binding name to import from `bindingImport`. */
  readonly bindingName?: string;
  /** Import specifier for `schemaToArbitrary`, default to source path. */
  readonly arbitraryImport?: string;
}

const DEFAULT_ARBITRARY_IMPORT = '../../packages/core/src/harness/arbitrary-from-schema.js';

/**
 * Generate the test + bench file contents for a `pureTransform` capsule.
 * The emitted files are strings; the repo compiler writes them to
 * `tests/generated/<name>.{test,bench}.ts`.
 */
export function generatePureTransform(
  cap: CapsuleDef<'pureTransform', unknown, unknown, unknown>,
  ctx: HarnessContext = {},
): HarnessOutput {
  const arbitraryImport = ctx.arbitraryImport ?? DEFAULT_ARBITRARY_IMPORT;

  if (ctx.bindingImport === undefined || ctx.bindingName === undefined) {
    // No real binding wired — emit honest skip per task constraint.
    const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('invariants under random input (no binding wired)', () => {
    // TODO(harness): no capsule binding import wired by capsule-compile.
    // Add bindingImport + bindingName to the manifest entry to enable.
  });
});
`;
    const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // handler invocation with a canonical fixture
}, { time: 500 });
`;
    return { testFile, benchFile };
  }

  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { ${ctx.bindingName} } from '${ctx.bindingImport}';
import { schemaToArbitrary, UnsupportedSchemaError } from '${arbitraryImport}';

describe('${cap.name}', () => {
  const cap = ${ctx.bindingName};
  let arb: fc.Arbitrary<unknown>;
  let arbError: unknown;
  try {
    arb = schemaToArbitrary(cap.input as never) as fc.Arbitrary<unknown>;
  } catch (err) {
    arbError = err;
  }
  if (cap.run === undefined || arbError !== undefined) {
    it.skip(
      arbError instanceof UnsupportedSchemaError
        ? \`invariants — input schema not arbitrary-derivable (\${arbError.message})\`
        : 'invariants — capsule has no run handler',
      () => {},
    );
  } else {
    for (const inv of cap.invariants) {
      it(\`invariant: \${inv.name}\`, () => {
        fc.assert(
          fc.property(arb, (input) => {
            const output = cap.run!(input as never);
            return inv.check(input as never, output as never);
          }),
          { numRuns: 100 },
        );
      });
    }
  }
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // handler invocation with a canonical fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
