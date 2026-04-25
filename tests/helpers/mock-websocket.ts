/**
 * MockWebSocket -- test double for the WebSocket API.
 *
 * State machine: CONNECTING → OPEN → CLOSING → CLOSED.
 * Captures sent messages and provides simulate* methods.
 *
 * Production contracts mirrored here:
 * - WebSocket readyState/send()/close() semantics used by wire/runtime helpers
 * - constructor protocol capture and callback lifecycle used by tests
 */

export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readonly protocol: string;

  readyState: number = MockWebSocket.CONNECTING;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  /** Messages captured from send() calls. */
  sentMessages: unknown[] = [];

  /** All instances created during the test, most recent last. */
  static instances: MockWebSocket[] = [];

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.protocol = Array.isArray(protocols) ? (protocols[0] ?? '') : (protocols ?? '');
    MockWebSocket.instances.push(this);
  }

  send(data: unknown): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new DOMException('WebSocket is not open', 'InvalidStateError');
    }
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSING;
    // Simulate async close
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({
      type: 'close',
      code: _code ?? 1000,
      reason: _reason ?? '',
      wasClean: true,
    } as unknown as CloseEvent);
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({ type: 'open' } as Event);
  }

  simulateMessage(data: string): void {
    this.onmessage?.({
      type: 'message',
      data,
      origin: '',
    } as unknown as MessageEvent);
  }

  simulateError(): void {
    this.onerror?.({ type: 'error' } as Event);
  }

  simulateClose(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({
      type: 'close',
      code: code ?? 1000,
      reason: reason ?? '',
      wasClean: true,
    } as unknown as CloseEvent);
  }

  /** Install as globalThis.WebSocket and return a cleanup function. */
  static install(): () => void {
    const runtime = globalThis as typeof globalThis & { WebSocket?: typeof MockWebSocket };
    const original = runtime.WebSocket;
    runtime.WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    return () => {
      runtime.WebSocket = original;
      MockWebSocket.instances = [];
    };
  }
}
