/**
 * Component test: CompositorWorker off-thread compositor.
 *
 * Tests the main-thread API for the CompositorWorker using MockWorker.
 * Validates message protocol, listener management, and cleanup.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Diagnostics } from '@czap/core';
import { CompositorWorker } from '@czap/worker';
import { prepareRegistrationsForTransfer } from '../../packages/worker/src/compositor-startup.js';
import { MockWorker } from '../helpers/mock-worker.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let restoreWorker: () => void;
let diagnosticEvents: Diagnostics.Event[] = [];

// We also need Blob and URL.createObjectURL for the inline worker script
let origBlob: typeof Blob | undefined;
let origURL: typeof URL | undefined;

beforeEach(() => {
  restoreWorker = MockWorker.install();
  const { sink, events } = Diagnostics.createBufferSink();
  Diagnostics.setSink(sink);
  diagnosticEvents = events;

  // Mock Blob and URL.createObjectURL for inline worker script
  if (typeof globalThis.Blob === 'undefined') {
    (globalThis as any).Blob = class MockBlob {
      parts: any[];
      options: any;
      constructor(parts: any[], options?: any) {
        this.parts = parts;
        this.options = options;
      }
    };
  }

  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:mock-url';
  URL.revokeObjectURL = () => {};

  // Store for cleanup
  (globalThis as any).__origCreateObjectURL = origCreateObjectURL;
  (globalThis as any).__origRevokeObjectURL = origRevokeObjectURL;
});

afterEach(() => {
  Diagnostics.reset();
  restoreWorker();
  if ((globalThis as any).__origCreateObjectURL) {
    URL.createObjectURL = (globalThis as any).__origCreateObjectURL;
    URL.revokeObjectURL = (globalThis as any).__origRevokeObjectURL;
  }
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for threshold array expectations — matches the Float64Array runtime shape sent by prepareRegistrationForTransfer. */
const f64 = (...values: number[]): Float64Array => Float64Array.from(values);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompositorWorker', () => {
  const markReady = (worker: MockWorker): void => {
    worker.simulateMessage({ type: 'ready' });
  };

  test('create() produces a worker and sends init message', () => {
    const cw = CompositorWorker.create();

    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0]!;

    // Should have sent an init message
    expect(worker.postedMessages.length).toBeGreaterThanOrEqual(1);
    expect(worker.postedMessages[0].data).toEqual(expect.objectContaining({ type: 'init' }));
  });

  test('prepareRegistrationsForTransfer converts thresholds to Float64Array buffers', () => {
    const prepared = prepareRegistrationsForTransfer([
      {
        name: 'width',
        boundaryId: 'boundary-1',
        states: ['mobile', 'tablet', 'desktop'],
        thresholds: [0, 768, 1024],
      },
    ]);

    expect(prepared.registrations).toEqual([
      expect.objectContaining({
        name: 'width',
        thresholds: f64(0, 768, 1024),
      }),
    ]);
    expect(prepared.buffers).toHaveLength(1);
    expect(prepared.buffers[0]).toBeInstanceOf(ArrayBuffer);
    expect(prepared.buffers[0]?.byteLength).toBe(3 * 8); // 3 Float64 values
  });

  test('reuses the cached blob url when multiple cold workers are created under the same script environment', () => {
    const createObjectUrl = vi.fn(() => 'blob:shared-compositor-url');
    URL.createObjectURL = createObjectUrl;

    const first = CompositorWorker.create();
    const second = CompositorWorker.create();

    expect(MockWorker.instances).toHaveLength(2);
    expect(MockWorker.instances[0]?.url).toBe('blob:shared-compositor-url');
    expect(MockWorker.instances[1]?.url).toBe('blob:shared-compositor-url');
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    first.dispose();
    second.dispose();
  });

  test('keeps startup registrations local until the first compute while retaining the ready event', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });

    expect(worker.postedMessages.map((entry) => (entry.data as { type?: string }).type)).toEqual(['init']);

    markReady(worker);
    expect(cw.runtime.hasQuantizer('width')).toBe(true);
    expect(cw.runtime.getDirtyEpoch('width')).toBeGreaterThanOrEqual(1);
  });

  test('removeQuantizer batches worker updates into apply-updates messages', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);
    cw.requestCompute();
    worker.postedMessages.length = 0;

    cw.removeQuantizer('width');
    await Promise.resolve();

    const msg = worker.postedMessages.at(-1);
    expect(msg.data).toEqual(
      expect.objectContaining({
        type: 'apply-updates',
        updates: [{ type: 'remove-quantizer', name: 'width' }],
      }),
    );
  });

  test('evaluate batches worker updates into apply-updates messages', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);
    cw.requestCompute();
    worker.postedMessages.length = 0;

    cw.evaluate('width', 800);
    await Promise.resolve();

    const msg = worker.postedMessages.at(-1);
    expect(msg.data).toEqual(
      expect.objectContaining({
        type: 'apply-updates',
        updates: [{ type: 'evaluate', name: 'width', value: 800 }],
      }),
    );
  });

  test('setBlendWeights batches worker updates into apply-updates messages', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);
    cw.requestCompute();
    worker.postedMessages.length = 0;

    cw.setBlendWeights('width', { mobile: 0.3, tablet: 0.7, desktop: 0 });
    await Promise.resolve();

    const msg = worker.postedMessages.at(-1);
    expect(msg.data).toEqual(
      expect.objectContaining({
        type: 'apply-updates',
        updates: [{ type: 'set-blend', name: 'width', weights: { mobile: 0.3, tablet: 0.7, desktop: 0 } }],
      }),
    );
  });

  test('requestCompute keeps the first startup compute on the combined startup path', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);
    cw.evaluate('width', 800);

    cw.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [],
        updates: [{ type: 'evaluate', name: 'width', value: 800 }],
      },
    });
  });

  test('bootstrapResolvedState ignores empty state batches without sending worker messages', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const initialMessageCount = worker.postedMessages.length;

    cw.bootstrapResolvedState([]);

    expect(worker.postedMessages).toHaveLength(initialMessageCount);
  });

  test('startup cleanup strips queued ghost updates before the first combined startup compute', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.evaluate('ghost', 800);
    cw.setBlendWeights('ghost', { ghost: 1 });
    cw.removeQuantizer('ghost');
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [],
        updates: [],
      },
    });
  });

  test('startup evaluation folds a queued pre-registration evaluate into the registration override once the quantizer exists', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.evaluate('width', 800);
    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.evaluate('width', 800);
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            initialState: 'tablet',
          },
        ],
        updates: [],
      },
    });
  });

  test('startup blend overrides fold a queued pre-registration override into the registration once the quantizer exists', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.setBlendWeights('width', { mobile: 1 });
    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.setBlendWeights('width', { mobile: 0.4, tablet: 0.6 });
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            blendWeights: { mobile: 0.4, tablet: 0.6 },
          },
        ],
        updates: [],
      },
    });
  });

  test('startup addQuantizer keeps duplicate registrations as a single startup registration', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const boundary = {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    } as const;

    cw.addQuantizer('width', boundary);
    cw.addQuantizer('width', boundary);
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
          },
        ],
        updates: [],
      },
    });
  });

  test('startup addQuantizer does not collapse changed thresholds behind the duplicate-registration fast path', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 640, 960],
    });
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 640, 960),
          },
        ],
        updates: [],
      },
    });
  });

  test('first state callback stays asynchronous and separate from request dispatch', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);

    const received: any[] = [];
    cw.onState((state) => received.push(state));

    cw.requestCompute();
    expect(received).toHaveLength(0);

    worker.simulateMessage({
      type: 'state',
      state: {
        discrete: { width: 'tablet' },
        blend: { width: { mobile: 0, tablet: 1, desktop: 0 } },
        outputs: { css: {}, glsl: {}, aria: {} },
      },
    });

    expect(received).toHaveLength(1);
  });

  test('coalesces multiple steady-state updates into a single worker flush', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);
    cw.requestCompute();
    worker.postedMessages.length = 0;

    cw.evaluate('width', 800);
    cw.setBlendWeights('width', { mobile: 0.2, tablet: 0.8, desktop: 0 });
    cw.removeQuantizer('stale');

    await Promise.resolve();

    const updateMessages = worker.postedMessages.filter((entry) => (entry.data as { type?: string }).type === 'apply-updates');
    expect(updateMessages).toHaveLength(1);
    expect(updateMessages[0]?.data).toEqual({
      type: 'apply-updates',
      updates: [
        { type: 'evaluate', name: 'width', value: 800 },
        { type: 'set-blend', name: 'width', weights: { mobile: 0.2, tablet: 0.8, desktop: 0 } },
        { type: 'remove-quantizer', name: 'stale' },
      ],
    });
  });

  test('steady-state addQuantizer replaces an existing boundary with an immediate add-quantizer message', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const baseBoundary = {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    } as const;

    cw.addQuantizer('width', baseBoundary);
    markReady(worker);
    cw.requestCompute();
    worker.postedMessages.length = 0;

    cw.addQuantizer('width', {
      id: 'boundary-2',
      states: ['mobile', 'desktop'],
      thresholds: [0, 900],
    });

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'add-quantizer',
      name: 'width',
      boundaryId: 'boundary-2',
      states: ['mobile', 'desktop'],
      thresholds: f64(0, 900),
    });
  });

  test('flushes startup registrations, updates, and compute without waiting for ready', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.evaluate('width', 800);
    cw.setBlendWeights('width', { mobile: 0, tablet: 1, desktop: 0 });
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.slice(-1).map((entry) => entry.data)).toEqual([
      {
        type: 'startup-compute',
        packet: {
          bootstrapMode: 'cold',
          registrations: [
            {
              name: 'width',
              boundaryId: 'boundary-1',
              states: ['mobile', 'tablet', 'desktop'],
              thresholds: f64(0, 768, 1024),
              initialState: 'tablet',
              blendWeights: { mobile: 0, tablet: 1, desktop: 0 },
            },
          ],
          updates: [],
        },
      },
    ]);

    markReady(worker);
  });

  test('startup compute omits default-state overrides when evaluation lands on the registration default', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.evaluate('width', 0);
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.slice(-1).map((entry) => entry.data)).toEqual([
      {
        type: 'startup-compute',
        packet: {
          bootstrapMode: 'cold',
          registrations: [
            {
              name: 'width',
              boundaryId: 'boundary-1',
              states: ['mobile', 'tablet', 'desktop'],
              thresholds: f64(0, 768, 1024),
            },
          ],
          updates: [],
        },
      },
    ]);
  });

  test('startup evaluation falls back to the default state when values stay below thresholds or state tables are shorter than thresholds', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-width',
      states: ['mobile', 'tablet'],
      thresholds: [640, 1024],
    });
    cw.addQuantizer('density', {
      id: 'boundary-density',
      states: ['cozy'],
      thresholds: [0, 100],
    });

    cw.evaluate('width', 320);
    cw.evaluate('density', 150);
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-width',
            states: ['mobile', 'tablet'],
            thresholds: f64(640, 1024),
          },
          {
            name: 'density',
            boundaryId: 'boundary-density',
            states: ['cozy'],
            thresholds: f64(0, 100),
          },
        ],
        updates: [],
      },
    });
  });

  test('startup blend overrides replace prior weight shapes before the first compute', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.setBlendWeights('width', { mobile: 1, tablet: 0, desktop: 0 });
    cw.setBlendWeights('width', { mobile: 0.4, tablet: 0.6 });
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            blendWeights: { mobile: 0.4, tablet: 0.6 },
          },
        ],
        updates: [],
      },
    });
  });

  test('onState receives state messages from worker', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });

    const received: any[] = [];
    cw.onState((state) => received.push(state));

    // Simulate worker sending state message
    const mockState = {
      discrete: { width: 'tablet' },
      blend: { width: { mobile: 0, tablet: 1, desktop: 0 } },
      outputs: { css: {}, glsl: {}, aria: {} },
    };
    worker.simulateMessage({ type: 'state', state: mockState });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(mockState);
    expect(cw.runtime.getStateIndex('width')).toBe(1);
  });

  test('onMetrics receives metrics messages from worker', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    const received: Array<{ fps: number; budgetUsed: number }> = [];
    cw.onMetrics((fps, budgetUsed) => received.push({ fps, budgetUsed }));

    worker.simulateMessage({ type: 'metrics', fps: 60, budgetUsed: 8.5 });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ fps: 60, budgetUsed: 8.5 });
  });

  test('onMetrics returns unsubscribe function', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    const received: Array<{ fps: number; budgetUsed: number }> = [];
    const unsub = cw.onMetrics((fps, budgetUsed) => received.push({ fps, budgetUsed }));

    worker.simulateMessage({ type: 'metrics', fps: 60, budgetUsed: 8.5 });
    expect(received).toEqual([{ fps: 60, budgetUsed: 8.5 }]);

    unsub();

    worker.simulateMessage({ type: 'metrics', fps: 58, budgetUsed: 9.1 });
    expect(received).toEqual([{ fps: 60, budgetUsed: 8.5 }]);
  });

  test('onState returns unsubscribe function', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    const received: any[] = [];
    const unsub = cw.onState((state) => received.push(state));

    const mockState = { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } };
    worker.simulateMessage({ type: 'state', state: mockState });
    expect(received).toHaveLength(1);

    // Unsubscribe
    unsub();

    worker.simulateMessage({ type: 'state', state: mockState });
    expect(received).toHaveLength(1); // No additional
  });

  test('dispose parks the compositor worker for warm reuse without leaking prior runtime state', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.requestCompute();

    cw.dispose();

    const disposeMsg = worker.postedMessages.find((m) => (m.data as any)?.type === 'dispose');
    expect(disposeMsg).toBeUndefined();
    expect(worker.terminated).toBe(false);

    const warm = CompositorWorker.create();
    expect(MockWorker.instances).toHaveLength(1);
    expect(warm.runtime.hasQuantizer('width')).toBe(false);

    warm.dispose();
  });

  test('dispose tears down the worker instead of parking it when the blob-url environment changes', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const originalCreateObjectURL = URL.createObjectURL;

    URL.createObjectURL = () => 'blob:changed-url';

    try {
      cw.dispose();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }

    const disposeMsg = worker.postedMessages.find((message) => (message.data as { type?: string }).type === 'dispose');
    expect(disposeMsg?.data).toEqual({ type: 'dispose' });
    expect(worker.terminated).toBe(true);
  });

  test('dispose tears down a second worker when a standby lease is already parked', () => {
    const first = CompositorWorker.create();
    const firstWorker = MockWorker.instances[0]!;
    first.dispose();

    const second = CompositorWorker.create();
    const third = CompositorWorker.create();
    const thirdWorker = MockWorker.instances[1]!;

    second.dispose();
    third.dispose();

    const disposeMsg = thirdWorker.postedMessages.find((message) => (message.data as { type?: string }).type === 'dispose');
    expect(firstWorker.terminated).toBe(false);
    expect(disposeMsg?.data).toEqual({ type: 'dispose' });
    expect(thirdWorker.terminated).toBe(true);
  });

  test('pagehide cleanup on a fresh module disposes the parked standby lease and revokes the cached blob url once', async () => {
    vi.resetModules();

    const cleanupCallbacks: Array<() => void> = [];
    const createObjectUrl = vi.fn(() => 'blob:fresh-cleanup-url');
    const revokeObjectUrl = vi.fn();

    vi.stubGlobal(
      'addEventListener',
      ((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'pagehide') {
          cleanupCallbacks.push(() => {
            if (typeof listener === 'function') {
              listener(new Event('pagehide'));
            } else {
              listener.handleEvent(new Event('pagehide'));
            }
          });
        }
      }) as typeof globalThis.addEventListener,
    );
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;

    const countBefore = MockWorker.instances.length;
    const { CompositorWorker: FreshCompositorWorker } = await import('../../packages/worker/src/compositor-worker.js');

    const first = FreshCompositorWorker.create();
    const firstWorker = MockWorker.instances.at(-1)!;
    first.dispose();

    expect(cleanupCallbacks).toHaveLength(1);
    cleanupCallbacks[0]!();
    cleanupCallbacks[0]!();

    expect(firstWorker.terminated).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:fresh-cleanup-url');

    const second = FreshCompositorWorker.create();
    expect(MockWorker.instances.length).toBe(countBefore + 2);
    expect(createObjectUrl).toHaveBeenCalledTimes(2);

    second.dispose();
  });

  test('process exit cleanup is registered when addEventListener is unavailable on a fresh module', async () => {
    vi.resetModules();

    const exitOnce = vi.fn();
    vi.stubGlobal('addEventListener', undefined as unknown as typeof globalThis.addEventListener);
    vi.stubGlobal('process', { once: exitOnce } as unknown as NodeJS.Process);

    const createObjectUrl = vi.fn(() => 'blob:process-cleanup-url');
    URL.createObjectURL = createObjectUrl;

    const { CompositorWorker: FreshCompositorWorker } = await import('../../packages/worker/src/compositor-worker.js');
    const worker = FreshCompositorWorker.create();

    expect(exitOnce).toHaveBeenCalledWith('exit', expect.any(Function));

    worker.dispose();
  });

  test('changing pool capacity disposes the parked standby lease before creating a replacement worker', () => {
    const first = CompositorWorker.create({ poolCapacity: 64 });
    const parkedWorker = MockWorker.instances[0]!;
    first.dispose();

    const replacement = CompositorWorker.create({ poolCapacity: 8 });
    const replacementWorker = MockWorker.instances[1]!;

    expect(
      parkedWorker.postedMessages.find((message) => (message.data as { type?: string }).type === 'dispose'),
    ).toBeUndefined();
    expect(parkedWorker.terminated).toBe(true);
    expect(replacementWorker.terminated).toBe(false);

    replacement.dispose();
  });

  test('warm snapshot rebuild path reuses the aligned runtime before startup-compute when startup overrides diverge', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    expect(MockWorker.instances).toHaveLength(1);
    const resetSpy = vi.spyOn(warm.runtime, 'reset');

    warm.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    warm.evaluate('width', 800);
    warm.setBlendWeights('width', { mobile: 0, tablet: 1, desktop: 0 });
    warm.requestCompute();

    expect(resetSpy).not.toHaveBeenCalled();
    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            initialState: 'tablet',
            blendWeights: { mobile: 0, tablet: 1, desktop: 0 },
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot rebuild path resets the runtime only when coordinator state has drifted from the startup seed', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    const resetSpy = vi.spyOn(warm.runtime, 'reset');

    warm.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    warm.runtime.removeQuantizer('width');
    warm.evaluate('width', 800);
    warm.setBlendWeights('width', { mobile: 0, tablet: 1, desktop: 0 });
    warm.requestCompute();

    expect(resetSpy).toHaveBeenCalledOnce();
    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            initialState: 'tablet',
            blendWeights: { mobile: 0, tablet: 1, desktop: 0 },
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot rebuild path resets the runtime when registered names match but quantizer lookup disagrees', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const snapshotBoundary = {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    } as const;

    first.addQuantizer('width', snapshotBoundary);
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    const resetSpy = vi.spyOn(warm.runtime, 'reset');

    warm.addQuantizer('width', {
      id: 'boundary-2',
      states: ['mobile', 'desktop'],
      thresholds: [0, 900],
    });
    warm.addQuantizer('width', snapshotBoundary);

    vi.spyOn(warm.runtime, 'registeredNames').mockReturnValue(['width']);
    vi.spyOn(warm.runtime, 'hasQuantizer').mockImplementation((name: string) => name !== 'width');

    warm.requestCompute();

    expect(resetSpy).toHaveBeenCalledOnce();
    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot path reuses the parked worker without forcing a rebuild when startup state still matches', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    const resetSpy = vi.spyOn(warm.runtime, 'reset');

    warm.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    warm.requestCompute();

    expect(resetSpy).not.toHaveBeenCalled();
    expect(worker.postedMessages.slice(-2).map((entry) => (entry.data as { type: string }).type)).toEqual([
      'warm-reset',
      'compute',
    ]);
  });

  test('warm snapshot duplicate registrations confirm the parked snapshot instead of rebuilding it', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const boundary = {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    } as const;

    first.addQuantizer('width', boundary);
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.addQuantizer('width', boundary);
    warm.addQuantizer('width', boundary);
    warm.requestCompute();

    expect(worker.postedMessages.map((entry) => (entry.data as { type?: string }).type)).toEqual([
      'warm-reset',
      'compute',
    ]);
  });

  test('warm snapshot evaluate without re-registering forces a rebuild packet with an evaluate update', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.evaluate('width', 800);
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
          },
        ],
        updates: [{ type: 'evaluate', name: 'width', value: 800 }],
      },
    });
  });

  test('warm snapshot updates are folded back into the registration when the quantizer is later confirmed', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const boundary = {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    } as const;

    first.addQuantizer('width', boundary);
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.evaluate('width', 800);
    warm.addQuantizer('width', boundary);
    warm.evaluate('width', 820);
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            initialState: 'tablet',
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot blend override without re-registering folds the override into the rebuild registration', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.setBlendWeights('width', { mobile: 0, tablet: 1, desktop: 0 });
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            blendWeights: { mobile: 0, tablet: 1, desktop: 0 },
          },
        ],
        updates: [],
      },
    });
  });

  test('startup blend overrides replace prior key sets before the first compute', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.setBlendWeights('width', { mobile: 1 });
    cw.setBlendWeights('width', { mobile: 0.5, tablet: 0.5 });
    cw.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            blendWeights: { mobile: 0.5, tablet: 0.5 },
          },
        ],
        updates: [],
      },
    });
  });

  test('startup blend overrides replace prior values with the same keys before the first compute', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.setBlendWeights('width', { mobile: 0.2, tablet: 0.8 });
    cw.setBlendWeights('width', { mobile: 0.6, tablet: 0.4 });
    cw.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            blendWeights: { mobile: 0.6, tablet: 0.4 },
          },
        ],
        updates: [],
      },
    });
  });

  test('startup blend overrides do not rebuild the registration when the next object is equal by value', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    cw.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    cw.setBlendWeights('width', { mobile: 0.6, tablet: 0.4 });
    cw.setBlendWeights('width', { mobile: 0.6, tablet: 0.4 });
    cw.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
            blendWeights: { mobile: 0.6, tablet: 0.4 },
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot registration drift before first compute marks the parked snapshot for rebuild', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.addQuantizer('width', {
      id: 'boundary-2',
      states: ['mobile', 'desktop'],
      thresholds: [0, 900],
    });
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-2',
            states: ['mobile', 'desktop'],
            thresholds: f64(0, 900),
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot re-registration back to the parked boundary reuses the existing runtime registration', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const snapshotBoundary = {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    } as const;

    first.addQuantizer('width', snapshotBoundary);
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    const registerSpy = vi.spyOn(warm.runtime, 'registerQuantizer');
    worker.postedMessages.length = 0;

    warm.addQuantizer('width', {
      id: 'boundary-2',
      states: ['mobile', 'desktop'],
      thresholds: [0, 900],
    });
    warm.addQuantizer('width', snapshotBoundary);
    warm.requestCompute();

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [
          {
            name: 'width',
            boundaryId: 'boundary-1',
            states: ['mobile', 'tablet', 'desktop'],
            thresholds: f64(0, 768, 1024),
          },
        ],
        updates: [],
      },
    });
  });

  test('warm snapshot removal before first compute rebuilds without the removed registration', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.removeQuantizer('width');
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [],
        updates: [],
      },
    });
  });

  test('warm snapshot removal clears queued startup updates for the removed quantizer', () => {
    const first = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    first.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    first.requestCompute();
    first.dispose();

    const warm = CompositorWorker.create();
    worker.postedMessages.length = 0;

    warm.evaluate('width', 800);
    warm.removeQuantizer('width');
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'rebuild',
        registrations: [],
        updates: [],
      },
    });
  });

  test('startup packet filters leave unrelated queued startup updates intact', () => {
    const warm = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    worker.postedMessages.length = 0;

    warm.evaluate('ghost', 12);
    warm.addQuantizer('width', {
      id: 'boundary-1',
      states: ['mobile', 'tablet', 'desktop'],
      thresholds: [0, 768, 1024],
    });
    warm.evaluate('width', 900);
    warm.removeQuantizer('width');
    warm.requestCompute();

    expect(worker.postedMessages.at(-1)?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [],
        updates: [{ type: 'evaluate', name: 'ghost', value: 12 }],
      },
    });
  });

  test('requestCompute flushes pending steady-state updates before sending compute', async () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    markReady(worker);
    cw.requestCompute();
    worker.postedMessages.length = 0;

    cw.evaluate('width', 820);
    cw.requestCompute();
    await Promise.resolve();

    expect(worker.postedMessages.map((entry) => entry.data)).toEqual([
      {
        type: 'apply-updates',
        updates: [{ type: 'evaluate', name: 'width', value: 820 }],
      },
      { type: 'compute' },
    ]);
  });

  test('ignores malformed worker messages and tolerates state payloads without discrete maps', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const received: unknown[] = [];
    cw.onState((state) => received.push(state));

    cw.requestCompute();
    worker.simulateMessage({});
    worker.simulateMessage({
      type: 'state',
      state: {
        blend: {},
        outputs: { css: {}, glsl: {}, aria: {} },
      },
    });
    worker.simulateMessage({
      type: 'state',
      state: {
        blend: {},
        outputs: { css: {}, glsl: {}, aria: {} },
      },
    });

    expect(received).toHaveLength(2);
    expect(cw.runtime.registeredNames()).toEqual([]);
  });

  test('dispose clears all listeners', () => {
    const cw = CompositorWorker.create();
    const received: any[] = [];
    cw.onState((state) => received.push(state));
    cw.onMetrics(() => {});

    cw.dispose();

    // Messages after dispose should not trigger callbacks
    // (listeners are cleared before terminate)
    const mockState = { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } };
    // Worker is terminated, but if we had pre-dispose messages queued:
    expect(received).toHaveLength(0);
  });

  test('dispose tolerates worker implementations that do not expose removeEventListener', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    (worker as { removeEventListener?: unknown }).removeEventListener = undefined;

    expect(() => cw.dispose()).not.toThrow();
  });

  test('falls back to Date.now timing and registers node cleanup through process.once when pagehide hooks are unavailable', async () => {
    const originalAddEventListener = globalThis.addEventListener;
    const exitSpy = vi.fn();

    vi.resetModules();
    vi.stubGlobal('performance', undefined as never);
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: undefined,
    });

    const processRecord = globalThis as typeof globalThis & {
      process?: { once?: (event: string, fn: () => void) => void };
    };
    const originalProcess = processRecord.process;
    processRecord.process = { once: exitSpy };

    try {
      const { CompositorWorker: FreshCompositorWorker } = await import('../../packages/worker/src/compositor-worker.js');
      const fresh = FreshCompositorWorker.create();

      expect(exitSpy).toHaveBeenCalledWith('exit', expect.any(Function));

      fresh.dispose();
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: originalAddEventListener,
      });
      processRecord.process = originalProcess;
    }
  });

  test('skips node cleanup registration when pagehide hooks and process are both unavailable', async () => {
    const originalAddEventListener = globalThis.addEventListener;

    vi.resetModules();
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: undefined,
    });

    // Stub process without `once` so compositor sees it as unavailable for
    // cleanup registration, but keep enough shape for Effect's module-level
    // `process.platform` read to succeed during dynamic import.
    vi.stubGlobal('process', { platform: 'linux' } as never);

    try {
      const { CompositorWorker: FreshCompositorWorker } = await import('../../packages/worker/src/compositor-worker.js');
      expect(() => FreshCompositorWorker.create().dispose()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: originalAddEventListener,
      });
      vi.unstubAllGlobals();
    }
  });

  test('tolerates process objects without once when pagehide hooks are unavailable', async () => {
    const originalAddEventListener = globalThis.addEventListener;

    vi.resetModules();
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: undefined,
    });

    const processRecord = globalThis as typeof globalThis & { process?: unknown };
    const originalProcess = processRecord.process;
    processRecord.process = {};

    try {
      const { CompositorWorker: FreshCompositorWorker } = await import('../../packages/worker/src/compositor-worker.js');
      expect(() => FreshCompositorWorker.create().dispose()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: originalAddEventListener,
      });
      if (originalProcess === undefined) {
        delete processRecord.process;
      } else {
        processRecord.process = originalProcess;
      }
      vi.unstubAllGlobals();
    }
  });

  test('state and metrics subscriptions can be unsubscribed before delivery without leaking callbacks', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;
    const stateSpy = vi.fn();
    const metricsSpy = vi.fn();

    const offState = cw.onState(stateSpy);
    const offMetrics = cw.onMetrics(metricsSpy);
    offState();
    offMetrics();

    worker.simulateMessage({
      type: 'state',
      state: { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } },
    });
    worker.simulateMessage({ type: 'metrics', fps: 60, budgetUsed: 1.2 });

    expect(stateSpy).not.toHaveBeenCalled();
    expect(metricsSpy).not.toHaveBeenCalled();
  });

  test('routes worker and message errors through diagnostics', () => {
    const cw = CompositorWorker.create();
    const worker = MockWorker.instances[0]!;

    worker.simulateMessage({ type: 'error', message: 'compositor failed' });
    worker.simulateError('boom');
    cw.dispose();

    expect(diagnosticEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          source: 'czap/worker.compositor-worker',
          code: 'worker-message-error',
          message: 'Compositor worker reported an error.',
          detail: 'compositor failed',
        }),
        expect.objectContaining({
          level: 'error',
          source: 'czap/worker.compositor-worker',
          code: 'worker-unhandled-error',
          message: 'Compositor worker raised an unhandled error.',
          detail: 'boom',
        }),
      ]),
    );
  });

  describe('residual hotspot coverage', () => {
    test('warm-snapshot startup preserves snapshot-backed registrations without redundant bootstrap churn', () => {
      const first = CompositorWorker.create();
      const worker = MockWorker.instances[0]!;
      const boundary = {
        id: 'boundary-1',
        states: ['mobile', 'tablet', 'desktop'],
        thresholds: [0, 768, 1024],
      } as const;

      first.addQuantizer('width', boundary);
      first.requestCompute();
      first.dispose();

      const warm = CompositorWorker.create();
      worker.postedMessages.length = 0;

      warm.addQuantizer('width', boundary);
      warm.requestCompute();

      expect(worker.postedMessages.map((entry) => (entry.data as { type?: string }).type)).toEqual([
        'warm-reset',
        'compute',
      ]);
    });

    test('rebuild mode reseeds runtime state exactly once when warm parity has drifted', () => {
      const first = CompositorWorker.create();
      const worker = MockWorker.instances[0]!;

      first.addQuantizer('width', {
        id: 'boundary-1',
        states: ['mobile', 'tablet', 'desktop'],
        thresholds: [0, 768, 1024],
      });
      first.requestCompute();
      first.dispose();

      const warm = CompositorWorker.create();
      const resetSpy = vi.spyOn(warm.runtime, 'reset');

      warm.addQuantizer('width', {
        id: 'boundary-1',
        states: ['mobile', 'tablet', 'desktop'],
        thresholds: [0, 768, 1024],
      });
      warm.runtime.removeQuantizer('width');
      warm.evaluate('width', 800);
      warm.setBlendWeights('width', { mobile: 0, tablet: 1, desktop: 0 });
      warm.requestCompute();

      expect(resetSpy).toHaveBeenCalledTimes(1);
      expect(worker.postedMessages.at(-1)?.data).toEqual({
        type: 'startup-compute',
        packet: {
          bootstrapMode: 'rebuild',
          registrations: [
            {
              name: 'width',
              boundaryId: 'boundary-1',
              states: ['mobile', 'tablet', 'desktop'],
              thresholds: f64(0, 768, 1024),
              initialState: 'tablet',
              blendWeights: { mobile: 0, tablet: 1, desktop: 0 },
            },
          ],
          updates: [],
        },
      });
    });

    test('resolved-state-ack drains listeners only when dispatch timing exists', () => {
      const cw = CompositorWorker.create();
      const worker = MockWorker.instances[0]!;
      const ackSpy = vi.fn();

      cw.onResolvedStateAck(ackSpy);
      worker.simulateMessage({
        type: 'resolved-state-ack',
        generation: 1,
        states: [{ name: 'layout', state: 'tablet' }],
        additionalOutputsChanged: false,
      });

      expect(ackSpy).not.toHaveBeenCalled();

      cw.bootstrapResolvedState([{ name: 'layout', state: 'tablet', generation: 2 }]);
      worker.simulateMessage({
        type: 'resolved-state-ack',
        generation: 2,
        states: [{ name: 'layout', state: 'tablet' }],
        additionalOutputsChanged: false,
      });

      expect(ackSpy).toHaveBeenCalledTimes(1);
      expect(ackSpy).toHaveBeenCalledWith({
        type: 'resolved-state-ack',
        generation: 2,
        states: [{ name: 'layout', state: 'tablet' }],
        additionalOutputsChanged: false,
      });
    });

    test('metrics and error side channels do not corrupt startup mode or queued bootstrap state', () => {
      const cw = CompositorWorker.create();
      const worker = MockWorker.instances[0]!;
      const metricsSpy = vi.fn();

      cw.onMetrics(metricsSpy);
      cw.addQuantizer('width', {
        id: 'boundary-1',
        states: ['mobile', 'tablet', 'desktop'],
        thresholds: [0, 768, 1024],
      });

      worker.simulateMessage({ type: 'metrics', fps: 60, budgetUsed: 1.5 });
      worker.simulateMessage({ type: 'error', message: 'side-channel only' });
      cw.requestCompute();

      expect(metricsSpy).toHaveBeenCalledWith(60, 1.5);
      expect(worker.postedMessages.at(-1)?.data).toEqual({
        type: 'startup-compute',
        packet: {
          bootstrapMode: 'cold',
          registrations: [
            {
              name: 'width',
              boundaryId: 'boundary-1',
              states: ['mobile', 'tablet', 'desktop'],
              thresholds: f64(0, 768, 1024),
            },
          ],
          updates: [],
        },
      });
      expect(diagnosticEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'worker-message-error',
            detail: 'side-channel only',
          }),
        ]),
      );
    });

    test('unknown and malformed worker messages remain benign during steady-state processing', async () => {
      const cw = CompositorWorker.create();
      const worker = MockWorker.instances[0]!;

      markReady(worker);
      cw.requestCompute();
      worker.postedMessages.length = 0;

      worker.simulateMessage({ type: 'mystery-event', payload: true } as never);
      worker.simulateMessage({} as never);

      cw.evaluate('width', 800);
      await Promise.resolve();

      expect(worker.postedMessages).toEqual([
        {
          data: {
            type: 'apply-updates',
            updates: [{ type: 'evaluate', name: 'width', value: 800 }],
          },
          transfer: [],
        },
      ]);
    });
  });
});
