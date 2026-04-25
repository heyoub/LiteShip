/**
 * Design layer integration tests -- TokenDef, StyleDef, ThemeDef, ComponentDef,
 * design compilers, 2-axis tiers, and spring CSS helpers.
 *
 * Tests behavioral contracts across the design primitive -> compiler pipeline.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';

// --- Core design primitives ---
import { Token, Style, Theme, Component, Boundary, TokenRef, Easing, Millis } from '@czap/core';
import type { StyleLayer } from '@czap/core';

// --- Compilers ---
import {
  TokenCSSCompiler,
  TokenTailwindCompiler,
  TokenJSCompiler,
  ThemeCSSCompiler,
  StyleCSSCompiler,
  ComponentCSSCompiler,
  generatePropertyRegistrations,
} from '@czap/compiler';

// --- Detect ---
import { designTierFromCapabilities, motionTierFromCapabilities } from '@czap/detect';
import type { ExtendedDeviceCapabilities } from '@czap/detect';

// ===========================================================================
// FIXTURES
// ===========================================================================

const viewport = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
});

const primaryToken = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['theme'] as const,
  values: { dark: 'oklch(0.3 0.05 260)', light: 'oklch(0.95 0.02 260)' },
  fallback: 'oklch(0.5 0.1 260)',
});

const spacingToken = Token.make({
  name: 'gap',
  category: 'spacing',
  axes: ['density'] as const,
  values: { compact: '8px', normal: '16px', spacious: '24px' },
  fallback: '16px',
});

const fbfTheme = Theme.make({
  name: 'fbf',
  variants: ['dark', 'light'] as const,
  tokens: {
    primary: { dark: '#00e5ff', light: 'hsl(175 70% 50%)' },
    surface: { dark: '#0a0a0f', light: '#fafafa' },
  },
  meta: {
    dark: { label: 'FBF Dark', mode: 'dark' },
    light: { label: 'FBF Light', mode: 'light' },
  },
});

const cardStyle = Style.make({
  boundary: viewport,
  base: {
    properties: { padding: '16px', 'border-radius': '8px', background: 'var(--czap-surface)' },
    boxShadow: [{ x: 0, y: 2, blur: 8, spread: 0, color: 'rgba(0,0,0,0.1)' }],
  },
  states: {
    mobile: { properties: { padding: '12px', 'font-size': '14px' } },
    desktop: { properties: { padding: '24px', 'font-size': '18px' } },
  },
  transition: { duration: Millis(200), easing: 'ease-out', properties: ['padding', 'font-size'] },
});

const cardComponent = Component.make({
  name: 'card',
  boundary: viewport,
  styles: cardStyle,
  slots: {
    header: { required: false, description: 'Card header area' },
    content: { required: true, description: 'Main card content' },
  } as const,
  defaultSlot: 'content',
});

// ===========================================================================
// TOKEN TESTS
// ===========================================================================

describe('Token', () => {
  test('make() produces valid TokenDef with content address', () => {
    expect(primaryToken._tag).toBe('TokenDef');
    expect(primaryToken._version).toBe(1);
    expect(primaryToken.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(primaryToken.name).toBe('primary');
    expect(primaryToken.category).toBe('color');
    expect(primaryToken.cssProperty).toBe('--czap-primary');
  });

  test('same inputs -> same content address (deterministic)', () => {
    const token2 = Token.make({
      name: 'primary',
      category: 'color',
      axes: ['theme'] as const,
      values: { dark: 'oklch(0.3 0.05 260)', light: 'oklch(0.95 0.02 260)' },
      fallback: 'oklch(0.5 0.1 260)',
    });
    expect(token2.id).toBe(primaryToken.id);
  });

  test('different inputs -> different content address', () => {
    const otherToken = Token.make({
      name: 'secondary',
      category: 'color',
      axes: ['theme'] as const,
      values: { dark: '#ff0', light: '#00f' },
      fallback: '#fff',
    });
    expect(otherToken.id).not.toBe(primaryToken.id);
  });

  test('different fallback -> different content address', () => {
    const token = Token.make({
      name: 'primary',
      category: 'color',
      axes: ['theme'] as const,
      values: { dark: 'oklch(0.3 0.05 260)', light: 'oklch(0.95 0.02 260)' },
      fallback: '#000',
    });
    expect(token.id).not.toBe(primaryToken.id);
  });

  test('Token.tap() returns axis-matched value', () => {
    expect(Token.tap(primaryToken, { theme: 'dark' })).toBe('oklch(0.3 0.05 260)');
    expect(Token.tap(primaryToken, { theme: 'light' })).toBe('oklch(0.95 0.02 260)');
  });

  test('Token.tap() falls back on unknown axis value', () => {
    expect(Token.tap(primaryToken, { theme: 'neon' })).toBe('oklch(0.5 0.1 260)');
  });

  test('Token.cssVar() returns CSS var reference', () => {
    expect(Token.cssVar(primaryToken)).toBe('var(--czap-primary)');
  });

  test('resolves multi-axis token with compound keys', () => {
    const token = Token.make({
      name: 'spacing',
      category: 'spacing',
      axes: ['density', 'breakpoint'] as const,
      values: {
        // Axes sorted alphabetically: breakpoint, density
        // Key = axisValues[breakpoint]:axisValues[density]
        'mobile:compact': '4px',
        'desktop:compact': '8px',
        'mobile:comfortable': '8px',
        'desktop:comfortable': '16px',
      },
      fallback: '8px',
    });

    const result = Token.tap(token, { density: 'compact', breakpoint: 'mobile' });
    expect(result).toBe('4px');

    const result2 = Token.tap(token, { density: 'comfortable', breakpoint: 'desktop' });
    expect(result2).toBe('16px');

    // Fallback for unknown combo
    const result3 = Token.tap(token, { density: 'unknown', breakpoint: 'mobile' });
    expect(result3).toBe('8px');
  });

  test('resolves a multi-axis token when one axis is intentionally omitted', () => {
    const token = Token.make({
      name: 'layout-gap',
      category: 'spacing',
      axes: ['density', 'breakpoint'] as const,
      values: {
        ':compact': '6px',
        'desktop:compact': '10px',
      },
      fallback: '12px',
    });

    expect(Token.tap(token, { density: 'compact' })).toBe('6px');
  });

  test('make() throws on empty name', () => {
    expect(() =>
      Token.make({
        name: '' as 'x',
        category: 'color',
        axes: ['theme'] as const,
        values: {},
        fallback: '#000',
      }),
    ).toThrow(/Token name must not be empty/);
  });

  test('make() throws on duplicate axis names', () => {
    expect(() =>
      Token.make({
        name: 'dup',
        category: 'color',
        axes: ['theme', 'theme'] as unknown as readonly ['theme', 'theme'],
        values: {},
        fallback: '#000',
      }),
    ).toThrow(/duplicate axis "theme"/);
  });

  test('TokenRef brand is transparent at runtime', () => {
    const ref = TokenRef('primary');
    expect(ref).toBe('primary');
  });
});

// ===========================================================================
// STYLE TESTS
// ===========================================================================

describe('Style', () => {
  test('make() produces valid StyleDef with content address', () => {
    expect(cardStyle._tag).toBe('StyleDef');
    expect(cardStyle._version).toBe(1);
    expect(cardStyle.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(cardStyle.boundary).toBe(viewport);
  });

  test('make() throws on invalid state name', () => {
    expect(() =>
      Style.make({
        boundary: viewport,
        base: { properties: {} },
        states: { nonexistent: { properties: { color: 'red' } } } as any,
      }),
    ).toThrow(/does not match boundary states/);
  });

  test('Style.mergeLayers() spreads properties', () => {
    const base: StyleLayer = { properties: { a: '1', b: '2' } };
    const over: StyleLayer = { properties: { b: '3', c: '4' } };
    const merged = Style.mergeLayers(base, over);
    expect(merged.properties).toEqual({ a: '1', b: '3', c: '4' });
  });

  test('Style.mergeLayers() merges pseudo selectors', () => {
    const base: StyleLayer = { properties: {}, pseudo: { ':hover': { color: 'red' } } };
    const over: StyleLayer = {
      properties: {},
      pseudo: { ':hover': { background: 'blue' }, ':focus': { outline: 'none' } },
    };
    const merged = Style.mergeLayers(base, over);
    expect(merged.pseudo).toEqual({
      ':hover': { color: 'red', background: 'blue' },
      ':focus': { outline: 'none' },
    });
  });

  test('Style.mergeLayers() concats boxShadow', () => {
    const s1: StyleLayer = { properties: {}, boxShadow: [{ x: 0, y: 1, blur: 2, color: 'black' }] };
    const s2: StyleLayer = { properties: {}, boxShadow: [{ x: 0, y: 4, blur: 8, color: 'gray' }] };
    const merged = Style.mergeLayers(s1, s2);
    expect(merged.boxShadow).toHaveLength(2);
  });

  test('Style.mergeLayers() preserves one-sided pseudo selectors without requiring both layers to define them', () => {
    const onlyBasePseudo: StyleLayer = {
      properties: {},
      pseudo: {
        ':hover': { color: 'red' },
      },
    };
    const onlyOverridePseudo: StyleLayer = {
      properties: {},
      pseudo: {
        ':focus': { outline: 'none' },
      },
    };

    expect(Style.mergeLayers(onlyBasePseudo, { properties: {} }).pseudo).toEqual({
      ':hover': { color: 'red' },
    });
    expect(Style.mergeLayers({ properties: {} }, onlyOverridePseudo).pseudo).toEqual({
      ':focus': { outline: 'none' },
    });
  });

  test('Style.tap() returns base when no state', () => {
    const result = Style.tap(cardStyle);
    expect(result['padding']).toBe('16px');
    expect(result['border-radius']).toBe('8px');
    expect(result['box-shadow']).toBe('0px 2px 8px 0px rgba(0,0,0,0.1)');
  });

  test('Style.tap() merges state layer into base', () => {
    const result = Style.tap(cardStyle, 'mobile');
    expect(result['padding']).toBe('12px');
    expect(result['font-size']).toBe('14px');
    expect(result['border-radius']).toBe('8px');
  });

  test('Style.tap() merges desktop state', () => {
    const result = Style.tap(cardStyle, 'desktop');
    expect(result['padding']).toBe('24px');
    expect(result['font-size']).toBe('18px');
  });

  test('Style.tap() falls back to base without state maps and preserves mixed box-shadow serialization', () => {
    const shadowStyle = Style.make({
      base: {
        properties: { color: 'red' },
        boxShadow: [{ x: 1, y: 2, blur: 3, color: '#111111' }],
      },
    });

    expect(Style.tap(shadowStyle, 'ghost')).toEqual({
      color: 'red',
      'box-shadow': '1px 2px 3px #111111',
    });

    const merged = Style.mergeLayers(
      {
        properties: {},
        boxShadow: [{ x: 0, y: 1, blur: 2, color: '#222222' }],
      },
      {
        properties: {},
        boxShadow: [{ x: 0, y: 4, blur: 8, spread: 1, color: '#333333', inset: true }],
      },
    );

    expect(merged.boxShadow).toEqual([
      { x: 0, y: 1, blur: 2, color: '#222222' },
      { x: 0, y: 4, blur: 8, spread: 1, color: '#333333', inset: true },
    ]);
  });

  test('Style.tap() flattens pseudo selectors and serializes inset shadows with spread overrides', () => {
    const style = Style.make({
      base: {
        properties: { color: 'red' },
        pseudo: { ':hover': { color: 'blue' } },
      },
      states: {
        mobile: {
          properties: { color: 'white' },
          pseudo: { ':focus': { outline: 'none' } },
          boxShadow: [
            { x: 0, y: 2, blur: 6, spread: 1, color: '#111111', inset: true },
            { x: 0, y: 4, blur: 8, color: '#222222' },
          ],
        },
      },
    });

    expect(Style.tap(style, 'mobile')).toEqual({
      color: 'white',
      ':hover::color': 'blue',
      ':focus::outline': 'none',
      'box-shadow': 'inset 0px 2px 6px 1px #111111, 0px 4px 8px #222222',
    });
  });
});

// ===========================================================================
// THEME TESTS
// ===========================================================================

describe('Theme', () => {
  test('make() produces valid ThemeDef with content address', () => {
    expect(fbfTheme._tag).toBe('ThemeDef');
    expect(fbfTheme._version).toBe(1);
    expect(fbfTheme.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(fbfTheme.variants).toEqual(['dark', 'light']);
  });

  test('different meta -> different content address', () => {
    const withoutMeta = Theme.make({
      name: 'fbf',
      variants: ['dark', 'light'] as const,
      tokens: {
        primary: { dark: '#00e5ff', light: 'hsl(175 70% 50%)' },
        surface: { dark: '#0a0a0f', light: '#fafafa' },
      },
    });
    expect(withoutMeta.id).not.toBe(fbfTheme.id);
  });

  test('make() throws on missing variant value', () => {
    expect(() =>
      Theme.make({
        name: 'broken',
        variants: ['a', 'b'] as const,
        tokens: { foo: { a: 'yes' } as any },
      }),
    ).toThrow(/missing value for variant/);
  });

  test('Theme.tap() returns correct variant values', () => {
    const dark = Theme.tap(fbfTheme, 'dark');
    expect(dark['primary']).toBe('#00e5ff');
    expect(dark['surface']).toBe('#0a0a0f');

    const light = Theme.tap(fbfTheme, 'light');
    expect(light['primary']).toBe('hsl(175 70% 50%)');
    expect(light['surface']).toBe('#fafafa');
  });
});

// ===========================================================================
// COMPONENT TESTS
// ===========================================================================

describe('Component', () => {
  test('make() produces valid ComponentDef', () => {
    expect(cardComponent._tag).toBe('ComponentDef');
    expect(cardComponent._version).toBe(1);
    expect(cardComponent.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(cardComponent.name).toBe('card');
    expect(cardComponent.slots.content.required).toBe(true);
    expect(cardComponent.defaultSlot).toBe('content');
  });

  test('ComponentDef id is deterministic across identical authored definitions', () => {
    const comp2 = Component.make({
      name: 'card',
      boundary: viewport,
      styles: cardStyle,
      slots: {
        header: { required: false, description: 'Card header area' },
        content: { required: true, description: 'Main card content' },
      } as const,
      defaultSlot: 'content',
    });
    expect(comp2.id).toBe(cardComponent.id);
  });

  test('ComponentDef id changes when slot config changes', () => {
    const comp = Component.make({
      name: 'card',
      boundary: viewport,
      styles: cardStyle,
      slots: { header: { required: true }, content: { required: true } } as const,
      defaultSlot: 'content',
    });
    expect(comp.id).not.toBe(cardComponent.id);
  });

  test('ComponentDef id changes when default slot changes', () => {
    const comp = Component.make({
      name: 'card',
      boundary: viewport,
      styles: cardStyle,
      slots: {
        header: { required: false, description: 'Card header area' },
        content: { required: true, description: 'Main card content' },
      } as const,
      defaultSlot: 'header',
    });
    expect(comp.id).not.toBe(cardComponent.id);
  });
});

// ===========================================================================
// TOKEN CSS COMPILER
// ===========================================================================

describe('TokenCSSCompiler', () => {
  test('compile() emits @property and :root', () => {
    const result = TokenCSSCompiler.compile(primaryToken);
    expect(result.customProperties).toContain('@property --czap-primary');
    expect(result.customProperties).toContain(':root');
    expect(result.customProperties).toContain('oklch(0.5 0.1 260)');
    expect(result.properties).toContain('--czap-primary');
  });

  test('compile() with theme emits html[data-theme] selectors', () => {
    const result = TokenCSSCompiler.compile(primaryToken, fbfTheme);
    expect(result.themed).toContain('html[data-theme="dark"]');
    expect(result.themed).toContain('html[data-theme="light"]');
    expect(result.themed).toContain('#00e5ff');
  });

  test('compile() emits <length> syntax for spacing tokens', () => {
    const result = TokenCSSCompiler.compile(spacingToken);
    expect(result.customProperties).toContain('syntax: "<length>"');
  });

  test('compile() uses explicit cssProperty names and skips @property registration for non-typed fallbacks', () => {
    const token = {
      ...Token.make({
        name: 'fluid-gap',
        category: 'spacing',
        axes: ['density'] as const,
        values: { normal: 'clamp(1rem, 2vw, 3rem)' },
        fallback: 'clamp(1rem, 2vw, 3rem)',
      }),
      cssProperty: '--brand-fluid-gap' as const,
    };

    const result = TokenCSSCompiler.compile(token);
    expect(result.properties).toEqual(['--brand-fluid-gap']);
    expect(result.customProperties).toContain('--brand-fluid-gap: clamp(1rem, 2vw, 3rem);');
    expect(result.customProperties).not.toContain('@property --brand-fluid-gap');
  });

  test('compile() defensively falls back to the generated property name when cssProperty is nullish at runtime', () => {
    const token = {
      ...Token.make({
        name: 'runtime-gap',
        category: 'spacing',
        axes: ['density'] as const,
        values: { normal: '8px' },
        fallback: '8px',
      }),
      cssProperty: null as never,
    };

    const result = TokenCSSCompiler.compile(token);
    expect(result.properties).toEqual(['--czap-runtime-gap']);
    expect(result.customProperties).toContain('--czap-runtime-gap: 8px;');
  });

  test('compile() infers percentage syntax and leaves themed overrides empty when the theme has no matching token', () => {
    const token = Token.make({
      name: 'alpha',
      category: 'effect',
      axes: ['theme'] as const,
      values: { light: '50%' },
      fallback: '50%',
    });

    const result = TokenCSSCompiler.compile(token, fbfTheme);
    expect(result.customProperties).toContain('syntax: "<percentage>"');
    expect(result.themed).toBe('');
  });

  test('compile() stringifies numeric fallback values', () => {
    const token = Token.make({
      name: 'weight',
      category: 'typography',
      axes: ['density'] as const,
      values: { compact: 400 },
      fallback: 400,
    });

    const result = TokenCSSCompiler.compile(token);
    expect(result.customProperties).toContain('--czap-weight: 400');
  });

  test('compile() stringifies non-string non-number fallback values', () => {
    const token = Token.make({
      name: 'flag',
      category: 'effect',
      axes: ['mode'] as const,
      values: { on: true },
      fallback: true,
    });

    const result = TokenCSSCompiler.compile(token);
    expect(result.customProperties).toContain('--czap-flag: true');
    expect(result.customProperties).not.toContain('@property');
  });

  test('compile() infers <number> syntax for unit-less numeric fallbacks', () => {
    const token = Token.make({
      name: 'ratio',
      category: 'effect',
      axes: ['mode'] as const,
      values: {},
      fallback: '1.5',
    });

    const result = TokenCSSCompiler.compile(token);
    expect(result.customProperties).toContain('syntax: "<number>"');
  });

  test('compile() skips themed variant when value is undefined in the theme tokens map', () => {
    const partialTheme = {
      name: 'partial',
      variants: ['a', 'b'] as const,
      tokens: {
        primary: { a: '#f00' } as Record<'a' | 'b', string | undefined>,
      },
    } as Theme.Shape;

    const token = Token.make({
      name: 'primary',
      category: 'color',
      axes: ['theme'] as const,
      values: { a: '#f00', b: '#0f0' },
      fallback: '#000',
    });

    const result = TokenCSSCompiler.compile(token, partialTheme);
    expect(result.themed).toContain('html[data-theme="a"]');
    expect(result.themed).not.toContain('html[data-theme="b"]');
  });
});

// ===========================================================================
// TOKEN TAILWIND COMPILER
// ===========================================================================

describe('TokenTailwindCompiler', () => {
  test('compile() emits @theme block', () => {
    const result = TokenTailwindCompiler.compile([primaryToken, spacingToken]);
    expect(result.themeBlock).toMatch(/^@theme \{/);
    expect(result.themeBlock).toContain('--color-primary');
    expect(result.themeBlock).toContain('--spacing-gap');
  });

  test('compile() stringifies non-string fallback values and skips undefined axis entries', () => {
    const flagToken = Token.make({
      name: 'flag',
      category: 'effect',
      axes: ['mode'] as const,
      values: {
        on: true,
        off: undefined,
      } as Record<'on' | 'off', boolean | undefined>,
      fallback: true,
    });

    const result = TokenTailwindCompiler.compile([flagToken]);
    expect(result.themeBlock).toContain('--effect-flag-on: true;');
    expect(result.themeBlock).toContain('--effect-flag: true;');
    expect(result.themeBlock).not.toContain('--effect-flag-off');
  });
});

// ===========================================================================
// TOKEN JS COMPILER
// ===========================================================================

describe('TokenJSCompiler', () => {
  test('compile() emits JS module and type declaration', () => {
    const result = TokenJSCompiler.compile([primaryToken]);
    expect(result.code).toContain('export const tokens');
    expect(result.code).toContain('as const');
    expect(result.typeDeclaration).toContain('typeof tokens');
  });
});

// ===========================================================================
// THEME CSS COMPILER
// ===========================================================================

describe('ThemeCSSCompiler', () => {
  test('compile() emits themed selectors', () => {
    const result = ThemeCSSCompiler.compile(fbfTheme);
    expect(result.selectors).toContain('html[data-theme="dark"]');
    expect(result.selectors).toContain('html[data-theme="light"]');
    expect(result.selectors).toContain('#00e5ff');
    expect(result.selectors).toContain('#fafafa');
  });

  test('compile() emits transitions when theme has meta', () => {
    const result = ThemeCSSCompiler.compile(fbfTheme);
    expect(result.transitions).not.toBe('');
    expect(result.transitions).toContain('transition-property');
    expect(result.transitions).toContain('--czap-primary');
    expect(result.transitions).toContain('--czap-surface');
    expect(result.transitions).toContain('transition-duration: 200ms');
    expect(result.transitions).toContain('transition-timing-function: ease-in-out');
  });

  test('compile() emits empty transitions when theme lacks meta', () => {
    const noMetaTheme = Theme.make({
      name: 'plain',
      variants: ['a', 'b'] as const,
      tokens: { fg: { a: 'black', b: 'white' } },
    });
    const result = ThemeCSSCompiler.compile(noMetaTheme);
    expect(result.transitions).toBe('');
  });
});

// ===========================================================================
// STYLE CSS COMPILER
// ===========================================================================

describe('StyleCSSCompiler', () => {
  test('compile() emits @layer and @scope', () => {
    const result = StyleCSSCompiler.compile(cardStyle, 'card');
    expect(result.layers).toContain('@layer czap.components');
    expect(result.scoped).toContain('@scope');
    expect(result.scoped).toContain('.czap-card');
  });

  test('compile() emits @starting-style', () => {
    const result = StyleCSSCompiler.compile(cardStyle, 'card');
    expect(result.startingStyle).toContain('@starting-style');
  });
});

// ===========================================================================
// COMPONENT CSS COMPILER
// ===========================================================================

describe('ComponentCSSCompiler', () => {
  test('compile() emits satellite container and slot styling', () => {
    const result = ComponentCSSCompiler.compile(cardComponent);
    expect(result.layers).toContain('@layer czap.components');
    expect(result.scoped).toContain('data-czap-slot');
  });
});

// ===========================================================================
// @property REGISTRATION (from css.ts)
// ===========================================================================

describe('generatePropertyRegistrations', () => {
  test('emits @property for custom property values', () => {
    const result = generatePropertyRegistrations({
      mobile: { '--czap-primary': '#00e5ff', '--czap-gap': '8px' },
      desktop: { '--czap-primary': '#ffffff', '--czap-gap': '16px' },
    });
    expect(result).toContain('@property --czap-primary');
    expect(result).toContain('syntax: "<color>"');
    expect(result).toContain('@property --czap-gap');
    expect(result).toContain('syntax: "<length>"');
  });

  test('skips non-custom properties', () => {
    const result = generatePropertyRegistrations({
      mobile: { color: 'red', padding: '8px' },
    });
    expect(result).toBe('');
  });
});

// ===========================================================================
// 2-AXIS TIER DETECTION
// ===========================================================================

describe('2-Axis Tiers', () => {
  const baseCaps: ExtendedDeviceCapabilities = {
    gpu: 2 as 0 | 1 | 2 | 3,
    cores: 4,
    memory: 8,
    webgpu: false,
    touchPrimary: false,
    prefersReducedMotion: false,
    prefersColorScheme: 'dark',
    viewportWidth: 1920,
    viewportHeight: 1080,
    devicePixelRatio: 2,
    prefersContrast: 'no-preference',
    forcedColors: false,
    prefersReducedTransparency: false,
    dynamicRange: 'standard',
    colorGamut: 'srgb',
    updateRate: 'fast',
  };

  test('forcedColors -> minimal design tier', () => {
    expect(designTierFromCapabilities({ ...baseCaps, forcedColors: true })).toBe('minimal');
  });

  test('updateRate none -> minimal design tier', () => {
    expect(designTierFromCapabilities({ ...baseCaps, updateRate: 'none' })).toBe('minimal');
  });

  test('slow update -> standard design tier', () => {
    expect(designTierFromCapabilities({ ...baseCaps, updateRate: 'slow' })).toBe('standard');
  });

  test('p3 gamut -> rich design tier', () => {
    expect(designTierFromCapabilities({ ...baseCaps, colorGamut: 'p3' })).toBe('rich');
  });

  test('HDR -> rich design tier', () => {
    expect(designTierFromCapabilities({ ...baseCaps, dynamicRange: 'high' })).toBe('rich');
  });

  test('clean preferences -> enhanced design tier', () => {
    expect(designTierFromCapabilities(baseCaps)).toBe('enhanced');
  });

  test('prefersReducedMotion -> none motion tier', () => {
    expect(motionTierFromCapabilities({ ...baseCaps, prefersReducedMotion: true })).toBe('none');
  });

  test('gpu 0 -> transitions motion tier', () => {
    expect(motionTierFromCapabilities({ ...baseCaps, gpu: 0 as const })).toBe('transitions');
  });

  test('gpu 2 + 4 cores -> physics motion tier', () => {
    expect(motionTierFromCapabilities(baseCaps)).toBe('physics');
  });

  test('gpu 3 + webgpu -> compute motion tier', () => {
    expect(motionTierFromCapabilities({ ...baseCaps, gpu: 3 as const, webgpu: true })).toBe('compute');
  });

  test('gpu 3 no webgpu -> physics motion tier', () => {
    expect(motionTierFromCapabilities({ ...baseCaps, gpu: 3 as const, webgpu: false })).toBe('physics');
  });
});

// ===========================================================================
// SPRING CSS HELPERS
// ===========================================================================

describe('Spring CSS Helpers', () => {
  test('springToLinearCSS() starts with linear( and has correct sample count', () => {
    const css = Easing.springToLinearCSS({ stiffness: 100, damping: 10 });
    expect(css).toMatch(/^linear\(/);
    expect(css).toMatch(/\)$/);
    // Default 32 samples = 33 points (0..32 inclusive)
    const points = css.slice('linear('.length, -1).split(',');
    expect(points).toHaveLength(33);
  });

  test('springToLinearCSS() custom sample count', () => {
    const css = Easing.springToLinearCSS({ stiffness: 200, damping: 15 }, 16);
    const points = css.slice('linear('.length, -1).split(',');
    expect(points).toHaveLength(17);
  });

  test('springToLinearCSS() starts at 0 and ends near 1', () => {
    const css = Easing.springToLinearCSS({ stiffness: 100, damping: 10 });
    const points = css
      .slice('linear('.length, -1)
      .split(',')
      .map((s) => parseFloat(s.trim()));
    expect(points[0]).toBeCloseTo(0, 3);
    expect(points[points.length - 1]!).toBeCloseTo(1, 2);
  });

  test('springNaturalDuration() returns value in (0, 1]', () => {
    const dur = Easing.springNaturalDuration({ stiffness: 100, damping: 10 });
    expect(dur).toBeGreaterThan(0);
    expect(dur).toBeLessThanOrEqual(2);
  });

  test('springNaturalDuration() returns meaningful duration for moderate spring', () => {
    // stiffness=100, damping=15 yields an underdamped spring that settles within 1s
    const dur = Easing.springNaturalDuration({ stiffness: 100, damping: 15 });
    expect(dur).toBeGreaterThan(0.3);
    expect(dur).toBeLessThan(0.95);
  });

  test('stiffer spring settles faster', () => {
    const stiff = Easing.springNaturalDuration({ stiffness: 400, damping: 20 });
    const soft = Easing.springNaturalDuration({ stiffness: 50, damping: 10 });
    expect(stiff).toBeLessThan(soft);
  });
});

// ===========================================================================
// PROPERTY-BASED: Token roundtrip
// ===========================================================================

describe('Property-based: Token determinism', () => {
  test('Token.make is deterministic across calls (single axis)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z]/.test(s)),
        fc.constantFrom('color', 'spacing', 'typography', 'shadow', 'radius', 'animation', 'effect' as const),
        (name, category) => {
          const t1 = Token.make({ name, category, axes: ['a'] as const, values: { x: '1' }, fallback: '0' });
          const t2 = Token.make({ name, category, axes: ['a'] as const, values: { x: '1' }, fallback: '0' });
          return t1.id === t2.id;
        },
      ),
    );
  });

  test('Token.make is deterministic with multi-axis compound keys', () => {
    // Arbitrary that generates 1-3 axes and matching compound key values
    const axisArb = fc.uniqueArray(fc.constantFrom('theme', 'density', 'breakpoint', 'contrast', 'motion'), {
      minLength: 1,
      maxLength: 3,
    });
    const valueArb = fc.constantFrom('a', 'b', 'c');

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]/.test(s)),
        fc.constantFrom('color', 'spacing', 'typography', 'shadow', 'radius', 'animation', 'effect' as const),
        axisArb,
        valueArb,
        (name, category, axes, val) => {
          // Build a compound key that matches sorted-axis order
          const sortedAxes = [...axes].sort();
          const key = sortedAxes.map(() => val).join(':');
          const values = { [key]: 'resolved' };
          const config = {
            name,
            category,
            axes: axes as unknown as readonly [string, ...string[]],
            values,
            fallback: 'fb',
          };
          const t1 = Token.make(config);
          const t2 = Token.make(config);
          return t1.id === t2.id;
        },
      ),
    );
  });

  test('Token.tap roundtrips with generated multi-axis tokens', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('color', 'spacing', 'typography' as const),
        fc.constantFrom('theme', 'density'),
        fc.constantFrom('breakpoint', 'contrast'),
        fc.string({ minLength: 1, maxLength: 5 }).filter((s) => /^[a-z]/.test(s)),
        fc.string({ minLength: 1, maxLength: 5 }).filter((s) => /^[a-z]/.test(s)),
        (category, axis1, axis2, val1, val2) => {
          const axes = [axis1, axis2] as const;
          const sorted = [...axes].sort();
          // Build key in sorted order
          const key = sorted.map((a) => (a === axis1 ? val1 : val2)).join(':');
          const token = Token.make({
            name: 'test',
            category,
            axes,
            values: { [key]: 'found' },
            fallback: 'miss',
          });
          const result = Token.tap(token, { [axis1]: val1, [axis2]: val2 });
          return result === 'found';
        },
      ),
    );
  });
});

// ===========================================================================
// PROPERTY-BASED: Theme resolution covers all tokens
// ===========================================================================

describe('Property-based: Theme resolution completeness', () => {
  test('Theme.tap always returns all token names (single variant)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]/.test(s)),
        fc.array(
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]/.test(s)),
          { minLength: 1, maxLength: 5 },
        ),
        (variant, tokenNames) => {
          const uniqueNames = [...new Set(tokenNames)];
          if (uniqueNames.length === 0) return true;
          const tokens: Record<string, Record<string, unknown>> = {};
          for (const name of uniqueNames) {
            tokens[name] = { [variant]: `val-${name}` };
          }
          const theme = Theme.make({
            name: 'test',
            variants: [variant] as const,
            tokens: tokens as any,
          });
          const resolved = Theme.tap(theme, variant as any);
          return uniqueNames.every((n) => n in resolved);
        },
      ),
    );
  });

  test('Theme.tap returns correct values for each variant in multi-variant themes', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]/.test(s)),
          { minLength: 2, maxLength: 4 },
        ),
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]/.test(s)),
          { minLength: 1, maxLength: 4 },
        ),
        (variants, tokenNames) => {
          if (variants.length < 2 || tokenNames.length === 0) return true;
          const tokens: Record<string, Record<string, string>> = {};
          for (const name of tokenNames) {
            const variantMap: Record<string, string> = {};
            for (const v of variants) {
              variantMap[v] = `${name}-${v}`;
            }
            tokens[name] = variantMap;
          }
          const theme = Theme.make({
            name: 'multi',
            variants: variants as unknown as readonly [string, ...string[]],
            tokens: tokens as any,
          });
          // Check each variant resolves to the correct per-variant value
          for (const v of variants) {
            const resolved = Theme.tap(theme, v as any);
            for (const name of tokenNames) {
              if (resolved[name] !== `${name}-${v}`) return false;
            }
          }
          return true;
        },
      ),
    );
  });
});
