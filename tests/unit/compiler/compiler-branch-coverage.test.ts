import { afterEach, describe, expect, test, vi } from 'vitest';
import { ARIACompiler } from '../../../packages/compiler/src/aria.js';
import { NUMBER_RE, inferSyntax } from '../../../packages/compiler/src/css-utils.js';
import { Boundary, Component, Style, Theme, Token } from '@czap/core';
import { CSSCompiler } from '../../../packages/compiler/src/css.js';
import { ThemeCSSCompiler } from '../../../packages/compiler/src/theme-css.js';
import { TokenJSCompiler } from '../../../packages/compiler/src/token-js.js';
import { ComponentCSSCompiler } from '../../../packages/compiler/src/component-css.js';
import { TokenTailwindCompiler } from '../../../packages/compiler/src/token-tailwind.js';
import { StyleCSSCompiler } from '../../../packages/compiler/src/style-css.js';
import { captureDiagnostics } from '../../helpers/diagnostics.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compiler branch coverage', () => {
  test('TokenJSCompiler serializes mixed fallback types and groups categories', () => {
    const result = TokenJSCompiler.compile([
      Token.make({
        name: 'accent',
        category: 'color',
        axes: ['theme'] as const,
        values: { light: '#fff' },
        fallback: '#fff',
      }),
      Token.make({
        name: 'enabled',
        category: 'effect',
        axes: ['theme'] as const,
        values: {},
        fallback: true,
      }),
      Token.make({
        name: 'steps',
        category: 'animation',
        axes: ['theme'] as const,
        values: {},
        fallback: { duration: 120 },
      }),
    ]);

    expect(result.code).toContain('"color": {');
    expect(result.code).toContain('"effect": {');
    expect(result.code).toContain('"accent": "#fff"');
    expect(result.code).toContain('"enabled": true');
    expect(result.code).toContain('"steps": {"duration":120}');
    expect(result.typeDeclaration).toContain('export declare const tokens');
  });

  test('ThemeCSSCompiler skips missing variant values and emits transitions only when meta is present', () => {
    const themed = ThemeCSSCompiler.compile(
      {
        _tag: 'ThemeDef',
        id: 'fnv1a:theme0001' as never,
        name: 'brand',
        variants: ['light', 'dark', 'contrast'],
        tokens: {
          accent: {
            light: '#ffffff',
            dark: '#111111',
          },
        },
        meta: {
          light: { label: 'Light', mode: 'light' },
          dark: { label: 'Dark', mode: 'dark' },
          contrast: { label: 'Contrast', mode: 'light' },
        },
      } as Theme.Shape,
    );

    expect(themed.selectors).toContain('html[data-theme="light"]');
    expect(themed.selectors).toContain('html[data-theme="dark"]');
    expect(themed.selectors).not.toContain('html[data-theme="contrast"]');
    expect(themed.transitions).toContain('transition-property: --czap-accent;');

    const noMeta = ThemeCSSCompiler.compile(
      Theme.make({
        name: 'plain',
        variants: ['light'] as const,
        tokens: {
          accent: {
            light: '#ffffff',
          },
        },
      }),
    );

    expect(noMeta.selectors).toContain('--czap-accent: #ffffff;');
    expect(noMeta.transitions).toBe('');
  });

  test('CSSCompiler covers single-state, ranged, and typed custom property registration branches', () => {
    const singletonBoundary = Boundary.make({
      input: 'viewport.width',
      at: [[0, 'only']] as const,
    });

    const singleton = CSSCompiler.compile(
      singletonBoundary,
      {
        only: { '--opacity': '1', color: 'red' },
      },
      '.singleton',
    );

    expect(singleton.raw).toContain('@container viewport-width (width >= 0px)');

    const rangedBoundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'wide'],
      ] as const,
    });

    const ranged = CSSCompiler.compile(
      rangedBoundary,
      {
        compact: { '--radius': '4px', '--tone': '#ffffff' },
        wide: { '--radius': '8px', '--duration': '250ms' },
      },
      '.card',
    );

    expect(ranged.raw).toContain('(width < 768px)');
    expect(ranged.raw).toContain('(width >= 768px)');

    const registrations = CSSCompiler.generatePropertyRegistrations({
      compact: {
        '--count': '2',
        '--radius': '4px',
        '--tone': '#ffffff',
        '--ratio': '25%',
        '--spin': '180deg',
        '--delay': '250ms',
      },
      wide: {
        '--count': '4',
      },
    });

    expect(registrations).toContain('syntax: "<number>"');
    expect(registrations).toContain('syntax: "<length>"');
    expect(registrations).toContain('syntax: "<color>"');
    expect(registrations).toContain('syntax: "<percentage>"');
    expect(registrations).toContain('syntax: "<angle>"');
    expect(registrations).toContain('syntax: "<time>"');
  });

  test('CSSCompiler skips empty states, emits middle-range queries, and serializes empty declarations consistently', () => {
    const threeStateBoundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'regular'],
        [1280, 'wide'],
      ] as const,
    });

    const compiled = CSSCompiler.compile(
      threeStateBoundary,
      {
        compact: {},
        regular: { '--gap': '12px' },
        wide: { color: 'blue' },
      },
      '.panel',
    );

    expect(compiled.raw).toContain('@container viewport-width (width >= 768px) and (width < 1280px)');
    expect(compiled.raw).not.toContain('(width < 768px)');

    expect(
      CSSCompiler.serialize({
        containerRules: [
          {
            name: 'demo',
            query: '(width >= 0px)',
            rules: [{ selector: '.empty', properties: {} }],
          },
        ],
        raw: '',
      }),
    ).toContain('.empty {}');
  });

  test('CSSCompiler ignores unsupported custom property values and emits frequency registrations', () => {
    const registrations = CSSCompiler.generatePropertyRegistrations({
      compact: {
        '--tone': 'inherit',
        '--rate': '440Hz',
      },
      wide: {
        color: 'red',
        '--carrier': '2kHz',
      },
    });

    expect(registrations).toContain('syntax: "<frequency>"');
    expect(registrations).toContain('initial-value: 0Hz;');
    expect(registrations).not.toContain('@property --tone');
    expect(CSSCompiler.generatePropertyRegistrations({ compact: { color: 'red', display: 'block' } })).toBe('');
  });

  test('ComponentCSSCompiler appends slot and satellite rules to the layered output', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'wide'],
      ] as const,
    });

    const styles = Style.make({
      boundary,
      base: {
        properties: {
          display: 'grid',
        },
      },
      states: {
        compact: {
          properties: {
            gap: '8px',
          },
        },
        wide: {
          properties: {
            gap: '16px',
          },
        },
      },
    });

    const component = Component.make({
      name: 'hero-card',
      styles,
      slots: {
        body: { accepts: ['text'] },
      },
    });

    const compiled = ComponentCSSCompiler.compile(component);
    expect(compiled.scoped).toContain('[data-czap-slot] { display: contents; }');
    expect(compiled.layers).toContain('[data-czap-satellite="hero-card"] { container-type: inline-size; }');
    expect(compiled.layers).toContain('@container viewport-width');
  });

  test('ComponentCSSCompiler synthesizes a layer block when the base compiler omits one', () => {
    vi.spyOn(StyleCSSCompiler, 'compile').mockReturnValue({
      scoped: '.plain {}',
      layers: '',
      startingStyle: '',
    });

    const component = {
      name: 'plain-card',
      styles: {} as never,
    } as Component.Shape;

    const compiled = ComponentCSSCompiler.compile(component);

    expect(compiled.layers).toContain('@layer czap.components');
    expect(compiled.layers).toContain('[data-czap-slot] { display: contents; }');
    expect(compiled.layers).toContain('[data-czap-satellite="plain-card"] { container-type: inline-size; }');
  });

  test('TokenJSCompiler reuses category buckets and serializes numeric fallbacks', () => {
    const result = TokenJSCompiler.compile([
      Token.make({
        name: 'space-sm',
        category: 'spacing',
        axes: ['density'] as const,
        values: {},
        fallback: 8,
      }),
      Token.make({
        name: 'space-lg',
        category: 'spacing',
        axes: ['density'] as const,
        values: {},
        fallback: 16,
      }),
    ]);

    expect(result.code).toContain('"spacing": {');
    expect(result.code).toContain('"space-sm": 8');
    expect(result.code).toContain('"space-lg": 16');
  });

  test('TokenTailwindCompiler handles empty inputs, repeated categories, single values, and undefined axis entries', () => {
    const empty = TokenTailwindCompiler.compile([]);
    expect(empty.themeBlock).toBe('@theme {\n\n}');

    const compiled = TokenTailwindCompiler.compile([
      Token.make({
        name: 'space-sm',
        category: 'spacing',
        axes: ['density'] as const,
        values: {},
        fallback: 8,
      }),
      Token.make({
        name: 'space-lg',
        category: 'spacing',
        axes: ['density'] as const,
        values: {},
        fallback: 16,
      }),
      Token.make({
        name: 'primary',
        category: 'color',
        axes: ['theme'] as const,
        values: {
          light: '#ffffff',
          missing: undefined,
        },
        fallback: '#000000',
      }),
    ]);

    expect(compiled.themeBlock).toContain('--spacing-space-sm: 8;');
    expect(compiled.themeBlock).toContain('--spacing-space-lg: 16;');
    expect(compiled.themeBlock).toContain('--color-primary-light: #ffffff;');
    expect(compiled.themeBlock).not.toContain('--color-primary-missing');
    expect(compiled.themeBlock).toContain('--color-primary: #000000;');
  });

  test('StyleCSSCompiler handles pseudo-only layers, empty base layers, and unscoped output', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'wide'],
      ] as const,
    });

    const style = Style.make({
      boundary,
      base: {
        properties: {},
        pseudo: {
          ':hover': {
            opacity: '0.75',
          },
        },
      },
      states: {
        compact: {
          properties: {},
        },
        wide: {
          properties: {
            gap: '24px',
          },
          boxShadow: [
            { x: 0, y: 2, blur: 8, spread: 1, color: '#00000033', inset: true },
          ],
        },
      },
    });

    const compiled = StyleCSSCompiler.compile(style);

    expect(compiled.scoped).toContain(':where(.czap-styled):hover');
    expect(compiled.layers).toContain('@layer czap.components');
    expect(compiled.layers).toContain('box-shadow: inset 0px 2px 8px 1px #00000033;');
    expect(compiled.startingStyle).toBe('');
  });

  test('StyleCSSCompiler covers spread-less shadows, default transitions, skipped pseudos, and empty state layers', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'wide'],
      ] as const,
    });

    const compiled = StyleCSSCompiler.compile(
      Style.make({
        boundary,
        transition: { duration: 180 },
        base: {
          properties: {},
          boxShadow: [{ x: 0, y: 4, blur: 12, color: '#00000022' }],
          pseudo: {
            ':hover': {},
            ':focus-visible': { outline: '2px solid red' },
          },
        },
        states: {
          compact: undefined,
          wide: {
            properties: {},
          },
        },
      }),
      'card',
    );

    expect(compiled.scoped).toContain('transition: all 180ms ease;');
    expect(compiled.scoped).toContain('box-shadow: 0px 4px 12px #00000022;');
    expect(compiled.scoped).toContain(':scope:focus-visible');
    expect(compiled.scoped).not.toContain(':scope:hover');
    expect(compiled.layers).toContain('@layer czap.components');
    expect(compiled.startingStyle).toContain('@starting-style');
  });

  test('StyleCSSCompiler skips container output when every boundary state layer is absent', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'wide'],
      ] as const,
    });

    const compiled = StyleCSSCompiler.compile(
      {
        _tag: 'StyleDef',
        id: 'fnv1a:style-empty-states' as never,
        base: { properties: { color: 'red' } },
        boundary,
        states: {
          compact: undefined,
          wide: undefined,
        },
      } as never,
      'empty-states',
    );

    expect(compiled.scoped).toContain(':scope');
    expect(compiled.layers).not.toContain('@container');
  });

  test('ThemeCSSCompiler stringifies non-string values and skips transition output without meta', () => {
    const compiled = ThemeCSSCompiler.compile({
      _tag: 'ThemeDef',
      id: 'fnv1a:theme0002' as never,
      name: 'numbers',
      variants: ['light', 'dark'],
      tokens: {
        radius: {
          light: 12,
          dark: 16,
        },
        contrast: {
          dark: true,
        },
      },
    } as Theme.Shape);

    expect(compiled.selectors).toContain('--czap-radius: 12;');
    expect(compiled.selectors).toContain('--czap-radius: 16;');
    expect(compiled.selectors).toContain('--czap-contrast: true;');
    expect(compiled.transitions).toBe('');
  });

  test('NUMBER_RE handles pathological ReDoS input in under 10ms', () => {
    // Crafted input that causes catastrophic backtracking with overlapping
    // alternation like (\d+\.?\d*|\.\d+). The non-overlapping form
    // (?:\d+(?:\.\d*)?|\.\d+) resolves in constant time.
    const pathological = '1.1.1.1.1.1.1.1x';
    const start = Date.now();
    const result = NUMBER_RE.test(pathological);
    const elapsed = Date.now() - start;
    expect(result).toBe(false);
    expect(elapsed).toBeLessThan(10);
  });

  test('inferSyntax covers all CSS syntax branches from the unified css-utils module', () => {
    // length
    expect(inferSyntax('16px')).toBe('<length>');
    expect(inferSyntax('1.5rem')).toBe('<length>');
    expect(inferSyntax('100%')).toBe('<percentage>');
    expect(inferSyntax('0.5fr')).toBe('<length>');
    // time
    expect(inferSyntax('250ms')).toBe('<time>');
    expect(inferSyntax('1s')).toBe('<time>');
    // angle
    expect(inferSyntax('180deg')).toBe('<angle>');
    expect(inferSyntax('1.5rad')).toBe('<angle>');
    expect(inferSyntax('0.25turn')).toBe('<angle>');
    // frequency (only present in css-utils, was missing in token-css.ts)
    expect(inferSyntax('440Hz')).toBe('<frequency>');
    expect(inferSyntax('2kHz')).toBe('<frequency>');
    // color
    expect(inferSyntax('#ff0000')).toBe('<color>');
    expect(inferSyntax('rgba(')).toBe('<color>');
    // bare number
    expect(inferSyntax('1')).toBe('<number>');
    expect(inferSyntax('-0.5')).toBe('<number>');
    expect(inferSyntax('.75')).toBe('<number>');
    // non-matching
    expect(inferSyntax('auto')).toBe(null);
    expect(inferSyntax('inherit')).toBe(null);
    expect(inferSyntax('1.1.1x')).toBe(null);
  });

  test('ARIACompiler drops invalid keys and falls back to an empty current state map', () => {
    captureDiagnostics(({ events }) => {
      const boundary = Boundary.make({
        input: 'viewport.width',
        at: [
          [0, 'compact'],
          [768, 'wide'],
        ] as const,
      });

      const compiled = ARIACompiler.compile(
        boundary,
        {
          compact: {
            role: 'button',
            'aria-hidden': 'true',
            title: 'ignored',
          },
          wide: {
            'data-test': 'ignored',
          },
        },
        'wide',
      );

      expect(compiled.stateAttributes.compact).toEqual({
        role: 'button',
        'aria-hidden': 'true',
      });
      expect(compiled.stateAttributes.wide).toEqual({});
      expect(compiled.currentAttributes).toEqual({});
      expect(events).toHaveLength(2);
      expect(events.every((event) => event.code === 'invalid-aria-key')).toBe(true);
    });
  });
});
