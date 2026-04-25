/**
 * Morph Hints
 *
 * Builder utilities for creating and merging morph hints.
 */

import type { MorphHints, MorphRejection, PhysicalState } from '../types.js';
import * as SemanticIdModule from './semantic-id.js';

/**
 * Mutable version of MorphHints for internal construction.
 */
type MutableMorphHints = {
  preserveIds?: string[];
  semanticIds?: string[];
  idMap?: Map<string, string>;
  preserveFocus?: string[];
  preserveScroll?: string[];
  preserve?: string[];
  remap?: Record<string, string>;
};

/**
 * Create empty morph hints.
 */
export const empty = (): MorphHints => ({});

/**
 * Create morph hints that preserve specific element IDs.
 */
export const preserveIds = (...ids: string[]): MorphHints => ({
  preserveIds: ids,
});

/**
 * Create morph hints with semantic ID mappings.
 */
export const withSemanticIds = (...ids: string[]): MorphHints => ({
  semanticIds: ids,
});

/**
 * Create morph hints with ID remapping.
 */
export const withIdMap = (map: Map<string, string>): MorphHints => ({
  idMap: map,
});

/**
 * Create morph hints for focus preservation.
 */
export const preserveFocus = (...selectors: string[]): MorphHints => ({
  preserveFocus: selectors,
});

/**
 * Create morph hints for scroll preservation.
 */
export const preserveScroll = (...selectors: string[]): MorphHints => ({
  preserveScroll: selectors,
});

/**
 * Merge multiple morph hints into one.
 */
export const merge = (...hints: MorphHints[]): MorphHints => {
  const arrays: {
    preserveIds?: string[];
    semanticIds?: string[];
    preserveFocus?: string[];
    preserveScroll?: string[];
    preserve?: string[];
  } = {};
  const idMap = new Map<string, string>();
  let remap: Record<string, string> = {};

  for (const hint of hints) {
    if (hint.preserveIds) {
      if (!arrays.preserveIds) arrays.preserveIds = [];
      arrays.preserveIds.push(...hint.preserveIds);
    }

    if (hint.semanticIds) {
      if (!arrays.semanticIds) arrays.semanticIds = [];
      arrays.semanticIds.push(...hint.semanticIds);
    }

    if (hint.preserveFocus) {
      if (!arrays.preserveFocus) arrays.preserveFocus = [];
      arrays.preserveFocus.push(...hint.preserveFocus);
    }

    if (hint.preserveScroll) {
      if (!arrays.preserveScroll) arrays.preserveScroll = [];
      arrays.preserveScroll.push(...hint.preserveScroll);
    }

    if (hint.preserve) {
      if (!arrays.preserve) arrays.preserve = [];
      arrays.preserve.push(...hint.preserve);
    }

    if (hint.idMap) {
      for (const [k, v] of hint.idMap) {
        idMap.set(k, v);
      }
    }

    if (hint.remap) {
      remap = { ...remap, ...hint.remap };
    }
  }

  const result: MutableMorphHints = {};
  if (arrays.preserveIds) result.preserveIds = arrays.preserveIds;
  if (arrays.semanticIds) result.semanticIds = arrays.semanticIds;
  if (arrays.preserveFocus) result.preserveFocus = arrays.preserveFocus;
  if (arrays.preserveScroll) result.preserveScroll = arrays.preserveScroll;
  if (arrays.preserve) result.preserve = arrays.preserve;
  if (idMap.size > 0) result.idMap = idMap;
  if (Object.keys(remap).length > 0) result.remap = remap;

  return result as MorphHints;
};

/**
 * Extract hints from a DOM element's data attributes.
 */
export const fromElement = (element: Element): MorphHints => {
  const result: MutableMorphHints = {};

  const preserveIdAttr = element.getAttribute('data-morph-preserve-id');
  if (preserveIdAttr) {
    result.preserveIds = preserveIdAttr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const semanticIdAttr = element.getAttribute('data-morph-semantic-id');
  if (semanticIdAttr) {
    result.semanticIds = semanticIdAttr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const preserveFocusAttr = element.getAttribute('data-morph-preserve-focus');
  if (preserveFocusAttr) {
    result.preserveFocus = preserveFocusAttr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const preserveScrollAttr = element.getAttribute('data-morph-preserve-scroll');
  if (preserveScrollAttr) {
    result.preserveScroll = preserveScrollAttr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const idMapAttr = element.getAttribute('data-morph-id-map');
  if (idMapAttr) {
    try {
      const parsed = JSON.parse(idMapAttr) as Record<string, string>;
      result.idMap = new Map(Object.entries(parsed));
    } catch {
      // Invalid JSON, skip id map
    }
  }

  return result as MorphHints;
};

// =============================================================================
// Preserve Validation
// =============================================================================

/**
 * Check if preserve constraint would be violated.
 * Returns MorphRejection if violated, null otherwise.
 */
export const rejectIfMissing = (hints: MorphHints, element: Element): MorphRejection | null => {
  const ids = hints.preserve ?? hints.preserveIds ?? [];

  if (ids.length === 0) {
    return null;
  }

  const index = SemanticIdModule.buildIndex(element);
  const missingIds: string[] = [];

  for (const id of ids) {
    if (!index.has(id)) {
      const byDomId = element.querySelector(`#${CSS.escape(id)}`);
      if (!byDomId) {
        missingIds.push(id);
      }
    }
  }

  if (missingIds.length > 0) {
    return {
      type: 'preserve_violation',
      missingIds,
      reason: `Required elements missing after morph: ${missingIds.join(', ')}`,
    };
  }

  return null;
};

// =============================================================================
// ID Remapping
// =============================================================================

/**
 * Apply ID remapping to physical state.
 */
export const applyRemap = (state: PhysicalState, remap: Record<string, string>): PhysicalState => {
  if (Object.keys(remap).length === 0) {
    return state;
  }

  const remapId = (id: string | null): string | null => {
    if (!id) return null;
    return remap[id] ?? id;
  };

  const remappedScrollPositions: Record<string, (typeof state.scrollPositions)[string]> = {};
  for (const [key, value] of Object.entries(state.scrollPositions)) {
    const newKey = remap[key] ?? key;
    remappedScrollPositions[newKey] = value;
  }

  return {
    activeElementPath: remapPath(state.activeElementPath, remap),
    focusState: state.focusState
      ? {
          ...state.focusState,
          elementId: remapId(state.focusState.elementId) ?? state.focusState.elementId,
        }
      : null,
    scrollPositions: remappedScrollPositions,
    selection: state.selection
      ? {
          ...state.selection,
          elementPath: remapPath(state.selection.elementPath, remap) ?? state.selection.elementPath,
        }
      : null,
    ime: state.ime
      ? {
          ...state.ime,
          elementPath: remapPath(state.ime.elementPath, remap) ?? state.ime.elementPath,
        }
      : null,
  };
};

/**
 * Remap IDs in a selector path.
 */
function remapPath(path: string | null, remap: Record<string, string>): string | null {
  if (!path) return null;

  let remappedPath = path;
  for (const [oldId, newId] of Object.entries(remap)) {
    remappedPath = remappedPath.replace(`[data-czap-id="${oldId}"]`, `[data-czap-id="${newId}"]`);
    remappedPath = remappedPath.replace(`#${CSS.escape(oldId)}`, `#${CSS.escape(newId)}`);
  }
  return remappedPath;
}

/**
 * Consolidated namespace export matching the spine contract.
 */
export const Hints = {
  empty,
  preserveIds,
  withSemanticIds,
  withIdMap,
  preserveFocus,
  preserveScroll,
  merge,
  fromElement,
} as const;
