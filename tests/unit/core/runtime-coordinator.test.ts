import { describe, expect, test } from 'vitest';
import { RuntimeCoordinator } from '@czap/core';

describe('RuntimeCoordinator', () => {
  test('exposes a stable phase plan and topological order', () => {
    const runtime = RuntimeCoordinator.create({ name: 'runtime-test' });

    expect(runtime.plan.name).toBe('runtime-test');
    expect(runtime.phases).toEqual([
      'compute-discrete',
      'compute-blend',
      'emit-css',
      'emit-glsl',
      'emit-aria',
    ]);
  });

  test('tracks registered quantizers in dense stores', () => {
    const runtime = RuntimeCoordinator.create({ capacity: 8 });

    runtime.registerQuantizer('layout', ['mobile', 'tablet', 'desktop']);
    expect(runtime.applyState('layout', 'tablet')).toBe(1);
    expect(runtime.applyState('layout', 'desktop')).toBe(2);
    runtime.markDirty('layout');
    runtime.markDirty('layout');

    expect(runtime.hasQuantizer('layout')).toBe(true);
    expect(runtime.getStateIndex('layout')).toBe(2);
    expect(runtime.getDirtyEpoch('layout')).toBe(3);
    expect(runtime.registeredNames()).toEqual(['layout']);
    expect(Array.from(runtime.stores.stateIndex.view())).toEqual([2]);
    expect(Array.from(runtime.stores.dirtyEpoch.view())).toEqual([3]);
  });

  test('removing a quantizer clears runtime bookkeeping', () => {
    const runtime = RuntimeCoordinator.create({ capacity: 4 });

    runtime.registerQuantizer('theme', ['light', 'dark']);
    runtime.setState('theme', 'dark');
    runtime.removeQuantizer('theme');

    expect(runtime.hasQuantizer('theme')).toBe(false);
    expect(runtime.getStateIndex('theme')).toBe(0);
    expect(runtime.getDirtyEpoch('theme')).toBe(0);
    expect(runtime.registeredNames()).toEqual([]);
    expect(runtime.stores.stateIndex.count).toBe(0);
    expect(runtime.stores.dirtyEpoch.count).toBe(0);
  });

  test('reuses registered entities and ignores unknown state transitions safely', () => {
    const runtime = RuntimeCoordinator.create({ name: 'custom-runtime', capacity: 4 });

    const first = runtime.registerQuantizer('layout', ['mobile', 'desktop']);
    const second = runtime.registerQuantizer('layout', ['mobile', 'desktop']);
    runtime.setState('layout', 'unknown');
    runtime.setState('missing', 'desktop');
    runtime.markDirty('missing');

    expect(first).toBe(second);
    expect(runtime.plan.name).toBe('custom-runtime');
    expect(runtime.getStateIndex('layout')).toBe(0);
    expect(runtime.getDirtyEpoch('missing')).toBe(0);
  });

  test('reset seeds registrations and clears stale runtime bookkeeping in one step', () => {
    const runtime = RuntimeCoordinator.create({ capacity: 8 });

    runtime.registerQuantizer('layout', ['mobile', 'tablet']);
    runtime.setState('layout', 'tablet');
    runtime.markDirty('layout');
    runtime.registerQuantizer('theme', ['light', 'dark']);

    runtime.reset([
      { name: 'density', states: ['compact', 'comfortable', 'spacious'] },
      { name: 'theme', states: ['light', 'dark'] },
    ]);

    expect(runtime.registeredNames()).toEqual(['density', 'theme']);
    expect(runtime.hasQuantizer('layout')).toBe(false);
    expect(runtime.getStateIndex('density')).toBe(0);
    expect(runtime.getDirtyEpoch('density')).toBe(1);
    expect(runtime.getStateIndex('theme')).toBe(0);
    expect(runtime.getDirtyEpoch('theme')).toBe(1);
  });

  test('reset without registrations clears existing entities and removeQuantizer stays a no-op for missing names', () => {
    const runtime = RuntimeCoordinator.create({ capacity: 4 });

    runtime.registerQuantizer('layout', ['mobile', 'desktop']);
    runtime.reset();
    runtime.removeQuantizer('missing');

    expect(runtime.registeredNames()).toEqual([]);
    expect(runtime.stores.stateIndex.count).toBe(0);
    expect(runtime.stores.dirtyEpoch.count).toBe(0);
  });

  test('registered quantizers default state and dirty bookkeeping to zero until updated', () => {
    const runtime = RuntimeCoordinator.create({ capacity: 4 });

    runtime.registerQuantizer('theme', ['light', 'dark']);

    expect(runtime.getStateIndex('theme')).toBe(0);
    expect(runtime.getDirtyEpoch('theme')).toBe(1);

    runtime.markDirty('theme');

    expect(runtime.getDirtyEpoch('theme')).toBe(2);
  });

  test('applyState falls back to index zero for unknown states on registered quantizers', () => {
    const runtime = RuntimeCoordinator.create({ capacity: 4 });

    runtime.registerQuantizer('density', ['compact', 'comfortable']);

    expect(runtime.applyState('density', 'missing')).toBe(0);
    expect(runtime.getStateIndex('density')).toBe(0);
  });
});
