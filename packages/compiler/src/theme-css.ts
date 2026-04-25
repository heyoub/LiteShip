/**
 * Theme CSS Compiler -- `ThemeDef` to `html[data-theme]` selector blocks + transitions.
 *
 * Emits per-variant CSS blocks overriding `--czap-*` custom properties,
 * and optional transition declarations for animated theme switching.
 *
 * @module
 */

import type { Theme } from '@czap/core';
import { THEME_TRANSITION_DURATION_MS, THEME_TRANSITION_EASING } from '@czap/core';
import { stringifyCSSValue } from './css-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Output of {@link ThemeCSSCompiler.compile}.
 *
 * `selectors` is the concatenated `html[data-theme="variant"]` rule block,
 * one per theme variant that has at least one token override. `transitions`
 * is the optional `:root { transition-*: … }` block emitted when the theme
 * carries metadata indicating animated switching is desired.
 */
export interface ThemeCSSResult {
  /** Per-variant `html[data-theme]` selector blocks. */
  readonly selectors: string;
  /** Optional root transition declarations for animated theme swaps. */
  readonly transitions: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the CSS custom property name from a token name within a theme.
 */
function fxProp(tokenName: string): string {
  return `--czap-${tokenName}`;
}

// ---------------------------------------------------------------------------
// ThemeCSSCompiler
// ---------------------------------------------------------------------------

/**
 * Compile a {@link Theme.Shape} into per-variant selector blocks and optional
 * root transitions.
 */
function compile(theme: Theme.Shape): ThemeCSSResult {
  const selectorBlocks: string[] = [];
  const transitionProps = new Set<string>();

  for (const variant of theme.variants) {
    const declarations: string[] = [];

    for (const [tokenName, variantMap] of Object.entries(theme.tokens)) {
      const value = variantMap[variant];
      if (value === undefined) continue;

      const prop = fxProp(tokenName);
      declarations.push(`  ${prop}: ${stringifyCSSValue(value)};`);
      transitionProps.add(prop);
    }

    if (declarations.length === 0) continue;

    selectorBlocks.push([`html[data-theme="${variant}"] {`, ...declarations, `}`].join('\n'));
  }

  const selectors = selectorBlocks.join('\n\n');

  // Emit transition rules if theme has meta (indicates animated switching is desired)
  let transitions = '';
  if (theme.meta && transitionProps.size > 0) {
    const propList = Array.from(transitionProps).join(', ');
    transitions = [
      `:root {`,
      `  transition-property: ${propList};`,
      `  transition-duration: ${THEME_TRANSITION_DURATION_MS}ms;`,
      `  transition-timing-function: ${THEME_TRANSITION_EASING};`,
      `}`,
    ].join('\n');
  }

  return { selectors, transitions };
}

/**
 * Theme CSS compiler namespace.
 *
 * Serializes a {@link Theme.Shape} into `html[data-theme="…"]` selector
 * overrides of `--czap-*` custom properties and, when theme metadata
 * requests it, a `:root` transition block that animates all theme
 * property changes.
 */
export const ThemeCSSCompiler = {
  /** Compile a theme definition into per-variant selector blocks. */
  compile,
} as const;
