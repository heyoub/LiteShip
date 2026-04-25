/**
 * Shared test infrastructure for all PrimitiveKind operations.
 *
 * PRIMITIVE_KINDS — exhaustive const array, use with test.each()
 * resolverSuite()  — factory for parameterised resolver test cases
 * arb*             — fast-check arbitraries shared by property tests + bench
 */

import fc from 'fast-check';
import { Boundary, Token, Theme, Style } from '@czap/core';
import type { PrimitiveKind } from '@czap/core';

export const PRIMITIVE_KINDS = ['boundary', 'token', 'theme', 'style'] as const satisfies PrimitiveKind[];

// ─────────────────────────────────────────────────────────────────────────────
// Shared arbitraries
// ─────────────────────────────────────────────────────────────────────────────

export const arbPrimitiveKind: fc.Arbitrary<PrimitiveKind> =
  fc.constantFrom(...PRIMITIVE_KINDS);

export const arbBoundaryShape: fc.Arbitrary<Boundary.Shape> = fc.constant(
  Boundary.make({
    input: 'viewport.width',
    at: [[0, 'small'], [768, 'large']] as const,
  }),
);

export const arbTokenShape: fc.Arbitrary<Token.Shape> = fc.constant(
  Token.make({
    name: 'spacing',
    category: 'spacing',
    axes: ['base'] as const,
    values: { base: '16px' },
    fallback: '16px',
  }),
);

export const arbThemeShape: fc.Arbitrary<Theme.Shape> = fc.constant(
  Theme.make({
    name: 'default',
    variants: ['light'] as const,
    tokens: {},
  }),
);

export const arbStyleShape: fc.Arbitrary<Style.Shape> = fc.constant(
  Style.make({
    boundary: Boundary.make({ input: 'viewport.width', at: [[0, 'sm']] as const }),
    base: { properties: {} },
  }),
);

export const arbConfigInput = fc.record({
  boundaries: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]/.test(s)),
    arbBoundaryShape,
  ),
  tokens:   fc.constant({}),
  themes:   fc.constant({}),
  styles:   fc.constant({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolver test suite factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a set of test case descriptions for a given PrimitiveKind.
 * Use with test.each(PRIMITIVE_KINDS) to parameterise tests.
 */
export function resolverSuite(kind: PrimitiveKind) {
  const plural = `${kind}s`;
  return {
    sameDir:         `resolves ${kind} from same-dir ${plural}.ts`,
    wildcard:        `resolves ${kind} from same-dir *.${plural}.ts`,
    rootFallback:    `resolves ${kind} from project root ${plural}.ts`,
    userDirOverride: `resolves ${kind} from config.dirs.${kind} override`,
    notFound:        `returns null when no ${kind} file exists`,
  };
}
