/**
 * ThemeDef -- theme primitive for constraint-based adaptive rendering.
 *
 * A theme maps a set of token names to variant-keyed values, enabling
 * coherent multi-variant token resolution. Content-addressed via FNV-1a.
 *
 * @module
 */

import type { ContentAddress } from './brands.js';
import { CanonicalCbor } from './cbor.js';
import { fnv1aBytes } from './fnv.js';
import { CzapValidationError } from './validation-error.js';

interface ThemeDef<V extends readonly string[] = readonly string[]> {
  readonly _tag: 'ThemeDef';
  readonly _version: 1;
  readonly id: ContentAddress;
  readonly name: string;
  readonly variants: V;
  readonly tokens: Record<string, Record<V[number] & string, unknown>>;
  readonly meta?: Record<V[number] & string, { readonly label: string; readonly mode: 'light' | 'dark' }>;
}

interface ThemeFactory {
  make<const V extends readonly [string, ...string[]]>(config: {
    readonly name: string;
    readonly variants: V;
    readonly tokens: Record<string, Record<V[number] & string, unknown>>;
    readonly meta?: ThemeDef<V>['meta'];
  }): ThemeDef<V>;
}

function deterministicId<V extends readonly string[]>(
  name: string,
  variants: V,
  tokens: ThemeDef<V>['tokens'],
  meta: ThemeDef<V>['meta'] | undefined,
): ContentAddress {
  return fnv1aBytes(
    CanonicalCbor.encode({
      _tag: 'ThemeDef',
      _version: 1,
      name,
      variants,
      tokens,
      meta: meta ?? null,
    }),
  );
}

/**
 * Resolve all tokens for a given variant, returning a map of token name to value.
 *
 * Iterates the theme's token map and extracts each token's value for the
 * specified variant.
 *
 * @example
 * ```ts
 * const theme = Theme.make({
 *   name: 'brand',
 *   variants: ['light', 'dark'] as const,
 *   tokens: { bg: { light: '#fff', dark: '#111' }, fg: { light: '#000', dark: '#eee' } },
 * });
 * const darkTokens = Theme.tap(theme, 'dark');
 * // darkTokens === { bg: '#111', fg: '#eee' }
 * ```
 */
function _tap<V extends readonly string[]>(theme: ThemeDef<V>, variant: V[number] & string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [tokenName, variantMap] of Object.entries(theme.tokens)) {
    result[tokenName] = variantMap[variant];
  }
  return result;
}

/**
 * Theme namespace -- theme primitive for constraint-based adaptive rendering.
 *
 * Map token names to variant-keyed values, enabling coherent multi-variant
 * token resolution (e.g. light/dark themes). Content-addressed via FNV-1a.
 *
 * @example
 * ```ts
 * import { Theme } from '@czap/core';
 *
 * const theme = Theme.make({
 *   name: 'brand',
 *   variants: ['light', 'dark'] as const,
 *   tokens: {
 *     bg: { light: '#fff', dark: '#111' },
 *     fg: { light: '#000', dark: '#eee' },
 *   },
 * });
 * const lightTokens = Theme.tap(theme, 'light');
 * // lightTokens === { bg: '#fff', fg: '#000' }
 * ```
 */
export const Theme: ThemeFactory & {
  tap: typeof _tap;
} = {
  /**
   * Create a new ThemeDef from a configuration object.
   *
   * Validates that every token has a value for each declared variant.
   * The resulting object is frozen and content-addressed.
   *
   * @example
   * ```ts
   * const theme = Theme.make({
   *   name: 'ocean',
   *   variants: ['light', 'dark'] as const,
   *   tokens: { primary: { light: '#0066cc', dark: '#3399ff' } },
   *   meta: { light: { label: 'Light', mode: 'light' }, dark: { label: 'Dark', mode: 'dark' } },
   * });
   * // theme._tag === 'ThemeDef'
   * // theme.id === 'fnv1a:...'
   * ```
   */
  make<const V extends readonly [string, ...string[]]>(config: {
    readonly name: string;
    readonly variants: V;
    readonly tokens: Record<string, Record<V[number] & string, unknown>>;
    readonly meta?: ThemeDef<V>['meta'];
  }): ThemeDef<V> {
    const variantSet = new Set(config.variants as readonly string[]);
    for (const [tokenName, variantMap] of Object.entries(config.tokens)) {
      for (const variant of variantSet) {
        if (!(variant in variantMap)) {
          throw new CzapValidationError('Theme.make', `Token "${tokenName}" is missing value for variant "${variant}"`);
        }
      }
    }

    const id = deterministicId<V>(config.name, config.variants, config.tokens, config.meta);

    return Object.freeze({
      _tag: 'ThemeDef' as const,
      _version: 1 as const,
      id,
      name: config.name,
      variants: config.variants,
      tokens: config.tokens,
      ...(config.meta !== undefined ? { meta: config.meta } : {}),
    });
  },
  tap: _tap,
};

export declare namespace Theme {
  /** Structural shape of a {@link Theme} definition, parameterized by its variant tuple `V`. */
  export type Shape<V extends readonly string[] = readonly string[]> = ThemeDef<V>;
}
