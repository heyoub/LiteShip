/**
 * Safe read/write helpers for named `window` globals used as runtime
 * handshake points between inline detect scripts and the hydrated
 * runtime (e.g. `__CZAP_DETECT__`, `__CZAP_SLOTS__`). Works on both
 * client and server entry paths -- returns `undefined` under SSR.
 *
 * @module
 */

declare global {
  interface Window {
    [key: string]: unknown;
  }
}

function runtimeWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

/**
 * Read a named `window` global, narrowed through `guard`. Returns
 * `undefined` under SSR or when the guard rejects the runtime value.
 */
export function readRuntimeGlobal<T>(name: string, guard: (v: unknown) => v is T): T | undefined {
  const win = runtimeWindow();
  if (!win) return undefined;
  const raw: unknown = win[name];
  return guard(raw) ? raw : undefined;
}

/**
 * Write a named `window` global as a non-enumerable property.
 *
 * `options.writable` defaults to `false` so the value is lock-down by default.
 * `options.configurable` defaults to `true` so HMR and bootstrap re-runs can
 * replace the global; security-critical globals (e.g. `__CZAP_RUNTIME_POLICY__`)
 * should pass `configurable: false` to prevent post-install redefinition by
 * any later script on the page.
 */
export function writeRuntimeGlobal<T>(
  name: string,
  value: T,
  options?: { readonly writable?: boolean; readonly configurable?: boolean },
): T {
  const win = runtimeWindow();
  if (!win) {
    return value;
  }

  Object.defineProperty(win, name, {
    value,
    configurable: options?.configurable ?? true,
    enumerable: false,
    writable: options?.writable ?? false,
  });
  return value;
}
