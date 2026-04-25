import { WASMDispatch, Diagnostics } from '@czap/core';
import { writeRuntimeGlobal } from './globals.js';
import { readRuntimeEndpointPolicy } from './policy.js';
import { allowRuntimeEndpointUrl } from './url-policy.js';

const ROOT_WASM_ATTR = 'data-czap-wasm-url';

/**
 * Configure (or clear) the root `data-czap-wasm-url` attribute used by
 * the `client:wasm` directive to discover its module URL. Also
 * back-fills any existing `[data-czap-wasm]` elements that lack a
 * per-element override.
 */
export function configureWasmRuntime(wasmUrl: string | null | undefined): void {
  if (!wasmUrl) {
    document.documentElement.removeAttribute(ROOT_WASM_ATTR);
    return;
  }

  document.documentElement.setAttribute(ROOT_WASM_ATTR, wasmUrl);
  document.querySelectorAll<HTMLElement>('[data-czap-wasm]').forEach((element) => {
    if (!element.getAttribute(ROOT_WASM_ATTR)) {
      element.setAttribute(ROOT_WASM_ATTR, wasmUrl);
    }
  });
}

/**
 * Resolve the WASM module URL for `element`, falling back to the
 * root-configured URL when no per-element override exists.
 */
export function resolveWasmUrl(element: HTMLElement): string | null {
  return element.getAttribute(ROOT_WASM_ATTR) ?? document.documentElement.getAttribute(ROOT_WASM_ATTR);
}

/**
 * Load the WASM kernels for `element`, publish them to
 * `window.__CZAP_WASM__`, and dispatch a `czap:wasm-ready` event on
 * `document`. On failure, emits a diagnostic and fires
 * `czap:wasm-error` instead so downstream consumers can degrade.
 */
export async function loadWasmRuntime(element: HTMLElement): Promise<void> {
  const wasmUrl = allowRuntimeEndpointUrl(
    resolveWasmUrl(element),
    'wasm',
    'czap/astro.wasm',
    {
      crossOriginRejected: 'wasm-cross-origin-url-rejected',
      malformedUrl: 'wasm-malformed-url-rejected',
      originNotAllowed: 'wasm-origin-not-allowed',
      endpointKindNotPermitted: 'wasm-endpoint-kind-not-permitted',
    },
    readRuntimeEndpointPolicy(),
  );
  if (!wasmUrl) {
    return;
  }

  try {
    const kernels = await WASMDispatch.load(wasmUrl);
    writeRuntimeGlobal('__CZAP_WASM__', kernels);

    document.dispatchEvent(
      new CustomEvent('czap:wasm-ready', {
        detail: { url: wasmUrl },
      }),
    );
  } catch (error) {
    Diagnostics.warn({
      source: 'czap/astro.wasm',
      code: 'wasm-load-failed',
      message: 'WASM runtime failed to load.',
      detail: error instanceof Error ? error.message : 'load-failed',
      cause: error,
    });
    document.dispatchEvent(
      new CustomEvent('czap:wasm-error', {
        detail: {
          url: wasmUrl,
          reason: error instanceof Error ? error.message : 'load-failed',
        },
      }),
    );
  }
}
