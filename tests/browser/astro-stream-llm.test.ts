import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import llmDirective from '../../packages/astro/src/client-directives/llm.js';
import streamDirective from '../../packages/astro/src/client-directives/stream.js';

const noop = () => Promise.resolve();

class EventSourceMock {
  static instances: EventSourceMock[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

function latestSource(): EventSourceMock {
  const source = EventSourceMock.instances.at(-1);
  expect(source).toBeDefined();
  return source!;
}

function messageEvent(data: string, lastEventId = ''): MessageEvent {
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'lastEventId', {
    value: lastEventId,
    configurable: true,
  });
  return event;
}

function tallHtml(prefix: string, lines = 80): string {
  return Array.from({ length: lines }, (_, index) => `<div>${prefix}-${index}</div>`).join('');
}

describe('browser stream and llm directives', () => {
  beforeEach(() => {
    EventSourceMock.instances.length = 0;
    document.body.innerHTML = '';
    document.documentElement.setAttribute('data-czap-tier', 'reactive');
    vi.stubGlobal('EventSource', EventSourceMock as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    EventSourceMock.instances.length = 0;
    document.body.innerHTML = '';
  });

  test('stream directive handles patches, snapshots, signals, and outerHTML replacement', async () => {
    const morphEvents: string[] = [];
    const signals: unknown[] = [];

    const inner = document.createElement('div');
    inner.setAttribute('data-czap-stream-url', '/stream');
    inner.style.height = '80px';
    inner.style.width = '80px';
    inner.style.overflow = 'auto';
    inner.innerHTML = `${tallHtml('initial')}<button type="button">keep</button>`;
    document.body.appendChild(inner);
    inner.scrollTop = 48;
    inner.addEventListener('czap:stream-morph', () => morphEvents.push('morph'));
    inner.addEventListener('czap:signal', ((event: CustomEvent) => signals.push(event.detail)) as EventListener);

    streamDirective(noop, {}, inner);
    let source = latestSource();
    source.onopen?.(new Event('open'));
    source.onmessage?.(
      messageEvent(
        JSON.stringify({
          type: 'patch',
          data: `<div class="next">patched</div>${tallHtml('patched')}`,
        }),
        'evt-1',
      ),
    );
    source.onmessage?.(
      messageEvent(
        JSON.stringify({
          type: 'snapshot',
          data: { html: `<div class="snapshot">snapshot</div>${tallHtml('snapshot')}` },
        }),
        'evt-2',
      ),
    );
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'signal', data: { width: 1280 } })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'heartbeat' })));
    source.onmessage?.(messageEvent('not-json'));
    await Promise.resolve();
    await Promise.resolve();

    expect(inner.innerHTML).toContain('snapshot');
    expect(inner.scrollTop).toBeCloseTo(48, 0);
    expect(morphEvents).toEqual(['morph', 'morph']);
    expect(signals).toEqual([{ width: 1280 }]);

    const outer = document.createElement('article');
    outer.id = 'outer-stream';
    outer.setAttribute('data-czap-stream-url', '/stream');
    outer.setAttribute('data-czap-stream-morph', 'outerHTML');
    document.body.appendChild(outer);

    streamDirective(noop, {}, outer);
    source = latestSource();
    source.onmessage?.(
      messageEvent(
        JSON.stringify({
          type: 'patch',
          data: '<article id="outer-stream"><div class="outer-next">replaced</div></article>',
        }),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('outer-stream')?.innerHTML).toContain('outer-next');
  });

  test('stream directive reconnects on reinit and emits max-attempts errors', () => {
    const disconnects: string[] = [];
    const errors: unknown[] = [];
    const scheduled: Array<() => void> = [];
    const clearTimeoutMock = vi.fn();

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal(
      'setTimeout',
      ((callback: () => void) => {
        scheduled.push(callback);
        return scheduled.length;
      }) as never,
    );
    vi.stubGlobal('clearTimeout', clearTimeoutMock as never);

    document.body.addEventListener('czap:stream-disconnected', () => disconnects.push('disconnect'));
    document.body.addEventListener('czap:stream-error', ((event: CustomEvent) => errors.push(event.detail)) as EventListener);

    const el = document.createElement('section');
    el.setAttribute('data-czap-stream-url', '/stream');
    el.setAttribute('data-czap-stream-artifact', 'doc-1');
    document.body.appendChild(el);

    streamDirective(noop, {}, el);
    let source = latestSource();
    source.onmessage?.(
      messageEvent(
        JSON.stringify({
          type: 'patch',
          data: '<div>connected</div>',
        }),
        'evt-9',
      ),
    );

    el.dispatchEvent(new CustomEvent('czap:reinit'));
    expect(source.closed).toBe(true);
    expect(clearTimeoutMock).not.toHaveBeenCalled();

    source = latestSource();
    expect(source.url).toContain('/stream/doc-1?lastEventId=evt-9');

    for (let attempt = 0; attempt < 10; attempt++) {
      source.onerror?.(new Event('error'));
      const reconnect = scheduled.shift();
      expect(reconnect).toBeTypeOf('function');
      reconnect?.();
      source = latestSource();
    }

    source.onerror?.(new Event('error'));

    expect(disconnects).toHaveLength(11);
    expect(errors).toEqual([{ reason: 'max-reconnect-attempts' }]);
  });

  test('llm directive respects tiers and handles tool calls, done events, and connection errors', () => {
    const starts: string[] = [];
    const tokens: unknown[] = [];
    const toolStarts: unknown[] = [];
    const toolEnds: unknown[] = [];
    const dones: unknown[] = [];
    const errors: unknown[] = [];

    const el = document.createElement('section');
    el.setAttribute('data-czap-llm-url', '/llm');
    el.setAttribute('data-czap-llm-mode', 'morph');
    el.innerHTML = '<div class="target"></div>';
    el.setAttribute('data-czap-llm-target', '.target');
    document.body.appendChild(el);

    el.addEventListener('czap:llm-start', () => starts.push('start'));
    el.addEventListener('czap:llm-token', ((event: CustomEvent) => tokens.push(event.detail)) as EventListener);
    el.addEventListener('czap:llm-tool-start', ((event: CustomEvent) => toolStarts.push(event.detail)) as EventListener);
    el.addEventListener('czap:llm-tool-end', ((event: CustomEvent) => toolEnds.push(event.detail)) as EventListener);
    el.addEventListener('czap:llm-done', ((event: CustomEvent) => dones.push(event.detail)) as EventListener);
    el.addEventListener('czap:llm-error', ((event: CustomEvent) => errors.push(event.detail)) as EventListener);

    llmDirective(noop, {}, el);
    let source = latestSource();
    source.onopen?.(new Event('open'));

    document.documentElement.setAttribute('data-czap-tier', 'static');
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'text', content: 'hidden' })));
    expect(el.querySelector('.target')?.innerHTML).toBe('');

    document.documentElement.setAttribute('data-czap-tier', 'reactive');
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'unknown', content: 'ignored' })));
    source.onmessage?.(messageEvent('Hello'));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'text', content: ' world' })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'tool-call-start', toolName: 'search' })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'tool-call-delta', toolArgs: '{"query":"czap"}' })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'tool-call-end' })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'done' })));

    expect(starts).toEqual(['start']);
    expect(el.querySelector('.target')?.innerHTML).toBe('Hello world');
    expect(tokens).toEqual([
      { text: 'Hello', accumulated: 'Hello' },
      { text: ' world', accumulated: 'Hello world' },
    ]);
    expect(toolStarts).toEqual([{ name: 'search' }]);
    expect(toolEnds).toEqual([{ name: 'search', args: { query: 'czap' } }]);
    expect(dones).toEqual([{ accumulated: 'Hello world' }]);
    expect(source.closed).toBe(true);

    el.dispatchEvent(new CustomEvent('czap:reinit'));
    source = latestSource();
    source.onerror?.(new Event('error'));

    expect(errors).toEqual([expect.objectContaining({ reason: 'connection-error', strategy: 're-request' })]);
  });

  test('llm directive ignores empty payloads, accepts receipt envelopes, and surfaces structured stream errors', async () => {
    const errors: unknown[] = [];

    const el = document.createElement('section');
    el.setAttribute('data-czap-llm-url', '/llm');
    document.body.appendChild(el);
    el.addEventListener('czap:llm-error', ((event: CustomEvent) => errors.push(event.detail)) as EventListener);

    llmDirective(noop, {}, el);
    const source = latestSource();
    source.onmessage?.(messageEvent(''));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'receipt', data: { hash: 'bad' } })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'text', content: 'ok' })));
    source.onmessage?.(messageEvent(JSON.stringify({ type: 'error', content: 'boom' })));

    await Promise.resolve();
    await Promise.resolve();

    expect(el.textContent).toBe('ok');
    expect(errors).toEqual([{ message: 'boom' }]);
    expect(source.closed).toBe(true);
  });
});
