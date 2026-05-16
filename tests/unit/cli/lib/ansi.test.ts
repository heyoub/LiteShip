/**
 * Unit tests for the ANSI color/glyph helper. Verifies that NO_COLOR
 * and FORCE_COLOR override TTY detection, and that the no-color path
 * returns the unchanged input.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { arrow, bearingGlyph, color, colorEnabled, header, label } from '../../../../packages/cli/src/lib/ansi.js';

const ESC = '\x1b';

describe('ansi helper', () => {
  const origNoColor = process.env.NO_COLOR;
  const origForceColor = process.env.FORCE_COLOR;

  beforeEach(() => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
  });
  afterEach(() => {
    if (origNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = origNoColor;
    if (origForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = origForceColor;
  });

  it('colorEnabled returns false when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(colorEnabled({ isTTY: true } as never)).toBe(false);
  });

  it('colorEnabled returns true when FORCE_COLOR is set (even without TTY)', () => {
    process.env.FORCE_COLOR = '1';
    expect(colorEnabled({ isTTY: false } as never)).toBe(true);
  });

  it('colorEnabled honors isTTY when neither env var is set', () => {
    expect(colorEnabled({ isTTY: true } as never)).toBe(true);
    expect(colorEnabled({ isTTY: false } as never)).toBe(false);
  });

  it('color(name, text) wraps in ANSI escape codes when enabled', () => {
    const wrapped = color('green', 'hello', true);
    expect(wrapped.startsWith(ESC)).toBe(true);
    expect(wrapped).toContain('hello');
    expect(wrapped.endsWith(`${ESC}[0m`)).toBe(true);
  });

  it('color() is a no-op (returns input) when disabled', () => {
    expect(color('green', 'hello', false)).toBe('hello');
  });

  it('bearingGlyph maps each status to a glyph token', () => {
    expect(bearingGlyph('ok', false)).toBe('OK');
    expect(bearingGlyph('warn', false)).toBe('!!');
    expect(bearingGlyph('fail', false)).toBe('XX');
  });

  it('bearingGlyph wraps in color when enabled', () => {
    expect(bearingGlyph('ok', true)).toContain('OK');
    expect(bearingGlyph('ok', true)).toContain(ESC);
  });

  it('arrow, header, label are no-ops when disabled', () => {
    expect(arrow(false)).toBe('->');
    expect(header('Hi', false)).toBe('Hi');
    expect(label('Hi', false)).toBe('Hi');
  });
});
