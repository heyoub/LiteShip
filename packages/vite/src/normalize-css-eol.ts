/**
 * Normalize CSS newlines to LF for line-based @rule parsers.
 *
 * @module
 */
export function normalizeCssLineEndings(css: string): string {
  return css.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}