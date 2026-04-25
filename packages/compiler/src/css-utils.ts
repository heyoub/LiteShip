/**
 * Shared CSS utility regexes and `inferSyntax` helper used by both the CSS
 * compiler and the Token CSS compiler.
 *
 * `NUMBER_RE` uses non-overlapping alternation to avoid catastrophic
 * backtracking (ReDoS) on crafted inputs like `"1.1.1.1.1.1.1.1x"`.
 *
 * The regex structure is `^-?(?:\d+(?:\.\d*)?|\.\d+)(units)?$`, where the
 * two numeric branches are mutually exclusive: `\d+(?:\.\d*)?` for integer
 * or decimal like `1`, `1.`, `1.5`, and `\.\d+` for leading-dot decimal
 * like `.5`. This eliminates the overlapping `(\d+\.?\d*|\.\d+)` pattern
 * that could cause the engine to re-attempt partial matches at each
 * character boundary.
 *
 * @module
 */

/** Matches any CSS color literal (hex, rgb/rgba, hsl/hsla, oklch, oklab, color(), lab, lch, hwb). */
export const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\(|lab\(|lch\(|hwb\()/;

/**
 * Matches any CSS dimension with a known unit suffix.
 *
 * Capture group 1 is the unit (or undefined for a unitless number);
 * {@link inferSyntax} keys off the unit to pick a registered-property syntax.
 */
export const NUMBER_RE =
  /^-?(?:\d+(?:\.\d*)?|\.\d+)(px|rem|em|%|vw|vh|dvh|svh|lvh|vmin|vmax|fr|deg|rad|turn|s|ms|Hz|kHz)?$/;

/** CSS registered-property syntax keyword produced by {@link inferSyntax}. */
export type CSSSyntax = '<number>' | '<length>' | '<color>' | '<percentage>' | '<time>' | '<angle>' | '<frequency>';

/**
 * Infer the CSS registered-property syntax keyword for a raw CSS value string.
 *
 * Returns null when the value does not map to a typed CSS syntax (e.g. keyword
 * values like "inherit", "auto", or multi-token shorthand values).
 *
 * Includes all units from the full compiler set:
 *   px | rem | em | % | vw | vh | dvh | svh | lvh | vmin | vmax | fr
 *   deg | rad | turn | s | ms | Hz | kHz
 */
export function inferSyntax(value: string): CSSSyntax | null {
  if (COLOR_RE.test(value)) return '<color>';
  const numMatch = value.match(NUMBER_RE);
  if (numMatch) {
    const unit = numMatch[1];
    if (!unit) return '<number>';
    if (unit === '%') return '<percentage>';
    if (unit === 's' || unit === 'ms') return '<time>';
    if (unit === 'deg' || unit === 'rad' || unit === 'turn') return '<angle>';
    if (unit === 'Hz' || unit === 'kHz') return '<frequency>';
    return '<length>';
  }
  return null;
}

/**
 * Coerce any token value to a CSS string.
 *
 * CSS values are always plain text -- no quoting or JSON encoding needed.
 * Strings pass through unchanged; everything else goes through String().
 * This covers the common cases: numbers (e.g. 16), booleans, and values
 * that are already CSS strings (e.g. "#ff0000", "1rem").
 */
export function stringifyCSSValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

/**
 * Group an array of tokens by their category, preserving insertion order.
 *
 * Returns a Map so callers can iterate in the order categories were first
 * encountered (matches the order of the input token array).
 */
export function groupTokensByCategory<T extends { readonly category: string }>(
  tokens: readonly T[],
): Map<T['category'], T[]> {
  const grouped = new Map<T['category'], T[]>();
  for (const token of tokens) {
    const category = token.category;
    const group = grouped.get(category);
    if (group) {
      group.push(token);
    } else {
      grouped.set(category, [token]);
    }
  }
  return grouped;
}
