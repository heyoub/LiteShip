/**
 * Lightweight DOM mocks for non-JSDOM test environments.
 *
 * Provides mock HTMLElement with event listener tracking
 * and mock canvas with transferControlToOffscreen.
 *
 * Production contracts mirrored here:
 * - HTMLElement add/removeEventListener behavior used by runtime helpers
 * - HTMLCanvasElement.transferControlToOffscreen() lifecycle used by worker hosts
 */

type Listener = EventListenerOrEventListenerObject;

export interface MockHTMLElementShape {
  readonly tagName: string;
  _listeners: Map<string, Set<Listener>>;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  /** Dispatch a synthetic event to registered listeners. */
  _emit(type: string, data?: Record<string, unknown>): void;
}

/**
 * Create a mock HTMLElement with event listener tracking.
 */
export function mockHTMLElement(tag = 'DIV'): MockHTMLElementShape {
  const _listeners = new Map<string, Set<Listener>>();

  return {
    tagName: tag.toUpperCase(),
    _listeners,

    addEventListener(type: string, listener: Listener): void {
      let set = _listeners.get(type);
      if (!set) {
        set = new Set();
        _listeners.set(type, set);
      }
      set.add(listener);
    },

    removeEventListener(type: string, listener: Listener): void {
      _listeners.get(type)?.delete(listener);
    },

    _emit(type: string, data: Record<string, unknown> = {}): void {
      const event = { type, ...data } as unknown as Event;
      const set = _listeners.get(type);
      if (set) {
        for (const listener of set) {
          if (typeof listener === 'function') {
            listener(event);
          } else {
            listener.handleEvent(event);
          }
        }
      }
    },
  };
}

export interface MockOffscreenCanvas {
  readonly width: number;
  readonly height: number;
}

export interface MockCanvasShape {
  readonly width: number;
  readonly height: number;
  transferControlToOffscreen(): MockOffscreenCanvas;
  _transferCalled: number;
}

/**
 * Create a mock HTMLCanvasElement with transferControlToOffscreen.
 */
export function mockCanvas(width = 640, height = 480): MockCanvasShape {
  let transferCount = 0;
  const canvas: MockCanvasShape = {
    width,
    height,
    _transferCalled: 0,

    transferControlToOffscreen(): MockOffscreenCanvas {
      transferCount++;
      // Real browsers only allow this once
      if (transferCount > 1) {
        throw new DOMException('Cannot transfer control from a canvas for a second time.', 'InvalidStateError');
      }
      canvas._transferCalled = transferCount;
      return { width, height };
    },
  };

  return canvas;
}
