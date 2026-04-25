/**
 * Token CSS Compiler -- `TokenDef` to CSS custom properties + `@property` registrations.
 *
 * Emits `:root` fallbacks, `@property` declarations for animatable tokens,
 * and themed overrides via `html[data-theme]` selectors.
 *
 * @module
 */

import type { Token, Theme } from '@czap/core';
import { inferSyntax, stringifyCSSValue } from './css-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Output of {@link TokenCSSCompiler.compile}.
 *
 * `properties` is the list of CSS custom property names emitted for this
 * token (usually one). `customProperties` bundles any `@property`
 * registrations and the `:root` fallback block. `themed` contains
 * per-variant override blocks derived from an optional theme.
 */
export interface TokenCSSResult {
  /** CSS custom property names emitted for this token. */
  readonly properties: readonly string[];
  /** `@property` registrations plus the `:root { … }` fallback block. */
  readonly customProperties: string;
  /** `html[data-theme="…"]` override blocks (empty when no theme supplied). */
  readonly themed: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// COLOR_RE, NUMBER_RE, CSSSyntax, inferSyntax, and stringifyCSSValue are imported from ./css-utils.js

/**
 * Derive the CSS custom property name from a `Token.Shape`.
 * Uses the token's `cssProperty` if set, otherwise generates `--czap-<name>`.
 */
function propName(token: Token.Shape): string {
  return token.cssProperty ?? `--czap-${token.name}`;
}

/**
 * Generate a single `@property` registration block for a token if its
 * fallback value can be parsed as a typed CSS value.
 */
function emitPropertyRegistration(token: Token.Shape): string | null {
  const fallbackStr = stringifyCSSValue(token.fallback);
  const syntax = inferSyntax(fallbackStr);
  if (!syntax) return null;

  const initial = syntax === '<color>' ? 'transparent' : '0';
  const prop = propName(token);
  return [
    `@property ${prop} {`,
    `  syntax: "${syntax}";`,
    `  inherits: true;`,
    `  initial-value: ${initial};`,
    `}`,
  ].join('\n');
}

/**
 * Generate the `:root` block declaration with the token's fallback value.
 */
function emitRootDeclaration(token: Token.Shape): string {
  const prop = propName(token);
  const fallbackStr = stringifyCSSValue(token.fallback);
  return `  ${prop}: ${fallbackStr};`;
}

/**
 * Generate themed override selectors for a token against a `Theme.Shape`.
 * For each variant in the theme that has a value for this token name,
 * emits an `html[data-theme="variant"]` block.
 */
function emitThemedOverrides(token: Token.Shape, theme: Theme.Shape): string {
  const tokenValues = theme.tokens[token.name];
  if (!tokenValues) return '';

  const prop = propName(token);
  const blocks: string[] = [];

  for (const variant of theme.variants) {
    const value = tokenValues[variant as keyof typeof tokenValues];
    if (value === undefined) continue;

    blocks.push([`html[data-theme="${variant}"] {`, `  ${prop}: ${stringifyCSSValue(value)};`, `}`].join('\n'));
  }

  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// TokenCSSCompiler
// ---------------------------------------------------------------------------

/**
 * Compile a single {@link Token.Shape} into CSS custom property definitions.
 *
 * Emits any applicable `@property` registration, the `:root` fallback, and
 * (when a `theme` is supplied) per-variant override selectors.
 */
function compile(token: Token.Shape, theme?: Theme.Shape): TokenCSSResult {
  const prop = propName(token);

  // @property registrations
  const registrations: string[] = [];
  const reg = emitPropertyRegistration(token);
  if (reg) registrations.push(reg);

  // :root fallback
  const rootDecl = emitRootDeclaration(token);
  const customProperties = [...registrations, '', `:root {`, rootDecl, `}`].join('\n');

  // Themed overrides
  const themed = theme ? emitThemedOverrides(token, theme) : '';

  // Collect property names emitted
  const properties: string[] = [prop];

  return { properties, customProperties, themed };
}

/**
 * Token CSS compiler namespace.
 *
 * Compiles a single {@link Token.Shape} into its CSS custom property
 * definitions (with optional `@property` registration for animatable
 * values) and, when a theme is supplied, the per-variant override blocks.
 */
export const TokenCSSCompiler = {
  /** Compile a token (optionally with theme overrides) into CSS. */
  compile,
} as const;
