/**
 * Compiler benchmarks -- CSS, GLSL, Token, Theme, Style compilation.
 */

import { Bench } from 'tinybench';
import { Boundary, Token, Theme, Style } from '@czap/core';
import {
  CSSCompiler,
  GLSLCompiler,
  TokenCSSCompiler,
  TokenTailwindCompiler,
  ThemeCSSCompiler,
  StyleCSSCompiler,
  dispatch,
} from '@czap/compiler';

const bench = new Bench({ warmupIterations: 100 });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const boundary = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
});

const token = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['theme'] as const,
  values: { dark: '#00e5ff', light: '#00c4d4' },
  fallback: '#00e5ff',
});

const theme = Theme.make({
  name: 'brand',
  variants: ['light', 'dark'] as const,
  tokens: {
    primary: { light: '#00c4d4', dark: '#00e5ff' },
    background: { light: '#ffffff', dark: '#0a0a0a' },
  },
  meta: {
    light: { label: 'Light', mode: 'light' },
    dark: { label: 'Dark', mode: 'dark' },
  },
});

const style = Style.make({
  boundary,
  base: {
    properties: {
      'font-size': '16px',
      padding: '8px',
      color: 'var(--czap-primary)',
    },
  },
  states: {
    mobile: { properties: { 'font-size': '14px', padding: '4px' } },
    tablet: { properties: { 'font-size': '16px', padding: '8px' } },
    desktop: { properties: { 'font-size': '18px', padding: '12px' } },
  },
});

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

bench.add('CSSCompiler.compile() -- boundary', () => {
  CSSCompiler.compile(boundary, {
    mobile: { 'font-size': '14px' },
    tablet: { 'font-size': '16px' },
    desktop: { 'font-size': '18px' },
  });
});

bench.add('GLSLCompiler.compile() -- boundary', () => {
  GLSLCompiler.compile(boundary, {
    mobile: { 'font-size': 14 },
    tablet: { 'font-size': 16 },
    desktop: { 'font-size': 18 },
  });
});

bench.add('TokenCSSCompiler.compile() -- token', () => {
  TokenCSSCompiler.compile(token);
});

bench.add('TokenTailwindCompiler.compile() -- tokens', () => {
  TokenTailwindCompiler.compile([token]);
});

bench.add('ThemeCSSCompiler.compile() -- theme', () => {
  ThemeCSSCompiler.compile(theme);
});

bench.add('StyleCSSCompiler.compile() -- style', () => {
  StyleCSSCompiler.compile(style);
});

// dispatch() overhead vs direct call — proves CompilerDef tagged union is zero-cost
const cssStates = {
  mobile: { 'font-size': '14px' },
  tablet: { 'font-size': '16px' },
  desktop: { 'font-size': '18px' },
};

bench.add('dispatch() -- CSSCompiler tag', () => {
  dispatch({ _tag: 'CSSCompiler', boundary, states: cssStates });
});

bench.add('CSSCompiler.compile() -- direct', () => {
  CSSCompiler.compile(boundary, cssStates);
});

bench.add('Full pipeline: boundary + token + theme + style', () => {
  CSSCompiler.compile(boundary, {
    mobile: { 'font-size': '14px' },
    tablet: { 'font-size': '16px' },
    desktop: { 'font-size': '18px' },
  });
  GLSLCompiler.compile(boundary, {
    mobile: { 'font-size': 14 },
    tablet: { 'font-size': 16 },
    desktop: { 'font-size': 18 },
  });
  TokenCSSCompiler.compile(token);
  TokenTailwindCompiler.compile([token]);
  ThemeCSSCompiler.compile(theme);
  StyleCSSCompiler.compile(style);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await bench.run();
console.table(bench.table());
