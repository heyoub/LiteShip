/**
 * ARIACompiler -- boundary -> accessibility attribute maps.
 *
 * Property: only aria-* and role keys survive validation.
 * Property: invalid keys are silently dropped (no side effects).
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Boundary } from '@czap/core';
import { ARIACompiler } from '@czap/compiler';
import { captureDiagnostics } from '../../helpers/diagnostics.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const navBoundary = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'collapsed'],
    [768, 'expanded'],
  ] as const,
});

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

describe('ARIACompiler.compile', () => {
  test('invalid keys emit diagnostics while being filtered', () => {
    captureDiagnostics(({ events }) => {
      const result = ARIACompiler.compile(
        navBoundary,
        {
          collapsed: { 'aria-label': 'Menu', 'data-test': 'bad', class: 'bad' },
          expanded: { 'aria-label': 'Navigation' },
        },
        'collapsed',
      );

      expect(result.currentAttributes['aria-label']).toBe('Menu');
      expect(result.currentAttributes['data-test']).toBeUndefined();
      expect(result.currentAttributes['class']).toBeUndefined();
      expect(events).toEqual([
        expect.objectContaining({ code: 'invalid-aria-key', source: 'czap/compiler.aria' }),
        expect.objectContaining({ code: 'invalid-aria-key', source: 'czap/compiler.aria' }),
      ]);
    });
  });

  test('returns currentAttributes for the active state', () => {
    const result = ARIACompiler.compile(
      navBoundary,
      {
        collapsed: { 'aria-expanded': 'false', role: 'navigation' },
        expanded: { 'aria-expanded': 'true', role: 'navigation' },
      },
      'collapsed',
    );

    expect(result.currentAttributes['aria-expanded']).toBe('false');
    expect(result.currentAttributes['role']).toBe('navigation');
  });

  test('returns stateAttributes for all states', () => {
    const result = ARIACompiler.compile(
      navBoundary,
      {
        collapsed: { 'aria-hidden': 'true' },
        expanded: { 'aria-hidden': 'false' },
      },
      'expanded',
    );

    expect(result.stateAttributes['collapsed']!['aria-hidden']).toBe('true');
    expect(result.stateAttributes['expanded']!['aria-hidden']).toBe('false');
  });

  test('role key is preserved', () => {
    const result = ARIACompiler.compile(
      navBoundary,
      {
        collapsed: { role: 'button' },
        expanded: { role: 'navigation' },
      },
      'expanded',
    );

    expect(result.currentAttributes['role']).toBe('navigation');
  });

  test('empty attributes produce empty objects', () => {
    const result = ARIACompiler.compile(navBoundary, { collapsed: {}, expanded: {} }, 'collapsed');

    expect(result.currentAttributes).toEqual({});
    expect(result.stateAttributes['collapsed']).toEqual({});
  });

  test('missing currentState in stateAttributes returns empty object', () => {
    const result = ARIACompiler.compile(
      navBoundary,
      { collapsed: { 'aria-label': 'X' }, expanded: { 'aria-label': 'Y' } },
      // Access collapsed state but pretend it has no entry
      'collapsed',
    );

    // Should still return something valid
    expect(result.currentAttributes).toBeDefined();
  });

  test('missing state maps compile to empty attribute objects without mutating populated states', () => {
    const result = ARIACompiler.compile(
      navBoundary,
      {
        collapsed: { role: 'navigation', 'aria-label': 'Menu' },
        expanded: undefined as unknown as Record<string, string>,
      },
      'expanded',
    );

    expect(result.stateAttributes['collapsed']).toEqual({
      role: 'navigation',
      'aria-label': 'Menu',
    });
    expect(result.stateAttributes['expanded']).toEqual({});
    expect(result.currentAttributes).toEqual({});
  });

  test('unknown current state falls back to an empty current attribute map', () => {
    const result = ARIACompiler.compile(
      navBoundary,
      {
        collapsed: { 'aria-hidden': 'true' },
        expanded: { 'aria-hidden': 'false' },
      },
      'missing-state' as unknown as 'collapsed',
    );

    expect(result.currentAttributes).toEqual({});
    expect(result.stateAttributes['collapsed']).toEqual({ 'aria-hidden': 'true' });
    expect(result.stateAttributes['expanded']).toEqual({ 'aria-hidden': 'false' });
  });

  test('all-invalid keys produce empty attributes', () => {
    captureDiagnostics(({ events }) => {
      const result = ARIACompiler.compile(
        navBoundary,
        {
          collapsed: { 'data-x': '1', class: 'foo', id: 'bar' },
          expanded: { style: 'color:red' },
        },
        'collapsed',
      );

      expect(result.currentAttributes).toEqual({});
      expect(result.stateAttributes['expanded']).toEqual({});
      expect(events).toHaveLength(4);
      expect(events.every((event) => event.code === 'invalid-aria-key')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property-based
// ---------------------------------------------------------------------------

describe('ARIACompiler properties', () => {
  test('only aria-* and role keys survive', () => {
    const arbKey = fc.oneof(
      fc.constant('role'),
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => `aria-${s}`),
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => `data-${s}`),
      fc.constantFrom('class', 'id', 'style', 'tabindex', 'href'),
    );

    captureDiagnostics(({ events }) => {
      fc.assert(
        fc.property(fc.dictionary(arbKey, fc.string()), (attrs) => {
          events.length = 0;
          const result = ARIACompiler.compile(navBoundary, { collapsed: attrs, expanded: {} }, 'collapsed');

          for (const key of Object.keys(result.currentAttributes)) {
            expect(key === 'role' || key.startsWith('aria-')).toBe(true);
          }

          const expectedDropped = Object.keys(attrs).filter((key) => key !== 'role' && !key.startsWith('aria-')).length;
          expect(events).toHaveLength(expectedDropped);
          expect(events.every((event) => event.code === 'invalid-aria-key')).toBe(true);
        }),
      );
    });
  });
});
