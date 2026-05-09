import { SlotRegistry } from '@czap/web';
import { readRuntimeGlobal, writeRuntimeGlobal } from './globals.js';

interface RuntimeWindow extends Window {
  __CZAP_SLOT_REGISTRY__?: SlotRegistry.Shape;
  __CZAP_SLOT_BOOTSTRAPPED__?: boolean;
  __CZAP_SWAP_REINIT__?: boolean;
  __CZAP_SLOTS__?: {
    readonly registry: SlotRegistry.Shape;
    readonly entries: Record<string, { path: string; mode: string }>;
  };
}

const REINIT_SELECTOR = '[data-czap-boundary],[data-czap-stream-url],[data-czap-llm-url],[data-czap-wasm]';

function isSlotRegistryShape(value: unknown): value is SlotRegistry.Shape {
  if (typeof value !== 'object' || value === null) return false;
  if (!('get' in value) || !('register' in value) || !('entries' in value)) return false;
  return typeof value.get === 'function' && typeof value.register === 'function' && typeof value.entries === 'function';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function runtimeWindow(): RuntimeWindow | null {
  return typeof window === 'undefined' ? null : (window as RuntimeWindow);
}

/**
 * Return the document-scoped {@link SlotRegistry.Shape}, creating and
 * persisting one on `window.__CZAP_SLOT_REGISTRY__` the first time
 * it's requested. Returns a detached registry under SSR.
 */
export function getSlotRegistry(): SlotRegistry.Shape {
  const win = runtimeWindow();
  if (!win) {
    return SlotRegistry.create();
  }

  const existingRegistry = readRuntimeGlobal('__CZAP_SLOT_REGISTRY__', isSlotRegistryShape);
  if (!existingRegistry) {
    return writeRuntimeGlobal('__CZAP_SLOT_REGISTRY__', SlotRegistry.create());
  }

  return existingRegistry;
}

/**
 * Clear and rebuild the slot registry by scanning `root` for
 * `data-czap-slot` elements. Also writes a serialised
 * `__CZAP_SLOTS__` snapshot for devtools / diagnostics consumers.
 */
export function rescanSlots(root: ParentNode = document): SlotRegistry.Shape {
  const registry = getSlotRegistry();
  const existingPaths = Array.from(registry.entries().keys());
  for (const path of existingPaths) {
    registry.unregister(path);
  }

  const scanRoot = root instanceof Element ? root : document.documentElement;
  SlotRegistry.scanDOM(registry, scanRoot);

  const win = runtimeWindow();
  if (win) {
    writeRuntimeGlobal('__CZAP_SLOTS__', {
      registry,
      entries: Object.fromEntries(
        Array.from(registry.entries().entries()).map(([path, entry]) => [path, { path, mode: entry.mode }]),
      ),
    });
  }

  return registry;
}

/**
 * One-shot bootstrap: arm a slot-registry scan on
 * `DOMContentLoaded` (or immediately if the document is already
 * ready) and re-scan after every Astro View Transitions `after-swap`
 * event. Idempotent -- subsequent calls return the same registry.
 */
export function bootstrapSlots(): SlotRegistry.Shape {
  const win = runtimeWindow();
  if (!win) {
    return SlotRegistry.create();
  }

  const scan = (): void => {
    rescanSlots(document.documentElement);
  };

  if (!readRuntimeGlobal('__CZAP_SLOT_BOOTSTRAPPED__', isBoolean)) {
    writeRuntimeGlobal('__CZAP_SLOT_BOOTSTRAPPED__', true);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scan, { once: true });
    } else {
      scan();
    }

    document.addEventListener('astro:after-swap', scan);
  }

  return getSlotRegistry();
}

/**
 * Dispatch `czap:dispose` + `czap:reinit` on every known directive
 * root. Used after Astro View Transitions `after-swap` so directives
 * can re-read fresh `data-czap-*` attributes without remounting.
 */
export function reinitializeDirectives(): void {
  document.querySelectorAll<HTMLElement>(REINIT_SELECTOR).forEach((element) => {
    element.dispatchEvent(new CustomEvent('czap:dispose', { bubbles: true }));
    element.dispatchEvent(new CustomEvent('czap:reinit', { bubbles: true }));
  });
}

/**
 * Install a one-time listener that fires
 * {@link reinitializeDirectives} on every Astro `after-swap`.
 * Guarded by `window.__CZAP_SWAP_REINIT__` so repeated module loads
 * do not stack listeners.
 */
export function installSwapReinit(): void {
  const win = runtimeWindow();
  if (!win || readRuntimeGlobal('__CZAP_SWAP_REINIT__', isBoolean)) {
    return;
  }

  writeRuntimeGlobal('__CZAP_SWAP_REINIT__', true);
  document.addEventListener('astro:after-swap', () => {
    reinitializeDirectives();
  });
}
