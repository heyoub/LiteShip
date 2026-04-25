import streamDirective from '../../../packages/astro/src/client-directives/stream.js';

declare global {
  interface Window {
    __streamPromise: Promise<void>;
    __streamResult: {
      morphCount: number;
      signalCount: number;
      reconnectCount: number;
      finalHtml: string;
    };
    __streamError: string | null;
  }
}

class EventSourceHarness {
  static instances: EventSourceHarness[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    EventSourceHarness.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emitMessage(data: string, lastEventId = ''): void {
    const event = new MessageEvent('message', { data });
    Object.defineProperty(event, 'lastEventId', {
      configurable: true,
      value: lastEventId,
    });
    this.onmessage?.(event);
  }

  emitError(): void {
    this.onerror?.(new Event('error'));
  }
}

async function runStreamHarness() {
  const host = document.getElementById('stream-root') as HTMLElement | null;
  if (!host) {
    return;
  }

  const originalEventSource = window.EventSource;
  const originalRandom = Math.random;
  Object.defineProperty(window, 'EventSource', {
    configurable: true,
    value: EventSourceHarness,
  });
  Math.random = () => 0;

  try {
    let morphCount = 0;
    let signalCount = 0;
    let reconnectCount = 0;

    host.addEventListener('czap:stream-morph', () => {
      morphCount += 1;
    });
    host.addEventListener('czap:signal', () => {
      signalCount += 1;
    });
    host.addEventListener('czap:stream-disconnected', () => {
      reconnectCount += 1;
    });

    streamDirective(async () => {}, {}, host);
    const firstSource = EventSourceHarness.instances.at(-1);
    if (!firstSource) {
      throw new Error('Stream harness failed to create EventSource.');
    }

    firstSource.onopen?.(new Event('open'));
    firstSource.emitMessage(
      JSON.stringify({
        type: 'patch',
        data: '<section id="stream-root" data-czap-stream-url="/stream" data-czap-stream-morph="outerHTML"><div data-czap-id="hero-copy">first</div></section>',
      }),
      'evt-1',
    );
    firstSource.emitMessage(JSON.stringify({ type: 'signal', data: { width: 1280 } }));
    await Promise.resolve();
    await Promise.resolve();

    firstSource.emitError();

    for (let attempt = 0; attempt < 20; attempt++) {
      if (EventSourceHarness.instances.at(-1) !== firstSource) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const secondSource = EventSourceHarness.instances.at(-1);
    if (!secondSource || secondSource === firstSource) {
      throw new Error('Stream harness failed to reconnect.');
    }

    secondSource.onopen?.(new Event('open'));
    secondSource.emitMessage(
      JSON.stringify({
        type: 'snapshot',
        data: {
          html: '<section id="stream-root" data-czap-stream-url="/stream" data-czap-stream-morph="outerHTML"><div data-czap-id="hero-copy">second</div></section>',
        },
      }),
      'evt-2',
    );

    await Promise.resolve();
    await Promise.resolve();

    window.__streamResult = {
      morphCount,
      signalCount,
      reconnectCount,
      finalHtml: (document.getElementById('stream-root') as HTMLElement | null)?.innerHTML ?? '',
    };
  } finally {
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: originalEventSource,
    });
    Math.random = originalRandom;
  }
}

window.__streamError = null;
window.__streamPromise = runStreamHarness().catch((err) => {
  window.__streamError = String(err);
  console.error('Stream harness failed:', err);
});
