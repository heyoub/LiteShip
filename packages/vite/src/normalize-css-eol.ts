/**
 * Normalize CSS newlines to LF for line-based parsing of CSS at-rules.
 *
 * @module
 */
export function normalizeCssLineEndings(css: string): string {
  return css.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
