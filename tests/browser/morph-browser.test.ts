import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Effect } from 'effect';
import { Morph } from '../../packages/web/src/morph/diff.js';
import {
  isSameNode,
  syncAttributes,
  syncChildren,
  findBestMatch,
  parseHTML,
  morphPure,
} from '../../packages/web/src/morph/diff-pure.js';
import * as SemanticIdModule from '../../packages/web/src/morph/semantic-id.js';

describe('browser morph with real DOM', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('section');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('morph innerHTML replaces children while preserving parent element identity', async () => {
    root.innerHTML = '<p>old text</p><span>remove me</span>';
    const originalRoot = root;

    await Effect.runPromise(
      Morph.morph(root, '<p>new text</p><div>added</div>'),
    );

    expect(root).toBe(originalRoot);
    expect(root.querySelector('p')?.textContent).toBe('new text');
    expect(root.querySelector('span')).toBeNull();
    expect(root.querySelector('div')?.textContent).toBe('added');
  });

  test('morph outerHTML replaces entire element when tags differ', async () => {
    const child = document.createElement('div');
    child.id = 'target';
    child.textContent = 'old';
    root.appendChild(child);

    await Effect.runPromise(
      Morph.morph(child, '<div id="target">replaced</div>', { morphStyle: 'outerHTML' }),
    );

    const updated = root.querySelector('#target');
    expect(updated?.textContent).toBe('replaced');
  });

  test('syncAttributes updates, adds, and removes real DOM attributes', () => {
    const oldEl = document.createElement('div');
    oldEl.setAttribute('class', 'old-class');
    oldEl.setAttribute('data-remove', 'yes');
    oldEl.setAttribute('id', 'keep');

    const newEl = document.createElement('div');
    newEl.setAttribute('class', 'new-class');
    newEl.setAttribute('id', 'keep');
    newEl.setAttribute('aria-label', 'added');

    syncAttributes(oldEl, newEl);

    expect(oldEl.getAttribute('class')).toBe('new-class');
    expect(oldEl.getAttribute('id')).toBe('keep');
    expect(oldEl.getAttribute('aria-label')).toBe('added');
    expect(oldEl.hasAttribute('data-remove')).toBe(false);
  });

  test('syncAttributes syncs input value, checked, and textarea value', () => {
    const oldInput = document.createElement('input');
    oldInput.type = 'text';
    oldInput.value = 'old';

    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.value = 'new';

    syncAttributes(oldInput, newInput);
    expect(oldInput.value).toBe('new');

    const oldCheckbox = document.createElement('input');
    oldCheckbox.type = 'checkbox';
    oldCheckbox.checked = false;

    const newCheckbox = document.createElement('input');
    newCheckbox.type = 'checkbox';
    newCheckbox.checked = true;

    syncAttributes(oldCheckbox, newCheckbox);
    expect(oldCheckbox.checked).toBe(true);

    const oldTextarea = document.createElement('textarea');
    oldTextarea.value = 'old content';
    const newTextarea = document.createElement('textarea');
    newTextarea.value = 'new content';

    syncAttributes(oldTextarea, newTextarea);
    expect(oldTextarea.value).toBe('new content');
  });

  test('isSameNode matches by semantic ID (data-czap-id)', () => {
    const a = document.createElement('div');
    a.setAttribute('data-czap-id', 'alpha');
    const b = document.createElement('div');
    b.setAttribute('data-czap-id', 'alpha');
    const c = document.createElement('span');
    c.setAttribute('data-czap-id', 'beta');

    // Same semantic ID → match
    expect(isSameNode(a, b)).toBe(true);
    // Different tag + different ID → no match
    expect(isSameNode(a, c)).toBe(false);
  });

  test('isSameNode matches by DOM id when no semantic ID', () => {
    const a = document.createElement('button');
    a.id = 'submit';
    const b = document.createElement('button');
    b.id = 'submit';

    expect(isSameNode(a, b)).toBe(true);
  });

  test('isSameNode matches INPUT elements by type and name', () => {
    const a = document.createElement('input');
    a.type = 'email';
    a.name = 'user-email';
    const b = document.createElement('input');
    b.type = 'email';
    b.name = 'user-email';
    const c = document.createElement('input');
    c.type = 'password';
    c.name = 'user-email';

    expect(isSameNode(a, b)).toBe(true);
    expect(isSameNode(a, c)).toBe(false);
  });

  test('syncChildren updates content while preserving child count', () => {
    root.innerHTML = `
      <div data-czap-id="a">A</div>
      <div data-czap-id="b">B</div>
      <div data-czap-id="c">C</div>
    `;

    const newParent = document.createElement('section');
    newParent.innerHTML = `
      <div data-czap-id="a">A updated</div>
      <div data-czap-id="b">B updated</div>
      <div data-czap-id="c">C updated</div>
    `;

    syncChildren(root, newParent);

    const children = Array.from(root.children);
    expect(children).toHaveLength(3);
    expect(children[0]?.textContent).toBe('A updated');
    expect(children[1]?.textContent).toBe('B updated');
    expect(children[2]?.textContent).toBe('C updated');
  });

  test('syncChildren removes elements not in the new tree', () => {
    root.innerHTML = '<p>keep</p><span>remove</span><div>also remove</div>';
    const keepEl = root.querySelector('p')!;

    const newParent = document.createElement('section');
    newParent.innerHTML = '<p>keep updated</p>';

    syncChildren(root, newParent);

    expect(root.children).toHaveLength(1);
    expect(root.querySelector('p')).toBe(keepEl);
    expect(keepEl.textContent).toBe('keep updated');
    expect(root.querySelector('span')).toBeNull();
  });

  test('findBestMatch prefers semantic ID over DOM id over tag match', () => {
    const target = document.createElement('div');
    target.setAttribute('data-czap-id', 'target');
    target.id = 'my-div';

    const semanticMatch = document.createElement('div');
    semanticMatch.setAttribute('data-czap-id', 'target');

    const idMatch = document.createElement('div');
    idMatch.id = 'my-div';

    const tagMatch = document.createElement('div');

    // Semantic match should win
    const result = findBestMatch(target, [tagMatch, idMatch, semanticMatch]);
    expect(result).toBe(semanticMatch);
  });

  test('morphWithState preserves element identity across semantic-id-based morph', async () => {
    root.innerHTML = `
      <button data-czap-id="btn-1" id="btn1">Click</button>
      <button data-czap-id="btn-2" id="btn2">Submit</button>
    `;

    const btn1 = root.querySelector('#btn1')!;
    const btn2 = root.querySelector('#btn2')!;

    const result = await Effect.runPromise(
      Morph.morphWithState(root, `
        <button data-czap-id="btn-2" id="btn2">Submit Updated</button>
        <button data-czap-id="btn-1" id="btn1">Click Updated</button>
      `, { morphStyle: 'innerHTML' }),
    );

    expect(result.type).toBe('success');
    expect(root.querySelector('#btn1')).toBe(btn1);
    expect(root.querySelector('#btn2')).toBe(btn2);
    expect(btn1.textContent).toBe('Click Updated');
    expect(btn2.textContent).toBe('Submit Updated');
  });

  test('morphWithState with remap updates data-czap-id attributes', async () => {
    root.innerHTML = '<div data-czap-id="old-id">content</div>';
    const el = root.querySelector('[data-czap-id="old-id"]')!;

    const result = await Effect.runPromise(
      Morph.morphWithState(
        root,
        '<div data-czap-id="new-id">updated content</div>',
        { morphStyle: 'innerHTML' },
        { remap: { 'old-id': 'new-id' } },
      ),
    );

    expect(result.type).toBe('success');
    expect(el.getAttribute('data-czap-id')).toBe('new-id');
    expect(el.textContent).toBe('updated content');
  });

  test('morphWithState returns rejection when preserve constraint is violated', async () => {
    root.innerHTML = '<div data-czap-id="required">must keep</div>';

    const rejections: unknown[] = [];
    root.addEventListener('czap:morph-rejected', ((e: CustomEvent) => {
      rejections.push(e.detail);
    }) as EventListener);

    const result = await Effect.runPromise(
      Morph.morphWithState(
        root,
        '<div data-czap-id="other">different</div>',
        { morphStyle: 'innerHTML' },
        { preserve: ['required'] },
      ),
    );

    expect(result.type).toBe('rejected');
    expect(rejections).toHaveLength(1);
    expect((rejections[0] as { missingIds: string[] }).missingIds).toContain('required');
  });

  test('parseHTML creates a DocumentFragment with real DOM nodes', () => {
    const fragment = parseHTML('<div class="test"><span>inner</span></div>');
    expect(fragment).toBeInstanceOf(DocumentFragment);
    expect(fragment.childNodes).toHaveLength(1);
    const div = fragment.firstElementChild as HTMLDivElement;
    expect(div.tagName).toBe('DIV');
    expect(div.className).toBe('test');
    expect(div.querySelector('span')?.textContent).toBe('inner');
  });

  test('morphPure applies innerHTML morph without Effect runtime', () => {
    root.innerHTML = '<p>before</p>';
    morphPure(root, '<p>after</p><span>new</span>');

    expect(root.querySelector('p')?.textContent).toBe('after');
    expect(root.querySelector('span')?.textContent).toBe('new');
  });

  test('SemanticId.buildIndex walks the DOM tree and indexes all data-czap-id elements', () => {
    root.innerHTML = `
      <div data-czap-id="parent">
        <span data-czap-id="child-1">one</span>
        <span data-czap-id="child-2">two</span>
        <div>
          <em data-czap-id="deep">deep</em>
        </div>
      </div>
    `;

    const index = SemanticIdModule.buildIndex(root);
    expect(index.has('parent')).toBe(true);
    expect(index.has('child-1')).toBe(true);
    expect(index.has('child-2')).toBe(true);
    expect(index.has('deep')).toBe(true);
    expect(index.get('deep')?.tagName).toBe('EM');
  });
});
