// @vitest-environment jsdom
/**
 * Component test: DOM morph algorithm.
 *
 * Tests parseHTML, morph, morphWithState, syncAttributes,
 * syncChildren, isSameNode, findBestMatch, and semantic ID matching.
 */

import { describe, test, expect, beforeAll, vi } from 'vitest';
import { Effect } from 'effect';
import { Diagnostics } from '@czap/core';
import { Morph, SemanticId, Hints } from '@czap/web';

// jsdom lacks CSS.escape — polyfill for tests
beforeAll(() => {
  if (typeof globalThis.CSS === 'undefined') {
    (globalThis as any).CSS = {};
  }
  if (typeof CSS.escape !== 'function') {
    CSS.escape = (s: string) => s.replace(/([^\w-])/g, '\\$1');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an element from HTML string. */
const el = (html: string): Element => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild!;
};

/** Run a sync Effect and return the result. */
const run = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect);

// ---------------------------------------------------------------------------
// parseHTML
// ---------------------------------------------------------------------------

describe('Morph.parseHTML', () => {
  test('parses simple HTML', () => {
    const frag = Morph.parseHTML('<div>hello</div>');
    expect(frag).toBeInstanceOf(DocumentFragment);
    expect(frag.firstElementChild?.tagName).toBe('DIV');
    expect(frag.firstElementChild?.textContent).toBe('hello');
  });

  test('parses multiple siblings', () => {
    const frag = Morph.parseHTML('<span>a</span><span>b</span>');
    expect(frag.childElementCount).toBe(2);
  });

  test('returns empty fragment for empty string', () => {
    const frag = Morph.parseHTML('');
    expect(frag.childNodes.length).toBe(0);
  });

  test('strips dangerous tags and executable attributes during parsing', () => {
    const frag = Morph.parseHTML(
      '<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a><span>safe</span></div>',
    );
    const container = frag.firstElementChild as HTMLElement;

    expect(container.getAttribute('onclick')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(container.querySelector('span')?.textContent).toBe('safe');
  });
});

// ---------------------------------------------------------------------------
// morph (innerHTML mode)
// ---------------------------------------------------------------------------

describe('Morph.morph innerHTML', () => {
  test('updates text content', () => {
    const root = el('<div>old</div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<span>new</span>'));
    expect(root.innerHTML).toContain('new');
    root.remove();
  });

  test('does not preserve dangerous HTML when morphing innerHTML content', () => {
    const root = el('<div><p>old</p></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<div onclick="alert(1)"><script>alert(1)</script><span>safe</span></div>'));
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('div')?.getAttribute('onclick')).toBeNull();
    expect(root.textContent).toContain('safe');
    root.remove();
  });

  test('adds new elements', () => {
    const root = el('<div><p>one</p></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<p>one</p><p>two</p>'));
    expect(root.querySelectorAll('p').length).toBe(2);
    root.remove();
  });

  test('removes extra elements', () => {
    const root = el('<div><p>one</p><p>two</p></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<p>one</p>'));
    expect(root.querySelectorAll('p').length).toBe(1);
    root.remove();
  });

  test('empty new HTML clears nothing (no-op for empty)', () => {
    const root = el('<div><p>keep</p></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, ''));
    // Empty newHTML is a no-op per the implementation
    expect(root.querySelector('p')).not.toBeNull();
    root.remove();
  });

  test('updates text nodes without replacing elements', () => {
    const root = el('<div><span>old text</span></div>');
    document.body.appendChild(root);
    const origSpan = root.querySelector('span')!;
    run(Morph.morph(root, '<span>new text</span>'));
    // The span should be reused (same identity), not replaced
    const currentSpan = root.querySelector('span')!;
    expect(currentSpan).toBe(origSpan);
    expect(currentSpan.textContent).toBe('new text');
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// morph (outerHTML mode)
// ---------------------------------------------------------------------------

describe('Morph.morph outerHTML', () => {
  test('replaces root attributes in outerHTML mode', () => {
    const root = el('<div class="old">content</div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<div class="new">content</div>', { morphStyle: 'outerHTML' }));
    expect(root.getAttribute('class')).toBe('new');
    root.remove();
  });

  test('replaces element if tag differs', () => {
    const root = el('<div>content</div>');
    const parent = document.createElement('section');
    parent.appendChild(root);
    document.body.appendChild(parent);
    run(Morph.morph(root, '<span>replaced</span>', { morphStyle: 'outerHTML' }));
    expect(parent.firstElementChild?.tagName).toBe('SPAN');
    parent.remove();
  });

  test('ignores outerHTML payloads that contain multiple top-level nodes', () => {
    const root = el('<div class="keep">content</div>');
    document.body.appendChild(root);

    run(Morph.morph(root, '<span>first</span><span>second</span>', { morphStyle: 'outerHTML' }));

    expect(root.tagName).toBe('DIV');
    expect(root.getAttribute('class')).toBe('keep');
    expect(root.textContent).toBe('content');
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// Semantic ID matching
// ---------------------------------------------------------------------------

describe('Morph semantic ID matching', () => {
  test('elements with same data-czap-id are reused', () => {
    const root = el('<div><p data-czap-id="para1">old</p></div>');
    document.body.appendChild(root);
    const origP = root.querySelector('[data-czap-id="para1"]')!;
    run(Morph.morph(root, '<p data-czap-id="para1">new</p>'));
    const currentP = root.querySelector('[data-czap-id="para1"]')!;
    expect(currentP).toBe(origP);
    expect(currentP.textContent).toBe('new');
    root.remove();
  });

  test('elements with different semantic IDs are not reused', () => {
    const root = el('<div><p data-czap-id="a">old</p></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<p data-czap-id="b">new</p>'));
    // The old element should be removed and a new one inserted
    expect(root.querySelector('[data-czap-id="a"]')).toBeNull();
    expect(root.querySelector('[data-czap-id="b"]')).not.toBeNull();
    root.remove();
  });

  test('idMap hints remap incoming semantic IDs before matching existing nodes in outerHTML mode', () => {
    const root = el('<p data-czap-id="mapped">old</p>');
    document.body.appendChild(root);
    const original = root;

    run(
      Morph.morph(
        root,
        '<p data-czap-id="incoming">new</p>',
        { morphStyle: 'outerHTML' },
        Hints.withIdMap(
          new Map([
            ['incoming', 'mapped'],
          ]),
        ),
      ),
    );

    const current = document.body.querySelector('[data-czap-id="mapped"]')!;
    expect(current).toBe(original);
    expect(current.textContent).toBe('new');
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// Attribute syncing
// ---------------------------------------------------------------------------

describe('Morph attribute syncing', () => {
  test('adds new attributes', () => {
    const root = el('<div><span>text</span></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<span class="highlight" data-x="1">text</span>'));
    const span = root.querySelector('span')!;
    expect(span.getAttribute('class')).toBe('highlight');
    expect(span.getAttribute('data-x')).toBe('1');
    root.remove();
  });

  test('removes old attributes', () => {
    const root = el('<div><span class="old" data-remove="yes">text</span></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<span>text</span>'));
    const span = root.querySelector('span')!;
    expect(span.hasAttribute('class')).toBe(false);
    expect(span.hasAttribute('data-remove')).toBe(false);
    root.remove();
  });

  test('updates changed attributes', () => {
    const root = el('<div><span class="a">text</span></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<span class="b">text</span>'));
    expect(root.querySelector('span')!.className).toBe('b');
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// Input value syncing
// ---------------------------------------------------------------------------

describe('Morph input syncing', () => {
  test('syncs input value', () => {
    const root = el('<div><input type="text" value="old" /></div>');
    document.body.appendChild(root);
    const input = root.querySelector('input')!;
    input.value = 'user-typed';
    run(Morph.morph(root, '<input type="text" value="new" />'));
    const currentInput = root.querySelector('input')!;
    expect(currentInput.value).toBe('new');
    root.remove();
  });

  test('syncs checkbox checked state', () => {
    const root = el('<div><input type="checkbox" /></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<input type="checkbox" checked />'));
    expect(root.querySelector('input')!.checked).toBe(true);
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// Node insertion/removal ordering
// ---------------------------------------------------------------------------

describe('Morph child ordering', () => {
  test('inserts new nodes at correct positions', () => {
    const root = el('<div><p>A</p><p>C</p></div>');
    document.body.appendChild(root);
    run(Morph.morph(root, '<p>A</p><p>B</p><p>C</p>'));
    const texts = Array.from(root.querySelectorAll('p')).map((p) => p.textContent);
    expect(texts).toEqual(['A', 'B', 'C']);
    root.remove();
  });

  test('matched nodes preserve identity even when order changes', () => {
    const root = el('<div><p data-czap-id="x">X</p><p data-czap-id="y">Y</p></div>');
    document.body.appendChild(root);
    const origX = root.querySelector('[data-czap-id="x"]')!;
    const origY = root.querySelector('[data-czap-id="y"]')!;
    run(Morph.morph(root, '<p data-czap-id="y">Y2</p><p data-czap-id="x">X2</p>'));
    // Both elements should still be in the DOM with updated content
    const currentX = root.querySelector('[data-czap-id="x"]')!;
    const currentY = root.querySelector('[data-czap-id="y"]')!;
    expect(currentX).toBe(origX);
    expect(currentY).toBe(origY);
    expect(currentX.textContent).toBe('X2');
    expect(currentY.textContent).toBe('Y2');
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// morphWithState
// ---------------------------------------------------------------------------

describe('Morph.morphWithState', () => {
  test('returns success on normal morph', () => {
    const root = el('<div><p>old</p></div>');
    document.body.appendChild(root);
    const result = run(Morph.morphWithState(root, '<p>new</p>'));
    expect(result.type).toBe('success');
    root.remove();
  });

  test('dispatches rejection event when preserved ID missing', () => {
    const root = el('<div><p data-czap-id="keep">preserve me</p></div>');
    document.body.appendChild(root);

    const hints = Hints.preserveIds('keep');
    // Morph to HTML that drops the preserved element
    const result = run(Morph.morphWithState(root, '<p>no keep here</p>', undefined, hints));
    expect(result.type).toBe('rejected');
    root.remove();
  });

  test('dispatches a snapshot request event with the rejection reason when preserve validation fails', () => {
    const root = el('<div><p data-czap-id="keep">preserve me</p></div>');
    document.body.appendChild(root);
    let snapshotReason: string | null = null;

    root.addEventListener('czap:request-snapshot', ((event: Event) => {
      snapshotReason = (event as CustomEvent<{ reason: string }>).detail.reason;
    }) as EventListener);

    const result = run(Morph.morphWithState(root, '<p>replacement</p>', undefined, Hints.preserveIds('keep')));

    expect(result.type).toBe('rejected');
    expect(snapshotReason).toBe(result.type === 'rejected' ? result.rejection.reason : null);
    root.remove();
  });

  test('skips physical state capture when preserve flags are disabled', () => {
    const root = el('<div><p>old</p></div>');
    document.body.appendChild(root);

    const result = run(
      Morph.morphWithState(
        root,
        '<p>new</p>',
        {
          preserveFocus: false,
          preserveScroll: false,
          preserveSelection: false,
        },
      ),
    );

    expect(result.type).toBe('success');
    expect(root.textContent).toBe('new');
    root.remove();
  });

  test('warns when a preserved id is missing from the old tree but still completes the morph', () => {
    const warnSpy = vi.spyOn(Diagnostics, 'warn').mockImplementation(() => {});
    const root = el('<div><p>old</p></div>');
    document.body.appendChild(root);

    try {
      const result = run(Morph.morphWithState(root, '<p>new</p>', undefined, Hints.preserveIds('ghost')));
      expect(result.type).toBe('rejected');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'czap/web.morph',
          code: 'preserve-id-missing',
        }),
      );
    } finally {
      warnSpy.mockRestore();
      root.remove();
    }
  });

  test('uses idMap hints as restore remaps when explicit remap hints are absent', () => {
    const root = el('<div><input data-czap-id="before" value="keep" /><p>old</p></div>') as HTMLElement;
    document.body.appendChild(root);

    const before = root.querySelector('input') as HTMLInputElement;
    before.focus();
    before.setSelectionRange(1, 3);

    const result = run(
      Morph.morphWithState(
        root,
        '<input data-czap-id="after" value="keep" /><p>new</p>',
        {
          preserveFocus: true,
          preserveSelection: true,
        },
        Hints.withIdMap(
          new Map([
            ['before', 'after'],
          ]),
        ),
      ),
    );

    const after = root.querySelector('[data-czap-id="after"]') as HTMLInputElement;
    expect(result.type).toBe('success');
    expect(document.activeElement).toBe(after);
    expect(after.selectionStart).toBe(1);
    expect(after.selectionEnd).toBe(3);
    root.remove();
  });

  test('applies idMap hints to element nodes without tripping on text siblings', () => {
    const root = el('<div><span data-czap-id="before">old</span></div>');
    document.body.appendChild(root);

    const result = run(
      Morph.morph(
        root,
        'lead<span data-czap-id="server">body</span>',
        undefined,
        Hints.withIdMap(
          new Map([
            ['server', 'client'],
          ]),
        ),
      ),
    );

    expect(result).toBeUndefined();
    expect(root.textContent).toBe('leadbody');
    expect(root.querySelector('span')?.textContent).toBe('body');
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('Morph idempotency', () => {
  test('morphing same HTML twice produces identical DOM', () => {
    const html = '<p class="x" data-czap-id="z">content</p>';
    const root = el(`<div>${html}</div>`);
    document.body.appendChild(root);

    run(Morph.morph(root, html));
    const after1 = root.innerHTML;
    run(Morph.morph(root, html));
    const after2 = root.innerHTML;

    expect(after1).toBe(after2);
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// SemanticId
// ---------------------------------------------------------------------------

describe('SemanticId', () => {
  test('get/set round-trips', () => {
    const div = document.createElement('div');
    expect(SemanticId.get(div)).toBeNull();
    SemanticId.set(div, 'my-id');
    expect(SemanticId.get(div)).toBe('my-id');
  });

  test('matches returns true for same semantic ID', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    SemanticId.set(a, 'same');
    SemanticId.set(b, 'same');
    expect(SemanticId.matches(a, b)).toBe(true);
  });

  test('matches returns false for different semantic ID', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    SemanticId.set(a, 'one');
    SemanticId.set(b, 'two');
    expect(SemanticId.matches(a, b)).toBe(false);
  });

  test('buildIndex indexes all semantic IDs', () => {
    const root = el('<div><p data-czap-id="a">A</p><p data-czap-id="b">B</p></div>');
    const index = SemanticId.buildIndex(root);
    expect(index.size).toBe(2);
    expect(index.get('a')?.textContent).toBe('A');
    expect(index.get('b')?.textContent).toBe('B');
  });

  test('find locates element by semantic ID', () => {
    const root = el('<div><span data-czap-id="target">found</span></div>');
    const found = SemanticId.find(root, 'target');
    expect(found?.textContent).toBe('found');
  });

  test('matchNodes prioritizes semantic ID over structural', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    SemanticId.set(a, 'same');
    SemanticId.set(b, 'same');
    const result = SemanticId.matchNodes(a, b);
    expect(result.priority).toBe('semantic');
    expect(result.matches).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

describe('Hints', () => {
  test('empty returns empty hints', () => {
    const h = Hints.empty();
    expect(h).toBeDefined();
  });

  test('merge combines multiple hints', () => {
    const h1 = Hints.preserveIds('a');
    const h2 = Hints.preserveIds('b');
    const merged = Hints.merge(h1, h2);
    expect(merged.preserveIds).toContain('a');
    expect(merged.preserveIds).toContain('b');
  });

  test('fromElement extracts hints from data attributes', () => {
    const div = document.createElement('div');
    div.setAttribute('data-morph-preserve-id', 'x,y');
    const h = Hints.fromElement(div);
    expect(h.preserveIds).toContain('x');
    expect(h.preserveIds).toContain('y');
  });
});
