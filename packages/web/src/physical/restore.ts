/**
 * Physical State Restoration
 *
 * Restores captured physical state after DOM morphing.
 */

import { Effect } from 'effect';
import { Diagnostics } from '@czap/core';
import type { PhysicalState, ScrollPosition, SelectionState, IMEState, FocusState } from '../types.js';
import { ATTR } from '../morph/semantic-id.js';
import * as SemanticIdModule from '../morph/semantic-id.js';

/**
 * Restore full physical state after morphing.
 */
export const restore = (state: PhysicalState, root: Element, remap?: Record<string, string>): Effect.Effect<void> => {
  return Effect.gen(function* () {
    const remappedState = remap ? applyRemapping(state, remap) : state;

    yield* restoreScrollPositions(remappedState.scrollPositions, root);
    yield* restoreSelection(remappedState.selection);

    if (remappedState.focusState) {
      yield* restoreFocusState(remappedState.focusState, root);
    } else {
      yield* restoreActiveElement(remappedState.activeElementPath, root);
    }

    if (remappedState.ime) {
      yield* restoreIME(remappedState.ime);
    }
  });
};

/**
 * Apply ID remapping to physical state paths.
 */
function applyRemapping(state: PhysicalState, remap: Record<string, string>): PhysicalState {
  return {
    activeElementPath: state.activeElementPath ? remapPath(state.activeElementPath, remap) : null,
    focusState: state.focusState
      ? {
          ...state.focusState,
          elementId: remapId(state.focusState.elementId, remap),
        }
      : null,
    scrollPositions: Object.fromEntries(
      Object.entries(state.scrollPositions).map(([key, pos]) => [remap[key] ?? remapPath(key, remap), pos]),
    ),
    selection: state.selection
      ? {
          ...state.selection,
          elementPath: remapPath(state.selection.elementPath, remap),
        }
      : null,
    ime: state.ime
      ? {
          ...state.ime,
          elementPath: remapPath(state.ime.elementPath, remap),
        }
      : null,
  };
}

/**
 * Remap a single ID (for semantic IDs).
 */
function remapId(id: string, remap: Record<string, string>): string {
  return Object.prototype.hasOwnProperty.call(remap, id) ? remap[id]! : id;
}

/**
 * Remap a path by replacing data-czap-id references.
 */
function remapPath(path: string, remap: Record<string, string>): string {
  let remappedPath = path;
  for (const [oldId, newId] of Object.entries(remap)) {
    const oldSelector = `[${ATTR}="${oldId}"]`;
    const newSelector = `[${ATTR}="${newId}"]`;
    remappedPath = remappedPath.replace(oldSelector, newSelector);
  }
  return remappedPath;
}

function isSelectionRangeError(error: unknown): error is DOMException {
  return (
    error instanceof DOMException &&
    ['InvalidStateError', 'InvalidAccessError', 'NotSupportedError'].includes(error.name)
  );
}

function isRangeRestoreError(error: unknown): error is DOMException {
  return error instanceof DOMException;
}

function isSelectorSyntaxError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'SyntaxError';
}

/**
 * Restore focus to an element by path.
 */
export const restoreActiveElement = (path: string | null, root?: Element): Effect.Effect<void> => {
  return Effect.sync(() => {
    if (!path) {
      return;
    }

    const element = pathToElement(path, root);
    if (element && element instanceof HTMLElement) {
      if (isFocusable(element)) {
        element.focus({ preventScroll: true });
      }
    }
  });
};

/**
 * Restore focus state including cursor position and selection.
 */
export const restoreFocusState = (focusState: FocusState, root?: Element): Effect.Effect<void> => {
  return Effect.sync(() => {
    let element: Element | null = null;
    const searchRoot = root ?? document.body;

    const isSemanticId =
      !focusState.elementId.includes(' ') &&
      !focusState.elementId.includes('>') &&
      !focusState.elementId.includes(':') &&
      !focusState.elementId.startsWith('[') &&
      !focusState.elementId.startsWith('#');

    if (isSemanticId) {
      element = SemanticIdModule.find(searchRoot, focusState.elementId);
    }

    if (!element) {
      element = pathToElement(focusState.elementId, root);
    }

    if (!element || !(element instanceof HTMLElement)) {
      return;
    }

    if (!isFocusable(element)) {
      return;
    }

    element.focus({ preventScroll: true });

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (focusState.selectionStart !== undefined && focusState.selectionEnd !== undefined) {
        try {
          element.setSelectionRange(
            focusState.selectionStart,
            focusState.selectionEnd,
            focusState.selectionDirection as 'forward' | 'backward' | 'none',
          );
        } catch (error) {
          if (isSelectionRangeError(error)) {
            return;
          }

          Diagnostics.warn({
            source: 'czap/web.physical.restore',
            code: 'restore-focus-selection-failed',
            message: 'Failed to restore focus selection range for a supported input element.',
            cause: error,
          });
          throw error;
        }
      }
    }

    if (element.isContentEditable && focusState.selectionStart !== undefined && focusState.selectionEnd !== undefined) {
      const range = createRangeFromOffsets(element, focusState.selectionStart, focusState.selectionEnd);
      if (range) {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
  });
};

/**
 * Check if an element is focusable.
 */
function isFocusable(element: HTMLElement): boolean {
  if (element.tabIndex >= 0) {
    return true;
  }

  if (element.isContentEditable) {
    return true;
  }

  const focusableTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];
  if (!focusableTags.includes(element.tagName)) {
    return false;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return !element.disabled;
  }

  return true;
}

