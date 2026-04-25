/**
 * Morph module tests -- SemanticId pure helpers and Hints builder utilities.
 *
 * Since vitest runs without a DOM, we create minimal mock Element-like
 * objects for functions that operate on attributes, and test purely
 * structural/logic functions directly.
 */

// Shim DOM globals that SemanticId's isFormElement checks via instanceof.
// In vitest there is no DOM, so these must exist as constructors that
// never match our plain mock objects.
if (typeof globalThis.HTMLInputElement === 'undefined') {
  (globalThis as Record<string, unknown>).HTMLInputElement = class HTMLInputElement {};
  (globalThis as Record<string, unknown>).HTMLTextAreaElement = class HTMLTextAreaElement {};
  (globalThis as Record<string, unknown>).HTMLSelectElement = class HTMLSelectElement {};
}

import { describe, test, expect } from 'vitest';
import { SemanticId, Hints, Morph } from '@czap/web';

// ---------------------------------------------------------------------------
// Minimal DOM Mocks
// ---------------------------------------------------------------------------

/**
 * Lightweight mock that satisfies the subset of the Element interface
 * used by SemanticId.get / .set / .matches / .generate / .matchNodes.
 */
function mockElement(
  opts: {
    tagName?: string;
    id?: string;
    className?: string;
    attrs?: Record<string, string>;
    type?: string;
    name?: string;
  } = {},
): Element {
  const attrs = new Map<string, string>(Object.entries(opts.attrs ?? {}));
  if (opts.id) attrs.set('id', opts.id);

  const el = {
    tagName: (opts.tagName ?? 'DIV').toUpperCase(),
    id: opts.id ?? '',
    className: opts.className ?? '',
    type: opts.type,
    name: opts.name,
    getAttribute(name: string): string | null {
      if (name === 'id') return this.id || null;
      return attrs.get(name) ?? null;
    },
    setAttribute(name: string, value: string): void {
      attrs.set(name, value);
      if (name === 'id') this.id = value;
    },
    hasAttribute(name: string): boolean {
      return attrs.has(name);
    },
  };

  return el as unknown as Element;
}

// ===========================================================================
// SemanticId.ATTR
// ===========================================================================

describe('SemanticId.ATTR', () => {
  test('is the data-czap-id attribute name', () => {
    expect(SemanticId.ATTR).toBe('data-czap-id');
  });
});

// ===========================================================================
// SemanticId.get / set
// ===========================================================================

describe('SemanticId.get and set', () => {
  test('get returns null when no semantic ID exists', () => {
    const el = mockElement();
    expect(SemanticId.get(el)).toBeNull();
  });

  test('get returns the semantic ID when set via attribute', () => {
    const el = mockElement({ attrs: { 'data-czap-id': 'hero' } });
    expect(SemanticId.get(el)).toBe('hero');
  });

  test('set writes the semantic ID attribute', () => {
    const el = mockElement();
    SemanticId.set(el, 'sidebar');
    expect(SemanticId.get(el)).toBe('sidebar');
  });
});

// ===========================================================================
// SemanticId.matches
// ===========================================================================

describe('SemanticId.matches', () => {
  test('two elements with same semantic ID match', () => {
    const a = mockElement({ attrs: { 'data-czap-id': 'nav' } });
    const b = mockElement({ attrs: { 'data-czap-id': 'nav' } });
    expect(SemanticId.matches(a, b)).toBe(true);
  });

  test('two elements with different semantic IDs do not match', () => {
    const a = mockElement({ attrs: { 'data-czap-id': 'nav' } });
    const b = mockElement({ attrs: { 'data-czap-id': 'footer' } });
    expect(SemanticId.matches(a, b)).toBe(false);
  });

  test('elements without semantic IDs do not match', () => {
    const a = mockElement();
    const b = mockElement();
    expect(SemanticId.matches(a, b)).toBe(false);
  });

  test('one with and one without semantic ID do not match', () => {
    const a = mockElement({ attrs: { 'data-czap-id': 'hero' } });
    const b = mockElement();
    expect(SemanticId.matches(a, b)).toBe(false);
  });
});

// ===========================================================================
// SemanticId.generate
// ===========================================================================

