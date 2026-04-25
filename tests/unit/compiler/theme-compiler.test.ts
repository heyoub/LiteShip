/**
 * Theme compiler -- per-tenant theme compilation tests.
 */

import { describe, test, expect } from 'vitest';
import { compileTheme } from '@czap/edge';

describe('compileTheme', () => {
  test('empty tokens produce empty rule', () => {
    const result = compileTheme({ tokens: {} });
    expect(result.declarations).toEqual([]);
    expect(result.css).toBe(':root {}');
    expect(result.inlineStyle).toBe('');
  });

  test('compiles string token values', () => {
    const result = compileTheme({
      tokens: { 'color.primary': '#3b82f6' },
    });
    expect(result.declarations).toEqual([{ property: '--czap-color-primary', value: '#3b82f6' }]);
    expect(result.css).toContain('--czap-color-primary: #3b82f6;');
    expect(result.inlineStyle).toContain('--czap-color-primary:#3b82f6');
  });

  test('compiles numeric token values without units', () => {
    const result = compileTheme({
      tokens: { 'spacing.base': 16 },
    });
    expect(result.css).toContain('--czap-spacing-base: 16;');
    expect(result.inlineStyle).toContain('--czap-spacing-base:16');
  });

  test('custom prefix replaces default', () => {
    const result = compileTheme({
      tokens: { bg: 'white' },
      prefix: 'myapp',
    });
    expect(result.css).toContain('--myapp-bg: white;');
  });

  test('token names are sanitized', () => {
    const result = compileTheme({
      tokens: { 'Font Size.Large': '24px' },
    });
    // dots and spaces become hyphens, lowercased
    expect(result.css).toContain('--czap-font-size-large: 24px;');
  });

  test('invalid characters are stripped', () => {
    const result = compileTheme({
      tokens: { 'color@primary!': 'red' },
    });
    // @ and ! are stripped
    expect(result.css).toContain('--czap-colorprimary: red;');
  });

  test('multiple tokens produce correct CSS block', () => {
    const result = compileTheme({
      tokens: {
        'color.primary': '#3b82f6',
        'color.secondary': '#10b981',
        'spacing.sm': 8,
      },
    });
    expect(result.css).toMatch(/^:root \{/);
    expect(result.css).toMatch(/\}$/);
    expect(result.css).toContain('--czap-color-primary: #3b82f6;');
    expect(result.css).toContain('--czap-color-secondary: #10b981;');
    expect(result.css).toContain('--czap-spacing-sm: 8;');
  });

  test('inline style uses semicolons without spaces', () => {
    const result = compileTheme({
      tokens: { a: '1', b: '2' },
    });
    expect(result.inlineStyle).toBe('--czap-a:1;--czap-b:2');
  });

  test('declarations remain the primary structured surface', () => {
    const result = compileTheme({
      tokens: { primary: '#fff', spacing: 16 },
    });

    expect(result.declarations).toEqual([
      { property: '--czap-primary', value: '#fff' },
      { property: '--czap-spacing', value: '16' },
    ]);
  });

  test('rejects unsafe prefixes', () => {
    expect(() =>
      compileTheme({
        tokens: { safe: '1' },
        prefix: 'brand;drop',
      }),
    ).toThrow(/Invalid theme prefix/);
  });

  test('rejects unsafe CSS token values', () => {
    expect(() =>
      compileTheme({
        tokens: { exploit: 'red;display:block' },
      }),
    ).toThrow(/Unsafe theme token value/);
  });

  test('rejects malformed serializer-context values', () => {
    expect(() =>
      compileTheme({
        tokens: { exploit: 'url(https://attacker.example/x);' },
      }),
    ).toThrow(/Unsafe theme token value/);

    expect(() =>
      compileTheme({
        prefix: 'brand"bad',
        tokens: { safe: '#fff' },
      }),
    ).toThrow(/Invalid theme prefix/);
  });
});
