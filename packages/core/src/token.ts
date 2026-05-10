/**
 * TokenDef -- design token primitive for constraint-based adaptive rendering.
 *
 * A token defines a named design value that varies across axes (e.g. theme,
 * density, contrast). Content-addressed via FNV-1a.
 *
 * @module
 */

import type { ContentAddress } from './brands.js';
import { CanonicalCbor } from './cbor.js';
import { fnv1aBytes } from './fnv.js';
import { CzapValidationError } from './validation-error.js';

/** Design-system category of a {@link Token} — governs compilation strategy and CSS property prefix. */
export type TokenCategory = 'color' | 'spacing' | 'typography' | 'shadow' | 'radius' | 'animation' | 'effect';

interface TokenDef<N extends string = string, Axes extends readonly string[] = readonly string[]> {
  readonly _tag: 'TokenDef';
  readonly _version: 1;
  readonly id: ContentAddress;
  readonly name: N;
  readonly category: TokenCategory;
  readonly axes: Axes;
  readonly values: Record<string, unknown>;
  readonly fallback: unknown;
  readonly cssProperty: `--${string}`;
}

interface TokenFactory {
  make<N extends string, const A extends readonly [string, ...string[]]>(config: {
    readonly name: N;
    readonly category: TokenCategory;
    readonly axes: A;
    readonly values: Record<string, unknown>;
    readonly fallback: unknown;
  }): TokenDef<N, A>;
}

function deterministicId(
  name: string,
  category: string,
  axes: readonly string[],
  values: Record<string, unknown>,
  fallback: unknown,
): ContentAddress {
  return fnv1aBytes(
    CanonicalCbor.encode({
      _tag: 'TokenDef',
      _version: 1,
      name,
      category,
      axes,
      values,
      fallback,
    }),
  );
}

/**
 * Resolve a token's value for the given axis values. Builds a sorted lookup key.
 *
 * Axes are sorted alphabetically and joined with ':' to form the lookup key.
 * Falls back to the token's fallback value if no match is found.
 *
 * The optional type parameter `T` lets callers narrow the return value when
 * they know the value shape; without it, the return is `unknown` (the
 * underlying `TokenDef.values` is `Record<string, unknown>` because token
 * values can be any JSON shape — colors as strings, spacing as numbers,
 * shadow records as objects). Pass `Token.tap<string>(...)` for a color
 * token, etc.
 *
 * @example
 * ```ts
 * const token = Token.make({
 *   name: 'primary', category: 'color',
 *   axes: ['theme'] as const,
 *   values: { 'light': '#000', 'dark': '#fff' },
 *   fallback: '#888',
 * });
 * const value = Token.tap<string>(token, { theme: 'dark' });
 * // value === '#fff' (typed as string)
 * ```
 */
function _tap<T = unknown>(token: TokenDef, axisValues: Record<string, string>): T {
  const key = [...token.axes]
    .sort()
    .map((axis) => axisValues[axis] ?? '')
    .join(':');
  return (token.values[key] ?? token.fallback) as T;
}

/**
 * Generate a CSS var() reference for a token.
 *
 * Returns a `var(--czap-<name>)` string suitable for use in CSS properties.
 *
 * @example
 * ```ts
 * const token = Token.make({
 *   name: 'primary', category: 'color',
 *   axes: ['theme'] as const,
 *   values: { 'light': '#000' },
 *   fallback: '#888',
 * });
 * const ref = Token.cssVar(token);
 * // ref === 'var(--czap-primary)'
 * ```
 */
function _cssVar<N extends string>(token: TokenDef<N>): `var(--czap-${N})` {
  return `var(--czap-${token.name})` as `var(--czap-${N})`;
}

/**
 * Token namespace -- design token primitive for adaptive rendering.
 *
 * Create named design values that vary across axes (theme, density, contrast).
 * Tokens are content-addressed and produce CSS custom property references.
 *
 * @example
 * ```ts
 * import { Token } from '@czap/core';
 *
 * const spacing = Token.make({
 *   name: 'gap', category: 'spacing',
 *   axes: ['density'] as const,
 *   values: { 'compact': '4px', 'comfortable': '8px' },
 *   fallback: '6px',
 * });
 * const resolved = Token.tap(spacing, { density: 'compact' });
 * // resolved === '4px'
 * const cssRef = Token.cssVar(spacing);
 * // cssRef === 'var(--czap-gap)'
 * ```
 */
export const Token: TokenFactory & {
  tap: typeof _tap;
  cssVar: typeof _cssVar;
} = {
  /**
   * Create a new TokenDef from a configuration object.
   *
   * The token is content-addressed via FNV-1a hash of its name, category,
   * axes, and values. The resulting object is frozen.
   *
   * @example
   * ```ts
   * const token = Token.make({
   *   name: 'bg', category: 'color',
   *   axes: ['theme', 'contrast'] as const,
   *   values: { 'light:normal': '#fff', 'dark:normal': '#111' },
   *   fallback: '#ccc',
   * });
   * // token._tag === 'TokenDef'
   * // token.cssProperty === '--czap-bg'
   * ```
   */
  make<N extends string, const A extends readonly [string, ...string[]]>(config: {
    readonly name: N;
    readonly category: TokenCategory;
    readonly axes: A;
    readonly values: Record<string, unknown>;
    readonly fallback: unknown;
  }): TokenDef<N, A> {
    if (config.name === '') {
      throw new CzapValidationError('Token.make', 'Token name must not be empty.');
    }
    const seen = new Set<string>();
    for (const axis of config.axes) {
      if (seen.has(axis)) {
        throw new CzapValidationError('Token.make', `duplicate axis "${axis}". Each axis must have a unique name.`);
      }
      seen.add(axis);
    }

    const id = deterministicId(config.name, config.category, config.axes, config.values, config.fallback);

    return Object.freeze({
      _tag: 'TokenDef' as const,
      _version: 1 as const,
      id,
      name: config.name,
      category: config.category,
      axes: config.axes,
      values: config.values,
      fallback: config.fallback,
      cssProperty: `--czap-${config.name}` as const,
    });
  },
  tap: _tap,
  cssVar: _cssVar,
};

export declare namespace Token {
  /** Structural shape of a token definition parameterized by its name `N` and axis tuple `Axes`. */
  export type Shape<N extends string = string, Axes extends readonly string[] = readonly string[]> = TokenDef<N, Axes>;
}
