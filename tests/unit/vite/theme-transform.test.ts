import { afterEach, describe, expect, test, vi } from 'vitest';
import { compileThemeBlock, parseThemeBlocks } from '../../../packages/vite/src/theme-transform.js';
import { ThemeCSSCompiler } from '../../../packages/compiler/src/theme-css.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseThemeBlocks', () => {
  test('parses empty, trailing-semicolon, and multi-line theme blocks while ignoring unrelated lines', () => {
    const css = [
      '.app { color: red; }',
      '@theme ocean {',
      '  color-primary: blue;;',
      '  spacing-lg: 24px',
      '}',
      '',
      '@theme dusk {',
      '}',
      '',
      '@theme forest {',
      '  accent-color: green;',
      '  border-radius: 9999px;',
      '}',
    ].join('\n');

    expect(parseThemeBlocks(css, '/virtual/theme.css')).toEqual([
      {
        themeName: 'ocean',
        declarations: {
          'color-primary': 'blue',
          'spacing-lg': '24px',
        },
        sourceFile: '/virtual/theme.css',
        line: 2,
      },
      {
        themeName: 'dusk',
        declarations: {},
        sourceFile: '/virtual/theme.css',
        line: 7,
      },
      {
        themeName: 'forest',
        declarations: {
          'accent-color': 'green',
          'border-radius': '9999px',
        },
        sourceFile: '/virtual/theme.css',
        line: 10,
      },
    ]);
  });
});

describe('compileThemeBlock', () => {
  test('delegates canonical CSS generation to ThemeCSSCompiler and appends html overrides when present', () => {
    const compile = vi.spyOn(ThemeCSSCompiler, 'compile').mockReturnValue({
      selectors: 'html[data-theme="ocean"] {\n  --czap-color-primary: blue;\n}',
      transitions: 'html[data-theme] {\n  transition: color 200ms ease;\n}',
    });
    const block = {
      themeName: 'ocean',
      declarations: { color: 'navy', background: 'white' },
      sourceFile: '/virtual/theme.css',
      line: 1,
    };

    const css = compileThemeBlock(block, { id: 'theme-ocean', tokens: {} } as never);

    expect(compile).toHaveBeenCalledWith({ id: 'theme-ocean', tokens: {} });
    expect(css).toContain('html[data-theme="ocean"]');
    expect(css).toContain('transition: color 200ms ease;');
    expect(css).toContain('html {\n  color: navy;\n  background: white;\n}');
  });

  test('returns only the available compiler fragments when selectors, transitions, or overrides are absent', () => {
    vi.spyOn(ThemeCSSCompiler, 'compile')
      .mockReturnValueOnce({ selectors: '', transitions: '' })
      .mockReturnValueOnce({ selectors: 'html[data-theme="minimal"] { color: black; }', transitions: '' })
      .mockReturnValueOnce({ selectors: '', transitions: 'html[data-theme] { transition: none; }' });
    const emptyBlock = {
      themeName: 'minimal',
      declarations: {},
      sourceFile: '/virtual/theme.css',
      line: 1,
    };

    expect(compileThemeBlock(emptyBlock, { id: 'theme-1', tokens: {} } as never)).toBe('');
    expect(compileThemeBlock(emptyBlock, { id: 'theme-2', tokens: {} } as never)).toBe(
      'html[data-theme="minimal"] { color: black; }',
    );
    expect(compileThemeBlock(emptyBlock, { id: 'theme-3', tokens: {} } as never)).toBe(
      'html[data-theme] { transition: none; }',
    );
  });

  test('uses a fresh compiler spy after prior sequential return values are consumed', () => {
    vi.spyOn(ThemeCSSCompiler, 'compile').mockReturnValue({
      selectors: '',
      transitions: '',
    });

    const css = compileThemeBlock(
      {
        themeName: 'fresh',
        declarations: {},
        sourceFile: '/virtual/theme.css',
        line: 1,
      },
      { id: 'theme-fresh', tokens: {} } as never,
    );

    expect(css).toBe('');
    expect(ThemeCSSCompiler.compile).toHaveBeenCalledTimes(1);
  });
});
