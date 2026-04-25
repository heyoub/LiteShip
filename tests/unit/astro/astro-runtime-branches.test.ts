// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { Diagnostics } from '@czap/core';
import { bootstrapSlots, getSlotRegistry, installSwapReinit, rescanSlots } from '../../../packages/astro/src/runtime/slots.js';
import { createStubRegistry, stubWorkerEnvironment } from '../../helpers/define-property-stub.js';
import { captureDiagnosticsAsync } from '../../helpers/diagnostics.js';
import type * as RuntimeBoundary from '../../../packages/astro/src/runtime/boundary.js';

const stubs = createStubRegistry();

type RuntimeWindow = Window & {
  __CZAP_SLOT_REGISTRY__?: unknown;
  __CZAP_SLOT_BOOTSTRAPPED__?: boolean;
  __CZAP_SWAP_REINIT__?: boolean;
  __CZAP_SLOTS__?: unknown;
};

function resetRuntimeWindow(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const runtimeWindow = window as RuntimeWindow;
  delete runtimeWindow.__CZAP_SLOT_REGISTRY__;
  delete runtimeWindow.__CZAP_SLOT_BOOTSTRAPPED__;
  delete runtimeWindow.__CZAP_SWAP_REINIT__;
  delete runtimeWindow.__CZAP_SLOTS__;
}

afterEach(() => {
  document.body.innerHTML = '';
  Diagnostics.reset();
  resetRuntimeWindow();
  stubs.restoreAll();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('astro runtime slot edge branches', () => {
  test('defers slot scanning until DOMContentLoaded when the document is still loading', () => {
    document.body.innerHTML = `<section data-czap-slot="/hero" data-czap-mode="replace"></section>`;
    const readyStateDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });

    try {
      const registry = bootstrapSlots();
      expect(registry.get('/hero' as never)).toBeUndefined();

      document.dispatchEvent(new Event('DOMContentLoaded'));

      expect(registry.get('/hero' as never)?.mode).toBe('replace');
    } finally {
      if (readyStateDescriptor) {
        Object.defineProperty(document, 'readyState', readyStateDescriptor);
      }
    }
  });

  test('falls back to the document root when rescanning from a non-Element parent', () => {
    document.body.innerHTML = `<section id="slot" data-czap-slot="/hero" data-czap-mode="replace"></section>`;
    const fragment = document.createDocumentFragment();
    const ignored = document.createElement('section');
    ignored.setAttribute('data-czap-slot', '/ignored');
    ignored.setAttribute('data-czap-mode', 'replace');
    fragment.appendChild(ignored);

    const registry = rescanSlots(fragment);

    expect(registry.get('/hero' as never)?.element).toBe(document.getElementById('slot'));
    expect(registry.get('/ignored' as never)).toBeUndefined();
  });

  test('returns safe ephemeral registries when window is unavailable', () => {
    vi.stubGlobal('window', undefined as unknown as Window);

    expect(() => getSlotRegistry()).not.toThrow();
    expect(() => bootstrapSlots()).not.toThrow();
    expect(() => installSwapReinit()).not.toThrow();
    expect(() => rescanSlots(document.createDocumentFragment())).not.toThrow();
  });
});