describe('SemanticId.generate', () => {
  test('element with id generates tagName#id', () => {
    const el = mockElement({ tagName: 'section', id: 'main' });
    expect(SemanticId.generate(el, 0)).toBe('section#main');
  });

  test('element with className generates tagName.classes:index', () => {
    const el = mockElement({ tagName: 'div', className: 'card featured' });
    expect(SemanticId.generate(el, 3)).toBe('div.card.featured:3');
  });

  test('element with only tagName generates tagName:index', () => {
    const el = mockElement({ tagName: 'span' });
    expect(SemanticId.generate(el, 5)).toBe('span:5');
  });

  test('id takes priority over className', () => {
    const el = mockElement({ tagName: 'div', id: 'hero', className: 'banner' });
    expect(SemanticId.generate(el, 0)).toBe('div#hero');
  });

  test('extra whitespace in className is collapsed to dots', () => {
    const el = mockElement({ tagName: 'p', className: '  a   b  ' });
    expect(SemanticId.generate(el, 1)).toBe('p.a.b:1');
  });

  test('whitespace-only className falls back to tagName:index', () => {
    const el = mockElement({ tagName: 'article', className: '   ' });
    expect(SemanticId.generate(el, 2)).toBe('article:2');
  });
});

// ===========================================================================
// SemanticId.matchNodes
// ===========================================================================

describe('SemanticId.matchNodes', () => {
  test('semantic ID match returns priority "semantic"', () => {
    const a = mockElement({ attrs: { 'data-czap-id': 'hero' } });
    const b = mockElement({ attrs: { 'data-czap-id': 'hero' } });
    const result = SemanticId.matchNodes(a, b);
    expect(result.matches).toBe(true);
    expect(result.priority).toBe('semantic');
    expect(result.matchedId).toBe('hero');
  });

  test('different semantic IDs -> no match', () => {
    const a = mockElement({ attrs: { 'data-czap-id': 'hero' } });
    const b = mockElement({ attrs: { 'data-czap-id': 'footer' } });
    const result = SemanticId.matchNodes(a, b);
    expect(result.matches).toBe(false);
    expect(result.priority).toBe('none');
  });

  test('DOM id match returns priority "dom-id"', () => {
    const a = mockElement({ tagName: 'div', id: 'main' });
    const b = mockElement({ tagName: 'div', id: 'main' });
    const result = SemanticId.matchNodes(a, b);
    expect(result.matches).toBe(true);
    expect(result.priority).toBe('dom-id');
  });

  test('different DOM ids -> no match', () => {
    const a = mockElement({ tagName: 'div', id: 'main' });
    const b = mockElement({ tagName: 'div', id: 'sidebar' });
    const result = SemanticId.matchNodes(a, b);
    expect(result.matches).toBe(false);
  });

  test('same tag, no IDs -> structural match', () => {
    const a = mockElement({ tagName: 'div' });
    const b = mockElement({ tagName: 'div' });
    const result = SemanticId.matchNodes(a, b);
    expect(result.matches).toBe(true);
    expect(result.priority).toBe('structural');
  });

  test('different tags -> no match', () => {
    const a = mockElement({ tagName: 'div' });
    const b = mockElement({ tagName: 'span' });
    const result = SemanticId.matchNodes(a, b);
    expect(result.matches).toBe(false);
  });

  test('form elements still match structurally when only one side has a name', () => {
    class InputElementMock extends HTMLInputElement {}
    const a = Object.assign(
      new InputElementMock(),
      mockElement({ tagName: 'input', type: 'email', name: 'work' }),
    ) as Element;
    const b = Object.assign(
      new InputElementMock(),
      mockElement({ tagName: 'input', type: 'email', name: '' }),
    ) as Element;
    const result = SemanticId.matchNodes(a, b);
    expect(result).toEqual({ matches: true, priority: 'structural' });
  });
});

// ===========================================================================
// SemanticId.findBestMatch
// ===========================================================================

