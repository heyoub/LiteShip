/**
 * Component test: WorkerHost main-thread coordinator.
 *
 * Tests canvas attachment, worker lifecycle, state forwarding,
 * and resource cleanup.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerHost } from '@czap/worker';
import { MockWorker } from '../helpers/mock-worker.js';
import { mockCanvas } from '../helpers/mock-dom.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let restoreWorker: () => void;

beforeEach(() => {
  restoreWorker = MockWorker.install();

  // Mock Blob and URL APIs for inline worker scripts
  if (typeof globalThis.Blob === 'undefined') {
    (globalThis as any).Blob = class MockBlob {
      constructor(
        public parts: any[],
        public options?: any,
      ) {}
    };
  }

  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:mock-url';
  URL.revokeObjectURL = () => {};
  (globalThis as any).__origURLCreate = origCreate;
  (globalThis as any).__origURLRevoke = origRevoke;
});

afterEach(() => {
  restoreWorker();
  if ((globalThis as any).__origURLCreate) {
    URL.createObjectURL = (globalThis as any).__origURLCreate;
    URL.revokeObjectURL = (globalThis as any).__origURLRevoke;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerHost', () => {
  const markCompositorReady = (): MockWorker => {
    const compositorWorker = MockWorker.instances[0]!;
    compositorWorker.simulateMessage({ type: 'ready' });
    return compositorWorker;
  };

  test('create() produces a host with compositor worker', () => {
    const host = WorkerHost.create();

    expect(host.compositor).toBeDefined();
    expect(host.renderer).toBeNull();

    // Should have created exactly one Worker (for compositor)
    expect(MockWorker.instances).toHaveLength(1);
  });

  test('attachCanvas creates render worker lazily', () => {
    const host = WorkerHost.create();
    const canvas = mockCanvas();

    expect(host.renderer).toBeNull();

    host.attachCanvas(canvas as any);

    // Should have created a second Worker (for renderer)
    expect(MockWorker.instances).toHaveLength(2);
    expect(host.renderer).not.toBeNull();
  });

  test('attachCanvas calls transferControlToOffscreen', () => {
    const host = WorkerHost.create();
    const canvas = mockCanvas();

    host.attachCanvas(canvas as any);

    expect(canvas._transferCalled).toBe(1);
  });

  test('attachCanvas reuses the same render worker across multiple canvases', () => {
    const host = WorkerHost.create();
    const firstCanvas = mockCanvas();
    const secondCanvas = mockCanvas();

    host.attachCanvas(firstCanvas as any);
    const renderer = host.renderer;
    host.attachCanvas(secondCanvas as any);

    expect(MockWorker.instances).toHaveLength(2);
    expect(host.renderer).toBe(renderer);
    expect(firstCanvas._transferCalled).toBe(1);
    expect(secondCanvas._transferCalled).toBe(1);
  });

  test('startRender without canvas throws', () => {
    const host = WorkerHost.create();

    expect(() =>
      host.startRender({
        fps: 30,
        durationMs: 1000 as any,
        width: 640,
        height: 480,
      }),
    ).toThrow(/no canvas attached/i);
  });

  test('startRender forwards to the render worker once a canvas is attached', () => {
    const host = WorkerHost.create();
    const canvas = mockCanvas();
    host.attachCanvas(canvas as any);

    host.startRender({
      fps: 30,
      durationMs: 1000 as any,
      width: 640,
      height: 480,
    });

    const renderWorker = MockWorker.instances[1]!;
    expect(renderWorker.postedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ type: 'start-render' }),
        }),
      ]),
    );
  });

  test('stopRender without canvas is a no-op', () => {
    const host = WorkerHost.create();
    // Should not throw
    host.stopRender();
  });

  test('stopRender forwards to the render worker when a canvas is attached', () => {
    const host = WorkerHost.create();
    const canvas = mockCanvas();
    host.attachCanvas(canvas as any);

    host.stopRender();

    const renderWorker = MockWorker.instances[1]!;
    expect(renderWorker.postedMessages).toEqual(
      expect.arrayContaining([expect.objectContaining({ data: expect.objectContaining({ type: 'stop-render' }) })]),
    );
  });

  test('onState subscribes to compositor state updates', () => {
    const host = WorkerHost.create();
    const compositorWorker = MockWorker.instances[0]!;

    const received: any[] = [];
    host.onState((state) => received.push(state));

    // Simulate compositor emitting a state
    const mockState = {
      discrete: { width: 'tablet' },
      blend: {},
      outputs: { css: {}, glsl: {}, aria: {} },
    };
    compositorWorker.simulateMessage({ type: 'state', state: mockState });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(mockState);
  });

  test('onState returns unsubscribe function', () => {
    const host = WorkerHost.create();
    const compositorWorker = MockWorker.instances[0]!;

    const received: any[] = [];
    const unsub = host.onState((state) => received.push(state));

    const mockState = { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } };
    compositorWorker.simulateMessage({ type: 'state', state: mockState });
    expect(received).toHaveLength(1);

    unsub();

    compositorWorker.simulateMessage({ type: 'state', state: mockState });
    expect(received).toHaveLength(1); // No additional
  });

  test('manual unsubscribe is idempotent and dispose does not re-run removed listeners', () => {
    const host = WorkerHost.create();
    const baseUnsub = host.onState(() => undefined);
    const unsub = vi.fn(() => baseUnsub());

    unsub();
    unsub();
    host.dispose();

    expect(unsub).toHaveBeenCalledTimes(2);
  });

  test('dispose terminates the render worker and parks the compositor worker for reuse', () => {
    const host = WorkerHost.create();
    const canvas = mockCanvas();
    host.attachCanvas(canvas as any);

    const compositorWorker = MockWorker.instances[0]!;
    const renderWorker = MockWorker.instances[1]!;

    host.dispose();

    expect(compositorWorker.terminated).toBe(false);
    expect(renderWorker.terminated).toBe(true);
  });

  test('dispose clears state listeners', () => {
    const host = WorkerHost.create();
    const compositorWorker = MockWorker.instances[0]!;

    const received: any[] = [];
    host.onState((state) => received.push(state));

    host.dispose();

    // After dispose, state messages should not trigger callback
    const mockState = { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } };
    compositorWorker.simulateMessage({ type: 'state', state: mockState });
    expect(received).toHaveLength(0);
  });

  test('dispose without a renderer parks the compositor worker for warm reuse', () => {
    const host = WorkerHost.create();
    const compositorWorker = MockWorker.instances[0]!;

    host.dispose();

    expect(compositorWorker.terminated).toBe(false);
    expect(host.renderer).toBeNull();
  });

  test('recreating a host reuses the parked compositor worker without leaking listeners or quantizers', () => {
    const firstHost = WorkerHost.create();
    const compositorWorker = markCompositorReady();
    const firstReceived: any[] = [];
    firstHost.onState((state) => firstReceived.push(state));
    firstHost.compositor.addQuantizer('layout', {
      id: 'layout',
      states: ['compact', 'comfortable', 'wide'],
      thresholds: [0, 640, 1024],
    });

    expect(firstHost.compositor.runtime.hasQuantizer('layout')).toBe(true);

    firstHost.dispose();
    expect(compositorWorker.terminated).toBe(false);

    const secondHost = WorkerHost.create();
    expect(MockWorker.instances).toHaveLength(1);
    expect(secondHost.compositor.runtime.hasQuantizer('layout')).toBe(false);

    const secondReceived: any[] = [];
    secondHost.onState((state) => secondReceived.push(state));
    compositorWorker.simulateMessage({
      type: 'state',
      state: { discrete: { width: 'tablet' }, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } },
    });

    expect(firstReceived).toEqual([]);
    expect(secondReceived).toHaveLength(1);
  });

  test('compositor is accessible on host', () => {
    const host = WorkerHost.create();
    markCompositorReady();
    // Should be able to use compositor methods through the host
    host.compositor.addQuantizer('test', {
      id: 'b1',
      states: ['a', 'b'],
      thresholds: [0, 100],
    });

    expect(host.compositor.runtime.hasQuantizer('test')).toBe(true);
  });

  test('startup path batches initial quantizer bootstrap until the first compute', () => {
    const host = WorkerHost.create();
    const compositorWorker = markCompositorReady();

    host.compositor.addQuantizer('layout', {
      id: 'layout',
      states: ['compact', 'comfortable', 'wide'],
      thresholds: [0, 640, 1024],
    });
    host.compositor.evaluate('layout', 800);

    expect(compositorWorker.postedMessages.map((message) => (message.data as { type?: string }).type)).toEqual(['init']);

    host.compositor.requestCompute();

    expect(compositorWorker.postedMessages.map((message) => (message.data as { type?: string }).type)).toEqual([
      'init',
      'startup-compute',
    ]);
    expect(compositorWorker.postedMessages[1]?.data).toEqual({
      type: 'startup-compute',
      packet: {
        bootstrapMode: 'cold',
        registrations: [
          {
            name: 'layout',
            boundaryId: 'layout',
            states: ['compact', 'comfortable', 'wide'],
            thresholds: new Float64Array([0, 640, 1024]),
            initialState: 'comfortable',
          },
        ],
        updates: [],
      },
    });
  });
});
