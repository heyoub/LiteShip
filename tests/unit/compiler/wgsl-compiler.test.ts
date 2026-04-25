/**
 * WGSLCompiler -- boundary -> WGSL struct definitions + @group/@binding declarations.
 *
 * Property: type promotion (f32 > i32 > u32).
 * Property: struct name is PascalCase + "State" suffix.
 * Property: state_index field always present as u32.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Boundary } from '@czap/core';
import { WGSLCompiler } from '@czap/compiler';

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

describe('WGSLCompiler.compile', () => {
  test('struct name is PascalCase + State from input name', () => {
    const result = WGSLCompiler.compile(widthBoundary, {
      mobile: { columns: 1 },
      tablet: { columns: 2 },
      desktop: { columns: 3 },
    });

    expect(result.structs[0]!.name).toBe('ViewportWidthState');
  });

  test('struct always has state_index: u32 as first field', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { x: 1 },
      light: { x: 2 },
    });

    expect(result.structs[0]!.fields[0]).toEqual({ name: 'state_index', type: 'u32' });
  });

  test('all-positive-integer values infer as u32', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { count: 1 },
      light: { count: 2 },
    });

    const countField = result.structs[0]!.fields.find((f) => f.name === 'count');
    expect(countField!.type).toBe('u32');
  });

  test('negative integer values promote to i32', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { offset: -10 },
      light: { offset: 10 },
    });

    const offsetField = result.structs[0]!.fields.find((f) => f.name === 'offset');
    expect(offsetField!.type).toBe('i32');
  });

  test('float values promote to f32', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { ratio: 0.3 },
      light: { ratio: 0.7 },
    });

    const ratioField = result.structs[0]!.fields.find((f) => f.name === 'ratio');
    expect(ratioField!.type).toBe('f32');
  });

  test('camelCase field names convert to snake_case', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { borderRadius: 4 },
      light: { borderRadius: 8 },
    });

    expect(result.structs[0]!.fields.find((f) => f.name === 'border_radius')).toBeDefined();
  });

  test('single binding at @group(0) @binding(0)', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { x: 1 },
      light: { x: 2 },
    });

    expect(result.bindings).toHaveLength(1);
    expect(result.bindings[0]!.group).toBe(0);
    expect(result.bindings[0]!.binding).toBe(0);
    expect(result.bindings[0]!.name).toBe('boundary_state');
  });

  test('declarations contain state constants with u suffix', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { x: 1 },
      light: { x: 2 },
    });

    expect(result.declarations).toContain('const STATE_DARK: u32 = 0u;');
    expect(result.declarations).toContain('const STATE_LIGHT: u32 = 1u;');
    expect(result.declarations).toContain('const STATE_COUNT: u32 = 2u;');
  });

  test('bindingValues contains state_index = 0', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { x: 10 },
      light: { x: 20 },
    });

    expect(result.bindingValues['state_index']).toBe(0);
  });

  test('empty state values produce struct with only state_index', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: {},
      light: {},
    });

    expect(result.structs[0]!.fields).toHaveLength(1);
    expect(result.structs[0]!.fields[0]!.name).toBe('state_index');
  });

  test('mixed keys across states produce union of all fields', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { a: 1 },
      light: { b: 2 },
    });

    const fieldNames = result.structs[0]!.fields.map((f) => f.name);
    expect(fieldNames).toContain('a');
    expect(fieldNames).toContain('b');
  });

  test('skips missing state maps while still compiling observed fields', () => {
    const partialStates = {
      dark: { onlyDark: 1 },
    } as unknown as {
      dark: Record<string, number>;
      light: Record<string, number>;
    };

    const result = WGSLCompiler.compile(simpleBoundary, partialStates);

    expect(result.structs[0]!.fields).toEqual([
      { name: 'state_index', type: 'u32' },
      { name: 'only_dark', type: 'u32' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// serialize()
// ---------------------------------------------------------------------------

describe('WGSLCompiler.serialize', () => {
  test('returns declarations string', () => {
    const result = WGSLCompiler.compile(simpleBoundary, {
      dark: { x: 1 },
      light: { x: 2 },
    });
    const serialized = WGSLCompiler.serialize(result);

    expect(serialized).toBe(result.declarations);
    expect(serialized).toContain('struct');
    expect(serialized).toContain('@group(0) @binding(0)');
  });
});

// ---------------------------------------------------------------------------
// Property-based: type promotion hierarchy
// ---------------------------------------------------------------------------

describe('WGSLCompiler properties', () => {
  test('type promotion: f32 beats i32 beats u32', () => {
    fc.assert(
      fc.property(
        // Ensure truly non-integer floats by adding 0.5
        fc.integer({ min: 0, max: 100 }).map((n) => n + 0.5),
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 0, max: 100 }),
        (floatVal, negInt, posInt) => {
          // Float always wins
          const withFloat = WGSLCompiler.compile(simpleBoundary, {
            dark: { v: floatVal },
            light: { v: posInt },
          });
          expect(withFloat.structs[0]!.fields.find((f) => f.name === 'v')!.type).toBe('f32');

          // Negative int -> i32 (no float)
          const withNeg = WGSLCompiler.compile(simpleBoundary, {
            dark: { v: negInt },
            light: { v: posInt },
          });
          expect(withNeg.structs[0]!.fields.find((f) => f.name === 'v')!.type).toBe('i32');

          // All positive -> u32
          const allPos = WGSLCompiler.compile(simpleBoundary, {
            dark: { v: posInt },
            light: { v: posInt + 1 },
          });
          expect(allPos.structs[0]!.fields.find((f) => f.name === 'v')!.type).toBe('u32');
        },
      ),
    );
  });

  test('struct name generation is deterministic', () => {
    const a = WGSLCompiler.compile(widthBoundary, { mobile: {}, tablet: {}, desktop: {} });
    const b = WGSLCompiler.compile(widthBoundary, { mobile: {}, tablet: {}, desktop: {} });
    expect(a.structs[0]!.name).toBe(b.structs[0]!.name);
  });
});
