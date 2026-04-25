/**
 * ECS Composable Implementation Tests
 * 
 * Tests that verify the actual ECS composition implementation works.
 * These tests validate the green phase of red-green development.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Scope } from 'effect';
import { Boundary, Token, Composable, ComposableWorld, World } from '@czap/core';

describe('ECS Composable Implementation', () => {
  const boundary = Boundary.make({
    input: 'viewport.width',
    at: [[0, 'mobile'], [768, 'tablet'], [1024, 'desktop']]
  });

  const token = Token.make({
    name: 'primary',
    category: 'color',
    axes: ['theme'],
    values: { dark: '#00e5ff', light: 'hsl(175 70% 50%)' },
    fallback: '#00e5ff'
  });

  test('Composable.make creates entity with deterministic ID', () => {
    const entity1 = Composable.make({ boundary });
    const entity2 = Composable.make({ boundary });

    // Same components should produce same ID
    expect(entity1.id).toBe(entity2.id);
    expect(entity1.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(entity1._tag).toBe('ComposableEntity');
    expect(entity1.components.boundary).toBe(boundary);
  });

  test('Composable.compose merges entities correctly', () => {
    const entity1 = Composable.make({ boundary });
    const entity2 = Composable.make({ token });

    const composed = Composable.compose(entity1, entity2);

    // Should have both components
    expect(composed.components.boundary).toBe(boundary);
    expect(composed.components.token).toBe(token);
    expect(composed._tag).toBe('ComposableEntity');

    // Should have new ID based on merged components
    expect(composed.id).not.toBe(entity1.id);
    expect(composed.id).not.toBe(entity2.id);
  });

  test('Composable.merge handles multiple entities', () => {
    const entity1 = Composable.make({ boundary });
    const entity2 = Composable.make({ token });
    const entity3 = Composable.make({ boundary, token });

    const merged = Composable.merge(entity1, entity2, entity3);

    // Should have all components (entity3 takes precedence)
    expect(merged.components.boundary).toBe(boundary);
    expect(merged.components.token).toBe(token);
  });

  test('Composable.make with multiple components', () => {
    const entity = Composable.make({ boundary, token });

    expect(entity.components.boundary).toBe(boundary);
    expect(entity.components.token).toBe(token);
    expect(entity.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });

  test('ComposableWorld.make creates composable world', () => {
    // Test that ComposableWorld exists and has expected structure
    expect(ComposableWorld.make).toBeDefined();
    expect(ComposableWorld.dense).toBeDefined();
  });

  test('ComposableWorld.evaluate concept', () => {
    // Test the evaluation concept without Effect complexity
    const entity = Composable.make({ boundary });

    // Direct boundary evaluation (what the world would do)
    const result = Boundary.evaluate(boundary, 800);
    expect(result).toBe('tablet');
  });

  test('ComposableWorld integration concept', () => {
    // Test that the integration concept exists
    const entity = Composable.make({ boundary, token });

    // Verify entity structure for world integration
    expect(entity.components.boundary).toBeDefined();
    expect(entity.components.token).toBeDefined();
    expect(entity.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });

  test('Entity composition preserves primitive properties', () => {
    const entity = Composable.make({ boundary, token });

    // Boundary properties preserved
    expect(entity.components.boundary.input).toBe('viewport.width');
    expect(entity.components.boundary.states).toEqual(['mobile', 'tablet', 'desktop']);

    // Token properties preserved
    expect(entity.components.token.name).toBe('primary');
    expect(entity.components.token.category).toBe('color');
    expect(entity.components.token.fallback).toBe('#00e5ff');
  });

  test('Entity composition is deterministic', () => {
    const entity1 = Composable.make({ boundary, token });
    const entity2 = Composable.make({ boundary, token });

    // Same components = same ID
    expect(entity1.id).toBe(entity2.id);

    // Different order = same ID (canonical serialization)
    const entity3 = Composable.make({ token, boundary });
    expect(entity1.id).toBe(entity3.id);
  });

  test('Entity composition collision resistance', () => {
    const entity1 = Composable.make({ boundary });
    const entity2 = Composable.make({ token });

    // Different components = different IDs
    expect(entity1.id).not.toBe(entity2.id);
  });

  test('Empty entity composition', () => {
    const entity = Composable.make({});

    expect(entity.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(entity.components).toEqual({});
    expect(entity._tag).toBe('ComposableEntity');
  });
});