describe('SemanticId.findBestMatch', () => {
  test('returns null for empty candidates', () => {
    const target = mockElement({ tagName: 'div' });
    expect(SemanticId.findBestMatch(target, [])).toBeNull();
  });

  test('prefers semantic match over structural', () => {
    const target = mockElement({ tagName: 'div', attrs: { 'data-czap-id': 'hero' } });
    const structural = mockElement({ tagName: 'div' });
    const semantic = mockElement({ tagName: 'div', attrs: { 'data-czap-id': 'hero' } });
    const result = SemanticId.findBestMatch(target, [structural, semantic]);
    expect(result).not.toBeNull();
    expect(result!.result.priority).toBe('semantic');
  });

  test('prefers dom-id match over structural', () => {
    const target = mockElement({ tagName: 'div', id: 'main' });
    const structural = mockElement({ tagName: 'div' });
    const domId = mockElement({ tagName: 'div', id: 'main' });
    const result = SemanticId.findBestMatch(target, [structural, domId]);
    expect(result).not.toBeNull();
    expect(result!.result.priority).toBe('dom-id');
  });

  test('returns structural match when no semantic or dom-id', () => {
    const target = mockElement({ tagName: 'section' });
    const candidate = mockElement({ tagName: 'section' });
    const result = SemanticId.findBestMatch(target, [candidate]);
    expect(result).not.toBeNull();
    expect(result!.result.priority).toBe('structural');
  });

  test('keeps the higher-priority best match when later candidates are lower priority', () => {
    const target = mockElement({ tagName: 'div', attrs: { 'data-czap-id': 'hero' } });
    const semantic = mockElement({ tagName: 'div', attrs: { 'data-czap-id': 'hero' } });
    const structural = mockElement({ tagName: 'div' });
    const result = SemanticId.findBestMatch(target, [semantic, structural]);
    expect(result?.element).toBe(semantic);
    expect(result?.result.priority).toBe('semantic');
  });

  test('returns null when no candidates match', () => {
    const target = mockElement({ tagName: 'div', attrs: { 'data-czap-id': 'hero' } });
    const nonMatch = mockElement({ tagName: 'div', attrs: { 'data-czap-id': 'footer' } });
    const result = SemanticId.findBestMatch(target, [nonMatch]);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// Hints builder utilities
// ===========================================================================

describe('Hints', () => {
  test('empty returns an object with no hint fields', () => {
    const h = Hints.empty();
    expect(h.preserveIds).toBeUndefined();
    expect(h.semanticIds).toBeUndefined();
    expect(h.idMap).toBeUndefined();
  });

  test('preserveIds returns hints with preserveIds array', () => {
    const h = Hints.preserveIds('a', 'b');
    expect(h.preserveIds).toEqual(['a', 'b']);
  });

  test('withSemanticIds returns hints with semanticIds array', () => {
    const h = Hints.withSemanticIds('x', 'y');
    expect(h.semanticIds).toEqual(['x', 'y']);
  });

  test('withIdMap returns hints wrapping a Map', () => {
    const map = new Map([['old', 'new']]);
    const h = Hints.withIdMap(map);
    expect(h.idMap).toBe(map);
  });

  test('preserveFocus returns hints with preserveFocus selectors', () => {
    const h = Hints.preserveFocus('#input');
    expect(h.preserveFocus).toEqual(['#input']);
  });

  test('preserveScroll returns hints with preserveScroll selectors', () => {
    const h = Hints.preserveScroll('.list');
    expect(h.preserveScroll).toEqual(['.list']);
  });
});

// ===========================================================================
// Hints.merge
// ===========================================================================

describe('Hints.merge', () => {
  test('merging empties yields empty', () => {
    const merged = Hints.merge(Hints.empty(), Hints.empty());
    expect(merged.preserveIds).toBeUndefined();
    expect(merged.semanticIds).toBeUndefined();
  });

  test('arrays are concatenated', () => {
    const a = Hints.preserveIds('x');
    const b = Hints.preserveIds('y');
    const merged = Hints.merge(a, b);
    expect(merged.preserveIds).toEqual(['x', 'y']);
  });

  test('idMaps are combined', () => {
    const a = Hints.withIdMap(new Map([['a', 'b']]));
    const b = Hints.withIdMap(new Map([['c', 'd']]));
    const merged = Hints.merge(a, b);
    expect(merged.idMap?.get('a')).toBe('b');
    expect(merged.idMap?.get('c')).toBe('d');
  });

  test('later idMap entries override earlier ones', () => {
    const a = Hints.withIdMap(new Map([['key', 'old']]));
    const b = Hints.withIdMap(new Map([['key', 'new']]));
    const merged = Hints.merge(a, b);
    expect(merged.idMap?.get('key')).toBe('new');
  });

  test('mixed hint types are all preserved', () => {
    const a = Hints.preserveIds('id1');
    const b = Hints.withSemanticIds('sem1');
    const c = Hints.preserveFocus('#input');
    const merged = Hints.merge(a, b, c);
    expect(merged.preserveIds).toEqual(['id1']);
    expect(merged.semanticIds).toEqual(['sem1']);
    expect(merged.preserveFocus).toEqual(['#input']);
  });
});

// ===========================================================================
// Morph.defaultConfig
// ===========================================================================

describe('Morph.defaultConfig', () => {
  test('has expected shape', () => {
    expect(Morph.defaultConfig.preserveFocus).toBe(true);
    expect(Morph.defaultConfig.preserveScroll).toBe(true);
    expect(Morph.defaultConfig.preserveSelection).toBe(true);
    expect(Morph.defaultConfig.morphStyle).toBe('innerHTML');
  });
});

