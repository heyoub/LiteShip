// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Effect } from 'effect';
import { Diagnostics } from '@czap/core';
import {
  applyIdMap,
  ATTR,
  buildIndex,
  find,
  findBestMatch as findBestSemanticMatch,
  generate,
  get,
  matchNodes,
  set,
} from '../../../packages/web/src/morph/semantic-id.js';
import {
  applyRemap,
  fromElement,
  merge,
  rejectIfMissing,
} from '../../../packages/web/src/morph/hints.js';
import {
  findBestMatch,
  isSameNode,
  morphPure,
  parseHTML,
  syncAttributes,
  syncChildren,
} from '../../../packages/web/src/morph/diff-pure.js';
import {
  captureActiveElement,
  captureFocusState,
  captureIME,
  captureSelection,
  elementToPath,
  findScrollable,
} from '../../../packages/web/src/physical/capture.js';
import {
  pathToElement,
  restore,
  restoreActiveElement,
  restoreFocusState,
  restoreIME,
  restoreScrollPositions,
  restoreSelection,
} from '../../../packages/web/src/physical/restore.js';
import { SlotRegistry } from '../../../packages/web/src/slot/registry.js';
import { captureDiagnosticsAsync } from '../../helpers/diagnostics.js';

function flushMutations(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function defineScrollBox(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperties(element, {
    scrollHeight: {
      configurable: true,
      value: scrollHeight,
    },
    clientHeight: {
      configurable: true,
      value: clientHeight,
    },
    scrollWidth: {
      configurable: true,
      value: 200,
    },
    clientWidth: {
      configurable: true,
      value: 100,
    },
  });
}

describe('web runtime primitives', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (!globalThis.CSS) {
      vi.stubGlobal('CSS', {
        escape(value: string) {
          return value.replace(/"/g, '\\"');
        },
      });
    }
  });

  afterEach(() => {
    Diagnostics.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  test('covers semantic-id helpers and prioritizes semantic matches', () => {
    const root = document.createElement('section');
    root.id = 'hero';
    set(root, 'root');

    const byClass = document.createElement('div');
    byClass.className = 'card primary';
    root.appendChild(byClass);

    const semanticChild = document.createElement('button');
    set(semanticChild, 'cta');
    semanticChild.id = 'cta-dom';
    root.appendChild(semanticChild);
    document.body.appendChild(root);

    expect(get(root)).toBe('root');
    expect(generate(root, 0)).toBe('section#hero');
    expect(generate(byClass, 2)).toBe('div.card.primary:2');
    expect(generate(document.createElement('span'), 1)).toBe('span:1');

    const index = buildIndex(root);
    expect(index.get('root')).toBe(root);
    expect(index.get('cta')).toBe(semanticChild);
    expect(find(root, 'root')).toBe(root);
    expect(find(root, 'cta')).toBe(semanticChild);
    expect(find(root, 'ghost')).toBeNull();

    const weird = document.createElement('div');
    set(weird, 'hero"][data-evil="1');
    root.appendChild(weird);
    expect(find(root, 'hero"][data-evil="1')).toBe(weird);

    applyIdMap(root, { root: 'root-next', cta: 'cta-next' });
    expect(get(root)).toBe('root-next');
    expect(get(semanticChild)).toBe('cta-next');

    const target = document.createElement('button');
    set(target, 'cta-next');

    const semanticCandidate = document.createElement('button');
    set(semanticCandidate, 'cta-next');
    semanticCandidate.id = 'wrong-dom-id';

    const domCandidate = document.createElement('button');
    domCandidate.id = 'cta-dom';

    expect(matchNodes(target, semanticCandidate)).toEqual({
      matches: true,
      priority: 'semantic',
      matchedId: 'cta-next',
    });
    expect(matchNodes(domCandidate, semanticCandidate)).toEqual({
      matches: false,
      priority: 'none',
    });

    const inputA = document.createElement('input');
    inputA.name = 'email';
    inputA.type = 'email';
    const inputB = document.createElement('input');
    inputB.name = 'email';
    inputB.type = 'email';
    expect(matchNodes(inputA, inputB)).toEqual({
      matches: true,
      priority: 'structural',
    });
    inputB.type = 'password';
    expect(matchNodes(inputA, inputB)).toEqual({
      matches: false,
      priority: 'none',
    });
    inputB.type = 'email';
    inputB.name = 'contact';
    expect(matchNodes(inputA, inputB)).toEqual({
      matches: false,
      priority: 'none',
    });

    const best = findBestSemanticMatch(target, [domCandidate, semanticCandidate]);
    expect(best?.element).toBe(semanticCandidate);
    expect(best?.result.priority).toBe('semantic');
  });

  test('covers morph hint parsing, validation, and remapping', () => {
    const element = document.createElement('div');
    element.setAttribute('data-morph-preserve-id', 'alpha, beta');
    element.setAttribute('data-morph-semantic-id', 'hero,cta');
    element.setAttribute('data-morph-preserve-focus', '#search');
    element.setAttribute('data-morph-preserve-scroll', '#panel');
    element.setAttribute('data-morph-id-map', '{"old":"new"}');

    const parsed = fromElement(element);
    expect(parsed.preserveIds).toEqual(['alpha', 'beta']);
    expect(parsed.semanticIds).toEqual(['hero', 'cta']);
    expect(parsed.preserveFocus).toEqual(['#search']);
    expect(parsed.preserveScroll).toEqual(['#panel']);
    expect(parsed.idMap?.get('old')).toBe('new');

    element.setAttribute('data-morph-id-map', '{invalid');
    expect(fromElement(element).idMap).toBeUndefined();

    const merged = merge(
      parsed,
      {
        preserve: ['sticky'],
        idMap: new Map([['legacy', 'modern']]),
        remap: { hero: 'hero-v2' },
      },
      {
        preserveIds: ['gamma'],
        preserveScroll: ['#logs'],
      },
    );

    expect(merged.preserveIds).toEqual(['alpha', 'beta', 'gamma']);
    expect(merged.preserve).toEqual(['sticky']);
    expect(merged.idMap?.get('legacy')).toBe('modern');
    expect(merged.remap).toEqual({ hero: 'hero-v2' });

    const root = document.createElement('div');
    root.innerHTML = '<div id="alpha"></div><div data-czap-id="hero"></div>';
    document.body.appendChild(root);

    expect(
      rejectIfMissing(
        {
          preserve: ['alpha', 'hero'],
        },
        root,
      ),
    ).toBeNull();

    const rejection = rejectIfMissing(
      {
        preserveIds: ['alpha', 'missing-id'],
      },
      root,
    );
    expect(rejection).toEqual({
      type: 'preserve_violation',
      missingIds: ['missing-id'],
      reason: 'Required elements missing after morph: missing-id',
    });

    const remappedState = applyRemap(
      {
        activeElementPath: '#alpha',
        focusState: {
          elementId: 'alpha',
          cursorPosition: 1,
          selectionStart: 0,
          selectionEnd: 1,
          selectionDirection: 'forward',
        },
        scrollPositions: {
          alpha: { top: 4, left: 5 },
        },
        selection: {
          elementPath: '[data-czap-id="hero"]',
          start: 0,
          end: 4,
          direction: 'forward',
        },
        ime: {
          elementPath: '[data-czap-id="hero"]',
          text: 'kana',
          start: 0,
          end: 4,
        },
      },
      {
        alpha: 'beta',
        hero: 'hero-v2',
      },
    );

    expect(remappedState.activeElementPath).toBe('#beta');
    expect(remappedState.focusState?.elementId).toBe('beta');
    expect(remappedState.scrollPositions).toEqual({
      beta: { top: 4, left: 5 },
    });
    expect(remappedState.selection?.elementPath).toContain('hero-v2');
    expect(remappedState.ime?.elementPath).toContain('hero-v2');
  });

  test('covers empty hint parsing and remap fallbacks without replacements', () => {
    const element = document.createElement('div');
    element.setAttribute('data-morph-semantic-id', 'hero');
    expect(fromElement(element)).toEqual({ semanticIds: ['hero'] });

    const merged = merge(
      { semanticIds: ['hero'] },
      { semanticIds: ['hero-next'] },
      { preserveFocus: ['#search'] },
      { preserveFocus: ['#search-next'] },
      { preserve: ['sticky'] },
      { preserve: ['panel'] },
    );

    expect(merged.semanticIds).toEqual(['hero', 'hero-next']);
    expect(merged.preserveFocus).toEqual(['#search', '#search-next']);
    expect(merged.preserve).toEqual(['sticky', 'panel']);

    const state = {
      activeElementPath: '#plain',
      focusState: {
        elementId: null as unknown as string,
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
        selectionDirection: 'none' as const,
      },
      scrollPositions: {
        plain: { top: 1, left: 2 },
      },
      selection: {
        elementPath: null as unknown as string,
        start: 0,
        end: 0,
        direction: 'none' as const,
      },
      ime: {
        elementPath: null as unknown as string,
        text: '',
        start: 0,
        end: 0,
      },
    };

    expect(applyRemap(state, {})).toBe(state);

    const remapped = applyRemap(state, { other: 'unused' });
    expect(remapped.activeElementPath).toBe('#plain');
    expect(remapped.focusState?.elementId).toBeNull();
    expect(remapped.scrollPositions).toEqual({ plain: { top: 1, left: 2 } });
    expect(remapped.selection?.elementPath).toBeNull();
    expect(remapped.ime?.elementPath).toBeNull();

    const focusedState = applyRemap(
      {
        ...state,
        focusState: {
          elementId: 'plain',
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 0,
          selectionDirection: 'none' as const,
        },
      },
      { other: 'unused' },
    );
    expect(focusedState.focusState?.elementId).toBe('plain');

    // applyRemap with a non-empty remap AND null focusState exercises the
    // ternary's else arm that passes focusState through as null.
    const nullFocus = applyRemap(
      {
        activeElementPath: null,
        focusState: null,
        scrollPositions: {},
        selection: null,
        ime: null,
      },
      { anything: 'here' },
    );
    expect(nullFocus.focusState).toBeNull();
  });

  test('covers the pure DOM diff helpers across replacement, matching, and attribute sync', () => {
    const fragment = parseHTML('  <div class="card">Hello</div>  ');
    expect(fragment.firstElementChild?.className).toBe('card');

    const oldNode = document.createElement('input');
    oldNode.id = 'card';
    oldNode.type = 'email';
    oldNode.name = 'email';
    const newNode = document.createElement('input');
    newNode.id = 'card';
    newNode.type = 'email';
    newNode.name = 'email';

    expect(isSameNode(oldNode, newNode)).toBe(true);

    set(oldNode, 'legacy');
    set(newNode, 'next');
    expect(
      isSameNode(oldNode, newNode, {
        semanticIds: ['legacy', 'next'],
      }),
    ).toBe(true);

    oldNode.id = '';
    newNode.id = '';
    newNode.type = 'password';
    expect(isSameNode(oldNode, newNode)).toBe(false);

    const current = document.createElement('input');
    current.setAttribute('data-keep', 'yes');
    current.value = 'before';
    current.checked = false;
    const incoming = document.createElement('input');
    incoming.setAttribute('data-next', 'yes');
    incoming.value = 'after';
    incoming.checked = true;

    syncAttributes(current, incoming, {
      beforeAttributeUpdate(element, name, value) {
        return !(element === current && name === 'data-keep' && value === null);
      },
    });

    expect(current.hasAttribute('data-keep')).toBe(true);
    expect(current.getAttribute('data-next')).toBe('yes');
    expect(current.value).toBe('after');
    expect(current.checked).toBe(true);

    const oldParent = document.createElement('div');
    oldParent.innerHTML = '<p data-czap-id="alpha">First</p>tail<span>drop</span>';
    const newParent = document.createElement('div');
    newParent.innerHTML = 'lead<p data-czap-id="alpha">Updated</p><p id="fresh">Fresh</p>';

    syncChildren(oldParent, newParent);

    expect(oldParent.textContent).toContain('leadUpdatedFresh');
    expect(oldParent.querySelector('[data-czap-id="alpha"]')?.textContent).toBe('Updated');
    expect(oldParent.querySelector('#fresh')).not.toBeNull();
    expect(oldParent.querySelector('span')).toBeNull();

    const best = findBestMatch(
      newParent.querySelector('#fresh')!,
      Array.from(oldParent.children),
    );
    expect(best?.id).toBe('fresh');

    const outer = document.createElement('div');
    outer.innerHTML = '<div data-czap-id="current">Old</div>';
    document.body.appendChild(outer);
    const stable = outer.firstElementChild as Element;

    morphPure(
      stable,
      '<div data-czap-id="server">New <strong>markup</strong></div>',
      { morphStyle: 'outerHTML' },
      { idMap: new Map([['server', 'current']]) },
    );

    expect(outer.querySelector(`[${ATTR}="current"]`)?.textContent).toContain('New');

    const replaceMe = document.createElement('div');
    replaceMe.id = 'replace-me';
    document.body.appendChild(replaceMe);
    morphPure(replaceMe, '<section id="next">Replaced</section>', { morphStyle: 'outerHTML' });
    expect(document.getElementById('next')?.textContent).toBe('Replaced');

    const untouched = document.createElement('div');
    untouched.id = 'untouched';
    untouched.textContent = 'keep';
    document.body.appendChild(untouched);
    morphPure(untouched, '   ', { morphStyle: 'innerHTML' });
    expect(untouched.textContent).toBe('keep');
  });

  test('covers remaining pure diff edge branches for denied writes, control syncing, and outerHTML no-ops', () => {
    const current = document.createElement('div');
    current.setAttribute('data-stable', 'keep');
    const incoming = document.createElement('div');
    incoming.setAttribute('data-stable', 'updated');
    incoming.setAttribute('data-blocked', 'nope');

    syncAttributes(current, incoming, {
      beforeAttributeUpdate(_element, name) {
        return name !== 'data-blocked';
      },
    });

    expect(current.getAttribute('data-stable')).toBe('updated');
    expect(current.hasAttribute('data-blocked')).toBe(false);

    const textareaCurrent = document.createElement('textarea');
    textareaCurrent.value = 'before';
    const textareaIncoming = document.createElement('textarea');
    textareaIncoming.value = 'after';
    syncAttributes(textareaCurrent, textareaIncoming);
    expect(textareaCurrent.value).toBe('after');

    const selectCurrent = document.createElement('select');
    selectCurrent.innerHTML = '<option value="a">A</option><option value="b">B</option>';
    selectCurrent.value = 'a';
    const selectIncoming = document.createElement('select');
    selectIncoming.innerHTML = '<option value="a">A</option><option value="b">B</option>';
    selectIncoming.value = 'b';
    syncAttributes(selectCurrent, selectIncoming);
    expect(selectCurrent.value).toBe('b');

    const textOldParent = document.createElement('div');
    textOldParent.appendChild(document.createTextNode('before'));
    const textNewParent = document.createElement('div');
    textNewParent.appendChild(document.createTextNode('after'));
    syncChildren(textOldParent, textNewParent);
    expect(textOldParent.textContent).toBe('after');

    expect(findBestMatch(document.createElement('div'), [])).toBeNull();

    const structuralCandidate = document.createElement('section');
    const structuralTarget = document.createElement('section');
    expect(findBestMatch(structuralTarget, [structuralCandidate])).toBe(structuralCandidate);

    const outer = document.createElement('div');
    outer.id = 'outer-stable';
    outer.textContent = 'keep me';
    document.body.appendChild(outer);
    morphPure(outer, '<span>first</span><span>second</span>', { morphStyle: 'outerHTML' });
    expect(document.getElementById('outer-stable')?.textContent).toBe('keep me');
  });

  test('covers additional pure diff branches for unmatched semantic ids, comment nodes, and outerHTML text payloads', () => {
    const semanticTarget = document.createElement('div');
    set(semanticTarget, 'hero');
    const semanticMiss = document.createElement('div');
    set(semanticMiss, 'other');
    const idFallback = document.createElement('div');
    idFallback.id = 'hero-dom';
    semanticTarget.id = 'hero-dom';

    expect(
      isSameNode(semanticTarget, semanticMiss, {
        semanticIds: ['hero'],
      }),
    ).toBe(true);
    expect(findBestMatch(semanticTarget, [semanticMiss, idFallback])?.id).toBe('hero-dom');

    const oldParent = document.createElement('div');
    oldParent.append(document.createComment('stale'), document.createElement('span'));
    const newParent = document.createElement('div');
    newParent.appendChild(document.createElement('span'));
    syncChildren(oldParent, newParent);
    expect(oldParent.childNodes).toHaveLength(1);
    expect(oldParent.firstChild?.nodeName).toBe('SPAN');

    const outer = document.createElement('div');
    outer.id = 'text-only-outer';
    outer.textContent = 'keep';
    document.body.appendChild(outer);
    morphPure(outer, 'text only', { morphStyle: 'outerHTML' });
    expect(document.getElementById('text-only-outer')?.textContent).toBe('keep');
  });

  test('covers diff fallbacks for stale references, semantic misses, and mixed outerHTML payloads', () => {
    const sameTextarea = document.createElement('textarea');
    sameTextarea.value = 'same';
    const equalTextarea = document.createElement('textarea');
    equalTextarea.value = 'same';
    syncAttributes(sameTextarea, equalTextarea);
    expect(sameTextarea.value).toBe('same');

    const sameSelect = document.createElement('select');
    sameSelect.innerHTML = '<option value="a">A</option><option value="b">B</option>';
    sameSelect.value = 'b';
    const equalSelect = document.createElement('select');
    equalSelect.innerHTML = '<option value="a">A</option><option value="b">B</option>';
    equalSelect.value = 'b';
    syncAttributes(sameSelect, equalSelect);
    expect(sameSelect.value).toBe('b');

    const semanticTarget = document.createElement('div');
    set(semanticTarget, 'match-me');
    const semanticMiss = document.createElement('div');
    set(semanticMiss, 'other');
    const semanticHit = document.createElement('div');
    set(semanticHit, 'match-me');
    expect(findBestMatch(semanticTarget, [semanticMiss, semanticHit])).toBe(semanticHit);

    const oldParent = document.createElement('div');
    const staleComment = document.createComment('stale');
    const existing = document.createElement('span');
    existing.setAttribute('data-czap-id', 'stable');
    oldParent.append(staleComment, existing);

    const newParent = document.createElement('div');
    newParent.innerHTML = '<span data-czap-id="stable">moved</span><!--ignored--><em>fresh</em>';

    staleComment.remove();
    syncChildren(oldParent, newParent);

    expect(oldParent.querySelector('span')?.textContent).toBe('moved');
    expect(oldParent.querySelector('em')?.textContent).toBe('fresh');

    const outer = document.createElement('div');
    outer.id = 'mixed-outer';
    outer.textContent = 'keep';
    document.body.appendChild(outer);
    morphPure(outer, 'lead<span data-czap-id="server">body</span>', { morphStyle: 'outerHTML' }, {
      idMap: new Map([['server', 'client']]),
    });
    expect(document.getElementById('mixed-outer')?.textContent).toBe('keep');
  });

  test('covers physical state capture helpers for focus, selection, scroll, and IME', () => {
    const root = document.createElement('div');
    const scrollBox = document.createElement('div');
    scrollBox.id = 'scrollable';
    scrollBox.style.overflowY = 'auto';
    scrollBox.style.overflowX = 'auto';
    defineScrollBox(scrollBox, 300, 100);
    scrollBox.scrollTop = 24;
    scrollBox.scrollLeft = 6;

    const input = document.createElement('input');
    input.id = 'search';
    input.value = 'abcdef';

    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.textContent = 'editable text';

    root.append(scrollBox, input, editor);
    document.body.appendChild(root);

    expect(captureActiveElement()).toBeNull();

    input.focus();
    input.setSelectionRange(1, 4, 'forward');
    expect(captureActiveElement()).toBe('#search');
    expect(captureFocusState()).toEqual({
      elementId: '#search',
      cursorPosition: 4,
      selectionStart: 1,
      selectionEnd: 4,
      selectionDirection: 'forward',
    });

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'kana' }));
    expect(captureIME()).toEqual({
      elementPath: '#search',
      text: 'kana',
      start: 1,
      end: 4,
    });
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(captureIME()).toBeNull();

    const selection = window.getSelection();
    const textNode = editor.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 8);
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(captureSelection()).toEqual({
      elementPath: 'div:nth-child(1) > div:nth-child(3)',
      start: 0,
      end: 8,
      direction: 'forward',
    });
    selection?.removeAllRanges();
    expect(captureSelection()).toBeNull();

    expect(elementToPath(editor)).toBe('div:nth-child(1) > div:nth-child(3)');
    expect(findScrollable(root)).toEqual([scrollBox]);
  });

  test('covers additional physical capture edge cases for collapsed selections and non-scrollable nodes', () => {
    const root = document.createElement('div');
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    editor.textContent = 'editable text';

    const sameId = document.createElement('div');
    sameId.setAttribute('data-czap-id', 'hero');
    editor.appendChild(sameId);

    const nonScrollable = document.createElement('div');
    nonScrollable.style.overflow = 'auto';
    defineScrollBox(nonScrollable, 100, 100);

    const hiddenOverflow = document.createElement('div');
    hiddenOverflow.style.overflow = 'hidden';
    defineScrollBox(hiddenOverflow, 500, 100);

    root.append(editor, nonScrollable, hiddenOverflow);
    document.body.appendChild(root);

    editor.focus();
    window.getSelection()?.removeAllRanges();
    expect(captureFocusState()).toEqual({
      elementId: 'div:nth-child(1) > div:nth-child(1)',
      cursorPosition: 0,
      selectionStart: 0,
      selectionEnd: 0,
      selectionDirection: 'none',
    });
    expect(captureSelection()).toBeNull();
    expect(elementToPath(sameId, root)).toBe(`[${ATTR}="hero"]`);
    expect(findScrollable(root)).toEqual([]);
  });

  test('covers selection direction branches and detached selection ancestors', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });

    const first = document.createTextNode('alpha');
    const second = document.createTextNode('beta');
    editor.append(first, second);
    document.body.appendChild(editor);
    editor.focus();

    const selectionSpy = vi.spyOn(window, 'getSelection');

    const backwardRange = document.createRange();
    backwardRange.setStart(first, 0);
    backwardRange.setEnd(second, 1);
    selectionSpy.mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: second,
      focusNode: first,
      anchorOffset: 1,
      focusOffset: 0,
      getRangeAt: () => backwardRange,
    } as Selection);

    expect(captureFocusState()?.selectionDirection).toBe('backward');
    expect(captureSelection()?.direction).toBe('backward');

    const forwardRange = document.createRange();
    forwardRange.setStart(first, 0);
    forwardRange.setEnd(second, 2);
    selectionSpy.mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: first,
      focusNode: second,
      anchorOffset: 0,
      focusOffset: 2,
      getRangeAt: () => forwardRange,
    } as Selection);

    expect(captureFocusState()?.selectionDirection).toBe('forward');
    expect(captureSelection()?.direction).toBe('forward');

    const orphan = document.createTextNode('orphan');
    const orphanRange = {
      commonAncestorContainer: orphan,
      startContainer: orphan,
      startOffset: 0,
      endContainer: orphan,
      endOffset: 1,
    } as Range;
    selectionSpy.mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: null,
      focusNode: null,
      anchorOffset: 0,
      focusOffset: 0,
      getRangeAt: () => orphanRange,
    } as Selection);

    expect(captureSelection()).toBeNull();

    selectionSpy.mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: first,
      focusNode: first,
      anchorOffset: 1,
      focusOffset: 1,
      getRangeAt: () => forwardRange,
    } as Selection);

    expect(captureFocusState()?.selectionDirection).toBe('none');

    const collapsedRange = document.createRange();
    collapsedRange.setStart(first, 2);
    collapsedRange.setEnd(first, 2);
    selectionSpy.mockReturnValue({
      rangeCount: 1,
      isCollapsed: true,
      anchorNode: first,
      focusNode: first,
      anchorOffset: 2,
      focusOffset: 2,
      getRangeAt: () => collapsedRange,
    } as Selection);

    expect(captureFocusState()?.selectionDirection).toBe('none');

    selectionSpy.mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: {
        compareDocumentPosition() {
          return Node.DOCUMENT_POSITION_CONTAINED_BY;
        },
      } as unknown as Node,
      focusNode: first,
      anchorOffset: 0,
      focusOffset: 0,
      getRangeAt: () => forwardRange,
    } as Selection);

    expect(captureSelection()?.direction).toBe('none');
  });

  test('covers physical restore helpers, including remapping and invalid selectors', async () => {
    const root = document.createElement('div');
    const scrollBox = document.createElement('div');
    scrollBox.setAttribute('data-czap-id', 'panel');
    scrollBox.style.overflow = 'auto';
    defineScrollBox(scrollBox, 400, 120);

    const input = document.createElement('input');
    input.setAttribute('data-czap-id', 'focus-next');
    input.value = 'abcdef';

    const textarea = document.createElement('textarea');
    textarea.id = 'notes';
    textarea.value = 'multiline';

    root.append(scrollBox, input, textarea);
    document.body.appendChild(root);

    await Effect.runPromise(restoreActiveElement(null));
    await Effect.runPromise(restoreActiveElement('['));
    expect(pathToElement('[')).toBeNull();

    await Effect.runPromise(
      restoreFocusState({
        elementId: 'focus-next',
        cursorPosition: 0,
        selectionStart: 2,
        selectionEnd: 5,
        selectionDirection: 'backward',
      }),
    );
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(5);

    const editor = document.createElement('div');
    editor.setAttribute('data-czap-id', 'editor');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    editor.textContent = 'editable text';
    root.appendChild(editor);

    await Effect.runPromise(
      restoreFocusState({
        elementId: 'editor',
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 8,
        selectionDirection: 'forward',
      }),
    );
    expect(document.activeElement).toBe(editor);
    expect(window.getSelection()?.toString()).toBe('editable');

    await Effect.runPromise(
      restoreSelection({
        elementPath: '#notes',
        start: 1,
        end: 4,
        direction: 'forward',
      }),
    );
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(4);

    await Effect.runPromise(
      restoreSelection({
        elementPath: '[data-czap-id="editor"]',
        start: 9,
        end: 13,
        direction: 'forward',
      }),
    );
    expect(window.getSelection()?.toString()).toBe('text');

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = 'color-input';
    const throwingSelection = vi.spyOn(colorInput, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('unsupported', 'InvalidStateError');
    });
    root.appendChild(colorInput);

    await Effect.runPromise(
      restoreFocusState({
        elementId: '#color-input',
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 1,
        selectionDirection: 'forward',
      }),
    );
    await Effect.runPromise(
      restoreSelection({
        elementPath: '#color-input',
        start: 0,
        end: 1,
        direction: 'forward',
      }),
    );
    expect(throwingSelection).toHaveBeenCalled();

    await Effect.runPromise(
      restoreScrollPositions(
        {
          '[data-czap-id="panel"]': { top: 90, left: 12 },
          '[': { top: 1, left: 1 },
        },
        root,
      ),
    );
    expect(scrollBox.scrollTop).toBe(90);
    expect(scrollBox.scrollLeft).toBe(12);

    root.style.overflow = 'auto';
    root.tabIndex = 0;
    defineScrollBox(root, 520, 120);
    const rootPath = elementToPath(root);

    await Effect.runPromise(restoreActiveElement(rootPath, root));
    expect(document.activeElement).toBe(root);

    await Effect.runPromise(
      restoreScrollPositions(
        {
          [rootPath]: { top: 33, left: 7 },
        },
        root,
      ),
    );
    expect(pathToElement(rootPath, root)).toBe(root);
    expect(root.scrollTop).toBe(33);
    expect(root.scrollLeft).toBe(7);

    await Effect.runPromise(restoreIME({ elementPath: '[data-czap-id="focus-next"]', text: 'kana', start: 0, end: 2 }));
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(2);

    await Effect.runPromise(restoreIME({ elementPath: '[data-czap-id="editor"]', text: 'kana', start: 0, end: 2 }));
    expect(document.activeElement).toBe(input);

    const remappedRoot = document.createElement('div');
    const remappedInput = document.createElement('input');
    remappedInput.setAttribute('data-czap-id', 'focus-final');
    remappedRoot.appendChild(remappedInput);
    document.body.appendChild(remappedRoot);

    await Effect.runPromise(
      restore(
        {
          activeElementPath: `[${ATTR}="focus-old"]`,
          focusState: {
            elementId: 'focus-old',
            cursorPosition: 0,
            selectionStart: 1,
            selectionEnd: 3,
            selectionDirection: 'forward',
          },
          scrollPositions: {},
          selection: {
            elementPath: `[${ATTR}="focus-old"]`,
            start: 0,
            end: 2,
            direction: 'forward',
          },
          ime: {
            elementPath: `[${ATTR}="focus-old"]`,
            text: 'ka',
            start: 0,
            end: 2,
          },
        },
        remappedRoot,
        { 'focus-old': 'focus-final' },
      ),
    );
    expect(document.activeElement).toBe(remappedInput);
    expect(remappedInput.selectionStart).toBeGreaterThanOrEqual(0);
  });

  test('covers additional physical restore edge cases for disabled, non-focusable, and short text targets', async () => {
    const root = document.createElement('div');
    const disabledInput = document.createElement('input');
    disabledInput.disabled = true;
    disabledInput.setAttribute('data-czap-id', 'disabled');

    const plainDiv = document.createElement('div');
    plainDiv.setAttribute('data-czap-id', 'plain');
    plainDiv.textContent = 'plain';

    const editor = document.createElement('div');
    editor.setAttribute('data-czap-id', 'editor-2');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    editor.textContent = 'short';

    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-czap-id', 'notes-2');
    textarea.value = 'textarea value';

    root.append(disabledInput, plainDiv, editor, textarea);
    document.body.appendChild(root);

    await Effect.runPromise(restoreActiveElement('[data-czap-id="disabled"]', root));
    expect(document.activeElement).not.toBe(disabledInput);

    await Effect.runPromise(
      restoreFocusState(
        {
          elementId: 'plain',
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 1,
          selectionDirection: 'forward',
        },
        root,
      ),
    );
    expect(document.activeElement).not.toBe(plainDiv);

    await Effect.runPromise(
      restoreFocusState(
        {
          elementId: 'editor-2',
          cursorPosition: 0,
          selectionStart: 20,
          selectionEnd: 25,
          selectionDirection: 'forward',
        },
        root,
      ),
    );
    expect(document.activeElement).toBe(editor);
    expect(window.getSelection()?.rangeCount ?? 0).toBeGreaterThanOrEqual(0);

    await Effect.runPromise(
      restoreSelection({
        elementPath: '[data-czap-id="editor-2"]',
        start: 20,
        end: 25,
        direction: 'forward',
      }),
    );
    expect(window.getSelection()?.toString() ?? '').toBe('');

    await Effect.runPromise(restoreSelection({ elementPath: '[', start: 0, end: 1, direction: 'forward' }));

    await Effect.runPromise(restoreIME({ elementPath: '[data-czap-id="notes-2"]', text: 'kana', start: 2, end: 5 }));
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(5);
  });

  test('surfaces unexpected physical restore failures through diagnostics instead of swallowing them', async () => {
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    const root = document.createElement('div');
    const input = document.createElement('input');
    input.id = 'explode-input';
    input.value = 'abcdef';

    const editor = document.createElement('div');
    editor.setAttribute('data-czap-id', 'explode-editor');
    editor.textContent = 'editable text';
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });

    root.append(input, editor);
    document.body.appendChild(root);

    vi.spyOn(input, 'setSelectionRange').mockImplementation(() => {
      throw new TypeError('selection boom');
    });

    await expect(
      Effect.runPromise(
        restoreFocusState({
          elementId: '#explode-input',
          cursorPosition: 0,
          selectionStart: 1,
          selectionEnd: 3,
          selectionDirection: 'forward',
        }),
      ),
    ).rejects.toThrow('selection boom');

    await expect(
      Effect.runPromise(
        restoreSelection({
          elementPath: '#explode-input',
          start: 1,
          end: 3,
          direction: 'forward',
        }),
      ),
    ).rejects.toThrow('selection boom');

    vi.spyOn(document, 'createRange').mockReturnValue({
      setStart() {
        throw new TypeError('range boom');
      },
      setEnd() {},
    } as unknown as Range);

    await expect(
      Effect.runPromise(
        restoreSelection({
          elementPath: '[data-czap-id="explode-editor"]',
          start: 0,
          end: 4,
          direction: 'forward',
        }),
      ),
    ).rejects.toThrow('range boom');

    await expect(
      Effect.runPromise(
        restoreIME({
          elementPath: '#explode-input',
          text: 'kana',
          start: 0,
          end: 2,
        }),
      ),
    ).rejects.toThrow('selection boom');

    expect(() =>
      pathToElement('#explode-input', {
        querySelector() {
          throw new TypeError('selector boom');
        },
      } as unknown as Element),
    ).toThrow('selector boom');

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'restore-focus-selection-failed' }),
        expect.objectContaining({ code: 'restore-selection-range-failed' }),
        expect.objectContaining({ code: 'restore-range-failed' }),
        expect.objectContaining({ code: 'restore-ime-selection-failed' }),
        expect.objectContaining({ code: 'restore-path-query-failed' }),
      ]),
    );
  });

  test('treats unsupported DOM range and missing IME targets as best-effort noops', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('data-czap-id', 'range-editor');
    editor.textContent = 'hello';
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    document.body.appendChild(editor);

    vi.spyOn(document, 'createRange').mockReturnValue({
      setStart() {
        throw new DOMException('unsupported', 'IndexSizeError');
      },
      setEnd() {},
    } as unknown as Range);

    await expect(
      Effect.runPromise(
        restoreSelection({
          elementPath: '[data-czap-id="range-editor"]',
          start: 0,
          end: 2,
          direction: 'forward',
        }),
      ),
    ).resolves.toBeUndefined();

    await expect(
      Effect.runPromise(
        restoreIME({
          elementPath: '#missing-ime-target',
          text: 'kana',
          start: 0,
          end: 2,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  test('covers additional restore best-effort branches for tabindex focus, empty ranges, and unsupported DOM exceptions', async () => {
    const generic = document.createElement('div');
    generic.setAttribute('data-czap-id', 'tabbable');
    generic.tabIndex = 0;
    document.body.appendChild(generic);

    await Effect.runPromise(
      restoreFocusState({
        elementId: 'tabbable',
        cursorPosition: 0,
      }),
    );
    expect(document.activeElement).toBe(generic);

    const emptyEditor = document.createElement('div');
    emptyEditor.setAttribute('data-czap-id', 'empty-editor');
    emptyEditor.textContent = '';
    emptyEditor.contentEditable = 'true';
    emptyEditor.setAttribute('contenteditable', 'true');
    Object.defineProperty(emptyEditor, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    document.body.appendChild(emptyEditor);

    await expect(
      Effect.runPromise(
        restoreSelection({
          elementPath: '[data-czap-id="empty-editor"]',
          start: 0,
          end: 1,
          direction: 'forward',
        }),
      ),
    ).resolves.toBeUndefined();

    const textInput = document.createElement('input');
    textInput.id = 'invalid-access';
    document.body.appendChild(textInput);
    vi.spyOn(textInput, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('unsupported', 'InvalidAccessError');
    });

    await expect(
      Effect.runPromise(
        restoreFocusState({
          elementId: '#invalid-access',
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 1,
          selectionDirection: 'forward',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  test('covers restore no-op branches for non-focusable targets, missing selections, and inert IME restores', async () => {
    const root = document.createElement('div');
    const plain = document.createElement('div');
    plain.id = 'plain';
    plain.textContent = 'plain';

    const editor = document.createElement('div');
    editor.setAttribute('data-czap-id', 'editor-null-selection');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    editor.textContent = 'editable text';

    const textarea = document.createElement('textarea');
    textarea.id = 'notes-null-selection';
    textarea.value = 'hello';

    root.append(plain, editor, textarea);
    document.body.appendChild(root);

    await Effect.runPromise(restoreActiveElement('#plain', root));
    expect(document.activeElement).not.toBe(plain);

    await Effect.runPromise(
      restoreFocusState(
        {
          elementId: '#notes-null-selection',
          cursorPosition: 0,
          selectionDirection: 'none',
        } as never,
        root,
      ),
    );
    expect(document.activeElement).toBe(textarea);

    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(null);

    await Effect.runPromise(
      restoreFocusState(
        {
          elementId: 'editor-null-selection',
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 4,
          selectionDirection: 'forward',
        },
        root,
      ),
    );
    expect(document.activeElement).toBe(editor);

    await Effect.runPromise(
      restoreSelection({
        elementPath: '[data-czap-id="editor-null-selection"]',
        start: 0,
        end: 4,
        direction: 'forward',
      }),
    );

    await Effect.runPromise(restoreIME(null));
    expect(getSelectionSpy).toHaveBeenCalled();
  });

  test('covers restore remap fallbacks and diff-pure matching branches with detached references', async () => {
    const root = document.createElement('div');
    const scroller = document.createElement('div');
    scroller.id = 'scroll-next';
    const focusTarget = document.createElement('input');
    focusTarget.setAttribute('data-czap-id', 'focus-next');
    focusTarget.value = 'abcdef';
    root.append(scroller, focusTarget);
    document.body.appendChild(root);

    await Effect.runPromise(
      restore(
        {
          activeElementPath: `[${ATTR}="focus-old"]`,
          focusState: null,
          scrollPositions: {
            '#scroll-old': { top: 7, left: 3 },
          },
          selection: null,
          ime: null,
        },
        root,
        { '#scroll-old': '#scroll-next', 'focus-old': 'focus-next' },
      ),
    );

    expect(document.activeElement).toBe(focusTarget);
    expect(scroller.scrollTop).toBe(7);
    expect(scroller.scrollLeft).toBe(3);

    const oldParent = document.createElement('div');
    oldParent.innerHTML = '<div data-czap-id="hero-old"></div><p id="remove-me">stale</p>';
    const newParent = document.createElement('div');
    newParent.innerHTML = '<div data-czap-id="hero-new"></div><span class="fresh">hello</span>';
    syncChildren(oldParent, newParent, {
      semanticIds: ['hero-old', 'hero-new'],
    });

    expect(oldParent.querySelector('.fresh')?.textContent).toBe('hello');
    expect(oldParent.querySelector('#remove-me')).toBeNull();

    const outer = document.createElement('input');
    outer.id = 'same-node';
    outer.value = 'old';
    document.body.appendChild(outer);

    morphPure(outer, '<input id="same-node" value="next" />', { morphStyle: 'outerHTML' });
    expect((document.getElementById('same-node') as HTMLInputElement | null)?.value).toBe('next');

    const inner = document.createElement('div');
    inner.innerHTML = '<span class="before">before</span>';
    morphPure(inner, '<span class="after">after</span>', { morphStyle: 'innerHTML' });
    expect(inner.querySelector('.after')?.textContent).toBe('after');
  });

  test('covers slot registry registration, prefix queries, and observation edge cases', async () => {
    await captureDiagnosticsAsync(async ({ events }) => {
      const registry = SlotRegistry.create();
      document.documentElement.setAttribute('data-czap-slot', '/root-shell');
      const root = document.createElement('section');
      root.innerHTML = `
        <div data-czap-slot="/hero"></div>
        <div data-czap-slot="/hero/body" data-mode="replace"></div>
        <div data-czap-slot="invalid"></div>
        <div data-czap-slot=""></div>
      `;
      document.body.appendChild(root);

      SlotRegistry.scanDOM(registry, root);
      expect(registry.has('/hero' as never)).toBe(true);
      expect(registry.findByPrefix('/hero' as never)).toHaveLength(2);
      expect(registry.entries().size).toBe(2);

      registry.register({
        path: '/hero' as never,
        element: root.querySelector('[data-czap-slot="/hero"]')!,
        mode: 'partial',
        mounted: true,
      });
      expect(registry.entries().size).toBe(2);

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* SlotRegistry.observe(registry, root);

            const nested = document.createElement('div');
            nested.appendChild(document.createTextNode('ignored'));
            nested.innerHTML += '<div data-czap-slot="relative-footer"></div><div data-czap-slot="/hero/footer"></div>';
            root.appendChild(nested);
            root.appendChild(document.createTextNode('still-ignored'));
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/footer' as never)).toBe(true);

            const attrNode = nested.lastElementChild as Element;
            attrNode.setAttribute('data-czap-slot', '/hero/footer-next');
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/footer' as never)).toBe(false);
            expect(registry.has('/hero/footer-next' as never)).toBe(true);

            attrNode.setAttribute('data-czap-slot', 'relative-footer');
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/footer-next' as never)).toBe(false);
            expect(SlotRegistry.getPath(attrNode)).toBeNull();

            attrNode.setAttribute('data-czap-slot', '/hero/footer-return');
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/footer-return' as never)).toBe(true);

            // Add a node that is ITSELF a slot (not just containing slot descendants)
            // so the observer hits the added-node branch that registers it directly.
            const directSlot = document.createElement('div');
            directSlot.setAttribute('data-czap-slot', '/hero/direct');
            root.appendChild(directSlot);
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/direct' as never)).toBe(true);

            // Remove that same slot node directly so the removed-node branch
            // unregisters it before walking its descendants.
            directSlot.remove();
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/direct' as never)).toBe(false);

            nested.remove();
            root.lastChild?.remove();
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/footer-return' as never)).toBe(false);
          }),
        ),
      );

      registry.unregister('/missing' as never);
      expect(SlotRegistry.findElement('/root-shell' as never)).toBe(document.documentElement);
      expect(SlotRegistry.findElement('/hero' as never)).toBe(root.querySelector('[data-czap-slot="/hero"]'));
      expect(SlotRegistry.getPath(root.querySelector('[data-czap-slot="/hero"]')!)).toBe('/hero');
      expect(SlotRegistry.findElement('/missing' as never)).toBeNull();
      expect(registry.findByPrefix('/missing' as never)).toEqual([]);

      const tricky = document.createElement('div');
      tricky.setAttribute('data-czap-slot', '/hero/"][data-evil="1');
      document.body.appendChild(tricky);
      expect(SlotRegistry.findElement('/hero' as never)).toBe(root.querySelector('[data-czap-slot="/hero"]'));
      tricky.remove();

      const attrOnly = document.createElement('div');
      root.appendChild(attrOnly);
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* SlotRegistry.observe(registry, root);
            attrOnly.setAttribute('data-czap-slot', '/hero/attr-only');
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/attr-only' as never)).toBe(true);

            attrOnly.setAttribute('data-czap-slot', 'invalid');
            yield* Effect.promise(flushMutations);
            expect(registry.has('/hero/attr-only' as never)).toBe(false);
          }),
        ),
      );

      expect(events.filter((event) => event.code === 'invalid-slot-path')).toHaveLength(1);
      document.documentElement.removeAttribute('data-czap-slot');
    });
  });
});
