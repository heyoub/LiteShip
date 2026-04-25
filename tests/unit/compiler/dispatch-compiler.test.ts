/**
 * dispatch() -- tagged CompilerDef discriminated union.
 *
 * Smoke tests that each target routes correctly and returns
 * the right discriminated union shape.
 */

import { describe, test, expect } from 'vitest';
import { Boundary, Config } from '@czap/core';
import { dispatch } from '@czap/compiler';
import type { AIManifest, CompilerDef } from '@czap/compiler';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const boundary = Boundary.make({
  input: 'width',
  at: [
    [0, 'small'],
    [768, 'large'],
  ] as const,
});

const cssStates = {
  small: { 'font-size': '14px' },
  large: { 'font-size': '18px' },
};

const numericStates = {
  small: { columns: 1 },
  large: { columns: 3 },
};

const ariaInput = {
  states: {
    small: { 'aria-label': 'Compact' },
    large: { 'aria-label': 'Full' },
  },
  currentState: 'small',
};

const aiManifest: AIManifest = {
  version: '1.0',
  dimensions: {},
  slots: {},
  actions: {},
  constraints: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatch()', () => {
  test('CSSCompiler def returns { target: "css" }', () => {
    const result = dispatch({ _tag: 'CSSCompiler', boundary, states: cssStates });
    expect(result.target).toBe('css');
    expect(result.result).toBeDefined();
  });

  test('GLSLCompiler def returns { target: "glsl" }', () => {
    const result = dispatch({ _tag: 'GLSLCompiler', boundary, states: numericStates });
    expect(result.target).toBe('glsl');
    expect(result.result).toHaveProperty('declarations');
    expect(result.result).toHaveProperty('uniforms');
  });

  test('WGSLCompiler def returns { target: "wgsl" }', () => {
    const result = dispatch({ _tag: 'WGSLCompiler', boundary, states: numericStates });
    expect(result.target).toBe('wgsl');
    expect(result.result).toHaveProperty('structs');
    expect(result.result).toHaveProperty('bindings');
  });

  test('ARIACompiler def returns { target: "aria" }', () => {
    const result = dispatch({ _tag: 'ARIACompiler', boundary, states: ariaInput });
    expect(result.target).toBe('aria');
    expect(result.result).toHaveProperty('stateAttributes');
    expect(result.result).toHaveProperty('currentAttributes');
  });

  test('AICompiler def returns { target: "ai" }', () => {
    const result = dispatch({ _tag: 'AICompiler', manifest: aiManifest });
    expect(result.target).toBe('ai');
    expect(result.result).toHaveProperty('toolDefinitions');
    expect(result.result).toHaveProperty('systemPrompt');
  });

  test('ConfigCompiler def returns json string', () => {
    const cfg = Config.make({});
    const def: CompilerDef = { _tag: 'ConfigCompiler', config: cfg };
    const result = dispatch(def);
    expect(result.target).toBe('config');
    expect((result as { target: string; result: { json: string } }).result.json).toContain('ConfigDef');
  });
});
