// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { Effect } from 'effect';
import { Diagnostics, GenFrame, HLC, Receipt, TokenBuffer, TypedRef, WASMDispatch } from '@czap/core';
import type { UIFrame } from '@czap/core';
import {
  bootstrapSlots,
  configureWasmRuntime,
  getSlotRegistry,
  installSwapReinit,
  loadWasmRuntime,
  reinitializeDirectives,
  rescanSlots,
  resolveWasmUrl,
} from '../../../packages/astro/src/runtime/index.js';
import { createReceiptChain } from '../../../packages/astro/src/runtime/receipt-chain.js';
import {
  createDOMLLMSessionHost,
  createLLMSession,
  type LLMSessionHost,
  createLLMSessionWithHost,
  createSupportLLMSessionHost,
  createSupportLLMTokenBoundaryHost,
} from '../../../packages/astro/src/runtime/llm-session.js';
import { createLLMReceiptTracker } from '../../../packages/astro/src/runtime/llm-receipt-tracker.js';
import { createStreamScheduler } from '../../../packages/astro/src/runtime/stream-session.js';
import { createRuntimeSession } from '../../../packages/astro/src/runtime/runtime-session.js';
import {
  applyBoundaryState,
  evaluateBoundary,
  parseBoundary,
  readSignalValue,
} from '../../../packages/astro/src/runtime/boundary.js';
import { readRuntimeGlobal, writeRuntimeGlobal } from '../../../packages/astro/src/runtime/globals.js';
import { parseLLMChunk } from '../../../packages/astro/src/runtime/llm.js';

type RuntimeWindow = Window & {
  __CZAP_SLOT_REGISTRY__?: unknown;
  __CZAP_SLOT_BOOTSTRAPPED__?: boolean;
  __CZAP_SWAP_REINIT__?: boolean;
  __CZAP_SLOTS__?: unknown;
};

function resetRuntimeWindow(): void {
  const runtimeWindow = window as RuntimeWindow;
  delete runtimeWindow.__CZAP_SLOT_REGISTRY__;
  delete runtimeWindow.__CZAP_SLOT_BOOTSTRAPPED__;
  delete runtimeWindow.__CZAP_SWAP_REINIT__;
  delete runtimeWindow.__CZAP_SLOTS__;
}

async function makeEnvelope(step: number, previous: string | readonly string[]) {
  const payload = await Effect.runPromise(TypedRef.create('schema:test', { step }));
  return Effect.runPromise(
    Receipt.createEnvelope(
      'frame',
      { type: 'artifact', id: 'ui' },
      payload,
      HLC.increment(HLC.create('ui-node'), step),
      previous,
    ),
  );
}

