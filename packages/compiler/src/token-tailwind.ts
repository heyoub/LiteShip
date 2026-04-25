/**
 * Token Tailwind Compiler -- `TokenDef[]` to a Tailwind v4 `@theme` block.
 *
 * Maps token categories to Tailwind v4 CSS-first namespace prefixes and
 * emits a single `@theme { }` block for consumption by the Tailwind engine.
 *
 * @module
 */

import type { Token, TokenCategory } from '@czap/core';
import { stringifyCSSValue, groupTokensByCategory } from './css-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Output of {@link TokenTailwindCompiler.compile}.
 *
 * Tailwind v4's CSS-first pipeline consumes the emitted `@theme { }` block
 * verbatim; there are no structured side outputs because Tailwind only
 * needs the declarations text.
 */
export interface TokenTailwindResult {
  /** Complete `@theme { … }` block ready for a Tailwind v4 entry CSS file. */
  readonly themeBlock: string;
}

// ---------------------------------------------------------------------------
// Category -> Tailwind Namespace Mapping
// ---------------------------------------------------------------------------

/** Mapping from {@link TokenCategory} to its Tailwind v4 namespace prefix. */
const CATEGORY_PREFIX: Record<TokenCategory, string> = {
  color: '--color-',
  spacing: '--spacing-',
  typography: '--font-',
  radius: '--radius-',
  shadow: '--shadow-',
  animation: '--animate-',
  effect: '--effect-',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the Tailwind theme variable name from a token.
 * Uses the category prefix + token name, e.g. `--color-primary`.
 */
function tailwindVarName(token: Token.Shape): string {
  const prefix = CATEGORY_PREFIX[token.category];
  return `${prefix}${token.name}`;
}

/**
 * Build declaration lines for a token inside the `@theme` block.
 *
 * If the token has axis values they are flattened as suffixed entries and
 * a base entry is also emitted; otherwise a single entry is produced from
 * the fallback.
 */
function emitTokenDeclarations(token: Token.Shape): string[] {
  const baseName = tailwindVarName(token);
  const lines: string[] = [];

  const axisEntries = Object.entries(token.values);

  if (axisEntries.length > 0) {
    // Emit each axis value as a suffixed variable
    for (const [axis, value] of axisEntries) {
      if (value === undefined) continue;
      lines.push(`  ${baseName}-${axis}: ${stringifyCSSValue(value)};`);
    }
    // Also emit the base name with fallback as the default
    lines.push(`  ${baseName}: ${stringifyCSSValue(token.fallback)};`);
  } else {
    // Single-value token
    lines.push(`  ${baseName}: ${stringifyCSSValue(token.fallback)};`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// TokenTailwindCompiler
// ---------------------------------------------------------------------------

/**
 * Compile a list of {@link Token.Shape} into a Tailwind v4 `@theme` block.
 *
 * Tokens are grouped by category with a short comment separator so the
 * generated CSS remains human-readable alongside hand-authored Tailwind.
 */
function compile(tokens: readonly Token.Shape[]): TokenTailwindResult {
  const lines: string[] = [];

  // Group by category for organized output
  const grouped = groupTokensByCategory(tokens);

  for (const [category, categoryTokens] of grouped) {
    lines.push(`  /* ${category} */`);
    for (const token of categoryTokens) {
      lines.push(...emitTokenDeclarations(token));
    }
    lines.push('');
  }

  // Trim trailing empty line
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const themeBlock = `@theme {\n${lines.join('\n')}\n}`;

  return { themeBlock };
}

/**
 * Token Tailwind compiler namespace.
 *
 * Adapts a `@czap/core` token set to Tailwind v4's CSS-first theming
 * pipeline by emitting a single `@theme { }` block with the category
 * prefixes Tailwind expects (`--color-`, `--spacing-`, `--font-`, …).
 */
export const TokenTailwindCompiler = {
  /** Compile a token array into a Tailwind v4 `@theme` block. */
  compile,
} as const;
