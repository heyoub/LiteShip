/**
 * Stream-patch scheduler backing the `client:stream` directive.
 *
 * Batches incoming HTML patches into a single DOM write per microtask
 * and reports whether any of the coalesced patches requires a slot
 * rescan. Delegates lifecycle (activate / dispose / reconnect timer)
 * to a shared {@link createRuntimeSession}.
 *
 * @module
 */
import { createRuntimeSession, type RuntimeSessionState } from './runtime-session.js';

/**
 * A single HTML patch pulled off the stream. `requiresRescan` flags
 * patches that inserted or removed slot-bearing elements.
 */
export interface StreamPatch {
  readonly html: string;
  readonly requiresRescan: boolean;
}

/** Callbacks the scheduler invokes when it writes a batch. */
export interface StreamSchedulerConfig {
  /** Write a coalesced HTML patch into the live document. */
  readonly applyHtml: (html: string) => void;
  /** Observer fired after each flush with batch metadata. */
  readonly onFlush: (context: { readonly patchCount: number; readonly requiresRescan: boolean }) => void;
}

/** Host surface of a stream scheduler. */
export interface StreamSchedulerShape {
  readonly state: RuntimeSessionState;
  activate(): void;
  beginReconnect(): void;
  enqueue(patch: StreamPatch): Promise<void>;
  enqueueBatch(patches: readonly StreamPatch[]): Promise<void>;
  setReconnectTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> | null;
  clearReconnectTimer(handle: ReturnType<typeof setTimeout> | null | undefined): null;
  dispose(): void;
}

/**
 * Build a new stream scheduler. The scheduler coalesces patches into a
 * single microtask-flushed DOM write and calls `config.onFlush` once
 * per batch.
 */
export function createStreamScheduler(config: StreamSchedulerConfig): StreamSchedulerShape {
  const runtime = createRuntimeSession();
  let queue: StreamPatch[] = [];
  let resolvers: Array<() => void> = [];

  const flush = (): void => {
    const patches = queue;
    queue = [];
    const pendingResolvers = resolvers;
    resolvers = [];

    let requiresRescan = false;
    for (const patch of patches) {
      requiresRescan ||= patch.requiresRescan;
      config.applyHtml(patch.html);
    }

    if (patches.length > 0) {
      config.onFlush({ patchCount: patches.length, requiresRescan });
    }

    for (const resolve of pendingResolvers) {
      resolve();
    }
  };

  const schedule = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      resolvers.push(resolve);
      void runtime.schedule(flush);
    });
  };

  return {
    get state(): RuntimeSessionState {
      return runtime.state;
    },

    activate() {
      runtime.activate();
    },

    beginReconnect() {
      runtime.beginReconnect();
    },

    enqueue(patch) {
      queue.push(patch);
      return schedule();
    },

    enqueueBatch(patches) {
      if (patches.length === 0) {
        return Promise.resolve();
      }

      queue.push(...patches);
      return schedule();
    },

    setReconnectTimer(callback, delay) {
      return runtime.setTimer(callback, delay);
    },

    clearReconnectTimer(handle) {
      return runtime.clearTimer(handle);
    },

    dispose() {
      queue = [];
      const pendingResolvers = resolvers;
      resolvers = [];
      for (const resolve of pendingResolvers) {
        resolve();
      }
      runtime.dispose();
    },
  };
}
