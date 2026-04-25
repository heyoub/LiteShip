/**
 * Compiler package smoke test -- verify all 5 compiler targets route correctly.
 */

import { describe, test, expect } from 'vitest';
import { Boundary } from '@czap/core';
import { dispatch, GLSLCompiler, WGSLCompiler, ARIACompiler, AIManifestCompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width',
  at: [
    [0, 'sm'],
    [768, 'lg'],
  ] as const,
});

describe('compiler smoke', () => {
  test('GLSLCompiler.compile produces uniforms', () => {
    const result = GLSLCompiler.compile(boundary, {
      sm: { columns: 1 },
      lg: { columns: 3 },
    });
    expect(result.uniforms.length).toBeGreaterThan(0);
  });

  test('WGSLCompiler.compile produces struct', () => {
    const result = WGSLCompiler.compile(boundary, {
      sm: { columns: 1 },
      lg: { columns: 3 },
    });
    expect(result.structs.length).toBeGreaterThan(0);
  });

  test('ARIACompiler.compile produces attributes', () => {
    const result = ARIACompiler.compile(
      boundary,
      { sm: { 'aria-label': 'Small' }, lg: { 'aria-label': 'Large' } },
      'sm',
    );
    expect(result.currentAttributes['aria-label']).toBe('Small');
  });

  test('AIManifestCompiler.compile produces result', () => {
    const result = AIManifestCompiler.compile({
      version: '1.0',
      dimensions: {},
      slots: {},
      actions: {},
      constraints: [],
    });
    expect(result.systemPrompt).toContain('1.0');
  });

  test('dispatch routes glsl target', () => {
    expect(dispatch({ _tag: 'GLSLCompiler', boundary, states: { sm: { x: 1 }, lg: { x: 2 } } }).target).toBe('glsl');
  });

  test('dispatch routes wgsl target', () => {
    expect(dispatch({ _tag: 'WGSLCompiler', boundary, states: { sm: { x: 1 }, lg: { x: 2 } } }).target).toBe('wgsl');
  });

  test('dispatch routes aria target', () => {
    expect(dispatch({ _tag: 'ARIACompiler', boundary, states: { states: { sm: {}, lg: {} }, currentState: 'sm' } }).target).toBe('aria');
  });

  test('dispatch routes ai target', () => {
    expect(
      dispatch({ _tag: 'AICompiler', manifest: { version: '1.0', dimensions: {}, slots: {}, actions: {}, constraints: [] } }).target,
    ).toBe('ai');
  });
});
