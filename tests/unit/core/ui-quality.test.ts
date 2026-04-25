/**
 * UIQuality -- ABR tier transitions as buffer fills/drains.
 */

import { describe, test, expect } from 'vitest';
import { UIQuality } from '@czap/core';

describe('UIQuality', () => {
  test('make creates evaluator', () => {
    const q = UIQuality.make();
    expect(q).toBeDefined();
    expect(q.boundary).toBeDefined();
  });

  test('empty buffer yields skeleton tier', () => {
    const q = UIQuality.make();
    const tier = q.evaluate(0.0);
    expect(tier).toBe('skeleton');
  });

  test('full buffer with high device tier yields rich tier', () => {
    const q = UIQuality.make();
    // Push through all tiers; use 'compute' device tier (1.0) so composite is high enough
    q.evaluate(0.0, 'compute');
    q.evaluate(0.2, 'compute');
    q.evaluate(0.4, 'compute');
    q.evaluate(0.7, 'compute');
    const tier = q.evaluate(1.0, 'compute');
    expect(tier).toBe('rich');
  });

  test('tier degrades as buffer drains', () => {
    const q = UIQuality.make();
    // Start at high occupancy with high device tier
    q.evaluate(0.0, 'compute');
    q.evaluate(0.3, 'compute');
    q.evaluate(0.5, 'compute');
    q.evaluate(0.7, 'compute');
    q.evaluate(1.0, 'compute');
    const rich = q.evaluate(0.95, 'compute');
    expect(rich).toBe('rich');

    // Drain significantly — low device tier so composite is truly low
    const degraded = q.evaluate(0.0, 'none');
    expect(degraded).toBe('skeleton');
  });

  test('hysteresis prevents flickering at boundary', () => {
    const q = UIQuality.make();
    // Get to text-only territory
    q.evaluate(0.0);
    const t1 = q.evaluate(0.22); // Above 0.15 threshold -> text-only

    // Oscillate slightly around threshold
    const t2 = q.evaluate(0.2);
    const t3 = q.evaluate(0.18);

    // Should stay stable due to hysteresis
    expect(t2).toBe(t1);
    expect(t3).toBe(t1);
  });

  test('device tier affects composite signal', () => {
    const q1 = UIQuality.make();
    const q2 = UIQuality.make();

    // Same buffer occupancy but different device capabilities
    const tier1 = q1.evaluate(0.4, 'none'); // Low device
    const tier2 = q2.evaluate(0.4, 'compute'); // High device

    // Higher device capability should result in equal or higher quality
    const tierOrder = ['skeleton', 'text-only', 'styled', 'interactive', 'rich'];
    expect(tierOrder.indexOf(tier2)).toBeGreaterThanOrEqual(tierOrder.indexOf(tier1));
  });

  test('boundary is exposed for inspection', () => {
    expect(UIQuality.boundary).toBeDefined();
    expect(UIQuality.boundary._tag).toBe('BoundaryDef');
    expect(UIQuality.boundary.states).toContain('skeleton');
    expect(UIQuality.boundary.states).toContain('rich');
  });
});
