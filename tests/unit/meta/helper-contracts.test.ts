import { describe, expect, test } from 'vitest';
import { mockCanvas, mockHTMLElement } from '../../helpers/mock-dom.js';
import { mockMatchMedia, mockNavigator, mockViewport, mockWebGL } from '../../helpers/mock-browser.js';
import { MockEventSource } from '../../helpers/mock-event-source.js';
import { MockWorker } from '../../helpers/mock-worker.js';
import { MockWebSocket } from '../../helpers/mock-websocket.js';

describe('test helper contract parity', () => {
  test('MockEventSource preserves constructor args and readyState transitions', () => {
    const source = new MockEventSource('/stream', { withCredentials: true });

    expect(source.url).toBe('/stream');
    expect(source.withCredentials).toBe(true);
    expect(source.readyState).toBe(MockEventSource.CONNECTING);

    source.simulateOpen();
    expect(source.readyState).toBe(MockEventSource.OPEN);

    source.close();
    expect(source.readyState).toBe(MockEventSource.CLOSED);
  });

  test('MockEventSource.install restores the original global and clears instances', () => {
    const original = globalThis.EventSource;
    const cleanup = MockEventSource.install();

    expect(globalThis.EventSource).toBe(MockEventSource as unknown as typeof EventSource);
    new MockEventSource('/stream');
    expect(MockEventSource.instances).toHaveLength(1);

    cleanup();

    expect(globalThis.EventSource).toBe(original);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  test('MockWorker captures constructor args and throws after terminate', () => {
    const worker = new MockWorker('blob:worker', { type: 'module', name: 'czap-worker' });

    expect(worker.url).toBe('blob:worker');
    expect(worker.options).toEqual({ type: 'module', name: 'czap-worker' });

    worker.postMessage({ type: 'ping' });
    expect(worker.postedMessages).toEqual([{ data: { type: 'ping' }, transfer: undefined }]);

    worker.terminate();
    expect(() => worker.postMessage({ type: 'pong' })).toThrow(/terminated/i);
  });

  test('MockWorker.install restores the original global and clears instances', () => {
    const original = globalThis.Worker;
    const cleanup = MockWorker.install();

    expect(globalThis.Worker).toBe(MockWorker as unknown as typeof Worker);
    new MockWorker('blob:worker');
    expect(MockWorker.instances).toHaveLength(1);

    cleanup();

    expect(globalThis.Worker).toBe(original);
    expect(MockWorker.instances).toHaveLength(0);
  });

  test('MockWorker add/removeEventListener mirrors runtime fanout', () => {
    const worker = new MockWorker('blob:worker');
    const received: unknown[] = [];
    const handler = ((event: MessageEvent) => received.push(event.data)) as EventListener;

    worker.addEventListener('message', handler);
    worker.simulateMessage({ ok: true });
    worker.removeEventListener('message', handler);
    worker.simulateMessage({ ok: false });

    expect(received).toEqual([{ ok: true }]);
  });

  test('MockWebSocket enforces open-state sends and captures protocol', () => {
    const socket = new MockWebSocket('wss://example.test/socket', ['json', 'fallback']);

    expect(socket.protocol).toBe('json');
    expect(() => socket.send('before-open')).toThrow(/not open/i);

    socket.simulateOpen();
    socket.send('hello');
    socket.close(1000, 'done');

    expect(socket.sentMessages).toEqual(['hello']);
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
  });

  test('MockWebSocket.install restores the original global and clears instances', () => {
    const original = globalThis.WebSocket;
    const cleanup = MockWebSocket.install();

    expect(globalThis.WebSocket).toBe(MockWebSocket as unknown as typeof WebSocket);
    new MockWebSocket('wss://example.test/socket');
    expect(MockWebSocket.instances).toHaveLength(1);

    cleanup();

    expect(globalThis.WebSocket).toBe(original);
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  test('mockHTMLElement removeEventListener stops later dispatch', () => {
    const element = mockHTMLElement();
    const calls: string[] = [];
    const handler = ((event: Event) => calls.push(event.type)) as EventListener;

    element.addEventListener('ping', handler);
    element._emit('ping');
    element.removeEventListener('ping', handler);
    element._emit('ping');

    expect(calls).toEqual(['ping']);
  });

  test('mockCanvas only transfers control once', () => {
    const canvas = mockCanvas();

    expect(canvas.transferControlToOffscreen()).toEqual({ width: 640, height: 480 });
    expect(() => canvas.transferControlToOffscreen()).toThrow(/second time/i);
  });

  test('mockMatchMedia install and cleanup preserve listener behavior', () => {
    const cleanup = mockMatchMedia({ '(prefers-reduced-motion: reduce)': false });
    const media = globalThis.matchMedia('(prefers-reduced-motion: reduce)') as {
      matches: boolean;
      addEventListener(type: string, cb: (event: { matches: boolean }) => void): void;
      _setMatches(value: boolean): void;
    };
    const seen: boolean[] = [];

    media.addEventListener('change', (event) => seen.push(event.matches));
    media._setMatches(true);

    expect(media.matches).toBe(true);
    expect(seen).toEqual([true]);

    cleanup();
  });

  test('mockNavigator installs overrides and restores the original navigator', () => {
    const original = globalThis.navigator;
    const cleanup = mockNavigator({ hardwareConcurrency: 12, connection: { effectiveType: 'wifi' } });

    expect(globalThis.navigator.hardwareConcurrency).toBe(12);
    expect(globalThis.navigator.connection?.effectiveType).toBe('wifi');

    cleanup();

    expect(globalThis.navigator).toBe(original);
  });

  test('mockViewport installs dimensions and restores previous values', () => {
    const originalWidth = globalThis.innerWidth;
    const originalHeight = globalThis.innerHeight;
    const originalDpr = globalThis.devicePixelRatio;
    const cleanup = mockViewport(1280, 720, 2);

    expect(globalThis.innerWidth).toBe(1280);
    expect(globalThis.innerHeight).toBe(720);
    expect(globalThis.devicePixelRatio).toBe(2);

    cleanup();

    expect(globalThis.innerWidth).toBe(originalWidth);
    expect(globalThis.innerHeight).toBe(originalHeight);
    expect(globalThis.devicePixelRatio).toBe(originalDpr);
  });

  test('mockWebGL installs a canvas probe path and restores document shape', () => {
    const originalDocument = globalThis.document;
    const cleanup = mockWebGL('Mock GPU Renderer');
    const canvas = globalThis.document.createElement('canvas') as {
      getContext(type: string): { getParameter(pname: number): string | null; getExtension(name: string): object | null } | null;
    };
    const gl = canvas.getContext('webgl');

    expect(gl?.getParameter(0x1f01)).toBe('Mock GPU Renderer');
    expect(gl?.getExtension('WEBGL_debug_renderer_info')).toEqual({ UNMASKED_RENDERER_WEBGL: 0x9246 });

    cleanup();

    expect(globalThis.document).toBe(originalDocument);
  });
});
