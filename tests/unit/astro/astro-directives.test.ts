// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WASMDispatch, Diagnostics, HLC, Receipt, TypedRef } from '@czap/core';
import { Effect } from 'effect';
import { Resumption } from '@czap/web';
import { configureRuntimePolicy } from '../../../packages/astro/src/runtime/policy.js';
import { MockEventSource } from '../../helpers/mock-event-source.js';

function makeEl(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

function disposeTree(): void {
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.dispatchEvent(new CustomEvent('czap:dispose'));
  });
}

const noop = () => Promise.resolve();
const BOUNDARY = JSON.stringify({
  id: 'hero',
  input: 'viewport.width',
  thresholds: [0, 768, 1280],
  states: ['mobile', 'tablet', 'desktop'],
  hysteresis: 40,
});

async function makeReceiptEnvelope(step: number): Promise<Receipt.Envelope> {
  const payload = await Effect.runPromise(TypedRef.create('schema:test', { step }));
  return Effect.runPromise(
    Receipt.createEnvelope(
      'frame',
      { type: 'artifact', id: 'llm' },
      payload,
      HLC.increment(HLC.create('llm-node'), step),
      Receipt.GENESIS,
    ),
  );
}

describe('satellite directive', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    Diagnostics.reset();
    disposeTree();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  test('evaluates initial state from viewport width through shared boundary primitives', async () => {
    vi.stubGlobal('innerWidth', 1024);
    const el = makeEl('div', { 'data-czap-boundary': BOUNDARY });

    const mod = await import('../../../packages/astro/src/client-directives/satellite.js');
    mod.default(noop, {}, el);

    expect(el.getAttribute('data-czap-state')).toBe('tablet');
  });

  test('handles reinit with updated boundary state', async () => {
    vi.stubGlobal('innerWidth', 400);
    const el = makeEl('div', { 'data-czap-boundary': BOUNDARY });

    const mod = await import('../../../packages/astro/src/client-directives/satellite.js');
    mod.default(noop, {}, el);
    expect(el.getAttribute('data-czap-state')).toBe('mobile');

    vi.stubGlobal('innerWidth', 1500);
    el.dispatchEvent(new CustomEvent('czap:reinit', { bubbles: true }));
    expect(el.getAttribute('data-czap-state')).toBe('desktop');
  });

  test('skips duplicate satellite state emissions and exits early for invalid boundaries', async () => {
    vi.stubGlobal('innerWidth', 1024);
    const valid = makeEl('div', { 'data-czap-boundary': BOUNDARY });
    let eventCount = 0;
    valid.addEventListener('czap:satellite-state', () => {
      eventCount += 1;
    });

    const mod = await import('../../../packages/astro/src/client-directives/satellite.js');
    mod.default(noop, {}, valid);
    expect(eventCount).toBe(1);

    valid.dispatchEvent(new CustomEvent('czap:reinit', { bubbles: true }));
    expect(eventCount).toBe(1);

    const invalid = makeEl('div', { 'data-czap-boundary': '{bad-json' });
    const load = vi.fn(() => Promise.resolve());
    mod.default(load, {}, invalid);
    expect(load).not.toHaveBeenCalled();
  });

  test('satellite reinit falls back to an empty previous state when no data-czap-state attribute is present', async () => {
    vi.stubGlobal('innerWidth', 1024);
    const el = makeEl('div', { 'data-czap-boundary': BOUNDARY });

    const mod = await import('../../../packages/astro/src/client-directives/satellite.js');
    mod.default(noop, {}, el);
    expect(el.getAttribute('data-czap-state')).toBe('tablet');

    el.removeAttribute('data-czap-state');
    vi.stubGlobal('innerWidth', 400);
    el.dispatchEvent(new CustomEvent('czap:reinit', { bubbles: true }));

    expect(el.getAttribute('data-czap-state')).toBe('mobile');
  });
});

