/**
 * Minimal ANSI color + glyph helper for TTY-pretty CLI output. Honors:
 *
 *  - `NO_COLOR`        — disables color regardless of TTY state
 *  - `FORCE_COLOR=1+`  — enables color even without a TTY (CI logs)
 *  - `CI=true`         — most CI providers render ANSI in build logs
 *  - default           — color when the target stream is a TTY
 *
 * Colors never go to stdout (JSON receipt stream stays raw); pretty
 * helpers are called from doctor / setup / postinstall / clean before
 * writing to stderr.
 *
 * @module
 */

/** Detect color support for a given stream. Defaults to stderr. */
export function colorEnabled(stream: NodeJS.WritableStream & { isTTY?: boolean } = process.stderr): boolean {
  // NO_COLOR spec (https://no-color.org): the variable is treated as "set"
  // when present, regardless of value — including the empty string. Earlier
  // versions of this check excluded `NO_COLOR=`, which silently re-enabled
  // color when callers exported the variable with no value.
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
  if (process.env.CI === 'true' || process.env.CI === '1') return true;
  return Boolean(stream.isTTY);
}

const CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
} as const;

type ColorName = keyof typeof CODES;

/** Wrap `text` in ANSI codes for `name`. No-op when color is disabled. */
export function color(name: ColorName, text: string, on: boolean = colorEnabled()): string {
  return on ? `${CODES[name]}${text}${CODES.reset}` : text;
}

/**
 * Convenience glyph + color for the three bearings (`ok` / `warn` / `fail`).
 * Returns a colored two-char glyph that pads to a stable visual width.
 */
export function bearingGlyph(status: 'ok' | 'warn' | 'fail', on: boolean = colorEnabled()): string {
  if (status === 'ok') return color('green', 'OK', on);
  if (status === 'warn') return color('yellow', '!!', on);
  return color('red', 'XX', on);
}

/** Glyph for a single arrow used in hints. */
export function arrow(on: boolean = colorEnabled()): string {
  return color('dim', '->', on);
}

/** A solid section header — for setup phases, postinstall, clean. */
export function header(text: string, on: boolean = colorEnabled()): string {
  return color('bold', color('cyan', text, on), on);
}

/** A subtle label (used for terms, paths, version strings). */
export function label(text: string, on: boolean = colorEnabled()): string {
  return color('dim', text, on);
}