describe('astro worker directive edge branches', () => {
  test('returns early without loading when no runtime boundary can be parsed', async () => {
    vi.doMock('@czap/worker', () => ({
      WorkerHost: { create: vi.fn() },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const load = vi.fn(async () => undefined);
    const element = document.createElement('div');

    initWorkerDirective(load, element);

    expect(load).not.toHaveBeenCalled();
  });

  test('falls back to main-thread evaluation when WorkerHost initialization throws', async () => {
    stubWorkerEnvironment(stubs, vi);

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: vi.fn(() => {
          throw new Error('boom');
        }),
      },
    }));

    await captureDiagnosticsAsync(async ({ events }) => {
      const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
      const load = vi.fn(async () => undefined);
      const element = document.createElement('div');
      element.setAttribute(
        'data-czap-boundary',
        JSON.stringify({
          id: 'hero',
          input: 'viewport.width',
          thresholds: [0, 768],
          states: ['compact', 'wide'],
        }),
      );
      stubs.define(window, 'innerWidth', {
        configurable: true,
        value: 820,
      });

      initWorkerDirective(load, element);

      expect(load).toHaveBeenCalledTimes(1);
      expect(element.getAttribute('data-czap-state')).toBe('wide');
      expect(events).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          source: 'czap/astro.worker',
          code: 'worker-host-fallback',
          detail: 'boom',
        }),
      );
    });
  });

  test('surfaces non-Error worker initialization failures through diagnostics detail', async () => {
    stubWorkerEnvironment(stubs, vi);

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: vi.fn(() => {
          throw 'worker boom';
        }),
      },
    }));

    await captureDiagnosticsAsync(async ({ events }) => {
      const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
      const load = vi.fn(async () => undefined);
      const element = document.createElement('div');
      element.setAttribute(
        'data-czap-boundary',
        JSON.stringify({
          id: 'hero',
          input: 'viewport.width',
          thresholds: [0, 768],
          states: ['compact', 'wide'],
        }),
      );
      stubs.define(window, 'innerWidth', {
        configurable: true,
        value: 820,
      });

      initWorkerDirective(load, element);

      expect(load).toHaveBeenCalledTimes(1);
      expect(element.getAttribute('data-czap-state')).toBe('wide');
      expect(events).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          source: 'czap/astro.worker',
          code: 'worker-host-fallback',
          detail: 'worker boom',
        }),
      );
    });
  });

  test('uses main-thread fallback when worker runtime prerequisites are unavailable and cleans observers on lifecycle events', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let resizeCallback: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe = observe;
        disconnect = disconnect;
      },
    );
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('SharedArrayBuffer', undefined);
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: false,
    });

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const load = vi.fn(async () => undefined);
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    initWorkerDirective(load, element);

    expect(load).toHaveBeenCalledTimes(1);
    expect(element.getAttribute('data-czap-state')).toBe('wide');
    expect(observe).toHaveBeenCalledWith(document.documentElement);

    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 640,
    });
    resizeCallback?.([] as never, {} as never);
    expect(element.getAttribute('data-czap-state')).toBe('compact');

    element.dispatchEvent(new CustomEvent('czap:reinit'));
    element.dispatchEvent(new CustomEvent('czap:dispose'));
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  test('skips observation and state application when the worker boundary input is unsupported', async () => {
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe = observe;
        disconnect() {}
      },
    );
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('SharedArrayBuffer', undefined);
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: false,
    });

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const load = vi.fn(async () => undefined);
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'pointer',
        input: 'pointer.x',
        thresholds: [0, 100],
        states: ['near', 'far'],
      }),
    );

    initWorkerDirective(load, element);

    expect(load).toHaveBeenCalledTimes(1);
    expect(observe).not.toHaveBeenCalled();
    expect(element.getAttribute('data-czap-state')).toBeNull();
  });

  test('binds worker readiness, resize observation, dispose, and reinit cleanup', async () => {
    const unsubscribe = vi.fn();
    const hostDispose = vi.fn();
    const addQuantizer = vi.fn();
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    const onResolvedStateAck = vi.fn(() => vi.fn());
    const addEventListener = vi.fn();
    const observe = vi.fn();
    const disconnect = vi.fn();
    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer,
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck,
        worker: {
          addEventListener,
        },
      },
      onState: vi.fn(() => unsubscribe),
      dispose: hostDispose,
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe = observe;
        disconnect = disconnect;
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const load = vi.fn(async () => undefined);
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });
    let readyCount = 0;
    element.addEventListener('czap:worker-ready', () => {
      readyCount += 1;
    });

    initWorkerDirective(load, element);

    expect(load).toHaveBeenCalledTimes(1);
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(addQuantizer).toHaveBeenCalledTimes(1);
    expect(bootstrapResolvedState).toHaveBeenCalledWith([{ name: 'hero', state: 'wide', generation: 1 }]);
    expect(applyResolvedState).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith(document.documentElement);

    const readyListener = addEventListener.mock.calls.find(([type]) => type === 'message')?.[1] as
      | ((event: MessageEvent<{ type?: string }>) => void)
      | undefined;
    readyListener?.({ data: { type: 'ready' } } as MessageEvent<{ type?: string }>);
    expect(readyCount).toBe(1);

    element.dispatchEvent(new CustomEvent('czap:dispose'));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(hostDispose).toHaveBeenCalledTimes(1);

    element.dispatchEvent(new CustomEvent('czap:reinit'));
    expect(createHost).toHaveBeenCalledTimes(2);
  });

  test('ignores stale worker callbacks after cleanup leaves no runtime boundary or host behind', async () => {
    const unsubscribe = vi.fn();
    const hostDispose = vi.fn();
    const addQuantizer = vi.fn();
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    const onResolvedStateAck = vi.fn(() => vi.fn());
    let onStateCallback: ((state: { discrete?: Record<string, string> }) => void) | null = null;
    let readyListener: ((event: MessageEvent<{ type?: string }>) => void) | null = null;
    let resizeCallback: ResizeObserverCallback | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer,
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck,
        worker: {
          addEventListener: vi.fn((type: string, listener: (event: MessageEvent<{ type?: string }>) => void) => {
            if (type === 'message') {
              readyListener = listener;
            }
          }),
        },
      },
      onState: vi.fn((callback: (state: { discrete?: Record<string, string> }) => void) => {
        onStateCallback = callback;
        return unsubscribe;
      }),
      dispose: hostDispose,
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const load = vi.fn(async () => undefined);
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    initWorkerDirective(load, element);
    readyListener?.({ data: { type: 'ready' } } as MessageEvent<{ type?: string }>);

    element.setAttribute('data-czap-boundary', '{broken');
    element.dispatchEvent(new CustomEvent('czap:reinit'));

    expect(hostDispose).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(createHost).toHaveBeenCalledTimes(1);

    expect(() => onStateCallback?.({ discrete: { hero: 'wide' } })).not.toThrow();
    expect(() => resizeCallback?.([] as never, {} as never)).not.toThrow();
    expect(element.getAttribute('data-czap-state')).toBe('wide');
    expect(bootstrapResolvedState).toHaveBeenCalledTimes(1);
    expect(applyResolvedState).not.toHaveBeenCalled();
  });

  test('ignores stale fallback resize callbacks after reinit clears the runtime boundary', async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('SharedArrayBuffer', undefined);
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: false,
    });

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    initWorkerDirective(async () => undefined, element);
    expect(element.getAttribute('data-czap-state')).toBe('wide');

    element.setAttribute('data-czap-boundary', '{broken');
    element.dispatchEvent(new CustomEvent('czap:reinit'));

    expect(() => resizeCallback?.([] as never, {} as never)).not.toThrow();
    expect(element.getAttribute('data-czap-state')).toBe('wide');
  });

  test('keeps the worker host idle when the runtime boundary disappears before a viewport update', async () => {
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    let resizeCallback: ResizeObserverCallback | null = null;
    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    initWorkerDirective(async () => undefined, element);
    expect(bootstrapResolvedState).toHaveBeenCalledTimes(1);
    expect(applyResolvedState).not.toHaveBeenCalled();

    element.setAttribute('data-czap-boundary', '{broken');
    element.dispatchEvent(new CustomEvent('czap:reinit'));
    resizeCallback?.([] as never, {} as never);

    expect(bootstrapResolvedState).toHaveBeenCalledTimes(1);
    expect(applyResolvedState).not.toHaveBeenCalled();
  });

  test('skips worker evaluation and observation when the worker boundary input is unsupported', async () => {
    const addQuantizer = vi.fn();
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    const observe = vi.fn();
    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer,
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe = observe;
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const load = vi.fn(async () => undefined);
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'pointer',
        input: 'pointer.x',
        thresholds: [0, 100],
        states: ['near', 'far'],
      }),
    );

    initWorkerDirective(load, element);

    expect(load).toHaveBeenCalledTimes(1);
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(addQuantizer).toHaveBeenCalledTimes(1);
    expect(bootstrapResolvedState).not.toHaveBeenCalled();
    expect(applyResolvedState).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  test('suppresses duplicate worker agreement when the mirrored generation matches host-applied detail', async () => {
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    let onStateCallback: ((state: {
      discrete?: Record<string, string>;
      outputs?: {
        css?: Record<string, string | number>;
        glsl?: Record<string, number>;
        aria?: Record<string, string>;
      };
      resolvedStateGenerations?: Record<string, number>;
    }) => void) | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn((callback) => {
        onStateCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: unknown[] = [];
    const uniformStates: unknown[] = [];
    element.addEventListener('czap:worker-state', ((event: CustomEvent) => workerStates.push(event.detail)) as EventListener);
    element.addEventListener('czap:uniform-update', ((event: CustomEvent) => uniformStates.push(event.detail)) as EventListener);

    initWorkerDirective(async () => undefined, element);

    expect(workerStates).toHaveLength(1);
    expect(uniformStates).toHaveLength(1);

    onStateCallback?.({
      discrete: { hero: 'wide' },
      outputs: {
        css: {},
        glsl: {},
        aria: {},
      },
      resolvedStateGenerations: { hero: 1 },
    });

    expect(workerStates).toHaveLength(1);
    expect(uniformStates).toHaveLength(1);
    expect(element.getAttribute('data-czap-state')).toBe('wide');
    expect(bootstrapResolvedState).toHaveBeenCalledWith([{ name: 'hero', state: 'wide', generation: 1 }]);
    expect(applyResolvedState).not.toHaveBeenCalled();
  });

  test('keeps pending agreement through unrelated ack entries and applies divergent mirrored payloads', async () => {
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    let onStateCallback: ((state: {
      discrete?: Record<string, string>;
      css?: Record<string, string | number>;
      aria?: Record<string, string>;
      outputs?: {
        css?: Record<string, string | number>;
        glsl?: Record<string, number>;
        aria?: Record<string, string>;
      };
      resolvedStateGenerations?: Record<string, number>;
    }) => void) | null = null;
    let ackCallback:
      | ((ack: {
          readonly generation: number;
          readonly states: readonly { name: string; state: string }[];
          readonly additionalOutputsChanged: boolean;
        }) => void)
      | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn((callback) => {
          ackCallback = callback;
          return vi.fn();
        }),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn((callback) => {
        onStateCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: Array<Record<string, unknown>> = [];
    element.addEventListener(
      'czap:worker-state',
      ((event: CustomEvent<Record<string, unknown>>) => workerStates.push(event.detail)) as EventListener,
    );

    initWorkerDirective(async () => undefined, element);

    ackCallback?.({
      generation: 1,
      states: [{ name: 'other', state: 'ignored' }],
      additionalOutputsChanged: false,
    });
    onStateCallback?.({
      discrete: { hero: 'wide' },
      css: { '--czap-worker-shadow': '1' },
      aria: { 'aria-live': 'polite' },
      outputs: {
        css: { '--czap-worker-shadow': '1' },
        glsl: {},
        aria: { 'aria-live': 'polite' },
      },
      resolvedStateGenerations: { hero: 1 },
    });

    expect(workerStates).toHaveLength(2);
    expect(element.style.getPropertyValue('--czap-worker-shadow')).toBe('1');
    expect(element.getAttribute('aria-live')).toBe('polite');
  });

  test('applies seeded worker payloads when mirrored discrete records diverge by value', async () => {
    stubWorkerEnvironment(stubs, vi);

    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );

    vi.doMock('../../../packages/astro/src/runtime/boundary.js', async () => {
      const actual = await vi.importActual<typeof RuntimeBoundary>(
        '../../../packages/astro/src/runtime/boundary.js',
      );

      return {
        ...actual,
        normalizeBoundaryState(state: {
          readonly discrete?: Record<string, string>;
          readonly css?: Record<string, string | number>;
          readonly glsl?: Record<string, number>;
          readonly aria?: Record<string, string>;
          readonly outputs?: {
            readonly css?: Record<string, string | number>;
            readonly glsl?: Record<string, number>;
            readonly aria?: Record<string, string>;
          };
        }) {
          return {
            discrete: {
              hero: state.discrete?.hero ?? '',
              mirror: state.discrete?.mirror ?? 'seed',
            },
            css: {},
            glsl: {},
            aria: {},
          };
        },
      };
    });

    let onStateCallback: ((state: {
      discrete?: Record<string, string>;
      outputs?: {
        css?: Record<string, string | number>;
        glsl?: Record<string, number>;
        aria?: Record<string, string>;
      };
      resolvedStateGenerations?: Record<string, number>;
    }) => void) | null = null;

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: vi.fn(() => ({
          compositor: {
            addQuantizer: vi.fn(),
            bootstrapResolvedState: vi.fn(),
            applyResolvedState: vi.fn(),
            onResolvedStateAck: vi.fn(() => vi.fn()),
            worker: {
              addEventListener: vi.fn(),
            },
          },
          onState: vi.fn((callback) => {
            onStateCallback = callback;
            return vi.fn();
          }),
          dispose: vi.fn(),
        })),
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: Array<Record<string, unknown>> = [];
    element.addEventListener(
      'czap:worker-state',
      ((event: CustomEvent<Record<string, unknown>>) => workerStates.push(event.detail)) as EventListener,
    );

    initWorkerDirective(async () => undefined, element);
    expect(workerStates).toHaveLength(1);

    onStateCallback?.({
      discrete: { hero: 'wide', mirror: 'worker' },
      outputs: {
        css: {},
        glsl: {},
        aria: {},
      },
      resolvedStateGenerations: { hero: 1 },
    });

    expect(workerStates).toHaveLength(2);
    expect(workerStates.at(-1)).toMatchObject({
      discrete: { hero: 'wide', mirror: 'worker' },
    });
  });

  test('applies seeded worker payloads when mirrored glsl records differ in key count', async () => {
    stubWorkerEnvironment(stubs, vi);

    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );

    vi.doMock('../../../packages/astro/src/runtime/boundary.js', async () => {
      const actual = await vi.importActual<typeof RuntimeBoundary>(
        '../../../packages/astro/src/runtime/boundary.js',
      );

      return {
        ...actual,
        normalizeBoundaryState(state: {
          readonly discrete?: Record<string, string>;
          readonly css?: Record<string, string | number>;
          readonly glsl?: Record<string, number>;
          readonly aria?: Record<string, string>;
          readonly outputs?: {
            readonly css?: Record<string, string | number>;
            readonly glsl?: Record<string, number>;
            readonly aria?: Record<string, string>;
          };
        }) {
          return {
            discrete: { ...(state.discrete ?? {}) },
            css: {},
            glsl: state.outputs?.glsl ?? { u_seed: 1, u_value: 1 },
            aria: {},
          };
        },
      };
    });

    let onStateCallback: ((state: {
      discrete?: Record<string, string>;
      outputs?: {
        css?: Record<string, string | number>;
        glsl?: Record<string, number>;
        aria?: Record<string, string>;
      };
      resolvedStateGenerations?: Record<string, number>;
    }) => void) | null = null;

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: vi.fn(() => ({
          compositor: {
            addQuantizer: vi.fn(),
            bootstrapResolvedState: vi.fn(),
            applyResolvedState: vi.fn(),
            onResolvedStateAck: vi.fn(() => vi.fn()),
            worker: {
              addEventListener: vi.fn(),
            },
          },
          onState: vi.fn((callback) => {
            onStateCallback = callback;
            return vi.fn();
          }),
          dispose: vi.fn(),
        })),
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: Array<Record<string, unknown>> = [];
    element.addEventListener(
      'czap:worker-state',
      ((event: CustomEvent<Record<string, unknown>>) => workerStates.push(event.detail)) as EventListener,
    );

    initWorkerDirective(async () => undefined, element);
    expect(workerStates).toHaveLength(1);

    onStateCallback?.({
      discrete: { hero: 'wide' },
      outputs: {
        css: {},
        glsl: { u_seed: 1 },
        aria: {},
      },
      resolvedStateGenerations: { hero: 1 },
    });

    expect(workerStates).toHaveLength(2);
    expect(workerStates.at(-1)).toMatchObject({
      glsl: { u_seed: 1 },
    });
  });

  test('applies seeded worker payloads when mirrored glsl records differ by value', async () => {
    stubWorkerEnvironment(stubs, vi);

    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );

    vi.doMock('../../../packages/astro/src/runtime/boundary.js', async () => {
      const actual = await vi.importActual<typeof RuntimeBoundary>(
        '../../../packages/astro/src/runtime/boundary.js',
      );

      return {
        ...actual,
        normalizeBoundaryState(state: {
          readonly discrete?: Record<string, string>;
          readonly css?: Record<string, string | number>;
          readonly glsl?: Record<string, number>;
          readonly aria?: Record<string, string>;
          readonly outputs?: {
            readonly css?: Record<string, string | number>;
            readonly glsl?: Record<string, number>;
            readonly aria?: Record<string, string>;
          };
        }) {
          return {
            discrete: { ...(state.discrete ?? {}) },
            css: {},
            glsl: state.outputs?.glsl ?? { u_seed: 1, u_value: 1 },
            aria: {},
          };
        },
      };
    });

    let onStateCallback: ((state: {
      discrete?: Record<string, string>;
      outputs?: {
        css?: Record<string, string | number>;
        glsl?: Record<string, number>;
        aria?: Record<string, string>;
      };
      resolvedStateGenerations?: Record<string, number>;
    }) => void) | null = null;

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: vi.fn(() => ({
          compositor: {
            addQuantizer: vi.fn(),
            bootstrapResolvedState: vi.fn(),
            applyResolvedState: vi.fn(),
            onResolvedStateAck: vi.fn(() => vi.fn()),
            worker: {
              addEventListener: vi.fn(),
            },
          },
          onState: vi.fn((callback) => {
            onStateCallback = callback;
            return vi.fn();
          }),
          dispose: vi.fn(),
        })),
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: Array<Record<string, unknown>> = [];
    element.addEventListener(
      'czap:worker-state',
      ((event: CustomEvent<Record<string, unknown>>) => workerStates.push(event.detail)) as EventListener,
    );

    initWorkerDirective(async () => undefined, element);
    expect(workerStates).toHaveLength(1);

    onStateCallback?.({
      discrete: { hero: 'wide' },
      outputs: {
        css: {},
        glsl: { u_seed: 2, u_value: 1 },
        aria: {},
      },
      resolvedStateGenerations: { hero: 1 },
    });

    expect(workerStates).toHaveLength(2);
    expect(workerStates.at(-1)).toMatchObject({
      glsl: { u_seed: 2, u_value: 1 },
    });
  });

  test('applies mirrored payloads when the seeded generation matches but normalized detail still differs', async () => {
    const bootstrapResolvedState = vi.fn();
    let onStateCallback: ((state: {
      discrete?: Record<string, string>;
      outputs?: {
        css?: Record<string, string | number>;
        glsl?: Record<string, number>;
        aria?: Record<string, string>;
      };
      resolvedStateGenerations?: Record<string, number>;
    }) => void) | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState: vi.fn(),
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn((callback) => {
        onStateCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: Array<Record<string, unknown>> = [];
    element.addEventListener(
      'czap:worker-state',
      ((event: CustomEvent<Record<string, unknown>>) => workerStates.push(event.detail)) as EventListener,
    );

    initWorkerDirective(async () => undefined, element);
    expect(workerStates).toHaveLength(1);

    onStateCallback?.({
      discrete: { hero: 'wide' },
      outputs: {
        css: {},
        glsl: { u_hero: 1 },
        aria: { 'aria-current': 'page' },
      },
      resolvedStateGenerations: { hero: 1 },
    });

    expect(workerStates).toHaveLength(2);
    expect(workerStates.at(-1)).toMatchObject({
      discrete: { hero: 'wide' },
      glsl: { u_hero: 1 },
      aria: { 'aria-current': 'page' },
    });
    expect(bootstrapResolvedState).toHaveBeenCalledWith([{ name: 'hero', state: 'wide', generation: 1 }]);
  });

  test('ignores stale resolved-state acknowledgements after reinit swaps to a new worker host', async () => {
    const ackCallbacks: Array<
      (ack: {
        readonly generation: number;
        readonly states: readonly { name: string; state: string }[];
        readonly additionalOutputsChanged: boolean;
      }) => void
    > = [];

    stubWorkerEnvironment(stubs, vi);
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: vi.fn(() => ({
          compositor: {
            addQuantizer: vi.fn(),
            bootstrapResolvedState: vi.fn(),
            applyResolvedState: vi.fn(),
            onResolvedStateAck: vi.fn((callback) => {
              ackCallbacks.push(callback);
              return vi.fn();
            }),
            worker: {
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            },
          },
          onState: vi.fn(() => vi.fn()),
          dispose: vi.fn(),
        })),
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    initWorkerDirective(async () => undefined, element);
    expect(ackCallbacks).toHaveLength(1);

    element.dispatchEvent(new CustomEvent('czap:reinit'));
    expect(ackCallbacks).toHaveLength(2);

    expect(() =>
      ackCallbacks[0]?.({
        generation: 1,
        states: [{ name: 'hero', state: 'wide' }],
        additionalOutputsChanged: false,
      }),
    ).not.toThrow();
    expect(element.getAttribute('data-czap-state')).toBe('wide');
  });

  test('ignores undefined and unchanged worker updates before mirroring the next resolved state', async () => {
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    let resizeCallback: ResizeObserverCallback | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
      writable: true,
    });

    initWorkerDirective(async () => undefined, element);

    expect(bootstrapResolvedState).toHaveBeenCalledTimes(1);
    expect(applyResolvedState).not.toHaveBeenCalled();

    window.innerWidth = 820;
    resizeCallback?.([] as never, {} as never);
    expect(applyResolvedState).not.toHaveBeenCalled();

    window.innerWidth = undefined as unknown as number;
    resizeCallback?.([] as never, {} as never);
    expect(applyResolvedState).not.toHaveBeenCalled();

    window.innerWidth = 640;
    resizeCallback?.([] as never, {} as never);
    expect(applyResolvedState).toHaveBeenCalledWith([{ name: 'hero', state: 'compact', generation: 2 }]);
    expect(element.getAttribute('data-czap-state')).toBe('compact');
  });

  test('treats the first worker resize update as hysteresis-free when startup had no readable viewport value', async () => {
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();
    let resizeCallback: ResizeObserverCallback | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
        hysteresis: 20,
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    initWorkerDirective(async () => undefined, element);

    expect(bootstrapResolvedState).not.toHaveBeenCalled();
    expect(element.getAttribute('data-czap-state')).toBeNull();

    window.innerWidth = 820;
    resizeCallback?.([] as never, {} as never);

    expect(applyResolvedState).toHaveBeenCalledWith([{ name: 'hero', state: 'wide', generation: 1 }]);
    expect(element.getAttribute('data-czap-state')).toBe('wide');
  });

  test('applies worker payloads without discrete state or generation when mirrored outputs still matter', async () => {
    const bootstrapResolvedState = vi.fn();
    let onStateCallback:
      | ((state: {
          outputs?: {
            css?: Record<string, string | number>;
            glsl?: Record<string, number>;
            aria?: Record<string, string>;
          };
          resolvedStateGenerations?: Record<string, number>;
        }) => void)
      | null = null;

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState: vi.fn(),
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn((type: string, listener: (event: MessageEvent<{ type?: string }>) => void) => {
            if (type === 'message') {
              listener({ data: { type: 'noop' } } as MessageEvent<{ type?: string }>);
            }
          }),
        },
      },
      onState: vi.fn((callback) => {
        onStateCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    const workerStates: Array<Record<string, unknown>> = [];
    element.addEventListener(
      'czap:worker-state',
      ((event: CustomEvent<Record<string, unknown>>) => workerStates.push(event.detail)) as EventListener,
    );

    initWorkerDirective(async () => undefined, element);
    expect(workerStates).toHaveLength(1);

    onStateCallback?.({
      outputs: {
        css: { '--czap-worker-shadow': '2' },
        glsl: { u_hero: 2 },
        aria: { 'aria-busy': 'true' },
      },
    });

    expect(workerStates).toHaveLength(2);
    expect(workerStates.at(-1)).toMatchObject({
      css: { '--czap-worker-shadow': '2' },
      glsl: { u_hero: 2 },
      aria: { 'aria-busy': 'true' },
    });
    expect(element.style.getPropertyValue('--czap-worker-shadow')).toBe('2');
    expect(element.getAttribute('aria-busy')).toBe('true');
    expect(element.getAttribute('data-czap-state')).toBe('wide');
  });

  test('reinit falls back to an empty previous state when the current data-czap-state attribute is absent', async () => {
    const bootstrapResolvedState = vi.fn();
    const applyResolvedState = vi.fn();

    const createHost = vi.fn(() => ({
      compositor: {
        addQuantizer: vi.fn(),
        bootstrapResolvedState,
        applyResolvedState,
        onResolvedStateAck: vi.fn(() => vi.fn()),
        worker: {
          addEventListener: vi.fn(),
        },
      },
      onState: vi.fn(() => vi.fn()),
      dispose: vi.fn(),
    }));

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
        hysteresis: 20,
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
    });

    initWorkerDirective(async () => undefined, element);
    expect(bootstrapResolvedState).toHaveBeenNthCalledWith(1, [{ name: 'hero', state: 'wide', generation: 1 }]);

    element.removeAttribute('data-czap-state');
    element.dispatchEvent(new CustomEvent('czap:reinit'));

    expect(bootstrapResolvedState).toHaveBeenNthCalledWith(2, [{ name: 'hero', state: 'wide', generation: 1 }]);
    expect(applyResolvedState).not.toHaveBeenCalled();
    expect(element.getAttribute('data-czap-state')).toBe('wide');
  });

  test('ignores stale worker resize callbacks after reinit swaps to a new host instance', async () => {
    const resizeCallbacks: ResizeObserverCallback[] = [];
    const firstApplyResolvedState = vi.fn();
    const secondApplyResolvedState = vi.fn();
    let hostCreateCount = 0;

    const createHost = vi.fn(() => {
      hostCreateCount += 1;
      return {
        compositor: {
          addQuantizer: vi.fn(),
          bootstrapResolvedState: vi.fn(),
          applyResolvedState: hostCreateCount === 1 ? firstApplyResolvedState : secondApplyResolvedState,
          onResolvedStateAck: vi.fn(() => vi.fn()),
          worker: {
            addEventListener: vi.fn(),
          },
        },
        onState: vi.fn(() => vi.fn()),
        dispose: vi.fn(),
      };
    });

    vi.stubGlobal('Worker', class MockWorker {});
    vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }

        observe() {}
        disconnect() {}
      },
    );
    stubs.define(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    vi.doMock('@czap/worker', () => ({
      WorkerHost: {
        create: createHost,
      },
    }));

    const { initWorkerDirective } = await import('../../../packages/astro/src/runtime/worker.js');
    const element = document.createElement('div');
    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 768],
        states: ['compact', 'wide'],
      }),
    );
    stubs.define(window, 'innerWidth', {
      configurable: true,
      value: 820,
      writable: true,
    });

    initWorkerDirective(async () => undefined, element);
    expect(resizeCallbacks).toHaveLength(1);

    element.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 640],
        states: ['narrow', 'wide'],
      }),
    );
    element.dispatchEvent(new CustomEvent('czap:reinit'));
    expect(resizeCallbacks).toHaveLength(2);

    window.innerWidth = 500;
    resizeCallbacks[0]?.([] as never, {} as never);
    expect(firstApplyResolvedState).not.toHaveBeenCalled();

    resizeCallbacks[1]?.([] as never, {} as never);
    expect(secondApplyResolvedState).toHaveBeenCalledWith([{ name: 'hero', state: 'narrow', generation: 2 }]);
    expect(element.getAttribute('data-czap-state')).toBe('narrow');
  });
});
