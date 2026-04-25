import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Effect } from 'effect';
import { capture, captureActiveElement, captureFocusState, captureIME, elementToPath, findScrollable } from '../../packages/web/src/physical/capture.js';
import { restore, restoreActiveElement, restoreFocusState, restoreScrollPositions, restoreIME, pathToElement } from '../../packages/web/src/physical/restore.js';

describe('browser physical state capture and restore', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'test-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('captureActiveElement returns path for focused input', () => {
    const input = document.createElement('input');
    input.id = 'my-input';
    root.appendChild(input);
    input.focus();

    const path = captureActiveElement();
    expect(path).toBe('#my-input');
  });

  test('captureActiveElement returns null when body is focused', () => {
    document.body.focus();
    const path = captureActiveElement();
    expect(path).toBeNull();
  });

  test('captureFocusState captures cursor and selection range for input', () => {
    const input = document.createElement('input');
    input.id = 'sel-input';
    input.value = 'hello world';
    root.appendChild(input);
    input.focus();
    input.setSelectionRange(2, 7);

    const state = captureFocusState();
    expect(state).not.toBeNull();
    expect(state!.elementId).toContain('sel-input');
    expect(state!.selectionStart).toBe(2);
    expect(state!.selectionEnd).toBe(7);
  });

  test('captureFocusState captures contentEditable selection positions', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    editable.id = 'editable';
    editable.textContent = 'editable text';
    root.appendChild(editable);

    editable.focus();

    // Create a selection in the editable content
    const range = document.createRange();
    const textNode = editable.firstChild!;
    range.setStart(textNode, 3);
    range.setEnd(textNode, 8);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const state = captureFocusState();
    expect(state).not.toBeNull();
    expect(state!.selectionStart).toBe(3);
    expect(state!.selectionEnd).toBe(8);
  });

  test('capture produces full PhysicalState with scroll, focus, and selection', async () => {
    const scrollBox = document.createElement('div');
    scrollBox.id = 'scrollable';
    scrollBox.style.overflow = 'auto';
    scrollBox.style.height = '50px';
    scrollBox.style.width = '50px';
    scrollBox.innerHTML = '<div style="height: 300px; width: 50px;">tall content</div>';

    const input = document.createElement('input');
    input.id = 'focused-input';
    input.value = 'test value';

    root.appendChild(scrollBox);
    root.appendChild(input);

    scrollBox.scrollTop = 42;
    input.focus();
    input.setSelectionRange(1, 5);

    const state = await Effect.runPromise(capture(root));

    expect(state.focusState?.elementId).toContain('focused-input');
    expect(state.focusState?.selectionStart).toBe(1);
    expect(state.focusState?.selectionEnd).toBe(5);
    expect(state.scrollPositions['#scrollable']?.top).toBeCloseTo(42, 0);
  });

  test('restore refocuses input and restores scroll position', async () => {
    const scrollBox = document.createElement('div');
    scrollBox.id = 'scroll-restore';
    scrollBox.style.overflow = 'auto';
    scrollBox.style.height = '50px';
    scrollBox.style.width = '50px';
    scrollBox.innerHTML = '<div style="height: 300px; width: 50px;">content</div>';

    const input = document.createElement('input');
    input.id = 'restore-input';
    input.value = 'restore me';

    root.appendChild(scrollBox);
    root.appendChild(input);

    scrollBox.scrollTop = 80;
    input.focus();
    input.setSelectionRange(2, 6);

    const state = await Effect.runPromise(capture(root));

    // Destroy state
    input.blur();
    input.setSelectionRange(0, 0);
    scrollBox.scrollTop = 0;

    // Restore
    await Effect.runPromise(restore(state, root));

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(6);
    expect(scrollBox.scrollTop).toBeCloseTo(80, 0);
  });

  test('restoreActiveElement focuses element by CSS path', async () => {
    const btn = document.createElement('button');
    btn.id = 'restore-btn';
    btn.textContent = 'Click';
    root.appendChild(btn);

    await Effect.runPromise(restoreActiveElement('#restore-btn', root));
    expect(document.activeElement).toBe(btn);
  });

  test('restoreActiveElement is a no-op for null path', async () => {
    await Effect.runPromise(restoreActiveElement(null, root));
    expect(document.activeElement).not.toBe(root);
  });

  test('restoreFocusState restores selection range on textarea', async () => {
    const textarea = document.createElement('textarea');
    textarea.id = 'ta';
    textarea.value = 'line one\nline two';
    root.appendChild(textarea);

    await Effect.runPromise(restoreFocusState({
      elementId: '#ta',
      cursorPosition: 5,
      selectionStart: 3,
      selectionEnd: 10,
      selectionDirection: 'forward',
    }, root));

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(10);
  });

  test('restoreScrollPositions sets scrollTop and scrollLeft on real scrollable elements', async () => {
    const box = document.createElement('div');
    box.id = 'scroll-box';
    box.style.overflow = 'auto';
    box.style.height = '40px';
    box.style.width = '40px';
    box.innerHTML = '<div style="height: 200px; width: 200px;">content</div>';
    root.appendChild(box);

    await Effect.runPromise(restoreScrollPositions({
      '#scroll-box': { top: 55, left: 30 },
    }, root));

    expect(box.scrollTop).toBeCloseTo(55, 0);
    expect(box.scrollLeft).toBeCloseTo(30, 0);
  });

  test('restoreIME focuses the target element and sets selection range', async () => {
    const input = document.createElement('input');
    input.id = 'ime-target';
    input.value = 'composing text';
    root.appendChild(input);

    await Effect.runPromise(restoreIME({
      elementPath: '#ime-target',
      text: 'comp',
      start: 2,
      end: 6,
    }));

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(6);
  });

  test('restoreIME is a no-op when passed null', async () => {
    await Effect.runPromise(restoreIME(null));
    // Should not throw
    expect(true).toBe(true);
  });

  test('elementToPath uses data-czap-id when present', () => {
    const el = document.createElement('div');
    el.setAttribute('data-czap-id', 'my-semantic-id');
    root.appendChild(el);

    const path = elementToPath(el);
    expect(path).toContain('data-czap-id="my-semantic-id"');
  });

  test('elementToPath builds nth-child path for elements without id', () => {
    root.innerHTML = '<div><span></span><span class="target"></span></div>';
    const target = root.querySelector('.target')!;
    const path = elementToPath(target);

    // Should produce something like "div:nth-child(1) > span:nth-child(2)"
    expect(path).toContain('nth-child');
    expect(path).toContain('span');
  });

  test('pathToElement resolves querySelector paths against the DOM', () => {
    const el = document.createElement('article');
    el.id = 'finder';
    root.appendChild(el);

    const found = pathToElement('#finder', root);
    expect(found).toBe(el);
  });

  test('pathToElement resolves a structural selector against the root element itself', () => {
    root.removeAttribute('id');

    const path = elementToPath(root);
    const found = pathToElement(path, root);

    expect(found).toBe(root);
  });

  test('pathToElement returns null for invalid CSS selectors without throwing', () => {
    const result = pathToElement('[invalid!!!', root);
    expect(result).toBeNull();
  });

  test('restoreScrollPositions restores scroll state onto the root scroll container', async () => {
    root.removeAttribute('id');
    root.style.overflow = 'auto';
    root.style.height = '40px';
    root.style.width = '40px';
    root.innerHTML = '<div style="height: 240px; width: 240px;">content</div>';

    const path = elementToPath(root);

    await Effect.runPromise(
      restoreScrollPositions(
        {
          [path]: { top: 63, left: 21 },
        },
        root,
      ),
    );

    expect(root.scrollTop).toBeCloseTo(63, 0);
    expect(root.scrollLeft).toBeCloseTo(21, 0);
  });

  test('restoreActiveElement can refocus the root element when its persisted path targets self', async () => {
    root.removeAttribute('id');
    root.tabIndex = 0;

    const path = elementToPath(root);

    await Effect.runPromise(restoreActiveElement(path, root));

    expect(document.activeElement).toBe(root);
  });

  test('findScrollable discovers scrollable elements in the subtree', () => {
    const scrollable = document.createElement('div');
    scrollable.style.overflow = 'auto';
    scrollable.style.height = '30px';
    scrollable.innerHTML = '<div style="height: 200px;">tall</div>';

    const notScrollable = document.createElement('div');
    notScrollable.style.overflow = 'hidden';
    notScrollable.textContent = 'short';

    root.appendChild(scrollable);
    root.appendChild(notScrollable);

    const found = findScrollable(root);
    expect(found).toContain(scrollable);
    expect(found).not.toContain(notScrollable);
  });

  test('captureIME returns null when no composition is active', () => {
    // Ensure no composition event has been fired
    const input = document.createElement('input');
    root.appendChild(input);
    input.focus();

    // Fire compositionend to clear any state
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));

    const ime = captureIME();
    expect(ime).toBeNull();
  });

  test('capture and restore round-trip preserves IME composition tracking', async () => {
    const input = document.createElement('input');
    input.id = 'ime-roundtrip';
    input.value = 'typing';
    root.appendChild(input);

    input.focus();
    input.setSelectionRange(2, 4);

    // Start composition
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'han' }));

    const state = await Effect.runPromise(capture(root));
    expect(state.ime).not.toBeNull();
    expect(state.ime!.text).toBe('han');

    // End composition to clean up
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
});
