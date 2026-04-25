// @vitest-environment jsdom
/**
 * Physical state module tests -- verifies that the Physical namespace imports
 * correctly and that the PhysicalState data structures are well-formed.
 *
 * The capture and restore functions are deeply DOM-dependent (they read
 * activeElement, getComputedStyle, getSelection, createTreeWalker, etc.),
 * so we limit testing to:
 *
 * 1. Import verification (ensures the barrel export is wired correctly)
 * 2. PhysicalState shape contracts via type-level and runtime checks
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Effect } from 'effect';
import { Physical } from '@czap/web';
import type { PhysicalState, FocusState, ScrollPosition, SelectionState, IMEState } from '@czap/web';
import { captureIME, captureSelection, elementToPath, findScrollable } from '../../../packages/web/src/physical/capture.js';

// jsdom lacks CSS.escape — polyfill for tests
beforeAll(() => {
  if (typeof globalThis.CSS === 'undefined') {
    (globalThis as any).CSS = {};
  }
  if (typeof CSS.escape !== 'function') {
    CSS.escape = (s: string) => s.replace(/([^\w-])/g, '\\$1');
  }
});

// ===========================================================================
// Import verification
// ===========================================================================

describe('Physical namespace', () => {
  test('exports capture function', () => {
    expect(typeof Physical.capture).toBe('function');
  });

  test('exports restore function', () => {
    expect(typeof Physical.restore).toBe('function');
  });
});

// ===========================================================================
// PhysicalState shape contracts
// ===========================================================================

describe('PhysicalState shape', () => {
  test('a well-formed PhysicalState satisfies the type contract', () => {
    const state: PhysicalState = {
      activeElementPath: '[data-czap-id="input-name"]',
      focusState: {
        elementId: 'input-name',
        cursorPosition: 5,
        selectionStart: 2,
        selectionEnd: 5,
        selectionDirection: 'forward',
      },
      scrollPositions: {
        '[data-czap-id="list"]': { top: 120, left: 0 },
      },
      selection: {
        elementPath: '[data-czap-id="editor"]',
        start: 10,
        end: 25,
        direction: 'forward',
      },
      ime: {
        elementPath: '[data-czap-id="input-name"]',
        text: 'composing',
        start: 5,
        end: 5,
      },
    };

    expect(state.activeElementPath).toBe('[data-czap-id="input-name"]');
    expect(state.focusState?.elementId).toBe('input-name');
    expect(state.focusState?.cursorPosition).toBe(5);
    expect(state.scrollPositions['[data-czap-id="list"]']?.top).toBe(120);
    expect(state.selection?.start).toBe(10);
    expect(state.ime?.text).toBe('composing');
  });

  test('a minimal PhysicalState with all nullable fields null', () => {
    const state: PhysicalState = {
      activeElementPath: null,
      focusState: null,
      scrollPositions: {},
      selection: null,
      ime: null,
    };

    expect(state.activeElementPath).toBeNull();
    expect(state.focusState).toBeNull();
    expect(Object.keys(state.scrollPositions)).toHaveLength(0);
    expect(state.selection).toBeNull();
    expect(state.ime).toBeNull();
  });
});

// ===========================================================================
// Sub-type shape checks
// ===========================================================================

describe('FocusState shape', () => {
  test('carries cursor and selection range', () => {
    const focus: FocusState = {
      elementId: 'search-box',
      cursorPosition: 12,
      selectionStart: 0,
      selectionEnd: 12,
      selectionDirection: 'forward',
    };
    expect(focus.elementId).toBe('search-box');
    expect(focus.selectionEnd).toBe(12);
  });
});

describe('ScrollPosition shape', () => {
  test('records top and left offsets', () => {
    const scroll: ScrollPosition = { top: 200, left: 50 };
    expect(scroll.top).toBe(200);
    expect(scroll.left).toBe(50);
  });
});

describe('SelectionState shape', () => {
  test('records element path with start/end/direction', () => {
    const sel: SelectionState = {
      elementPath: '#editor',
      start: 3,
      end: 15,
      direction: 'backward',
    };
    expect(sel.elementPath).toBe('#editor');
    expect(sel.start).toBe(3);
    expect(sel.end).toBe(15);
    expect(sel.direction).toBe('backward');
  });
});

describe('IMEState shape', () => {
  test('records composition text and range', () => {
    const ime: IMEState = {
      elementPath: '[data-czap-id="input"]',
      text: '\u304b\u306a',
      start: 0,
      end: 2,
    };
    expect(ime.text).toBe('\u304b\u306a');
    expect(ime.start).toBe(0);
    expect(ime.end).toBe(2);
  });
});

// ===========================================================================
// Behavioral tests (jsdom)
// ===========================================================================

describe('Physical.capture() behavioral', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-root';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('captures activeElementPath when an input is focused', () => {
    const input = document.createElement('input');
    input.id = 'name-field';
    input.type = 'text';
    container.appendChild(input);

    input.focus();
    expect(document.activeElement).toBe(input);

    const state = Effect.runSync(Physical.capture(container));

    expect(state.activeElementPath).not.toBeNull();
    expect(state.activeElementPath).toContain('name-field');
  });

  test('captures focusState with cursor position for a text input', () => {
    const input = document.createElement('input');
    input.id = 'cursor-field';
    input.type = 'text';
    input.value = 'hello world';
    container.appendChild(input);

    input.focus();
    input.setSelectionRange(5, 5);

    const state = Effect.runSync(Physical.capture(container));

    expect(state.focusState).not.toBeNull();
    expect(state.focusState!.cursorPosition).toBe(5);
    expect(state.focusState!.selectionStart).toBe(5);
    expect(state.focusState!.selectionEnd).toBe(5);
  });

  test('captures focusState with selection range for a text input', () => {
    const input = document.createElement('input');
    input.id = 'sel-field';
    input.type = 'text';
    input.value = 'select me';
    container.appendChild(input);

    input.focus();
    input.setSelectionRange(0, 6, 'forward');

    const state = Effect.runSync(Physical.capture(container));

    expect(state.focusState).not.toBeNull();
    expect(state.focusState!.selectionStart).toBe(0);
    expect(state.focusState!.selectionEnd).toBe(6);
    expect(state.focusState!.selectionDirection).toBe('forward');
  });

  test('captures focusState for a textarea', () => {
    const textarea = document.createElement('textarea');
    textarea.id = 'ta-field';
    textarea.value = 'line one\nline two';
    container.appendChild(textarea);

    textarea.focus();
    textarea.setSelectionRange(3, 8);

    const state = Effect.runSync(Physical.capture(container));

    expect(state.focusState).not.toBeNull();
    expect(state.focusState!.selectionStart).toBe(3);
    expect(state.focusState!.selectionEnd).toBe(8);
  });

  test('captures activeElementPath using data-czap-id when present', () => {
    const input = document.createElement('input');
    input.setAttribute('data-czap-id', 'semantic-input');
    input.type = 'text';
    container.appendChild(input);

    input.focus();

    const state = Effect.runSync(Physical.capture(container));

    expect(state.activeElementPath).toContain('data-czap-id="semantic-input"');
  });

  test('captures forward selection direction when anchor and focus share the same node', () => {
    const editor = document.createElement('div');
    editor.textContent = 'abcdef';
    container.appendChild(editor);

    const textNode = editor.firstChild as Text;
    const anchorFocusNode = {
      compareDocumentPosition: () => 0,
    } as unknown as Node;
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: anchorFocusNode,
      focusNode: anchorFocusNode,
      anchorOffset: 1,
      focusOffset: 4,
      getRangeAt: () => {
        const range = document.createRange();
        range.setStart(textNode, 1);
        range.setEnd(textNode, 4);
        return range;
      },
    } as Selection;

    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    try {
      expect(captureSelection()).toMatchObject({
        start: 1,
        end: 4,
        direction: 'forward',
      });
    } finally {
      getSelectionSpy.mockRestore();
    }
  });

  test('capture on empty container returns null/empty state', () => {
    // No children, nothing focused
    const state = Effect.runSync(Physical.capture(container));

    expect(state.activeElementPath).toBeNull();
    expect(state.focusState).toBeNull();
    expect(Object.keys(state.scrollPositions)).toHaveLength(0);
    expect(state.selection).toBeNull();
    expect(state.ime).toBeNull();
  });

  test('capture on body-focused document returns null activeElementPath', () => {
    // Blur any focused element so activeElement reverts to body
    const input = document.createElement('input');
    container.appendChild(input);
    input.focus();
    input.blur();

    const state = Effect.runSync(Physical.capture(container));

    expect(state.activeElementPath).toBeNull();
    expect(state.focusState).toBeNull();
  });

  test('captures focusState for a button element', () => {
    const button = document.createElement('button');
    button.id = 'my-btn';
    button.textContent = 'Click me';
    container.appendChild(button);

    button.focus();
    expect(document.activeElement).toBe(button);

    const state = Effect.runSync(Physical.capture(container));

    expect(state.focusState).not.toBeNull();
    expect(state.focusState!.elementId).toContain('my-btn');
    // Buttons have no text selection, so cursor/selection should be 0
    expect(state.focusState!.cursorPosition).toBe(0);
  });

  test('captures IME state with null selection fallbacks and ignores non-text composition targets', () => {
    const ignoredTarget = document.createElement('div');
    container.appendChild(ignoredTarget);
    ignoredTarget.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    expect(captureIME()).toBeNull();

    const input = document.createElement('input');
    input.type = 'text';
    container.appendChild(input);

    Object.defineProperty(input, 'selectionStart', {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(input, 'selectionEnd', {
      configurable: true,
      get: () => null,
    });

    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));

    const emptyUpdate = new Event('compositionupdate', { bubbles: true });
    Object.defineProperty(emptyUpdate, 'data', {
      configurable: true,
      value: '',
    });
    input.dispatchEvent(emptyUpdate);

    expect(captureIME()).toEqual({
      elementPath: '#test-root > input:nth-child(2)',
      text: '',
      start: 0,
      end: 0,
    });

    const textUpdate = new Event('compositionupdate', { bubbles: true });
    Object.defineProperty(textUpdate, 'data', {
      configurable: true,
      value: 'kana',
    });
    input.dispatchEvent(textUpdate);

    expect(captureIME()).toEqual({
      elementPath: '#test-root > input:nth-child(2)',
      text: 'kana',
      start: 0,
      end: 0,
    });

    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    expect(captureIME()).toBeNull();
  });

  test('captures focus state fallback values when input selections are unavailable', () => {
    const input = document.createElement('input');
    input.id = 'null-selection-input';
    input.type = 'text';
    input.value = 'hello';
    container.appendChild(input);

    Object.defineProperty(input, 'selectionStart', {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(input, 'selectionEnd', {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(input, 'selectionDirection', {
      configurable: true,
      get: () => null,
    });

    input.focus();

    const state = Effect.runSync(Physical.capture(container));

    expect(state.focusState).toEqual({
      elementId: '#null-selection-input',
      cursorPosition: 0,
      selectionStart: 0,
      selectionEnd: 0,
      selectionDirection: 'none',
    });
  });

  test('elementToPath handles detached elements and findScrollable catches horizontal overflow', () => {
    const detached = document.createElement('span');
    expect(elementToPath(detached)).toBe('');

    const horizontal = document.createElement('div');
    horizontal.style.overflowX = 'auto';
    horizontal.style.overflowY = 'hidden';
    Object.defineProperty(horizontal, 'clientWidth', { configurable: true, value: 20 });
    Object.defineProperty(horizontal, 'clientHeight', { configurable: true, value: 20 });
    Object.defineProperty(horizontal, 'scrollWidth', { configurable: true, value: 200 });
    Object.defineProperty(horizontal, 'scrollHeight', { configurable: true, value: 20 });
    container.appendChild(horizontal);

    expect(findScrollable(container)).toContain(horizontal);
  });

  test('capture records scroll positions keyed by semantic id and elementPath fallback', () => {
    const withSemanticId = document.createElement('div');
    withSemanticId.setAttribute('data-czap-id', 'scroll-semantic');
    withSemanticId.style.overflowY = 'auto';
    Object.defineProperty(withSemanticId, 'clientWidth', { configurable: true, value: 20 });
    Object.defineProperty(withSemanticId, 'clientHeight', { configurable: true, value: 20 });
    Object.defineProperty(withSemanticId, 'scrollWidth', { configurable: true, value: 20 });
    Object.defineProperty(withSemanticId, 'scrollHeight', { configurable: true, value: 200 });
    Object.defineProperty(withSemanticId, 'scrollTop', { configurable: true, value: 42 });
    Object.defineProperty(withSemanticId, 'scrollLeft', { configurable: true, value: 7 });

    const withoutSemanticId = document.createElement('section');
    withoutSemanticId.style.overflowX = 'scroll';
    Object.defineProperty(withoutSemanticId, 'clientWidth', { configurable: true, value: 20 });
    Object.defineProperty(withoutSemanticId, 'clientHeight', { configurable: true, value: 20 });
    Object.defineProperty(withoutSemanticId, 'scrollWidth', { configurable: true, value: 100 });
    Object.defineProperty(withoutSemanticId, 'scrollHeight', { configurable: true, value: 20 });
    Object.defineProperty(withoutSemanticId, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(withoutSemanticId, 'scrollLeft', { configurable: true, value: 11 });

    container.append(withSemanticId, withoutSemanticId);

    const state = Effect.runSync(Physical.capture(container));

    expect(state.scrollPositions['scroll-semantic']).toEqual({ top: 42, left: 7 });
    const elementPathKey = Object.keys(state.scrollPositions).find((k) => k !== 'scroll-semantic');
    expect(elementPathKey).toBeDefined();
    expect(state.scrollPositions[elementPathKey!]).toEqual({ top: 0, left: 11 });
  });
});

describe('Physical.restore() behavioral', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'restore-root';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('restores focus to an input after capture', () => {
    const input = document.createElement('input');
    input.id = 'restore-input';
    input.type = 'text';
    input.value = 'test value';
    container.appendChild(input);

    // Capture with focus
    input.focus();
    const state = Effect.runSync(Physical.capture(container));

    // Blur to lose focus
    input.blur();
    expect(document.activeElement).not.toBe(input);

    // Restore
    Effect.runSync(Physical.restore(state, container));

    expect(document.activeElement).toBe(input);
  });

  test('restores cursor position in an input after capture', () => {
    const input = document.createElement('input');
    input.id = 'cursor-restore';
    input.type = 'text';
    input.value = 'hello world';
    container.appendChild(input);

    input.focus();
    input.setSelectionRange(7, 7);
    const state = Effect.runSync(Physical.capture(container));

    // Blur and reset cursor
    input.blur();

    // Restore
    Effect.runSync(Physical.restore(state, container));

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(7);
  });

  test('restores selection range in a textarea after capture', () => {
    const textarea = document.createElement('textarea');
    textarea.id = 'sel-restore';
    textarea.value = 'some text here';
    container.appendChild(textarea);

    textarea.focus();
    textarea.setSelectionRange(5, 9, 'forward');
    const state = Effect.runSync(Physical.capture(container));

    textarea.blur();

    Effect.runSync(Physical.restore(state, container));

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(9);
  });

  test('round-trip capture/restore preserves state across DOM rebuild', () => {
    const input = document.createElement('input');
    input.id = 'roundtrip-input';
    input.type = 'text';
    input.value = 'persistent';
    container.appendChild(input);

    input.focus();
    input.setSelectionRange(3, 7);
    const state = Effect.runSync(Physical.capture(container));

    // Simulate a DOM morph: remove and recreate the input
    container.innerHTML = '';
    const newInput = document.createElement('input');
    newInput.id = 'roundtrip-input';
    newInput.type = 'text';
    newInput.value = 'persistent';
    container.appendChild(newInput);

    // Restore onto the new DOM
    Effect.runSync(Physical.restore(state, container));

    expect(document.activeElement).toBe(newInput);
    expect(newInput.selectionStart).toBe(3);
    expect(newInput.selectionEnd).toBe(7);
  });

  test('restore remaps semantic ids for scroll, focus, and ime state', () => {
    const scrollable = document.createElement('div');
    scrollable.setAttribute('data-czap-id', 'scroll-new');
    scrollable.style.overflow = 'auto';
    scrollable.style.height = '20px';
    scrollable.style.width = '20px';
    scrollable.innerHTML = '<div style="height: 200px; width: 200px;"></div>';

    const input = document.createElement('input');
    input.setAttribute('data-czap-id', 'input-new');
    input.type = 'text';
    input.value = 'hello world';

    container.append(scrollable, input);

    const state: PhysicalState = {
      activeElementPath: '[data-czap-id="input-old"]',
      focusState: {
        elementId: 'input-old',
        cursorPosition: 2,
        selectionStart: 1,
        selectionEnd: 4,
        selectionDirection: 'forward',
      },
      scrollPositions: {
        '[data-czap-id="scroll-old"]': { top: 25, left: 8 },
      },
      selection: null,
      ime: {
        elementPath: '[data-czap-id="input-old"]',
        text: 'ello',
        start: 1,
        end: 4,
      },
    };

    Effect.runSync(
      Physical.restore(state, container, {
        'input-old': 'input-new',
        'scroll-old': 'scroll-new',
      }),
    );

    expect(scrollable.scrollTop).toBe(25);
    expect(scrollable.scrollLeft).toBe(8);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(4);
  });

  test('restore with null activeElementPath does not throw', () => {
    const state: PhysicalState = {
      activeElementPath: null,
      focusState: null,
      scrollPositions: {},
      selection: null,
      ime: null,
    };

    expect(() => Effect.runSync(Physical.restore(state, container))).not.toThrow();
  });

  test('restore with nonexistent element path does not throw', () => {
    const state: PhysicalState = {
      activeElementPath: '#does-not-exist',
      focusState: {
        elementId: '#does-not-exist',
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
        selectionDirection: 'none',
      },
      scrollPositions: {},
      selection: null,
      ime: null,
    };

    expect(() => Effect.runSync(Physical.restore(state, container))).not.toThrow();
  });

  test('restore skips disabled focus targets that are not otherwise tabbable', () => {
    const input = document.createElement('input');
    input.id = 'disabled-focus-target';
    input.type = 'text';
    input.disabled = true;
    Object.defineProperty(input, 'tabIndex', {
      configurable: true,
      get: () => -1,
    });
    container.appendChild(input);

    const state: PhysicalState = {
      activeElementPath: null,
      focusState: {
        elementId: '#disabled-focus-target',
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
        selectionDirection: 'none',
      },
      scrollPositions: {},
      selection: null,
      ime: null,
    };

    Effect.runSync(Physical.restore(state, container));

    expect(document.activeElement).not.toBe(input);
  });

  test('restore with a non-empty remap but null activeElementPath leaves the active path pass-through as null', () => {
    const state: PhysicalState = {
      activeElementPath: null,
      focusState: null,
      scrollPositions: {},
      selection: null,
      ime: null,
    };

    expect(() =>
      Effect.runSync(
        Physical.restore(state, container, {
          'some-old-id': 'some-new-id',
        }),
      ),
    ).not.toThrow();
    // With no active element to restore, focus should remain on body.
    expect(document.activeElement === container || document.activeElement === document.body).toBe(true);
  });

  test('restore routes focus to an anchor element whose tabIndex was forced negative', () => {
    const anchor = document.createElement('a');
    anchor.id = 'anchor-focus-target';
    anchor.href = '#section';
    anchor.textContent = 'link';
    Object.defineProperty(anchor, 'tabIndex', {
      configurable: true,
      get: () => -1,
    });
    container.appendChild(anchor);

    const state: PhysicalState = {
      activeElementPath: '#anchor-focus-target',
      focusState: null,
      scrollPositions: {},
      selection: null,
      ime: null,
    };

    Effect.runSync(Physical.restore(state, container));
    expect(document.activeElement).toBe(anchor);
  });

  test('restore tolerates IME selection errors for supported input elements', () => {
    const input = document.createElement('input');
    input.id = 'ime-target';
    input.type = 'text';
    input.value = 'ime';
    Object.defineProperty(input, 'setSelectionRange', {
      configurable: true,
      value: () => {
        throw new DOMException('unsupported', 'InvalidStateError');
      },
    });
    container.appendChild(input);

    const state: PhysicalState = {
      activeElementPath: null,
      focusState: null,
      scrollPositions: {},
      selection: null,
      ime: {
        elementPath: '#ime-target',
        text: 'ime',
        start: 0,
        end: 1,
      },
    };

    expect(() => Effect.runSync(Physical.restore(state, container))).not.toThrow();
  });

  test('restore selection tolerates text nodes whose content resolves to null during range construction', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    const text = document.createTextNode('abc');
    Object.defineProperty(text, 'textContent', {
      configurable: true,
      get: () => null,
    });
    editor.appendChild(text);
    container.appendChild(editor);

    const state: PhysicalState = {
      activeElementPath: null,
      focusState: null,
      scrollPositions: {},
      selection: {
        elementPath: '#restore-root > div',
        start: 0,
        end: 1,
        direction: 'forward',
      },
      ime: null,
    };

    expect(() => Effect.runSync(Physical.restore(state, container))).not.toThrow();
  });

  test('restores focus using data-czap-id semantic path', () => {
    const input = document.createElement('input');
    input.setAttribute('data-czap-id', 'semantic-field');
    input.type = 'text';
    input.value = 'semantic';
    container.appendChild(input);

    input.focus();
    input.setSelectionRange(2, 5);
    const state = Effect.runSync(Physical.capture(container));

    // Rebuild DOM with same semantic ID
    container.innerHTML = '';
    const newInput = document.createElement('input');
    newInput.setAttribute('data-czap-id', 'semantic-field');
    newInput.type = 'text';
    newInput.value = 'semantic';
    container.appendChild(newInput);

    Effect.runSync(Physical.restore(state, container));

    expect(document.activeElement).toBe(newInput);
    expect(newInput.selectionStart).toBe(2);
    expect(newInput.selectionEnd).toBe(5);
  });
});
