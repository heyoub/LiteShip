/**
 * GLSLCompiler -- boundary -> GLSL uniform declarations + bindUniforms helper.
 *
 * Property: type stability (if ANY value is float/negative, ALL values for that key promote to float).
 * Property: uniform name determinism (same input -> same output, always).
 * Property: state define indices are sequential 0..N-1.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Boundary } from '@czap/core';
import { GLSLCompiler } from '@czap/compiler';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const widthBoundary = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1024, 'desktop'],
  ] as const,
});

const simpleBoundary = Boundary.make({
  input: 'brightness',
  at: [
    [0, 'dark'],
    [128, 'light'],
  ] as const,
});

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

describe('GLSLCompiler.compile', () => {
  test('produces defines for each state + STATE_COUNT', () => {
    const result = GLSLCompiler.compile(widthBoundary, {
      mobile: { columns: 1 },
      tablet: { columns: 2 },
      desktop: { columns: 3 },
    });

    expect(result.defines).toHaveLength(4); // 3 states + STATE_COUNT
    expect(result.defines[0]!.name).toBe('STATE_MOBILE');
    expect(result.defines[0]!.value).toBe('0');
    expect(result.defines[1]!.name).toBe('STATE_TABLET');
    expect(result.defines[1]!.value).toBe('1');
    expect(result.defines[2]!.name).toBe('STATE_DESKTOP');
    expect(result.defines[2]!.value).toBe('2');
    expect(result.defines[3]!.name).toBe('STATE_COUNT');
    expect(result.defines[3]!.value).toBe('3');
  });

  test('produces u_state uniform + one per value key', () => {
    const result = GLSLCompiler.compile(widthBoundary, {
      mobile: { columns: 1, gap: 8 },
      tablet: { columns: 2, gap: 16 },
      desktop: { columns: 3, gap: 24 },
    });

    expect(result.uniforms[0]!.name).toBe('u_state');
    expect(result.uniforms[0]!.type).toBe('int');
    expect(result.uniforms.find((u) => u.name === 'u_columns')).toBeDefined();
    expect(result.uniforms.find((u) => u.name === 'u_gap')).toBeDefined();
  });

  test('all-integer values infer as int', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { opacity: 1 },
      light: { opacity: 0 },
    });

    const opacityUniform = result.uniforms.find((u) => u.name === 'u_opacity');
    expect(opacityUniform!.type).toBe('int');
  });

  test('float values promote type to float', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { opacity: 0.3 },
      light: { opacity: 1.0 },
    });

    const opacityUniform = result.uniforms.find((u) => u.name === 'u_opacity');
    expect(opacityUniform!.type).toBe('float');
  });

  test('negative integer promotes type to float', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { offset: -10 },
      light: { offset: 10 },
    });

    const offsetUniform = result.uniforms.find((u) => u.name === 'u_offset');
    expect(offsetUniform!.type).toBe('float');
  });

  test('camelCase converts to snake_case with u_ prefix', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { borderRadius: 4 },
      light: { borderRadius: 8 },
    });

    expect(result.uniforms.find((u) => u.name === 'u_border_radius')).toBeDefined();
  });

  test('kebab-case converts to snake_case with u_ prefix', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { 'font-size': 14 },
      light: { 'font-size': 18 },
    });

    expect(result.uniforms.find((u) => u.name === 'u_font_size')).toBeDefined();
  });

  test('uniformValues contains u_state = 0 and last state values', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { x: 10 },
      light: { x: 20 },
    });

    expect(result.uniformValues['u_state']).toBe(0);
    expect(result.uniformValues['u_x']).toBe(20); // last state wins
  });

  test('empty states produce only u_state uniform', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: {},
      light: {},
    });

    expect(result.uniforms).toHaveLength(1);
    expect(result.uniforms[0]!.name).toBe('u_state');
  });

  test('mixed keys across states produces union of all keys', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { a: 1 },
      light: { b: 2 },
    });

    expect(result.uniforms.find((u) => u.name === 'u_a')).toBeDefined();
    expect(result.uniforms.find((u) => u.name === 'u_b')).toBeDefined();
  });

  test('bindUniforms uses uniform1i for int, uniform1f for float', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { count: 1, ratio: 0.5 },
      light: { count: 2, ratio: 0.8 },
    });

    expect(result.bindUniforms).toContain('uniform1i');
    expect(result.bindUniforms).toContain('uniform1f');
  });
});

// ---------------------------------------------------------------------------
// serialize()
// ---------------------------------------------------------------------------

describe('GLSLCompiler.serialize', () => {
  test('includes define and uniform declarations', () => {
    const result = GLSLCompiler.compile(simpleBoundary, {
      dark: { x: 1 },
      light: { x: 2 },
    });
    const serialized = GLSLCompiler.serialize(result);

    expect(serialized).toContain('#define STATE_DARK 0');
    expect(serialized).toContain('#define STATE_LIGHT 1');
    expect(serialized).toContain('uniform int u_state;');
    expect(serialized).toContain('uniform int u_x;');
    expect(serialized).toContain('function bindUniforms');
  });

  test('omits inline comments when metadata comments are undefined', () => {
    const serialized = GLSLCompiler.serialize({
      declarations: ['uniform int u_state;'],
      defines: [],
      uniforms: [{ name: 'u_state', type: 'int' }],
      uniformValues: { u_state: 0 },
      comments: {},
      bindUniforms: 'function bindUniforms() {}',
    });

    expect(serialized).toContain('uniform int u_state;');
    expect(serialized).not.toContain('uniform int u_state; //');
  });
});

// ---------------------------------------------------------------------------
// Property-based: type stability
// ---------------------------------------------------------------------------

describe('GLSLCompiler properties', () => {
  test('type stability: float presence promotes entire key to float', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 0, max: 100 }).map((n) => n + 0.5), // ensure truly non-integer
        (intVal, floatVal) => {
          const result = GLSLCompiler.compile(simpleBoundary, {
            dark: { value: intVal },
            light: { value: floatVal },
          });
          const uniform = result.uniforms.find((u) => u.name === 'u_value');
          expect(uniform!.type).toBe('float');
        },
      ),
    );
  });

  test('state define indices are sequential', () => {
    const result = GLSLCompiler.compile(widthBoundary, {
      mobile: { x: 1 },
      tablet: { x: 2 },
      desktop: { x: 3 },
    });

    const stateDefines = result.defines.filter((d) => d.name !== 'STATE_COUNT');
    stateDefines.forEach((d, i) => {
      expect(d.value).toBe(String(i));
    });
  });

  test('compile is deterministic (same input -> same output)', () => {
    const states = { dark: { x: 1, y: 2.5 }, light: { x: 3, y: 4.5 } };
    const a = GLSLCompiler.compile(simpleBoundary, states);
    const b = GLSLCompiler.compile(simpleBoundary, states);

    expect(a.declarations).toBe(b.declarations);
    expect(a.bindUniforms).toBe(b.bindUniforms);
    expect(a.uniformValues).toEqual(b.uniformValues);
  });
});
