/**
 * Slot Registry
 *
 * Maps SlotPaths to DOM elements for efficient lookup and patching.
 */

import { Effect } from 'effect';
import type { Scope } from 'effect';
import type { SlotPath, SlotEntry, IslandMode } from '../types.js';
import { Diagnostics } from '@czap/core';
import { SlotAddressing, SlotPath as mkSlotPath } from './addressing.js';

/**
 * Narrow a raw attribute string (possibly null) to the `IslandMode` shape.
 *
 * The runtime contract accepts any non-empty string (custom modes propagate
 * through to consumers); only null/empty yields `null`. Centralising the cast
 * here keeps the Element-read sites cast-free.
 */
const narrowIslandMode = (raw: string | null): IslandMode | null =>
  // `raw as IslandMode` justified: the runtime contract passes any non-empty attribute string through.
  raw !== null && raw.length > 0 ? (raw as IslandMode) : null;

/**
 * Read the island mode from an element, checking both `data-czap-mode` and
 * legacy `data-mode` attributes. Returns `null` if neither is set.
 */
const readIslandMode = (element: Element): IslandMode | null =>
  narrowIslandMode(element.getAttribute('data-czap-mode')) ?? narrowIslandMode(element.getAttribute('data-mode'));

/**
 * Slot registry interface -- manages mapping between slot paths and DOM elements.
 */
export interface SlotRegistryShape {
  get(path: SlotPath): SlotEntry | undefined;
  register(entry: SlotEntry): void;
  unregister(path: SlotPath): void;
  has(path: SlotPath): boolean;
  entries(): ReadonlyMap<SlotPath, SlotEntry>;
  findByPrefix(prefix: SlotPath): readonly SlotEntry[];
}

/**
 * Create a new slot registry that maps slot paths to DOM elements.
 *
 * @example
 * ```ts
 * import { SlotRegistry, SlotAddressing } from '@czap/web';
 *
 * const heroPath = SlotAddressing.brand('/hero');
 * const registry = SlotRegistry.create();
 * registry.register({
 *   path: heroPath, element: document.querySelector('#hero')!,
 *   mode: 'partial', mounted: true,
 * });
 * const entry = registry.get(heroPath);
 * console.log(entry?.element.id); // 'hero'
 * ```
 *
 * @returns A new {@link SlotRegistryShape} instance
 */
export const create = (): SlotRegistryShape => {
  const registry = new Map<SlotPath, SlotEntry>();

  return {
    get: (path: SlotPath) => registry.get(path),

    /** Registers a slot entry. Dispatches `czap:slot-mounted` on the entry element (public observability event). */
    register: (entry: SlotEntry) => {
      registry.set(entry.path, entry);
      entry.element.dispatchEvent(
        new CustomEvent('czap:slot-mounted', {
          detail: { path: entry.path, mode: entry.mode },
          bubbles: true,
        }),
      );
    },

    /** Unregisters a slot. Dispatches `czap:slot-unmounted` on document (element may be detached). */
    unregister: (path: SlotPath) => {
      const entry = registry.get(path);
      registry.delete(path);
      document.dispatchEvent(
        new CustomEvent('czap:slot-unmounted', {
          detail: { path, mode: entry?.mode },
          bubbles: true,
        }),
      );
    },

    has: (path: SlotPath) => registry.has(path),

    entries: () => new Map(registry) as ReadonlyMap<SlotPath, SlotEntry>,

    findByPrefix: (prefix: SlotPath) => {
      const results: SlotEntry[] = [];

      for (const entry of registry.values()) {
        if (entry.path === prefix || entry.path.startsWith(prefix + '/')) {
          results.push(entry);
        }
      }

      return results;
    },
  };
};

/**
 * Scan the DOM subtree for elements with `data-czap-slot` attributes and
 * register them in the given registry.
 *
 * @example
 * ```ts
 * import { SlotRegistry } from '@czap/web';
 *
 * const registry = SlotRegistry.create();
 * SlotRegistry.scanDOM(registry, document.body);
 * // All elements with data-czap-slot="/..." are now registered
 * ```
 *
 * @param registry    - The slot registry to populate
 * @param root        - The DOM root element to scan
 * @param defaultMode - Default island mode for discovered slots (defaults to 'partial')
 */
export const scanDOM = (registry: SlotRegistryShape, root: Element, defaultMode: IslandMode = 'partial'): void => {
  const elements = root.querySelectorAll('[data-czap-slot]');

  for (const element of Array.from(elements)) {
    const slotPath = element.getAttribute('data-czap-slot');

    if (slotPath && SlotAddressing.isValid(slotPath)) {
      const mode = readIslandMode(element) ?? defaultMode;

      const entry: SlotEntry = {
        path: mkSlotPath(slotPath),
        element,
        mode,
        mounted: true,
      };
      registry.register(entry);
    } else if (slotPath) {
      Diagnostics.warn({
        source: 'czap/web.SlotRegistry',
        code: 'invalid-slot-path',
        message: `Invalid slot path "${slotPath}". Must start with "/" and contain only alphanumeric, hyphens, underscores.`,
      });
    }
  }
};

