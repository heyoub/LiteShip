/**
 * Generic runtime-session lifecycle used by every `@czap/astro` client
 * directive. Owns a microtask scheduler, a set of pending timers, and
 * a state machine (`idle` / `active` / `reconnecting` / `disposed`)
 * that every concrete session (stream, llm, gpu, ...) composes.
 *
 * @module
 */

/** Lifecycle states a runtime session progresses through. */
export type RuntimeSessionState = 'idle' | 'active' | 'reconnecting' | 'disposed';

/**
 * Shared lifecycle surface shared by every runtime-session kind.
 *
 * `schedule` batches callbacks into a single microtask flush;
 * `setTimer` / `clearTimer` mirror `setTimeout` but participate in
 * `dispose()` so no task outlives the session.
 */
export interface RuntimeSessionShape {
  readonly state: RuntimeSessionState;
  activate(): void;
  beginReconnect(): void;
  schedule(task: () => void): Promise<void>;
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> | null;
  clearTimer(handle: ReturnType<typeof setTimeout> | null | undefined): null;
  isDisposed(): boolean;
  dispose(): void;
}

/**
 * Build a fresh runtime session. Every session starts in the `idle`
 * state and must be explicitly `activate()`d before tasks are allowed
 * to run.
 */
export function createRuntimeSession(): RuntimeSessionShape {
  let state: RuntimeSessionState = 'idle';
  let scheduled = false;
  let tasks: Array<() => void> | null = null;
  let resolvers: Array<() => void> | null = null;
  let timers: Set<ReturnType<typeof setTimeout>> | null = null;
  const resolvePending = (pendingResolvers: ReadonlyArray<() => void>): void => {
    for (const resolve of pendingResolvers) {
      resolve();
    }
  };

  const flush = (): void => {
    scheduled = false;
    const pendingTasks = tasks ?? [];
    tasks = null;
    const pendingResolvers = resolvers ?? [];
    resolvers = null;

    if (state === 'disposed') {
      resolvePending(pendingResolvers);
      return;
    }

    for (const task of pendingTasks) {
      task();
    }

    resolvePending(pendingResolvers);
  };

  return {
    get state(): RuntimeSessionState {
      return state;
    },

    activate(): void {
      if (state !== 'disposed') {
        state = 'active';
      }
    },

    beginReconnect(): void {
      if (state !== 'disposed') {
        state = 'reconnecting';
      }
    },

    schedule(task: () => void): Promise<void> {
      if (state === 'disposed') {
        return Promise.resolve();
      }

      (tasks ??= []).push(task);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }

      return new Promise<void>((resolve) => {
        (resolvers ??= []).push(resolve);
      });
    },

    setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> | null {
      if (state === 'disposed') {
        return null;
      }

      const handle = setTimeout(() => {
        timers?.delete(handle);
        callback();
      }, delay);
      (timers ??= new Set()).add(handle);
      return handle;
    },

    clearTimer(handle: ReturnType<typeof setTimeout> | null | undefined): null {
      if (!handle) {
        return null;
      }

      clearTimeout(handle);
      timers?.delete(handle);
      return null;
    },

    isDisposed(): boolean {
      return state === 'disposed';
    },

    dispose(): void {
      state = 'disposed';
      for (const handle of timers ?? []) {
        clearTimeout(handle);
      }
      timers = null;
      tasks = null;
      const pendingResolvers = resolvers ?? [];
      resolvers = null;
      resolvePending(pendingResolvers);
    },
  };
}
