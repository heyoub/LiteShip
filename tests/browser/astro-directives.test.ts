import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WASMDispatch } from '@czap/core';
import satelliteDirective from '../../packages/astro/src/client-directives/satellite.js';
import workerDirective from '../../packages/astro/src/client-directives/worker.js';
import wasmDirective from '../../packages/astro/src/client-directives/wasm.js';
import gpuDirective from '../../packages/astro/src/client-directives/gpu.js';
import { createStubRegistry } from '../helpers/define-property-stub.js';

const noop = () => Promise.resolve();
const boundary = JSON.stringify({
  id: 'hero',
  input: 'viewport.width',
  thresholds: [0, 768],
  states: ['compact', 'expanded'],
  hysteresis: 20,
});

describe('browser astro directive coverage', () => {
  const stubs = createStubRegistry();

  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.setAttribute('data-czap-tier', 'animated');
  });

  afterEach(() => {
    document.querySelectorAll<HTMLElement>('*').forEach((element) => {
      element.dispatchEvent(new CustomEvent('czap:dispose'));
    });
    stubs.restoreAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  test('satellite directive handles resize hysteresis, reinit, and dispose in the browser lane', async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal('innerWidth', 760);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
        unobserve() {}
      },
    );

    const el = document.createElement('div');
    el.setAttribute('data-czap-boundary', boundary);
    document.body.appendChild(el);

    satelliteDirective(noop, {}, el);
    expect(el.getAttribute('data-czap-state')).toBe('compact');

    vi.stubGlobal('innerWidth', 790);
    resizeCallback?.([] as never, {} as never);
    expect(el.getAttribute('data-czap-state')).toBe('expanded');

    el.setAttribute(
      'data-czap-boundary',
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0, 640],
        states: ['narrow', 'wide'],
      }),
    );
    vi.stubGlobal('innerWidth', 500);
    el.dispatchEvent(new CustomEvent('czap:reinit'));
    expect(el.getAttribute('data-czap-state')).toBe('narrow');

    el.dispatchEvent(new CustomEvent('czap:dispose'));
    expect(disconnect).toHaveBeenCalled();
  });

  test('worker directive drives the shared WorkerHost path and handles reinit', async () => {
    const workers: Array<{
      listeners: Record<string, Array<(event: MessageEvent) => void>>;
      postMessage: (message: Record<string, unknown>) => void;
      terminate: () => void;
    }> = [];

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:worker');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );

    vi.stubGlobal(
      'Worker',
      class {
        listeners: Record<string, Array<(event: MessageEvent) => void>> = { message: [], error: [] };

        constructor(_url: string) {
          workers.push(this);
        }

        addEventListener(type: string, listener: (event: MessageEvent) => void) {
          this.listeners[type] ??= [];
          this.listeners[type]!.push(listener);
        }

        removeEventListener(type: string, listener: (event: MessageEvent) => void) {
          this.listeners[type] = (this.listeners[type] ?? []).filter((candidate) => candidate !== listener);
        }

        postMessage(message: Record<string, unknown>) {
          if (message.type === 'init') {
            queueMicrotask(() => {
              for (const listener of this.listeners.message ?? []) {
                listener({ data: { type: 'ready' } } as MessageEvent);
              }
            });
          }

          if (message.type === 'compute' || message.type === 'startup-compute') {
            queueMicrotask(() => {
              for (const listener of this.listeners.message ?? []) {
                listener({
                  data: {
                    type: 'state',
                    state: {
                      discrete: { hero: 'expanded' },
                      blend: {},
                      outputs: {
                        css: { '--czap-hero-gap': '16px' },
                        glsl: {},
                        aria: {},
                      },
                    },
                  },
                } as MessageEvent);
              }
            });
          }

          if (message.type === 'bootstrap-resolved-state' || message.type === 'apply-resolved-state') {
            if (message.ack === true) {
              queueMicrotask(() => {
                for (const listener of this.listeners.message ?? []) {
                  listener({
                    data: {
                      type: 'resolved-state-ack',
                      generation: Array.isArray(message.states) ? ((message.states[0] as { generation?: number } | undefined)?.generation ?? 0) : 0,
                      states: Array.isArray(message.states)
                        ? message.states.map((state) => ({
                            name: (state as { name: string }).name,
                            state: (state as { state: string }).state,
                          }))
                        : [],
                      additionalOutputsChanged: false,
                    },
                  } as MessageEvent);
                }
              });
            }
          }
        }

        terminate() {}
      },
    );

    vi.stubGlobal('SharedArrayBuffer', class SharedArrayBufferMock extends ArrayBuffer {} as never);
    stubs.define(globalThis, 'crossOriginIsolated', { value: true, configurable: true });
    vi.stubGlobal('innerWidth', 1024);

    const el = document.createElement('div');
    el.setAttribute('data-czap-boundary', boundary);
    document.body.appendChild(el);

    workerDirective(noop, {}, el);
    await Promise.resolve();
    await Promise.resolve();

    expect(workers).toHaveLength(1);
    expect(el.getAttribute('data-czap-state')).toBe('expanded');

    el.dispatchEvent(new CustomEvent('czap:reinit'));
    await Promise.resolve();
    await Promise.resolve();

    expect(workers).toHaveLength(1);
    expect(
      workers[0]?.listeners.message.length,
    ).toBeGreaterThanOrEqual(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test('wasm directive resolves through WASMDispatch and shared runtime config', async () => {
    const wasmElement = document.createElement('div');
    wasmElement.setAttribute('data-czap-wasm', 'true');
    document.documentElement.setAttribute('data-czap-wasm-url', '/czap-compute.wasm');
    document.body.appendChild(wasmElement);

    const loadSpy = vi.spyOn(WASMDispatch, 'load').mockResolvedValue(WASMDispatch.kernels());

    const readyEvents: unknown[] = [];
    document.addEventListener('czap:wasm-ready', ((event: CustomEvent) => readyEvents.push(event.detail)) as EventListener);

    wasmDirective(noop, {}, wasmElement);
    await Promise.resolve();
    await Promise.resolve();

    expect(loadSpy).toHaveBeenCalledWith('/czap-compute.wasm');
    expect(readyEvents).toEqual([{ url: '/czap-compute.wasm' }]);
  });

  test('gpu directive initializes a WebGL shader path and reacts to uniform updates', async () => {
    const uniformCalls: Array<[string, number]> = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1) as never);
    vi.stubGlobal('cancelAnimationFrame', vi.fn() as never);

    const gl = {
      COMPILE_STATUS: 1,
      LINK_STATUS: 2,
      ACTIVE_UNIFORMS: 3,
      TRIANGLES: 4,
      ARRAY_BUFFER: 5,
      STATIC_DRAW: 6,
      FLOAT: 7,
      VERTEX_SHADER: 8,
      FRAGMENT_SHADER: 9,
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn((_: unknown, param: number) => (param === 3 ? 2 : true)),
      getProgramInfoLog: vi.fn(() => ''),
      deleteProgram: vi.fn(),
      useProgram: vi.fn(),
      createVertexArray: vi.fn(() => ({})),
      bindVertexArray: vi.fn(),
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      getActiveUniform: vi.fn((_: unknown, index: number) => (index === 0 ? { name: 'u_time' } : { name: 'u_state' })),
      getUniformLocation: vi.fn((_: unknown, name: string) => name),
      uniform1f: vi.fn((location: string, value: number) => {
        uniformCalls.push([location, value]);
      }),
      uniform2f: vi.fn(),
      viewport: vi.fn(),
      drawArrays: vi.fn(),
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) =>
      kind === 'webgl2' ? (gl as never) : null,
    );

    const el = document.createElement('canvas');
    el.setAttribute('data-czap-boundary', boundary);
    document.body.appendChild(el);

    let ready = false;
    el.addEventListener('czap:gpu-ready', () => {
      ready = true;
    });

    gpuDirective(noop, {}, el);
    await Promise.resolve();
    await Promise.resolve();

    expect(ready).toBe(true);

    el.dispatchEvent(
      new CustomEvent('czap:uniform-update', {
        detail: {
          discrete: { hero: 'expanded' },
          css: { '--czap-state': '1' },
        },
      }),
    );

    expect(uniformCalls.some(([name]) => name === 'u_state')).toBe(true);
    expect(gl.drawArrays).toHaveBeenCalled();
  });
});