function makeFrame(receiptId: string, tokens: readonly string[], bufferPosition: number): UIFrame {
  return {
    type: 'keyframe',
    tokens,
    qualityTier: 'styled',
    morphStrategy: 'replace',
    timestamp: bufferPosition,
    receiptId: receiptId as UIFrame['receiptId'],
    bufferPosition,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  resetRuntimeWindow();
  delete (window as Window & { __CZAP_WASM__?: unknown }).__CZAP_WASM__;
  document.documentElement.removeAttribute('data-czap-wasm-url');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('astro shared runtime adapters', () => {
  test('bootstraps slots into the shared registry and reinitializes directives after swaps', () => {
    document.body.innerHTML = `
      <section data-czap-slot="/hero" data-czap-mode="replace"></section>
      <div id="widget" data-czap-boundary='{"id":"hero","input":"viewport.width","thresholds":[0],"states":["compact"]}'></div>
    `;

    const registry = bootstrapSlots();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(registry.get('/hero' as never)?.mode).toBe('replace');
    expect(getSlotRegistry().get('/hero' as never)?.element).toBe(
      document.querySelector('[data-czap-slot="/hero"]'),
    );

    let reinitCount = 0;
    document.getElementById('widget')?.addEventListener('czap:reinit', () => {
      reinitCount += 1;
    });

    installSwapReinit();

    const nextSlot = document.createElement('section');
    nextSlot.setAttribute('data-czap-slot', '/next');
    nextSlot.setAttribute('data-czap-mode', 'partial');
    document.body.appendChild(nextSlot);

    document.dispatchEvent(new Event('astro:after-swap'));

    expect(getSlotRegistry().get('/next' as never)?.mode).toBe('partial');
    expect(reinitCount).toBe(1);
  });

  test('rescans slots through the document root and installs swap reinit only once', () => {
    document.body.innerHTML = `
      <section data-czap-slot="/hero" data-czap-mode="replace"></section>
      <div id="widget" data-czap-boundary='{"id":"hero","input":"viewport.width","thresholds":[0],"states":["compact"]}'></div>
    `;

    const registry = rescanSlots(document);
    const runtimeWindow = window as RuntimeWindow;
    expect(registry.get('/hero' as never)?.mode).toBe('replace');
    expect(runtimeWindow.__CZAP_SLOTS__).toMatchObject({
      entries: {
        '/hero': { path: '/hero', mode: 'replace' },
      },
    });
    expect(Object.prototype.propertyIsEnumerable.call(runtimeWindow, '__CZAP_SLOTS__')).toBe(false);

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    installSwapReinit();
    installSwapReinit();

    expect(
      addEventListenerSpy.mock.calls.filter(([type]) => type === 'astro:after-swap'),
    ).toHaveLength(1);
    expect(runtimeWindow.__CZAP_SWAP_REINIT__).toBe(true);
    expect(Object.prototype.propertyIsEnumerable.call(runtimeWindow, '__CZAP_SWAP_REINIT__')).toBe(false);
  });

  test('bootstrapSlots is idempotent and keeps a single shared registry instance', () => {
    document.body.innerHTML = `<section data-czap-slot="/hero" data-czap-mode="replace"></section>`;

    const first = bootstrapSlots();
    const second = bootstrapSlots();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(first).toBe(second);
    expect(first).toBe(getSlotRegistry());
    expect((window as RuntimeWindow).__CZAP_SLOT_BOOTSTRAPPED__).toBe(true);
    expect(Object.prototype.propertyIsEnumerable.call(window, '__CZAP_SLOT_REGISTRY__')).toBe(false);
    expect(Object.prototype.propertyIsEnumerable.call(window, '__CZAP_SLOT_BOOTSTRAPPED__')).toBe(false);
    expect(first.get('/hero' as never)?.mode).toBe('replace');
  });

  test('getSlotRegistry replaces an existing window global that does not match the registry shape', () => {
    // Pre-seed with an object missing register/entries/get to force isSlotRegistryShape
    // to reject it and fall through to writing a fresh registry.
    writeRuntimeGlobal('__CZAP_SLOT_REGISTRY__', { bogus: true } as never);
    const registry = getSlotRegistry();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.entries).toBe('function');
  });

  test('runtime globals are non-enumerable by default, support writable overrides, and degrade outside the browser', () => {
    const isNumber = (v: unknown): v is number => typeof v === 'number';
    const isString = (v: unknown): v is string => typeof v === 'string';

    writeRuntimeGlobal('__CZAP_TEST__', 42);
    expect(readRuntimeGlobal('__CZAP_TEST__', isNumber)).toBe(42);

    const fixedDescriptor = Object.getOwnPropertyDescriptor(window, '__CZAP_TEST__');
    expect(fixedDescriptor).toMatchObject({
      configurable: true,
      enumerable: false,
      writable: false,
      value: 42,
    });

    writeRuntimeGlobal('__CZAP_MUTABLE__', 1, { writable: true });
    const mutableDescriptor = Object.getOwnPropertyDescriptor(window, '__CZAP_MUTABLE__');
    expect(mutableDescriptor?.writable).toBe(true);
    (window as Window & { __CZAP_MUTABLE__?: number }).__CZAP_MUTABLE__ = 2;
    expect(readRuntimeGlobal('__CZAP_MUTABLE__', isNumber)).toBe(2);

    const originalWindow = window;
    vi.stubGlobal('window', undefined as never);
    expect(writeRuntimeGlobal('__CZAP_OFFLINE__', 'value')).toBe('value');
    expect(readRuntimeGlobal('__CZAP_OFFLINE__', isString)).toBeUndefined();
    vi.stubGlobal('window', originalWindow as never);
  });

  test('rescans slots invalidate stale paths and preserve retargeted slot addresses', () => {
    document.body.innerHTML = `<section id="slot" data-czap-slot="/hero" data-czap-mode="replace"></section>`;

    const first = rescanSlots(document);
    expect(first.get('/hero' as never)?.element).toBe(document.getElementById('slot'));

    const slot = document.getElementById('slot')!;
    slot.setAttribute('data-czap-slot', '/hero/next');
    rescanSlots(document);

    const runtimeWindow = window as RuntimeWindow;
    expect(first.get('/hero' as never)).toBeUndefined();
    expect(first.get('/hero/next' as never)?.element).toBe(slot);
    expect(runtimeWindow.__CZAP_SLOTS__).toMatchObject({
      entries: {
        '/hero/next': { path: '/hero/next', mode: 'replace' },
      },
    });
  });

  test('reinitializeDirectives dispatches across stream, llm, wasm, and boundary surfaces', () => {
    document.body.innerHTML = `
      <div id="boundary" data-czap-boundary="{}"></div>
      <div id="stream" data-czap-stream-url="/stream"></div>
      <div id="llm" data-czap-llm-url="/llm"></div>
      <div id="wasm" data-czap-wasm="true"></div>
    `;

    const counts = new Map<string, number>();
    for (const id of ['boundary', 'stream', 'llm', 'wasm'] as const) {
      document.getElementById(id)?.addEventListener('czap:reinit', () => {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      });
    }

    reinitializeDirectives();

    expect(counts).toEqual(
      new Map([
        ['boundary', 1],
        ['stream', 1],
        ['llm', 1],
        ['wasm', 1],
      ]),
    );
  });

  test('replays frames in DAG order when receipt envelopes are ingested', async () => {
    const first = await makeEnvelope(1, Receipt.GENESIS);
    const second = await makeEnvelope(2, first.hash);
    const third = await makeEnvelope(3, second.hash);

    const receiptChain = createReceiptChain();
    const frame1 = makeFrame(first.hash, ['first'], 1);
    const frame2 = makeFrame(second.hash, ['second'], 2);
    const frame3 = makeFrame(third.hash, ['third'], 3);

    receiptChain.rememberFrame(frame3);
    receiptChain.rememberFrame(frame1);
    receiptChain.rememberFrame(frame2);

    expect(receiptChain.ingestEnvelope(second)).toBe(true);
    expect(receiptChain.ingestEnvelope(third)).toBe(true);
    expect(receiptChain.ingestEnvelope(first)).toBe(true);

    expect(receiptChain.hasFramesAfter(first.hash as UIFrame['receiptId'])).toBe(true);
    expect(receiptChain.getFramesAfter(first.hash as UIFrame['receiptId'])).toEqual([frame2, frame3]);
    expect(receiptChain.latestReceiptId()).toBe(third.hash);
    expect(receiptChain.trustMode()).toBe('advisory-unverified');
  });

  test('handles empty and unknown receipt lookups without losing remembered frames', async () => {
    const receiptChain = createReceiptChain();

    expect(receiptChain.hasFramesAfter(null)).toBe(false);
    expect(receiptChain.getFramesAfter(null)).toEqual([]);
    expect(receiptChain.latestReceiptId()).toBeNull();

    const first = await makeEnvelope(1, Receipt.GENESIS);
    const frame1 = makeFrame(first.hash, ['first'], 1);

    receiptChain.rememberFrame(frame1);

    // null returns all frames (full replay from start)
    expect(receiptChain.hasFramesAfter(null)).toBe(true);
    expect(receiptChain.getFramesAfter(null)).toEqual([frame1]);

    // known ID returns frames after it
    expect(receiptChain.hasFramesAfter(first.hash as UIFrame['receiptId'])).toBe(false);
    expect(receiptChain.getFramesAfter(first.hash as UIFrame['receiptId'])).toEqual([]);

    // unknown/stale ID returns empty array (gap-only replay, not full replay)
    expect(receiptChain.hasFramesAfter('stale-unknown-id')).toBe(false);
    expect(receiptChain.getFramesAfter('stale-unknown-id')).toEqual([]);

    expect(receiptChain.latestReceiptId()).toBe(first.hash);
  });

  test('treats receipt signatures as advisory metadata without implying authenticity', async () => {
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    const receiptChain = createReceiptChain();
    const envelope = await makeEnvelope(1, Receipt.GENESIS);
    receiptChain.rememberFrame(makeFrame(envelope.hash, ['signed'], 1));
    const signed = { ...envelope, signature: 'deadbeef' };

    expect(receiptChain.ingestEnvelope(signed)).toBe(true);
    expect(receiptChain.latestReceiptId()).toBe(envelope.hash);
    expect(receiptChain.trustMode()).toBe('advisory-unverified');

    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        source: 'czap/astro.receipt-chain',
        code: 'receipt-signature-unverified',
      }),
    );
  });

  test('falls back to remembered order when ingested receipts have no remembered frames and avoids duplicate remembers', async () => {
    const receiptChain = createReceiptChain();
    const first = await makeEnvelope(1, Receipt.GENESIS);
    const second = await makeEnvelope(2, first.hash);
    const frame = makeFrame(first.hash, ['first'], 1);

    expect(receiptChain.ingestEnvelope(second)).toBe(true);
    expect(receiptChain.latestReceiptId()).toBeNull();
    expect(receiptChain.hasFramesAfter(null)).toBe(false);

    receiptChain.rememberFrame(frame);
    receiptChain.rememberFrame(frame);

    expect(receiptChain.getFramesAfter(null)).toEqual([frame]);
    expect(receiptChain.latestReceiptId()).toBe(first.hash);
  });

  test('returns no later frames when querying the latest remembered receipt', async () => {
    const receiptChain = createReceiptChain();
    const first = await makeEnvelope(1, Receipt.GENESIS);
    const second = await makeEnvelope(2, first.hash);
    const frame1 = makeFrame(first.hash, ['first'], 1);
    const frame2 = makeFrame(second.hash, ['second'], 2);

    receiptChain.rememberFrame(frame1);
    receiptChain.rememberFrame(frame2);
    expect(receiptChain.ingestEnvelope(first)).toBe(true);
    expect(receiptChain.ingestEnvelope(second)).toBe(true);

    expect(receiptChain.hasFramesAfter(second.hash as UIFrame['receiptId'])).toBe(false);
    expect(receiptChain.getFramesAfter(second.hash as UIFrame['receiptId'])).toEqual([]);
  });

  test('configures and resolves shared wasm URLs through the runtime adapter', () => {
    const inherited = document.createElement('div');
    inherited.setAttribute('data-czap-wasm', 'true');
    document.body.appendChild(inherited);

    const pinned = document.createElement('div');
    pinned.setAttribute('data-czap-wasm', 'true');
    pinned.setAttribute('data-czap-wasm-url', '/custom.wasm');
    document.body.appendChild(pinned);

    configureWasmRuntime('/runtime.wasm');

    expect(document.documentElement.getAttribute('data-czap-wasm-url')).toBe('/runtime.wasm');
    expect(inherited.getAttribute('data-czap-wasm-url')).toBe('/runtime.wasm');
    expect(resolveWasmUrl(inherited)).toBe('/runtime.wasm');
    expect(resolveWasmUrl(pinned)).toBe('/custom.wasm');

    configureWasmRuntime(null);

    expect(document.documentElement.hasAttribute('data-czap-wasm-url')).toBe(false);
  });

  test('loads wasm kernels through WASMDispatch and dispatches readiness events', async () => {
    const element = document.createElement('div');
    element.setAttribute('data-czap-wasm', 'true');
    document.body.appendChild(element);
    configureWasmRuntime('/runtime.wasm');

    const kernels = WASMDispatch.kernels();
    const loadSpy = vi.spyOn(WASMDispatch, 'load').mockResolvedValue(kernels);
    let detail: { url: string } | null = null;
    document.addEventListener('czap:wasm-ready', ((event: CustomEvent<{ url: string }>) => {
      detail = event.detail;
    }) as EventListener);

    await loadWasmRuntime(element);

    expect(loadSpy).toHaveBeenCalledWith('/runtime.wasm');
    expect((window as Window & { __CZAP_WASM__?: unknown }).__CZAP_WASM__).toBe(kernels);
    expect(Object.prototype.propertyIsEnumerable.call(window, '__CZAP_WASM__')).toBe(false);
    expect(detail).toEqual({ url: '/runtime.wasm' });
  });

  test('skips empty wasm loads and surfaces shared wasm runtime errors', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);

    const loadSpy = vi.spyOn(WASMDispatch, 'load');
    await loadWasmRuntime(element);
    expect(loadSpy).not.toHaveBeenCalled();

    element.setAttribute('data-czap-wasm-url', '/broken.wasm');
    loadSpy.mockRejectedValueOnce(new Error('bad module'));

    let detail: { url: string; reason: string } | null = null;
    document.addEventListener('czap:wasm-error', ((event: CustomEvent<{ url: string; reason: string }>) => {
      detail = event.detail;
    }) as EventListener);

    await loadWasmRuntime(element);

    expect(detail).toEqual({ url: '/broken.wasm', reason: 'bad module' });
  });

  test('falls back to a generic wasm error reason when loading rejects with a non-Error value', async () => {
    const element = document.createElement('div');
    element.setAttribute('data-czap-wasm-url', '/broken.wasm');
    document.body.appendChild(element);

    vi.spyOn(WASMDispatch, 'load').mockRejectedValueOnce('boom');

    let detail: { url: string; reason: string } | null = null;
    document.addEventListener('czap:wasm-error', ((event: CustomEvent<{ url: string; reason: string }>) => {
      detail = event.detail;
    }) as EventListener);

    await loadWasmRuntime(element);

    expect(detail).toEqual({ url: '/broken.wasm', reason: 'load-failed' });
  });

  test('compatibility shims delegate boundary evaluation and event application to the shared runtime', () => {
    vi.stubGlobal('innerWidth', 780);

    const boundary = {
      id: 'hero',
      input: 'viewport.width',
      thresholds: [0, 768, 1280],
      states: ['mobile', 'tablet', 'desktop'] as const,
      hysteresis: 40,
    };

    const parsedBoundary = parseBoundary(JSON.stringify(boundary));
    expect(parsedBoundary).not.toBeNull();

    expect(evaluateBoundary(parsedBoundary!, 1024)).toBe('tablet');
    expect(evaluateBoundary(parsedBoundary!, 780, 'mobile')).toBe('mobile');
    expect(evaluateBoundary(parsedBoundary!, 789, 'mobile')).toBe('tablet');
    expect(readSignalValue('viewport.width')).toBe(780);
    expect(readSignalValue('signal.depth')).toBeUndefined();

    const element = document.createElement('div');
    document.body.appendChild(element);
    const runtimeBoundary = parseBoundary(JSON.stringify(boundary));
    expect(runtimeBoundary).not.toBeNull();

    let detail:
      | {
          discrete: Record<string, string>;
          css: Record<string, string | number>;
          glsl: Record<string, number>;
          aria: Record<string, string>;
        }
      | null = null;

    element.addEventListener('czap:shared-boundary', ((event: CustomEvent<typeof detail>) => {
      detail = event.detail;
    }) as EventListener);

    applyBoundaryState(
      element,
      runtimeBoundary!,
      {
        discrete: { hero: 'tablet' },
        outputs: {
          css: { '--czap-gap': 24 },
          glsl: { u_time: 0.5 },
          aria: { 'aria-busy': 'true' },
        },
        css: { color: 'red' },
        aria: { onclick: 'alert(1)', role: 'status' },
      },
      'czap:shared-boundary',
    );

    expect(element.getAttribute('data-czap-state')).toBe('tablet');
    expect(element.style.getPropertyValue('--czap-gap')).toBe('24');
    expect(element.style.getPropertyValue('color')).toBe('');
    expect(element.getAttribute('aria-busy')).toBe('true');
    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('onclick')).toBeNull();
    expect(detail).toEqual({
      discrete: { hero: 'tablet' },
      css: { '--czap-gap': 24 },
      glsl: { u_time: 0.5 },
      aria: { 'aria-busy': 'true', role: 'status' },
    });
  });

  test('boundary helpers cover default ids, viewport height, malformed payload rethrows, and empty normalized state', () => {
    vi.stubGlobal('innerHeight', 720);

    const parsed = parseBoundary(
      JSON.stringify({
        input: 'viewport.height',
        thresholds: [0],
        states: ['short'],
      }),
    );

    expect(parsed?.name).toBe('default');
    expect(readSignalValue('viewport.height')).toBe(720);
    expect(evaluateBoundary(parsed!, 720, 'short')).toBe('short');

    const element = document.createElement('div');
    let detail: unknown = null;
    element.addEventListener('czap:empty-boundary', ((event: CustomEvent) => {
      detail = event.detail;
    }) as EventListener);

    applyBoundaryState(
      element,
      parsed!,
      {
        css: { color: 'red' },
        aria: { onclick: 'boom' },
      },
      'czap:empty-boundary',
    );

    expect(element.hasAttribute('data-czap-state')).toBe(false);
    expect(detail).toEqual({
      discrete: {},
      css: {},
      glsl: {},
      aria: {},
    });

    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new TypeError('parse boom');
    });
    expect(() => parseBoundary('{}')).toThrow('parse boom');
    parseSpy.mockRestore();
  });

  test('readSignalValue falls back to a server-safe zero when window is unavailable', () => {
    const originalWindow = window;

    vi.stubGlobal('window', undefined as never);
    expect(readSignalValue('viewport.width')).toBe(0);
    expect(readSignalValue('signal.depth')).toBe(0);

    vi.stubGlobal('window', originalWindow as never);
  });

  test('applyBoundaryState skips redundant data-czap-state writes while preserving event detail', () => {
    const parsed = parseBoundary(
      JSON.stringify({
        id: 'hero',
        input: 'viewport.width',
        thresholds: [0],
        states: ['compact'],
      }),
    );
    const element = document.createElement('div');
    element.setAttribute('data-czap-state', 'compact');
    const setAttributeSpy = vi.spyOn(element, 'setAttribute');
    const detailEvents: unknown[] = [];

    element.addEventListener('czap:shared-boundary', ((event: CustomEvent) => {
      detailEvents.push(event.detail);
    }) as EventListener);

    applyBoundaryState(
      element,
      parsed!,
      {
        discrete: { hero: 'compact' },
        outputs: {
          css: { '--czap-gap': 12 },
          aria: { role: 'status' },
          glsl: {},
        },
      },
      'czap:shared-boundary',
    );

    expect(
      setAttributeSpy.mock.calls.filter(([name]) => name === 'data-czap-state'),
    ).toHaveLength(0);
    expect(detailEvents).toEqual([
      {
        discrete: { hero: 'compact' },
        css: { '--czap-gap': 12 },
        glsl: {},
        aria: { role: 'status' },
      },
    ]);
    expect(element.getAttribute('data-czap-state')).toBe('compact');
    expect(element.getAttribute('role')).toBe('status');
  });

  test('parseBoundary rejects structurally invalid parsed payloads', () => {
    expect(
      parseBoundary(
        JSON.stringify({
          input: 'viewport.width',
          thresholds: [],
          states: ['compact'],
        }),
      ),
    ).toBeNull();

    expect(
      parseBoundary(
        JSON.stringify({
          input: 'viewport.width',
          thresholds: [0],
          states: [123],
        }),
      ),
    ).toBeNull();
  });

  test('shared llm parser shim normalizes text, tool deltas, and invalid chunks through the runtime parser', () => {
    expect(parseLLMChunk({ data: 'hello world' })).toEqual({
      type: 'text',
      partial: false,
      content: 'hello world',
      toolName: undefined,
      toolArgs: undefined,
    });

    expect(
      parseLLMChunk({
        data: JSON.stringify({
          type: 'tool-call-delta',
          partial: true,
          toolName: 'search',
          toolArgs: { query: 'hello' },
        }),
      }),
    ).toEqual({
      type: 'tool-call-delta',
      partial: true,
      content: '{"query":"hello"}',
      toolName: 'search',
      toolArgs: { query: 'hello' },
    });

    expect(
      parseLLMChunk({
        data: JSON.stringify({
          type: 'tool-call-end',
          partial: false,
          toolName: 'search',
        }),
      }),
    ).toEqual({
      type: 'tool-call-end',
      partial: false,
      content: undefined,
      toolName: 'search',
      toolArgs: undefined,
    });

    expect(parseLLMChunk({ data: JSON.stringify({ hello: 'world' }) })).toBeNull();
    expect(parseLLMChunk({ data: JSON.stringify({ type: 'receipt', data: { hash: 'bad' } }) })).toBeNull();
    expect(parseLLMChunk({ data: JSON.stringify({ type: 'receipt', data: null }) })).toBeNull();
    expect(parseLLMChunk({ data: JSON.stringify({ type: 'receipt', data: 'not-an-envelope' }) })).toBeNull();
    expect(parseLLMChunk({ data: JSON.stringify({ type: 'error', content: 'boom' }) })).toBeNull();
    expect(parseLLMChunk({ data: JSON.stringify({ type: 'unknown', content: 'ignored' }) })).toBeNull();
    expect(parseLLMChunk({ data: '[1,2,3]' })).toBeNull();
    expect(parseLLMChunk({ data: '' })).toBeNull();
    expect(
      parseLLMChunk({
        data: {
          type: 'tool-call-delta',
          partial: false,
          toolName: 'search',
          toolArgs: '{"query":"runtime"}',
        },
      }),
    ).toEqual({
      type: 'tool-call-delta',
      partial: false,
      content: '{"query":"runtime"}',
      toolName: 'search',
      toolArgs: '{"query":"runtime"}',
    });
    expect(parseLLMChunk({ data: { type: 42 } })).toBeNull();
    expect(parseLLMChunk({ data: 42 })).toBeNull();
    expect(parseLLMChunk({ data: '   \n\t  ' })).toBeNull();
    expect(parseLLMChunk({ data: '{not-json' })).toBeNull();
    expect(
      parseLLMChunk({
        data: JSON.stringify({
          type: 'tool-call-delta',
          partial: false,
          toolName: 123,
          content: { ignored: true },
          toolArgs: 42,
        }),
      }),
    ).toEqual({
      type: 'tool-call-delta',
      partial: false,
      content: undefined,
      toolName: undefined,
      toolArgs: 42,
    });
    expect(
      parseLLMChunk({
        data: JSON.stringify({
          type: 'done',
          partial: true,
          content: 'finished',
        }),
      }),
    ).toEqual({
      type: 'done',
      partial: true,
      content: 'finished',
      toolName: undefined,
      toolArgs: undefined,
    });
  });

  test('shared llm parser shim rethrows unexpected parse failures', () => {
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new TypeError('parse exploded');
    });

    expect(() => parseLLMChunk({ data: '{"type":"text","content":"boom"}' })).toThrow('parse exploded');
    expect(parseSpy).toHaveBeenCalled();
  });

  test('llm session incrementally emits tokens, tool completions, and replay decisions', () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const toolEnds: unknown[] = [];
    host.addEventListener('czap:llm-tool-end', ((event: CustomEvent) => toolEnds.push(event.detail)) as EventListener);

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    expect(session.ingest({ type: 'tool-call-delta', partial: true, content: '{"dangling":' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-start', partial: false, toolName: 'search' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-delta', partial: true, content: '{"query":' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-delta', partial: false, content: '"czap"}' })).toBe('continue');
    expect(session.ingest({ type: 'text', partial: false, content: 'Hello runtime' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-end', partial: false })).toBe('continue');
    expect(session.ingest({ type: 'done', partial: false })).toBe('done');

    expect(target.innerHTML).toBe('Hello runtime');
    expect(toolEnds).toEqual([{ name: 'search', args: { query: 'czap' } }]);
    expect(session.replayGap().type).toBe('re-request');
    expect(session.state).toBe('idle');

    session.activate();
    expect(session.state).toBe('active');
    session.beginReconnect();
    expect(session.state).toBe('reconnecting');
  });

  test('llm session treats morph-mode text as literal text instead of HTML', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    expect(session.ingest({ type: 'text', partial: false, content: '<img src=x onerror=alert(1)>' })).toBe('continue');
    await Promise.resolve();

    expect(target.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(target.querySelector('img')).toBeNull();
  });

  test('llm session support host preserves token, tool, and done semantics without DOM event dispatch', () => {
    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    const toolStarts: Array<{ name: string }> = [];
    const toolEnds: Array<{ name: string; args: unknown }> = [];
    const doneEvents: Array<{ accumulated: string }> = [];

    const session = createLLMSessionWithHost(
      {
        mode: 'append',
        getDeviceTier: () => 'animations',
      },
      createSupportLLMSessionHost({
        onToken: (detail) => tokenEvents.push(detail),
        onToolStart: (detail) => toolStarts.push(detail),
        onToolEnd: (detail) => toolEnds.push(detail),
        onDone: (detail) => doneEvents.push(detail),
      }),
    );

    expect(session.ingest({ type: 'text', partial: false, content: 'Hello ' })).toBe('continue');
    expect(session.ingest({ type: 'text', partial: false, content: 'world' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-start', partial: false, toolName: 'search' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-delta', partial: false, content: '{"query":"czap"}' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-end', partial: false, toolName: 'search' })).toBe('continue');
    expect(session.ingest({ type: 'done', partial: false })).toBe('done');

    expect(tokenEvents.at(0)).toEqual({ text: 'Hello ', accumulated: 'Hello ' });
    expect(tokenEvents.at(-1)).toEqual({ text: 'world', accumulated: 'Hello world' });
    expect(toolStarts).toEqual([{ name: 'search' }]);
    expect(toolEnds).toEqual([{ name: 'search', args: { query: 'czap' } }]);
    expect(doneEvents).toEqual([{ accumulated: 'Hello world' }]);
  });

  test('llm session support host token-only fast path preserves first-token boundary semantics', () => {
    const tokenEvents: Array<{ text: string; accumulated: string }> = [];

    const session = createLLMSessionWithHost(
      {
        mode: 'append',
        getDeviceTier: () => 'animations',
      },
      createSupportLLMSessionHost({
        onTokenValue: (text, accumulated) => tokenEvents.push({ text, accumulated }),
      }),
    );

    expect(session.ingest({ type: 'text', partial: false, content: 'Hello ' })).toBe('continue');
    expect(session.ingest({ type: 'done', partial: false })).toBe('done');

    expect(tokenEvents).toEqual([{ text: 'Hello ', accumulated: 'Hello ' }]);
  });

  test('llm session tolerates orphaned tool-call-end chunks and keeps only one standby runtime cached', () => {
    const toolEnds: Array<{ name: string; args: unknown }> = [];
    const tokenBufferCreates: number[] = [];
    const schedulerCreates: number[] = [];
    const schedulerResets: number[] = [];
    const tokenBufferResets: number[] = [];

    const originalTokenBufferMake = TokenBuffer.make;
    const originalGenFrameMake = GenFrame.make;

    vi.spyOn(TokenBuffer, 'make').mockImplementation(((...args: Parameters<typeof TokenBuffer.make>) => {
      tokenBufferCreates.push(tokenBufferCreates.length);
      const buffer = originalTokenBufferMake(...args);
      const originalReset = buffer.reset.bind(buffer);
      buffer.reset = () => {
        tokenBufferResets.push(tokenBufferResets.length);
        originalReset();
      };
      return buffer;
    }) as typeof TokenBuffer.make);
    vi.spyOn(GenFrame, 'make').mockImplementation(((...args: Parameters<typeof GenFrame.make>) => {
      schedulerCreates.push(schedulerCreates.length);
      const scheduler = originalGenFrameMake(...args);
      const originalReset = scheduler.reset.bind(scheduler);
      scheduler.reset = () => {
        schedulerResets.push(schedulerResets.length);
        originalReset();
      };
      return scheduler;
    }) as typeof GenFrame.make);

    const makeSession = () =>
      createLLMSessionWithHost(
        {
          mode: 'append',
          getDeviceTier: () => 'animations',
        },
        createSupportLLMSessionHost({
          onToolEndValue: (name, args) => {
            toolEnds.push({ name, args });
          },
        }),
      );

    const sessionA = makeSession();
    sessionA.ingest({ type: 'text', partial: false, content: 'warm' });
    sessionA.ingest({ type: 'text', partial: false, content: ' again' });
    sessionA.dispose();

    const sessionB = makeSession();
    sessionB.ingest({ type: 'text', partial: false, content: 'reuse' });
    sessionB.ingest({ type: 'text', partial: false, content: ' path' });

    const sessionC = makeSession();
    sessionC.ingest({ type: 'text', partial: false, content: 'fresh' });
    sessionC.ingest({ type: 'text', partial: false, content: ' runtime' });

    sessionB.dispose();
    sessionC.dispose();

    const sessionD = makeSession();
    sessionD.ingest({ type: 'tool-call-end', partial: false });
    sessionD.dispose();

    expect(toolEnds).toEqual([{ name: '', args: undefined }]);
    expect(tokenBufferCreates).toHaveLength(2);
    expect(schedulerCreates).toHaveLength(2);
    expect(schedulerResets.length).toBeGreaterThanOrEqual(3);
    expect(tokenBufferResets.length).toBeGreaterThanOrEqual(3);
  });

  test('llm session support host emits both value and detail callbacks without dropping order or payloads', () => {
    const callbackOrder: string[] = [];
    const tokenValues: Array<{ text: string; accumulated: string }> = [];
    const tokenDetails: Array<{ text: string; accumulated: string }> = [];
    const toolStartValues: string[] = [];
    const toolStartDetails: Array<{ name: string }> = [];
    const toolEndValues: Array<{ name: string; args: unknown }> = [];
    const toolEndDetails: Array<{ name: string; args: unknown }> = [];
    const doneValues: string[] = [];
    const doneDetails: Array<{ accumulated: string }> = [];

    const session = createLLMSessionWithHost(
      {
        mode: 'append',
        getDeviceTier: () => 'animations',
      },
      createSupportLLMSessionHost({
        onTokenValue: (text, accumulated) => {
          callbackOrder.push(`token-value:${text}`);
          tokenValues.push({ text, accumulated });
        },
        onToken: (detail) => {
          callbackOrder.push(`token-detail:${detail.text}`);
          tokenDetails.push(detail);
        },
        onToolStartValue: (name) => {
          callbackOrder.push(`tool-start-value:${name}`);
          toolStartValues.push(name);
        },
        onToolStart: (detail) => {
          callbackOrder.push(`tool-start-detail:${detail.name}`);
          toolStartDetails.push(detail);
        },
        onToolEndValue: (name, args) => {
          callbackOrder.push(`tool-end-value:${name}`);
          toolEndValues.push({ name, args });
        },
        onToolEnd: (detail) => {
          callbackOrder.push(`tool-end-detail:${detail.name}`);
          toolEndDetails.push(detail);
        },
        onDoneValue: (accumulated) => {
          callbackOrder.push(`done-value:${accumulated}`);
          doneValues.push(accumulated);
        },
        onDone: (detail) => {
          callbackOrder.push(`done-detail:${detail.accumulated}`);
          doneDetails.push(detail);
        },
      }),
    );

    expect(session.ingest({ type: 'text', partial: false, content: 'Hello' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-start', partial: false, toolName: 'search' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-delta', partial: false, content: '{"query":"czap"}' })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-end', partial: false, toolName: 'search' })).toBe('continue');
    expect(session.ingest({ type: 'done', partial: false })).toBe('done');

    expect(tokenValues).toEqual([{ text: 'Hello', accumulated: 'Hello' }]);
    expect(tokenDetails).toEqual([{ text: 'Hello', accumulated: 'Hello' }]);
    expect(toolStartValues).toEqual(['search']);
    expect(toolStartDetails).toEqual([{ name: 'search' }]);
    expect(toolEndValues).toEqual([{ name: 'search', args: { query: 'czap' } }]);
    expect(toolEndDetails).toEqual([{ name: 'search', args: { query: 'czap' } }]);
    expect(doneValues).toEqual(['Hello']);
    expect(doneDetails).toEqual([{ accumulated: 'Hello' }]);
    expect(callbackOrder).toEqual([
      'token-value:Hello',
      'token-detail:Hello',
      'tool-start-value:search',
      'tool-start-detail:search',
      'tool-end-value:search',
      'tool-end-detail:search',
      'done-value:Hello',
      'done-detail:Hello',
    ]);
  });

  test('llm DOM host retargets updates and skips empty frames', () => {
    const host = document.createElement('section');
    const firstTarget = document.createElement('div');
    const secondTarget = document.createElement('div');
    host.append(firstTarget, secondTarget);

    const llmHost = createDOMLLMSessionHost(host, firstTarget);
    expect(llmHost.renderText('first', 'first', 'append')).toBe(true);
    llmHost.setTarget(secondTarget);
    expect(llmHost.renderFrame(makeFrame('empty', [], 1), 'ignored', 'morph')).toBe(false);
    expect(llmHost.renderText('second', 'second', 'morph')).toBe(true);

    expect(firstTarget.textContent).toBe('first');
    expect(secondTarget.textContent).toBe('second');
  });

  test('llm DOM host sanitizes html output and ignores undefined retargets', () => {
    const host = document.createElement('section');
    const firstTarget = document.createElement('div');
    const secondTarget = document.createElement('div');
    host.append(firstTarget, secondTarget);

    const llmHost = createDOMLLMSessionHost(host, firstTarget, {
      htmlPolicy: 'sanitized-html',
    });

    llmHost.setTarget(undefined);
    expect(
      llmHost.renderText(
        '<b>safe</b><script>bad()</script><a href="javascript:alert(1)">x</a><div style="display:none">y</div>',
        '<b>safe</b><script>bad()</script><a href="javascript:alert(1)">x</a><div style="display:none">y</div>',
        'morph',
      ),
    ).toBe(true);

    expect(firstTarget.querySelector('script')).toBeNull();
    expect(firstTarget.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(firstTarget.querySelector('div')?.getAttribute('style')).toBeNull();
    expect(firstTarget.querySelector('b')?.textContent).toBe('safe');
    expect(secondTarget.innerHTML).toBe('');
  });

  test('llm DOM host sanitizes html frame output when html rendering is enabled', () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);

    const llmHost = createDOMLLMSessionHost(host, target, {
      htmlPolicy: 'sanitized-html',
    });

    expect(
      llmHost.renderFrame(
        makeFrame('frame-html', ['<b>safe</b><script>bad()</script><img src=x onerror=boom>'], 1),
        '<b>safe</b><script>bad()</script><img src=x onerror=boom>',
        'morph',
      ),
    ).toBe(true);

    expect(target.querySelector('b')?.textContent).toBe('safe');
    expect(target.querySelector('script')).toBeNull();
    expect(target.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  test('llm DOM host falls back to appendChild when append is unavailable', () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);

    Object.defineProperty(target, 'append', {
      value: undefined,
      configurable: true,
    });

    const appendChildSpy = vi.spyOn(target, 'appendChild');
    const llmHost = createDOMLLMSessionHost(host, target);

    expect(llmHost.renderText('fallback', 'fallback', 'append')).toBe(true);
    expect(appendChildSpy).toHaveBeenCalledOnce();
    expect(target.textContent).toBe('fallback');
  });

  test('llm token-boundary host emits token callbacks and treats frame boundaries as successful', () => {
    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    const host = createSupportLLMTokenBoundaryHost((text, accumulated) => {
      tokenEvents.push({ text, accumulated });
    });

    expect(host.renderText('hello', 'hello', 'append')).toBe(true);
    expect(host.renderFrame(makeFrame('frame-1', [], 1), '', 'append')).toBe(true);
    host.emitToken('hello', 'hello');
    host.emitDone('hello');

    expect(tokenEvents).toEqual([{ text: 'hello', accumulated: 'hello' }]);
  });

  test('llm support host tolerates empty handler sets and preserves token-only frame filtering', () => {
    const host = createSupportLLMSessionHost();

    expect(host.renderText('text', 'text', 'append')).toBe(true);
    expect(host.renderFrame(makeFrame('empty-frame', [], 1), '', 'append')).toBe(false);
    expect(() => host.emitToolStart('search')).not.toThrow();
    expect(() => host.emitToolEnd('search', { query: 'czap' })).not.toThrow();
    expect(() => host.emitDone('done')).not.toThrow();
  });

  test('llm support host composes detail-only callbacks without value handlers', () => {
    const events: string[] = [];
    const host = createSupportLLMSessionHost({
      onToken: ({ text, accumulated }) => {
        events.push(`token:${text}:${accumulated}`);
      },
      onToolStart: ({ name }) => {
        events.push(`tool-start:${name}`);
      },
      onToolEnd: ({ name, args }) => {
        events.push(`tool-end:${name}:${JSON.stringify(args)}`);
      },
      onDone: ({ accumulated }) => {
        events.push(`done:${accumulated}`);
      },
    });

    host.emitToken('hello', 'hello');
    host.emitToolStart('search');
    host.emitToolEnd('search', { query: 'czap' });
    host.emitDone('hello');

    expect(events).toEqual([
      'token:hello:hello',
      'tool-start:search',
      'tool-end:search:{"query":"czap"}',
      'done:hello',
    ]);
  });

  test('llm support host composes value-only callbacks without detail handlers', () => {
    const events: string[] = [];
    const host = createSupportLLMSessionHost({
      onToolStartValue: (name) => {
        events.push(`tool-start:${name}`);
      },
      onToolEndValue: (name, args) => {
        events.push(`tool-end:${name}:${JSON.stringify(args)}`);
      },
      onDoneValue: (accumulated) => {
        events.push(`done:${accumulated}`);
      },
    });

    host.emitToolStart('search');
    host.emitToolEnd('search', { query: 'czap' });
    host.emitDone('hello');

    expect(events).toEqual([
      'tool-start:search',
      'tool-end:search:{"query":"czap"}',
      'done:hello',
    ]);
  });

  test('llm support host keeps token value handlers on the direct path when other non-token callbacks are present', () => {
    const events: string[] = [];
    const host = createSupportLLMSessionHost({
      onTokenValue: (text, accumulated) => {
        events.push(`token:${text}:${accumulated}`);
      },
      onDoneValue: (accumulated) => {
        events.push(`done:${accumulated}`);
      },
    });

    host.emitToken('hello', 'hello');
    host.emitDone('hello');

    expect(events).toEqual(['token:hello:hello', 'done:hello']);
  });

  test('llm session renders the first token immediately, then promotes later chunks through the scheduled flush', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    host.addEventListener(
      'czap:llm-token',
      ((event: CustomEvent<{ text: string; accumulated: string }>) => tokenEvents.push(event.detail)) as EventListener,
    );

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    expect(session.ingest({ type: 'text', partial: false, content: 'Hello ' })).toBe('continue');
    expect(target.innerHTML).toBe('Hello ');
    expect(tokenEvents).toEqual([{ text: 'Hello ', accumulated: 'Hello ' }]);

    expect(session.ingest({ type: 'text', partial: false, content: 'world' })).toBe('continue');
    expect(target.innerHTML).toBe('Hello ');

    await Promise.resolve();

    expect(target.innerHTML).toBe('Hello world');
    expect(tokenEvents).toEqual([
      { text: 'Hello ', accumulated: 'Hello ' },
      { text: 'world', accumulated: 'Hello world' },
    ]);
  });

  test('llm session keeps the first token on the fast lane, then constructs the adaptive runtime on promotion', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const tokenBufferSpy = vi.spyOn(TokenBuffer, 'make');
    const frameSpy = vi.spyOn(GenFrame, 'make');

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    session.ingest({ type: 'text', partial: false, content: 'Hello ' });
    expect(tokenBufferSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();
    expect(target.innerHTML).toBe('Hello ');

    session.ingest({ type: 'text', partial: false, content: 'world' });
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();
    expect(target.innerHTML).toBe('Hello ');

    await Promise.resolve();

    expect(target.innerHTML).toBe('Hello world');
  });

  test('llm session coalesces queued fragments behind a single scheduled flush', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    host.addEventListener(
      'czap:llm-token',
      ((event: CustomEvent<{ text: string; accumulated: string }>) => tokenEvents.push(event.detail)) as EventListener,
    );

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    session.ingest({ type: 'text', partial: false, content: 'Hello ' });
    session.ingest({ type: 'text', partial: false, content: 'world' });
    session.ingest({ type: 'text', partial: false, content: ' again' });

    expect(target.innerHTML).toBe('Hello ');

    await Promise.resolve();

    expect(target.innerHTML).toBe('Hello world again');
    expect(tokenEvents).toEqual([
      { text: 'Hello ', accumulated: 'Hello ' },
      { text: 'world again', accumulated: 'Hello world again' },
    ]);
  });

  test('llm reconnect metadata and receipt envelopes stay off the adaptive runtime until promotion is truly needed', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const tokenBufferSpy = vi.spyOn(TokenBuffer, 'make');
    const frameSpy = vi.spyOn(GenFrame, 'make');
    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    session.beginReconnect();
    session.rememberEnvelope(await makeEnvelope(1, Receipt.GENESIS));

    expect(tokenBufferSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();

    expect(session.ingest({ type: 'text', partial: false, content: 'Hello ' })).toBe('continue');
    expect(target.innerHTML).toBe('');
    expect(tokenBufferSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();

    expect(session.ingest({ type: 'tool-call-start', partial: false, toolName: 'search' })).toBe('continue');
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();
  });

  test('llm session reset reuses an armed render runtime across reconnect-like cycles', async () => {
    const host = document.createElement('section');
    const firstTarget = document.createElement('div');
    const secondTarget = document.createElement('div');
    host.append(firstTarget, secondTarget);
    document.body.appendChild(host);

    const tokenBufferSpy = vi.spyOn(TokenBuffer, 'make');
    const frameSpy = vi.spyOn(GenFrame, 'make');

    const session = createLLMSession({
      element: host,
      target: firstTarget,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    session.ingest({ type: 'text', partial: false, content: 'first ' });
    session.ingest({ type: 'text', partial: false, content: 'pass' });
    await Promise.resolve();

    expect(firstTarget.innerHTML).toBe('first pass');
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();

    session.reset(secondTarget);
    session.ingest({ type: 'text', partial: false, content: 'second pass' });
    expect(secondTarget.innerHTML).toBe('');
    await Promise.resolve();

    expect(firstTarget.innerHTML).toBe('first pass');
    expect(secondTarget.innerHTML).toBe('second pass');
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();
  });

  test('llm session fast lane does not re-engage between beginReconnect → reset and activate', async () => {
    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    const renderedTexts: string[] = [];
    const host: LLMSessionHost = {
      setTarget: () => undefined,
      renderText: (text, _accumulated, _mode) => {
        renderedTexts.push(text);
        return true;
      },
      renderFrame: () => false,
      emitToken: (text, accumulated) => {
        tokenEvents.push({ text, accumulated });
      },
      emitFrame: () => undefined,
      emitToolStart: () => undefined,
      emitToolEnd: () => undefined,
      emitDone: () => undefined,
    };

    const tokenBufferSpy = vi.spyOn(TokenBuffer, 'make');
    const frameSpy = vi.spyOn(GenFrame, 'make');

    const session = createLLMSessionWithHost(
      {
        mode: 'morph',
        getDeviceTier: () => 'animations',
      },
      host,
    );

    // Simulate reconnect lifecycle: beginReconnect sets state to 'reconnecting'
    session.beginReconnect();
    expect(session.state).toBe('reconnecting');

    // reset() is called (e.g. connection re-established, clearing old session data)
    session.reset();

    // State must still be 'reconnecting' — not 'idle' — so the fast lane
    // cannot fire before activate() is explicitly called.
    expect(session.state).toBe('reconnecting');

    // A text chunk arrives before activate() — must NOT take the fast lane
    const result = session.ingest({ type: 'text', partial: false, content: 'early chunk' });
    expect(result).toBe('continue');

    // Fast lane would call renderText immediately and emit a token; neither
    // should have happened yet because we are still in 'reconnecting' state.
    expect(renderedTexts).toHaveLength(0);
    expect(tokenEvents).toHaveLength(0);

    // The adaptive runtime (TokenBuffer + GenFrame) should not have been
    // constructed on the fast lane either.
    expect(tokenBufferSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();

    // Only after activate() does the session advance to the normal active path.
    session.activate();
    expect(session.state).toBe('active');

    await Promise.resolve();

    // After activation the buffered chunk should have been rendered via the
    // scheduled flush path (not the fast lane).
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();
  });

  test('llm session dispose parks a scrubbed adaptive runtime for the next session', async () => {
    const firstHost = document.createElement('section');
    const firstTarget = document.createElement('div');
    firstHost.appendChild(firstTarget);
    document.body.appendChild(firstHost);

    const secondHost = document.createElement('section');
    const secondTarget = document.createElement('div');
    secondHost.appendChild(secondTarget);
    document.body.appendChild(secondHost);

    const tokenBufferSpy = vi.spyOn(TokenBuffer, 'make');
    const frameSpy = vi.spyOn(GenFrame, 'make');

    const firstSession = createLLMSession({
      element: firstHost,
      target: firstTarget,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    firstSession.ingest({ type: 'text', partial: false, content: 'first ' });
    firstSession.ingest({ type: 'text', partial: false, content: 'pass' });
    await Promise.resolve();

    expect(firstTarget.innerHTML).toBe('first pass');
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();

    firstSession.dispose();

    const secondSession = createLLMSession({
      element: secondHost,
      target: secondTarget,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    secondSession.ingest({ type: 'text', partial: false, content: 'second ' });
    secondSession.ingest({ type: 'text', partial: false, content: 'pass' });
    await Promise.resolve();

    expect(secondTarget.innerHTML).toBe('second pass');
    expect(tokenBufferSpy).toHaveBeenCalledOnce();
    expect(frameSpy).toHaveBeenCalledOnce();
  });

  test('llm session forces a final flush on done before emitting completion', () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const doneEvents: Array<{ accumulated: string }> = [];
    host.addEventListener(
      'czap:llm-done',
      ((event: CustomEvent<{ accumulated: string }>) => doneEvents.push(event.detail)) as EventListener,
    );

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    session.ingest({ type: 'text', partial: false, content: 'batched' });
    expect(target.innerHTML).toBe('batched');

    expect(session.ingest({ type: 'done', partial: false })).toBe('done');
    expect(target.innerHTML).toBe('batched');
    expect(doneEvents).toEqual([{ accumulated: 'batched' }]);
  });

  test('llm session respects non-rendering tiers without dropping completion events', () => {
    const host = document.createElement('section');
    document.body.appendChild(host);

    const doneEvents: unknown[] = [];
    host.addEventListener('czap:llm-done', ((event: CustomEvent) => doneEvents.push(event.detail)) as EventListener);

    const session = createLLMSession({
      element: host,
      target: host,
      mode: 'append',
      getDeviceTier: () => 'none',
    });

    session.ingest({ type: 'text', partial: false, content: 'hidden' });
    session.ingest({ type: 'done', partial: false });

    expect(host.textContent).toBe('');
    expect(doneEvents).toEqual([{ accumulated: '' }]);
  });

  test('llm session avoids runtime construction on static tiers and becomes inert after dispose', () => {
    const host = document.createElement('section');
    document.body.appendChild(host);

    const tokenBufferSpy = vi.spyOn(TokenBuffer, 'make');
    const frameSpy = vi.spyOn(GenFrame, 'make');

    const session = createLLMSession({
      element: host,
      target: host,
      mode: 'append',
      getDeviceTier: () => 'none',
    });

    expect(session.ingest({ type: 'text', partial: false, content: 'hidden' })).toBe('continue');
    expect(session.ingest({ type: 'done', partial: false })).toBe('done');
    expect(tokenBufferSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();
    expect(host.textContent).toBe('');

    session.dispose();
    expect(session.ingest({ type: 'text', partial: false, content: 'after dispose' })).toBe('done');
  });

  test('llm receipt trackers expose a null ack receipt id before any frames are recorded', () => {
    const tracker = createLLMReceiptTracker();

    expect(tracker.receiptChain).toBeNull();
    expect(tracker.lastAckReceiptId).toBeNull();
  });

  test('llm session ignores empty text and lifecycle mutations after disposal', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const session = createLLMSession({
      element: host,
      target,
      mode: 'append',
      getDeviceTier: () => 'animations',
    });

    expect(session.ingest({ type: 'text', partial: false, content: '' })).toBe('continue');
    expect(target.textContent).toBe('');

    session.dispose();
    session.activate();
    session.beginReconnect();
    session.reset(host);
    session.rememberEnvelope(await makeEnvelope(1, Receipt.GENESIS));

    expect(session.state).toBe('disposed');
    expect(session.replayGap().type).toBe('re-request');
    expect(target.textContent).toBe('');
  });

  test('llm session stops ingesting once disposal happens during queued text ingestion', () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });
    const controller = session as typeof session & {
      pipeline: {
        pushText(fragment: string): void;
        queuedTextFragments: string[];
      };
    };
    const originalPushText = controller.pipeline.pushText.bind(controller.pipeline);

    controller.pipeline.pushText = (fragment: string) => {
      originalPushText(fragment);
      session.dispose();
    };

    session.beginReconnect();

    expect(session.ingest({ type: 'text', partial: false, content: 'queued' })).toBe('done');
    expect(session.state).toBe('disposed');
    expect(controller.pipeline.queuedTextFragments).toEqual([]);
    expect(target.textContent).toBe('');
  });

  test('llm session keeps replay state alive across tier changes without rendering suppressed bursts', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    let tier: 'none' | 'animations' = 'animations';
    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    host.addEventListener(
      'czap:llm-token',
      ((event: CustomEvent<{ text: string; accumulated: string }>) => tokenEvents.push(event.detail)) as EventListener,
    );

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => tier,
    });

    session.ingest({ type: 'text', partial: false, content: 'visible' });
    await Promise.resolve();

    expect(target.innerHTML).toBe('visible');
    expect(tokenEvents).toEqual([{ text: 'visible', accumulated: 'visible' }]);

    tier = 'none';
    session.ingest({ type: 'text', partial: false, content: ' hidden' });
    await Promise.resolve();

    expect(target.innerHTML).toBe('visible');
    expect(tokenEvents).toEqual([{ text: 'visible', accumulated: 'visible' }]);
    expect(session.replayGap().type).toBe('re-request');

    tier = 'animations';
    session.ingest({ type: 'text', partial: false, content: ' again' });
    await Promise.resolve();

    expect(target.innerHTML).toBe('visible again');
    expect(tokenEvents.at(-1)).toEqual({ text: ' again', accumulated: 'visible again' });
  });

  test('llm session drops queued fragments when rendering is disabled before the scheduled flush runs', async () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    let tier: 'none' | 'animations' = 'animations';
    const tokenEvents: Array<{ text: string; accumulated: string }> = [];
    host.addEventListener(
      'czap:llm-token',
      ((event: CustomEvent<{ text: string; accumulated: string }>) => tokenEvents.push(event.detail)) as EventListener,
    );

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => tier,
    });

    session.ingest({ type: 'text', partial: false, content: 'Hello ' });
    session.ingest({ type: 'text', partial: false, content: 'world' });
    tier = 'none';

    await Promise.resolve();

    expect(target.innerHTML).toBe('Hello ');
    expect(tokenEvents).toEqual([{ text: 'Hello ', accumulated: 'Hello ' }]);
  });

  test('llm session falls back to chunk tool metadata when no normalized accumulator is available', () => {
    const host = document.createElement('section');
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    const toolStarts: string[] = [];
    const toolEnds: Array<{ name: string; args: unknown }> = [];
    host.addEventListener(
      'czap:llm-tool-start',
      ((event: CustomEvent<{ name: string }>) => toolStarts.push(event.detail.name)) as EventListener,
    );
    host.addEventListener(
      'czap:llm-tool-end',
      ((event: CustomEvent<{ name: string; args: unknown }>) => toolEnds.push(event.detail)) as EventListener,
    );

    const session = createLLMSession({
      element: host,
      target,
      mode: 'morph',
      getDeviceTier: () => 'animations',
    });

    expect(session.ingest({ type: 'tool-call-start', partial: false })).toBe('continue');
    expect(session.ingest({ type: 'tool-call-end', partial: false })).toBe(
      'continue',
    );

    expect(toolStarts).toEqual(['']);
    expect(toolEnds).toEqual([{ name: '', args: undefined }]);
  });

  test('llm session can record frames without host rendering and suppress token emission for empty frame flushes', async () => {
    const renderedFrames: UIFrame[] = [];
    const emittedFrames: UIFrame[] = [];
    const emittedTokens: Array<{ text: string; accumulated: string }> = [];
    const host: LLMSessionHost = {
      setTarget: () => undefined,
      renderText: () => true,
      renderFrame: (frame) => {
        renderedFrames.push(frame);
        return false;
      },
      emitToken: (text, accumulated) => {
        emittedTokens.push({ text, accumulated });
      },
      emitFrame: (frame) => {
        emittedFrames.push(frame);
      },
      emitToolStart: () => undefined,
      emitToolEnd: () => undefined,
      emitDone: () => undefined,
    };

    const session = createLLMSessionWithHost(
      {
        mode: 'morph',
        getDeviceTier: () => 'animations',
      },
      host,
    );

    session.beginReconnect();
    session.ingest({ type: 'text', partial: false, content: 'queued' });
    await Promise.resolve();

    expect(renderedFrames).toHaveLength(1);
    expect(renderedFrames[0]?.tokens).toEqual(['queued']);
    expect(emittedFrames).toEqual([]);
    expect(emittedTokens).toEqual([]);
  });

  test('llm session replays non-empty frames returned by the gap strategy', () => {
    const rendered: Array<{ tokens: readonly string[]; accumulated: string }> = [];
    const host: LLMSessionHost = {
      setTarget: () => undefined,
      renderText: () => true,
      renderFrame: (frame, accumulated) => {
        rendered.push({ tokens: frame.tokens, accumulated });
        return true;
      },
      emitToken: () => undefined,
      emitFrame: () => undefined,
      emitToolStart: () => undefined,
      emitToolEnd: () => undefined,
      emitDone: () => undefined,
    };

    vi.spyOn(GenFrame, 'resolveGap').mockReturnValue({
      type: 'replay',
      frames: [makeFrame('empty', [], 1), makeFrame('replay', ['replayed'], 2)],
    } as ReturnType<typeof GenFrame.resolveGap>);

    const session = createLLMSessionWithHost(
      {
        mode: 'morph',
        getDeviceTier: () => 'animations',
      },
      host,
    );

    expect(session.replayGap().type).toBe('replay');
    expect(rendered).toEqual([{ tokens: ['replayed'], accumulated: 'replayed' }]);
  });

  test('stream scheduler batches patches into a single flush and short-circuits empty batches', async () => {
    const applied: string[] = [];
    const flushed: Array<{ patchCount: number; requiresRescan: boolean }> = [];
    const scheduler = createStreamScheduler({
      applyHtml: (html) => {
        applied.push(html);
      },
      onFlush: (context) => {
        flushed.push(context);
      },
    });

    await scheduler.enqueueBatch([]);
    expect(flushed).toEqual([]);

    const first = scheduler.enqueue({ html: '<div>one</div>', requiresRescan: false });
    const second = scheduler.enqueue({ html: '<div>two</div>', requiresRescan: true });
    await Promise.all([first, second]);

    expect(applied).toEqual(['<div>one</div>', '<div>two</div>']);
    expect(flushed).toEqual([{ patchCount: 2, requiresRescan: true }]);
    expect(scheduler.state).toBe('idle');

    scheduler.activate();
    expect(scheduler.state).toBe('active');
    scheduler.beginReconnect();
    expect(scheduler.state).toBe('reconnecting');
  });

  test('runtime session shares lifecycle, timers, and scheduled work across host seams', async () => {
    const runtime = createRuntimeSession();
    const calls: string[] = [];

    expect(runtime.isDisposed()).toBe(false);
    runtime.activate();
    expect(runtime.state).toBe('active');

    const scheduled = runtime.schedule(() => {
      calls.push('flush');
    });
    await scheduled;
    expect(calls).toEqual(['flush']);

    runtime.beginReconnect();
    expect(runtime.state).toBe('reconnecting');

    const timer = runtime.setTimer(() => {
      calls.push('timer');
    }, 0);
    expect(timer).not.toBeNull();
    runtime.clearTimer(timer);

    runtime.dispose();
    expect(runtime.state).toBe('disposed');
    expect(runtime.isDisposed()).toBe(true);
    await runtime.schedule(() => {
      calls.push('disposed');
    });
    expect(calls).toEqual(['flush']);
  });

  test('runtime session coalesces scheduled work and ignores lifecycle changes after disposal', async () => {
    const runtime = createRuntimeSession();
    const calls: string[] = [];

    const first = runtime.schedule(() => {
      calls.push('first');
    });
    const second = runtime.schedule(() => {
      calls.push('second');
    });

    await Promise.all([first, second]);
    expect(calls).toEqual(['first', 'second']);

    runtime.dispose();
    expect(runtime.clearTimer(null)).toBeNull();
    expect(runtime.setTimer(() => {
      calls.push('timer');
    }, 0)).toBeNull();

    runtime.activate();
    runtime.beginReconnect();
    expect(runtime.state).toBe('disposed');
  });

  test('runtime session drops queued work on disposal but still resolves pending schedule promises', async () => {
    const runtime = createRuntimeSession();
    const calls: string[] = [];

    const first = runtime.schedule(() => {
      calls.push('first');
    });
    const second = runtime.schedule(() => {
      calls.push('second');
    });

    runtime.dispose();
    await Promise.all([first, second]);

    expect(calls).toEqual([]);
    expect(runtime.state).toBe('disposed');
  });

  test('runtime session timer callbacks can clear and replace themselves safely', async () => {
    const runtime = createRuntimeSession();
    const calls: string[] = [];
    let secondHandle: ReturnType<typeof setTimeout> | null = null;

    await new Promise<void>((resolve) => {
      const firstHandle = runtime.setTimer(() => {
        calls.push('first');
        expect(runtime.clearTimer(firstHandle)).toBeNull();
        secondHandle = runtime.setTimer(() => {
          calls.push('second');
          resolve();
        }, 0);
      }, 0);

      expect(firstHandle).not.toBeNull();
    });

    expect(secondHandle).not.toBeNull();
    expect(calls).toEqual(['first', 'second']);
    expect(runtime.clearTimer(undefined)).toBeNull();
  });

  test('runtime session clears active timers during disposal', () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntimeSession();
      const calls: string[] = [];

      runtime.setTimer(() => {
        calls.push('first');
      }, 50);
      runtime.setTimer(() => {
        calls.push('second');
      }, 100);

      runtime.dispose();
      vi.runAllTimers();

      expect(runtime.isDisposed()).toBe(true);
      expect(calls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('stream scheduler resolves pending work during disposal and clears reconnect timers safely', async () => {
    const applied: string[] = [];
    const scheduler = createStreamScheduler({
      applyHtml: (html) => {
        applied.push(html);
      },
      onFlush: () => undefined,
    });

    const pending = scheduler.enqueue({ html: '<div>late</div>', requiresRescan: false });
    scheduler.dispose();
    await pending;

    expect(applied).toEqual([]);
    expect(scheduler.clearReconnectTimer(null)).toBeNull();
    expect(scheduler.setReconnectTimer(() => {
      applied.push('timer');
    }, 0)).toBeNull();
    expect(scheduler.state).toBe('disposed');
  });

  test('stream scheduler coalesces separate batch calls into one scheduled flush and cancels reconnect timers', async () => {
    const applied: string[] = [];
    const flushed: Array<{ patchCount: number; requiresRescan: boolean }> = [];
    const scheduler = createStreamScheduler({
      applyHtml: (html) => {
        applied.push(html);
      },
      onFlush: (context) => {
        flushed.push(context);
      },
    });

    const timer = scheduler.setReconnectTimer(() => {
      applied.push('timer');
    }, 5);

    const first = scheduler.enqueueBatch([{ html: '<div>one</div>', requiresRescan: false }]);
    const second = scheduler.enqueueBatch([{ html: '<div>two</div>', requiresRescan: false }]);
    await Promise.all([first, second]);

    expect(applied).toEqual(['<div>one</div>', '<div>two</div>']);
    expect(flushed).toEqual([{ patchCount: 2, requiresRescan: false }]);
    expect(scheduler.clearReconnectTimer(timer)).toBeNull();
  });
});