/**
 * Create a `MutationObserver` that automatically registers/unregisters slots
 * as DOM elements with `data-czap-slot` are added or removed. The observer
 * is disconnected when the enclosing Effect scope closes.
 *
 * @example
 * ```ts
 * import { SlotRegistry } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const registry = SlotRegistry.create();
 *   yield* SlotRegistry.observe(registry, document.body);
 *   // Observer is now active; slots auto-register on DOM changes
 * }));
 * ```
 *
 * @param registry - The slot registry to keep in sync
 * @param root     - The DOM root to observe
 * @returns An Effect (scoped) that starts observation
 */
export const observe = (registry: SlotRegistryShape, root: Element): Effect.Effect<void, never, Scope.Scope> => {
  return Effect.gen(function* () {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) {
            const slotPath = node.getAttribute('data-czap-slot');
            if (slotPath && SlotAddressing.isValid(slotPath)) {
              const mode = readIslandMode(node) ?? 'partial';
              const entry: SlotEntry = {
                path: mkSlotPath(slotPath),
                element: node,
                mode,
                mounted: true,
              };
              registry.register(entry);
            }

            const descendants = node.querySelectorAll('[data-czap-slot]');
            for (const desc of Array.from(descendants)) {
              const descPath = desc.getAttribute('data-czap-slot');
              if (descPath && SlotAddressing.isValid(descPath)) {
                const mode = readIslandMode(desc) ?? 'partial';
                const entry: SlotEntry = {
                  path: mkSlotPath(descPath),
                  element: desc,
                  mode,
                  mounted: true,
                };
                registry.register(entry);
              }
            }
          }
        }

        for (const node of Array.from(mutation.removedNodes)) {
          if (node instanceof Element) {
            const slotPath = node.getAttribute('data-czap-slot');
            if (slotPath && SlotAddressing.isValid(slotPath)) {
              registry.unregister(mkSlotPath(slotPath));
            }

            const descendants = node.querySelectorAll('[data-czap-slot]');
            for (const desc of Array.from(descendants)) {
              const descPath = desc.getAttribute('data-czap-slot');
              if (descPath && SlotAddressing.isValid(descPath)) {
                registry.unregister(mkSlotPath(descPath));
              }
            }
          }
        }

        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-czap-slot' &&
          mutation.target instanceof Element
        ) {
          const element = mutation.target;
          const oldPath = mutation.oldValue;
          const newPath = element.getAttribute('data-czap-slot');

          if (oldPath && SlotAddressing.isValid(oldPath)) {
            registry.unregister(mkSlotPath(oldPath));
          }

          if (newPath && SlotAddressing.isValid(newPath)) {
            const mode = readIslandMode(element) ?? 'partial';
            const entry: SlotEntry = {
              path: mkSlotPath(newPath),
              element,
              mode,
              mounted: true,
            };
            registry.register(entry);
          }
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-czap-slot'],
    });

    yield* Effect.addFinalizer(() => Effect.sync(() => observer.disconnect()));
  });
};

/**
 * Find the DOM element for a slot path via `querySelector`.
 *
 * @example
 * ```ts
 * import { SlotRegistry, SlotAddressing } from '@czap/web';
 *
 * const el = SlotRegistry.findElement(SlotAddressing.brand('/sidebar'));
 * // el => <div data-czap-slot="/sidebar"> or null
 * ```
 *
 * @param path - The slot path to search for
 * @returns The matching Element, or null
 */
export const findElement = (path: SlotPath): Element | null => {
  const root = document.documentElement;

  if (root.getAttribute('data-czap-slot') === path) {
    return root;
  }

  for (const element of Array.from(root.querySelectorAll('[data-czap-slot]'))) {
    if (element.getAttribute('data-czap-slot') === path) {
      return element;
    }
  }

  return null;
};

/**
 * Get the slot path from a DOM element's `data-czap-slot` attribute.
 *
 * @example
 * ```ts
 * import { SlotRegistry } from '@czap/web';
 *
 * const el = document.querySelector('[data-czap-slot]')!;
 * const path = SlotRegistry.getPath(el);
 * // path => '/hero' or null if not a slot element
 * ```
 *
 * @param element - The DOM element to inspect
 * @returns The slot path, or null if the element is not a slot
 */
export const getPath = (element: Element): SlotPath | null => {
  const slotPath = element.getAttribute('data-czap-slot');

  if (slotPath && SlotAddressing.isValid(slotPath)) {
    return mkSlotPath(slotPath);
  }

  return null;
};

/**
 * Slot registry namespace.
 *
 * Maps `SlotPath` identifiers (from `data-czap-slot` attributes) to DOM
 * elements for efficient lookup and patching. Provides DOM scanning,
 * `MutationObserver`-based auto-registration, and path lookup utilities.
 *
 * @example
 * ```ts
 * import { SlotRegistry } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * const registry = SlotRegistry.create();
 * SlotRegistry.scanDOM(registry, document.body);
 *
 * const entries = registry.entries();
 * for (const [path, entry] of entries) {
 *   console.log(path, entry.element.tagName);
 * }
 *
 * const el = SlotRegistry.findElement(SlotAddressing.brand('/hero'));
 * const path = el ? SlotRegistry.getPath(el) : null;
 * ```
 */
export const SlotRegistry = {
  create,
  scanDOM,
  observe,
  findElement,
  getPath,
} as const;

export declare namespace SlotRegistry {
  /** Structural type of a slot registry instance. */
  export type Shape = SlotRegistryShape;
}