/**
 * Restore scroll positions.
 */
export const restoreScrollPositions = (
  positions: Record<string, ScrollPosition>,
  root: Element,
): Effect.Effect<void> => {
  return Effect.sync(() => {
    for (const [path, position] of Object.entries(positions)) {
      const element = pathToElement(path, root);
      if (element) {
        element.scrollTop = position.top;
        element.scrollLeft = position.left;
      }
    }
  });
};

/**
 * Restore text selection.
 */
export const restoreSelection = (selection: SelectionState | null): Effect.Effect<void> => {
  return Effect.sync(() => {
    if (!selection) {
      return;
    }

    const element = pathToElement(selection.elementPath);
    if (!element) {
      return;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      try {
        element.setSelectionRange(
          selection.start,
          selection.end,
          selection.direction as 'forward' | 'backward' | 'none',
        );
      } catch (error) {
        if (isSelectionRangeError(error)) {
          return;
        }

        Diagnostics.warn({
          source: 'czap/web.physical.restore',
          code: 'restore-selection-range-failed',
          message: 'Failed to restore text selection for a supported input element.',
          cause: error,
        });
        throw error;
      }
      return;
    }

    const range = createRangeFromOffsets(element, selection.start, selection.end);
    if (range) {
      const windowSelection = window.getSelection();
      if (windowSelection) {
        windowSelection.removeAllRanges();
        windowSelection.addRange(range);
      }
    }
  });
};

/**
 * Create a Range from character offsets within an element.
 */
function createRangeFromOffsets(element: Element, start: number, end: number): Range | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  let charCount = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  let currentNode = walker.nextNode();
  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;

    if (!startNode && charCount + textLength >= start) {
      startNode = currentNode;
      startOffset = start - charCount;
    }

    if (!endNode && charCount + textLength >= end) {
      endNode = currentNode;
      endOffset = end - charCount;
    }

    if (startNode && endNode) {
      break;
    }

    charCount += textLength;
    currentNode = walker.nextNode();
  }

  if (startNode && endNode) {
    let restoredRange: Range | null = null;
    let unsupportedRange = false;
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      restoredRange = range;
    } catch (error) {
      if (isRangeRestoreError(error)) {
        unsupportedRange = true;
      } else {
        Diagnostics.warn({
          source: 'czap/web.physical.restore',
          code: 'restore-range-failed',
          message: 'Failed to construct a DOM range while restoring physical selection state.',
          cause: error,
        });
        throw error;
      }
    }

    return unsupportedRange ? null : restoredRange;
  }

  return null;
}

/**
 * Restore IME composition state.
 * Best-effort: OS controls IME state, we can only focus and position cursor.
 */
export const restoreIME = (ime: IMEState | null): Effect.Effect<void> => {
  return Effect.sync(() => {
    if (!ime) {
      return;
    }

    const element = pathToElement(ime.elementPath);
    if (!element) {
      return;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus({ preventScroll: true });
      try {
        element.setSelectionRange(ime.start, ime.end);
      } catch (error) {
        if (isSelectionRangeError(error)) {
          return;
        }

        Diagnostics.warn({
          source: 'czap/web.physical.restore',
          code: 'restore-ime-selection-failed',
          message: 'Failed to restore IME selection range for a supported input element.',
          cause: error,
        });
        throw error;
      }
    }
  });
};

/**
 * Find an element by its path selector.
 */
export const pathToElement = (path: string, root?: Element): Element | null => {
  const searchRoot = root ?? document.body;

  let element: Element | null = null;
  let invalidSelector = false;
  try {
    if (typeof searchRoot.matches === 'function' && searchRoot.matches(path)) {
      element = searchRoot;
    } else {
      element = searchRoot.querySelector(path);
    }
  } catch (error) {
    if (isSelectorSyntaxError(error)) {
      invalidSelector = true;
    } else {
      Diagnostics.warn({
        source: 'czap/web.physical.restore',
        code: 'restore-path-query-failed',
        message: 'Failed to resolve a persisted physical-state selector.',
        cause: error,
        detail: { path },
      });
      throw error;
    }
  }

  return invalidSelector ? null : element;
};
