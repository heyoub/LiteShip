/**
 * Per-tenant theme compilation at the edge.
 *
 * Takes a flat map of design token definitions and produces CSS custom
 * property declarations suitable for injection into the `<html>` element
 * or a `<style>` block.
 *
 * This is a pure function with no side effects -- safe for edge runtime use.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input to {@link compileTheme}.
 *
 * Tokens are flat key/value pairs — nested paths like `color.primary` are
 * sanitized into CSS-safe custom property names. Numeric values are emitted
 * bare so consumers can apply their own units downstream.
 */
export interface ThemeCompileConfig {
  /** Flat map of token name to value (string or numeric). */
  readonly tokens: Readonly<Record<string, string | number>>;
  /** CSS custom property prefix. Defaults to `'czap'`. */
  readonly prefix?: string;
}

/**
 * Output of {@link compileTheme}.
 *
 * Provides three views of the same declarations: structured, a full CSS
 * rule, and an inline-style string — so hosts can pick whichever
 * serialization best fits their HTML injection strategy.
 */
export interface ThemeCompileResult {
  /** Structured declarations suitable for serializer-specific output. */
  readonly declarations: readonly ThemeDeclaration[];
  /** Full CSS rule with custom property declarations inside `:root {}`. */
  readonly css: string;
  /** Inline style string for `<html style="...">` injection. */
  readonly inlineStyle: string;
}

/** A single compiled CSS custom property declaration. */
export interface ThemeDeclaration {
  /** Full CSS custom property name including the `--prefix-` prefix. */
  readonly property: string;
  /** Formatted value (numbers stringified bare, strings validated). */
  readonly value: string;
}

const SAFE_PREFIX_PATTERN = /^[a-z0-9-]+$/;
const UNSAFE_CSS_VALUE_PATTERN = /[;{}<>]/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a token name to a valid CSS custom property name.
 * Replaces dots and spaces with hyphens, lowercases, strips invalid chars.
 */
function tokenToProperty(prefix: string, name: string): string {
  const sanitised = name
    .toLowerCase()
    .replace(/[.\s]+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
  return `--${prefix}-${sanitised}`;
}

function normalizePrefix(prefix: string): string {
  const normalized = prefix.toLowerCase();
  if (!SAFE_PREFIX_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid theme prefix "${prefix}". Prefixes must contain only lowercase letters, digits, and hyphens.`,
    );
  }

  return normalized;
}

/**
 * Format a token value for CSS output.
 * Numbers are emitted bare (no unit) so consumers can apply their own units.
 */
function formatValue(value: string | number): string {
  const formatted = typeof value === 'number' ? String(value) : value;
  if (UNSAFE_CSS_VALUE_PATTERN.test(formatted)) {
    throw new Error(`Unsafe theme token value "${formatted}" cannot be serialized into CSS safely.`);
  }

  return formatted;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a set of design tokens into CSS custom property declarations.
 *
 * @param config - Token definitions and optional prefix.
 * @returns CSS string and inline style string.
 *
 * @example
 * ```ts
 * const result = compileTheme({
 *   tokens: { 'color.primary': '#3b82f6', 'spacing.base': 16 },
 *   prefix: 'czap',
 * });
 * // result.css =>
 * //   :root {
 * //     --czap-color-primary: #3b82f6;
 * //     --czap-spacing-base: 16;
 * //   }
 * // result.inlineStyle =>
 * //   --czap-color-primary:#3b82f6;--czap-spacing-base:16
 * ```
 */
export function compileTheme(config: ThemeCompileConfig): ThemeCompileResult {
  const prefix = normalizePrefix(config.prefix ?? 'czap');
  const entries = Object.entries(config.tokens);

  if (entries.length === 0) {
    return { declarations: [], css: ':root {}', inlineStyle: '' };
  }

  const declarations: ThemeDeclaration[] = [];
  const cssDeclarations: string[] = [];
  const inlineParts: string[] = [];

  for (const [name, value] of entries) {
    const prop = tokenToProperty(prefix, name);
    const formatted = formatValue(value);
    declarations.push({ property: prop, value: formatted });
    cssDeclarations.push(`  ${prop}: ${formatted};`);
    inlineParts.push(`${prop}:${formatted}`);
  }

  const css = `:root {\n${cssDeclarations.join('\n')}\n}`;
  const inlineStyle = inlineParts.join(';');

  return {
    declarations: Object.freeze(declarations),
    css,
    inlineStyle,
  };
}