describe('stream directive', () => {
  let cleanupES: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    cleanupES = MockEventSource.install();
  });

  afterEach(() => {
    Diagnostics.reset();
    disposeTree();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanupES();
    document.body.innerHTML = '';
  });

  test('opens EventSource to configured URL', async () => {
    const el = makeEl('div', {
      'data-czap-stream-url': '/api/feed',
    });

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0]!.url).toContain('/api/feed');
  });

  test('applies patch messages through the shared morph runtime', async () => {
    const el = makeEl('div', {
      'data-czap-stream-url': '/api/feed',
      'data-czap-slot': '/hero',
    });
    el.innerHTML = '<p>Original</p>';

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    const source = MockEventSource.instances[0]!;
    source.simulateMessage(
      JSON.stringify({
        type: 'patch',
        data: '<div data-czap-slot="/hero"><p>Updated content</p></div>',
      }),
      'evt-1',
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(el.innerHTML).toContain('Updated content');
  });

  test('dispatches signals and reconnect lifecycle events', async () => {
    const el = makeEl('div', {
      'data-czap-stream-url': '/api/feed',
      'data-czap-stream-artifact': 'hero',
    });

    let connected = false;
    let signalData: unknown = null;
    el.addEventListener('czap:stream-connected', () => {
      connected = true;
    });
    el.addEventListener('czap:signal', ((event: CustomEvent) => {
      signalData = event.detail;
    }) as EventListener);

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    const source = MockEventSource.instances[0]!;
    source.simulateOpen();
    source.simulateMessage(JSON.stringify({ type: 'signal', data: { viewport: 1024 } }), 'evt-2');

    expect(connected).toBe(true);
    expect(signalData).toEqual({ viewport: 1024 });
  });

  test('reconnects through the shared resumption runtime after a disconnect', async () => {
    const scheduled: Array<() => void> = [];
    const clearTimeoutMock = vi.fn();
    const resumeSpy = vi.spyOn(Resumption, 'resume').mockReturnValue(
      Effect.succeed({
        type: 'snapshot',
        html: '<div data-czap-stream-url="/api/feed" data-czap-stream-artifact="hero">Recovered</div>',
        signals: null,
        lastEventId: 'evt-10',
      }),
    );

    vi.stubGlobal(
      'setTimeout',
      ((callback: () => void) => {
        scheduled.push(callback);
        return scheduled.length;
      }) as never,
    );
    vi.stubGlobal('clearTimeout', clearTimeoutMock as never);

    const el = makeEl('div', {
      'data-czap-stream-url': '/api/feed',
      'data-czap-stream-artifact': 'hero',
    });

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    let source = MockEventSource.instances[0]!;
    source.simulateMessage(JSON.stringify({ type: 'patch', data: '<div>Connected</div>' }), 'evt-9');
    source.simulateError();
    await Promise.resolve();

    expect(scheduled.length).toBeGreaterThan(0);
    scheduled.pop()?.();

    source = MockEventSource.instances[1]!;
    source.simulateMessage(JSON.stringify({ type: 'patch', data: '<div>Recovered</div>' }), 'evt-10');

    await Promise.resolve();
    await Promise.resolve();

    expect(resumeSpy).toHaveBeenCalledWith('hero', 'evt-10', {});
    expect(el.innerHTML).toContain('Recovered');
    expect(clearTimeoutMock).not.toHaveBeenCalled();
  });

  test('tracks semantic-id targets across outerHTML replacement and replay patch objects', async () => {
    const scheduled: Array<() => void> = [];
    vi.stubGlobal(
      'setTimeout',
      ((callback: () => void) => {
        scheduled.push(callback);
        return scheduled.length;
      }) as never,
    );
    vi.stubGlobal('clearTimeout', vi.fn() as never);

    const resumeSpy = vi.spyOn(Resumption, 'resume').mockReturnValue(
      Effect.succeed({
        type: 'replay',
        patches: [
          { data: '<section data-czap-id="semantic-stream"><div class="replayed-data">first</div></section>' },
          { html: '<section data-czap-id="semantic-stream"><div class="replayed-html">second</div></section>' },
          { html: 123 },
        ] as unknown[],
      }),
    );

    const el = makeEl('section', {
      'data-czap-stream-url': '/api/feed',
      'data-czap-stream-artifact': 'semantic-stream',
      'data-czap-stream-morph': 'outerHTML',
      'data-czap-id': 'semantic-stream',
    });

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    let source = MockEventSource.instances[0]!;
    source.simulateMessage(
      JSON.stringify({
        type: 'patch',
        data: '<section data-czap-id="semantic-stream"><div class="outer-swap">outer</div></section>',
      }),
      'evt-1',
    );
    await Promise.resolve();
    await Promise.resolve();

    source.simulateError();
    scheduled.shift()?.();

    source = MockEventSource.instances.at(-1)!;
    source.simulateOpen();
    source.simulateMessage(JSON.stringify({ type: 'heartbeat' }), 'evt-2');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeSpy).toHaveBeenCalledWith('semantic-stream', 'evt-2', {});
    const target = document.querySelector('[data-czap-id="semantic-stream"]');
    expect(target?.innerHTML).toContain('replayed-html');
  });

  test('passes same-origin allowlists into stream resumption and tolerates id targets disappearing across outerHTML swaps', async () => {
    const scheduled: Array<() => void> = [];
    vi.stubGlobal(
      'setTimeout',
      ((callback: () => void) => {
        scheduled.push(callback);
        return scheduled.length;
      }) as never,
    );
    vi.stubGlobal('clearTimeout', vi.fn() as never);
    configureRuntimePolicy({
      endpointPolicy: {
        mode: 'same-origin',
        allowOrigins: ['https://trusted.example'],
      },
    });

    const resumeSpy = vi.spyOn(Resumption, 'resume').mockReturnValue(
      Effect.succeed({
        type: 'snapshot',
        html: '<section><div class="recovered">resumed</div></section>',
        signals: null,
        lastEventId: 'evt-2',
      }),
    );

    const el = makeEl('section', {
      id: 'stream-id-target',
      'data-czap-stream-url': '/api/feed',
      'data-czap-stream-artifact': 'hero',
      'data-czap-stream-morph': 'outerHTML',
    });

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    let source = MockEventSource.instances[0]!;
    source.simulateMessage(JSON.stringify({ type: 'patch', data: '<section><div class="outer">outer</div></section>' }), 'evt-1');
    await Promise.resolve();
    await Promise.resolve();

    source.simulateError();
    scheduled.shift()?.();
    source = MockEventSource.instances.at(-1)!;
    source.simulateOpen();
    source.simulateMessage(JSON.stringify({ type: 'heartbeat' }), 'evt-2');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('stream-id-target')).toBeNull();
    expect(resumeSpy).toHaveBeenCalledWith(
      'hero',
      'evt-2',
      expect.objectContaining({
        endpointPolicy: expect.objectContaining({
          mode: 'same-origin',
          allowOrigins: ['https://trusted.example'],
        }),
      }),
    );
  });

  test('treats per-kind same-origin allowlists as custom stream endpoint policy metadata during replay recovery', async () => {
    const scheduled: Array<() => void> = [];
    vi.stubGlobal(
      'setTimeout',
      ((callback: () => void) => {
        scheduled.push(callback);
        return scheduled.length;
      }) as never,
    );
    vi.stubGlobal('clearTimeout', vi.fn() as never);
    configureRuntimePolicy({
      endpointPolicy: {
        mode: 'same-origin',
        byKind: {
          replay: ['https://trusted.example'],
        },
      },
    });

    const resumeSpy = vi.spyOn(Resumption, 'resume').mockReturnValue(
      Effect.succeed({
        type: 'snapshot',
        html: '<div data-czap-stream-url="/api/feed" data-czap-stream-artifact="hero">Recovered</div>',
        signals: null,
        lastEventId: 'evt-4',
      }),
    );

    const el = makeEl('div', {
      'data-czap-stream-url': '/api/feed',
      'data-czap-stream-artifact': 'hero',
    });

    const mod = await import('../../../packages/astro/src/client-directives/stream.js');
    mod.default(noop, {}, el);

    let source = MockEventSource.instances[0]!;
    source.simulateMessage(JSON.stringify({ type: 'patch', data: '<div>Connected</div>' }), 'evt-3');
    source.simulateError();
    await Promise.resolve();
    scheduled.pop()?.();

    source = MockEventSource.instances.at(-1)!;
    source.simulateMessage(JSON.stringify({ type: 'patch', data: '<div>Recovered</div>' }), 'evt-4');
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeSpy).toHaveBeenCalledWith(
      'hero',
      'evt-4',
      expect.objectContaining({
        endpointPolicy: expect.objectContaining({
          mode: 'same-origin',
          byKind: expect.objectContaining({
            replay: ['https://trusted.example'],
          }),
        }),
      }),
    );
  });
});

