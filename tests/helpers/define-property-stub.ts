/**
 * Safe Object.defineProperty wrapper that integrates with vitest cleanup.
 * Returns a restore function.
 */
export function definePropertyStub(
  target: object,
  property: string,
  descriptor: PropertyDescriptor,
): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { ...descriptor, configurable: true });
  return () => {
    if (original) {
      Object.defineProperty(target, property, original);
    } else {
      delete (target as Record<string, unknown>)[property];
    }
  };
}

/**
 * Accumulates restore functions and runs them all at once.
 * Use with afterEach: `afterEach(() => stubs.restoreAll())`
 */
export function createStubRegistry() {
  const restores: Array<() => void> = [];
  return {
    define(target: object, property: string, descriptor: PropertyDescriptor) {
      restores.push(definePropertyStub(target, property, descriptor));
    },
    restoreAll() {
      while (restores.length) restores.pop()!();
    },
  };
}

/**
 * Stubs the common Worker + SharedArrayBuffer + crossOriginIsolated pattern
 * used by worker-mode tests. Requires `vi` from vitest for stubGlobal calls.
 */
export function stubWorkerEnvironment(
  stubs: ReturnType<typeof createStubRegistry>,
  vi: { stubGlobal: (name: string, value: unknown) => void },
): void {
  vi.stubGlobal('Worker', class MockWorker {});
  vi.stubGlobal('SharedArrayBuffer', class MockSharedArrayBuffer {});
  stubs.define(globalThis, 'crossOriginIsolated', {
    configurable: true,
    value: true,
  });
}
