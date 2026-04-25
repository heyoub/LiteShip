/**
 * MockEventSource -- test double for the EventSource API.
 *
 * Captures constructor args, exposes handler slots, and provides
 * simulate* methods for test-driven event dispatch.
 *
 * Production contracts mirrored here:
 * - EventSource constructor arguments used by stream and llm directives
 * - readyState/close() transitions used by reconnect logic
 * - onopen/onmessage/onerror callback delivery used by the SSE runtime
 */

export class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readonly withCredentials: boolean;

  readyState: number = MockEventSource.CONNECTING;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  /** All instances created during the test, most recent last. */
  static instances: MockEventSource[] = [];

  constructor(url: string | URL, options?: EventSourceInit) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.withCredentials = options?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  simulateOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({ type: 'open' } as Event);
  }

  simulateMessage(data: string, id?: string): void {
    this.readyState = MockEventSource.OPEN;
    const event = {
      type: 'message',
      data,
      lastEventId: id ?? '',
      origin: '',
    } as unknown as MessageEvent;
    this.onmessage?.(event);
  }

  simulateError(): void {
    this.onerror?.({ type: 'error' } as Event);
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  /** Install as globalThis.EventSource and return a cleanup function. */
  static install(): () => void {
    const runtime = globalThis as typeof globalThis & { EventSource?: typeof MockEventSource };
    const original = runtime.EventSource;
    runtime.EventSource = MockEventSource;
    MockEventSource.instances = [];
    return () => {
      runtime.EventSource = original;
      MockEventSource.instances = [];
    };
  }
}