describe('llm directive', () => {
  let cleanupES: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    cleanupES = MockEventSource.install();
  });

  afterEach(() => {
    Diagnostics.reset();
    disposeTree();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanupES();
    document.body.innerHTML = '';
  });

  test('opens EventSource to the configured endpoint', async () => {
    const el = makeEl('div', {
      'data-czap-llm-url': '/api/chat',
    });

    const mod = await import('../../../packages/astro/src/client-directives/llm.js');
    mod.default(noop, {}, el);

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0]!.url).toContain('/api/chat');
  });

  test('streams text through LLMAdapter -> TokenBuffer -> UIQuality -> GenFrame', async () => {
    const el = makeEl('div', {
      'data-czap-llm-url': '/api/chat',
      'data-czap-llm-mode': 'append',
    });

    const mod = await import('../../../packages/astro/src/client-directives/llm.js');
    mod.default(noop, {}, el);

    const source = MockEventSource.instances[0]!;
    source.simulateMessage(JSON.stringify({ type: 'text', content: 'Hello ' }));
    source.simulateMessage(JSON.stringify({ type: 'text', content: 'World' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el.textContent).toBe('Hello World');
  });

  test('dispatches parsed tool events and done', async () => {
    const el = makeEl('div', {
      'data-czap-llm-url': '/api/chat',
    });

    let toolResult: { name: string; args: unknown } | null = null;
    let done = false;
    el.addEventListener('czap:llm-tool-end', ((event: CustomEvent) => {
      toolResult = event.detail;
    }) as EventListener);
    el.addEventListener('czap:llm-done', () => {
      done = true;
    });

    const mod = await import('../../../packages/astro/src/client-directives/llm.js');
    mod.default(noop, {}, el);

    const source = MockEventSource.instances[0]!;
    source.simulateMessage(JSON.stringify({ type: 'tool-call-start', toolName: 'search' }));
    source.simulateMessage(JSON.stringify({ type: 'tool-call-delta', content: '{"query":', partial: true }));
    source.simulateMessage(JSON.stringify({ type: 'tool-call-delta', content: '"hello"}', partial: false }));
    source.simulateMessage(JSON.stringify({ type: 'tool-call-end' }));
    source.simulateMessage(JSON.stringify({ type: 'done' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toolResult).toEqual({ name: 'search', args: { query: 'hello' } });
    expect(done).toBe(true);
  });

  test('ignores unknown structured payloads and accepts valid receipt envelopes without interrupting text flow', async () => {
    const el = makeEl('div', {
      'data-czap-llm-url': '/api/chat',
      'data-czap-llm-mode': 'append',
    });

    const mod = await import('../../../packages/astro/src/client-directives/llm.js');
    mod.default(noop, {}, el);

    const envelope = await makeReceiptEnvelope(1);
    const source = MockEventSource.instances[0]!;
    source.simulateMessage(JSON.stringify({ type: 'receipt', data: envelope }));
    source.simulateMessage(JSON.stringify({ type: 'unknown', content: 'ignored' }));
    source.simulateMessage(JSON.stringify({ type: 'text', content: 'after receipt' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el.textContent).toBe('after receipt');
  });

  test('falls back to the host element target and surfaces structured error payloads', async () => {
    const el = makeEl('div', {
      'data-czap-llm-url': '/api/chat',
      'data-czap-llm-target': '.missing-target',
      'data-czap-llm-mode': 'append',
    });

    const errors: Array<{ message: string }> = [];
    el.addEventListener('czap:llm-error', ((event: CustomEvent<{ message: string }>) => errors.push(event.detail)) as EventListener);

    const mod = await import('../../../packages/astro/src/client-directives/llm.js');
    mod.default(noop, {}, el);

    const source = MockEventSource.instances[0]!;
    source.simulateMessage('');
    source.simulateMessage('plain fallback');
    source.simulateMessage(JSON.stringify({ type: 'error', message: 'stream boom' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el.textContent).toBe('plain fallback');
    expect(errors).toEqual([{ message: 'stream boom' }]);
    expect(source.readyState).toBe(MockEventSource.CLOSED);
  });
});

describe('worker directive', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    Diagnostics.reset();
    disposeTree();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  test('falls back to main-thread evaluation when workers are unavailable', async () => {
    vi.stubGlobal('innerWidth', 1024);
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
    const el = makeEl('div', { 'data-czap-boundary': BOUNDARY });

    const mod = await import('../../../packages/astro/src/client-directives/worker.js');
    mod.default(noop, {}, el);

    expect(el.getAttribute('data-czap-state')).toBe('tablet');
  });
});

describe('wasm directive', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Diagnostics.reset();
    disposeTree();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('reads the wasm URL from the shared runtime configuration and loads through WASMDispatch', async () => {
    const el = makeEl('div', { 'data-czap-wasm': 'true' });
    document.documentElement.setAttribute('data-czap-wasm-url', '/czap-compute.wasm');
    const loadSpy = vi.spyOn(WASMDispatch, 'load').mockResolvedValue(WASMDispatch.kernels());

    const mod = await import('../../../packages/astro/src/client-directives/wasm.js');
    mod.default(noop, {}, el);
    await Promise.resolve();

    expect(loadSpy).toHaveBeenCalledWith('/czap-compute.wasm');
  });
});
