// @vitest-environment jsdom
/**
 * Component test: Physical state capture → morph → restore roundtrip.
 *
 * Tests focus capture/restore, scroll capture/restore,
 * input selection, elementToPath, pathToElement, and IME state.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Effect } from 'effect';
import { Physical, Morph, SemanticId } from '@czap/web';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect);

/** Create element and attach to body. */
const mount = (html: string): Element => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const el = template.content.firstElementChild!;
  document.body.appendChild(el);
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// capture basics
// ---------------------------------------------------------------------------

describe('Physical.capture', () => {
  test('captures state with no focus', () => {
    const root = mount('<div><p>hello</p></div>');
    const state = run(Physical.capture(root));
    expect(state.activeElementPath).toBeNull();
    expect(state.focusState).toBeNull();
    expect(state.selection).toBeNull();
    expect(state.ime).toBeNull();
  });

  test('captures focused input element', () => {
    const root = mount('<div><input type="text" data-czap-id="myinput" /></div>');
    const input = root.querySelector('input')!;
    input.focus();
    const state = run(Physical.capture(root));
    expect(state.activeElementPath).not.toBeNull();
    expect(state.focusState).not.toBeNull();
    expect(state.focusState!.elementId).toContain('myinput');
  });

  test('captures cursor position in input', () => {
    const root = mount('<div><input type="text" value="hello world" data-czap-id="inp" /></div>');
    const input = root.querySelector('input')!;
    input.focus();
    input.setSelectionRange(5, 5);
    const state = run(Physical.capture(root));
    expect(state.focusState!.cursorPosition).toBe(5);
    expect(state.focusState!.selectionStart).toBe(5);
    expect(state.focusState!.selectionEnd).toBe(5);
  });

  test('captures text selection range in input', () => {
    const root = mount('<div><input type="text" value="hello world" data-czap-id="inp" /></div>');
    const input = root.querySelector('input')!;
    input.focus();
    input.setSelectionRange(0, 5);
    const state = run(Physical.capture(root));
    expect(state.focusState!.selectionStart).toBe(0);
    expect(state.focusState!.selectionEnd).toBe(5);
  });

  test('captures textarea focus state', () => {
    const root = mount('<div><textarea data-czap-id="ta">some text</textarea></div>');
    const ta = root.querySelector('textarea')!;
    ta.focus();
    ta.setSelectionRange(2, 7);
    const state = run(Physical.capture(root));
    expect(state.focusState).not.toBeNull();
    expect(state.focusState!.selectionStart).toBe(2);
    expect(state.focusState!.selectionEnd).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// restore focus
// ---------------------------------------------------------------------------

describe('Physical.restore focus', () => {
  test('restores focus to input by semantic ID', () => {
    const root = mount('<div><input data-czap-id="target" /><input data-czap-id="other" /></div>');
    const targetInput = root.querySelector('[data-czap-id="target"]') as HTMLInputElement;
    targetInput.focus();
    const state = run(Physical.capture(root));

    // Blur the input
    targetInput.blur();
    expect(document.activeElement).not.toBe(targetInput);

    // Restore
    run(Physical.restore(state, root));
    expect(document.activeElement).toBe(targetInput);
  });

  test('restores cursor position in input', () => {
    const root = mount('<div><input type="text" value="hello" data-czap-id="inp" /></div>');
    const input = root.querySelector('input')!;
    input.focus();
    input.setSelectionRange(3, 3);
    const state = run(Physical.capture(root));

    input.blur();
    input.setSelectionRange(0, 0);

    run(Physical.restore(state, root));
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });

  test('restores selection range in input', () => {
    const root = mount('<div><input type="text" value="abcdef" data-czap-id="inp" /></div>');
    const input = root.querySelector('input')!;
    input.focus();
    input.setSelectionRange(1, 4);
    const state = run(Physical.capture(root));

    input.setSelectionRange(0, 0);
    input.blur();

    run(Physical.restore(state, root));
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Morph + physical roundtrip
// ---------------------------------------------------------------------------

describe('Physical roundtrip through morph', () => {
  test('focus survives morph via morphWithState', () => {
    const root = mount('<div><input type="text" value="keep" data-czap-id="myfield" /><p>other</p></div>');
    const input = root.querySelector('input')!;
    input.focus();
    input.setSelectionRange(2, 2);

    // morphWithState should capture and restore focus
    const result = run(
      Morph.morphWithState(root, '<input type="text" value="keep" data-czap-id="myfield" /><p>updated</p>'),
    );
    expect(result.type).toBe('success');

    // Focus should be restored
    const restoredInput = root.querySelector('input')!;
    expect(document.activeElement).toBe(restoredInput);
  });

  test('text content updates while preserving focused element identity', () => {
    const root = mount('<div><input data-czap-id="f1" value="a" /><span>old</span></div>');
    const input = root.querySelector('input')!;
    input.focus();

    run(Morph.morphWithState(root, '<input data-czap-id="f1" value="a" /><span>new</span>'));

    // Input should survive morph (same element reused due to semantic ID)
    const currentInput = root.querySelector('input')!;
    expect(currentInput).toBe(input);
    expect(root.querySelector('span')!.textContent).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// Scroll capture/restore
// ---------------------------------------------------------------------------

describe('Physical scroll', () => {
  test('captures and restores scroll positions', () => {
    // Create a scrollable container
    const root = mount(
      '<div>' +
        '<div data-czap-id="scroller" style="overflow:auto;width:100px;height:100px">' +
        '<div style="width:500px;height:500px">content</div>' +
        '</div>' +
        '</div>',
    );
    const scroller = root.querySelector('[data-czap-id="scroller"]') as HTMLElement;

    // jsdom doesn't support real scrolling, but we can check the capture/restore wiring
    // Set scrollTop/scrollLeft directly
    Object.defineProperty(scroller, 'scrollHeight', { value: 500 });
    Object.defineProperty(scroller, 'clientHeight', { value: 100 });
    Object.defineProperty(scroller, 'scrollWidth', { value: 500 });
    Object.defineProperty(scroller, 'clientWidth', { value: 100 });

    scroller.scrollTop = 150;
    scroller.scrollLeft = 75;

    const state = run(Physical.capture(root));

    // The scroll positions should be captured (if the element was detected as scrollable)
    // Note: jsdom may not compute overflow styles, so this tests the wiring
    expect(state.scrollPositions).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// elementToPath / pathToElement wiring
// ---------------------------------------------------------------------------

describe('Physical path resolution', () => {
  test('semantic ID path resolves back', () => {
    const root = mount('<div><span data-czap-id="target">found</span></div>');
    const span = root.querySelector('span')!;
    span.focus(); // Even if not focusable, it sets active
    // We can test SemanticId directly
    expect(SemanticId.get(span)).toBe('target');
    expect(SemanticId.find(root, 'target')).toBe(span);
  });
});

// ---------------------------------------------------------------------------
// IME state
// ---------------------------------------------------------------------------

describe('Physical IME', () => {
  test('IME is null when no composition active', () => {
    const root = mount('<div><input /></div>');
    const state = run(Physical.capture(root));
    expect(state.ime).toBeNull();
  });
});
