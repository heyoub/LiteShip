/**
 * Slot module tests -- SlotAddressing pure path operations.
 *
 * Covers validation, parsing, parent/ancestor traversal, join,
 * basename, descendant checks, and CSS selector generation.
 */

import { describe, test, expect } from 'vitest';
import { SlotAddressing } from '@czap/web';
import type { SlotPath } from '@czap/web';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience to cast a known-good path without going through parse. */
const sp = (s: string) => s as SlotPath;

// ---------------------------------------------------------------------------
// isValid
// ---------------------------------------------------------------------------

describe('SlotAddressing.isValid', () => {
  test('root "/" is valid', () => {
    expect(SlotAddressing.isValid('/')).toBe(true);
  });

  test('simple one-segment path is valid', () => {
    expect(SlotAddressing.isValid('/header')).toBe(true);
  });

  test('multi-segment path is valid', () => {
    expect(SlotAddressing.isValid('/app/sidebar/nav')).toBe(true);
  });

  test('hyphens and underscores are allowed in segments', () => {
    expect(SlotAddressing.isValid('/my-slot')).toBe(true);
    expect(SlotAddressing.isValid('/my_slot')).toBe(true);
    expect(SlotAddressing.isValid('/a-b_c/d-e_f')).toBe(true);
  });

  test('digits are allowed', () => {
    expect(SlotAddressing.isValid('/item-42')).toBe(true);
    expect(SlotAddressing.isValid('/123')).toBe(true);
  });

  test('paths not starting with "/" are invalid', () => {
    expect(SlotAddressing.isValid('header')).toBe(false);
    expect(SlotAddressing.isValid('')).toBe(false);
  });

  test('double slashes are invalid', () => {
    expect(SlotAddressing.isValid('//header')).toBe(false);
    expect(SlotAddressing.isValid('/app//sidebar')).toBe(false);
  });

  test('trailing slash creates empty segment -> invalid', () => {
    expect(SlotAddressing.isValid('/app/')).toBe(false);
  });

  test('"." and ".." segments are rejected', () => {
    expect(SlotAddressing.isValid('/.')).toBe(false);
    expect(SlotAddressing.isValid('/..')).toBe(false);
    expect(SlotAddressing.isValid('/app/..')).toBe(false);
    expect(SlotAddressing.isValid('/app/./sidebar')).toBe(false);
  });

  test('special characters are rejected', () => {
    expect(SlotAddressing.isValid('/foo bar')).toBe(false);
    expect(SlotAddressing.isValid('/foo@bar')).toBe(false);
    expect(SlotAddressing.isValid('/foo.bar')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

describe('SlotAddressing.parse', () => {
  test('returns a valid SlotPath unchanged', () => {
    const result = SlotAddressing.parse('/header');
    expect(result).toBe('/header');
  });

  test('throws on invalid path', () => {
    expect(() => SlotAddressing.parse('nope')).toThrow(/Invalid slot path/);
    expect(() => SlotAddressing.parse('')).toThrow(/Invalid slot path/);
  });
});

// ---------------------------------------------------------------------------
// toSelector
// ---------------------------------------------------------------------------

describe('SlotAddressing.toSelector', () => {
  test('generates a data-attribute CSS selector', () => {
    expect(SlotAddressing.toSelector(sp('/app/sidebar'))).toBe('[data-czap-slot="/app/sidebar"]');
  });

  test('root path selector', () => {
    expect(SlotAddressing.toSelector(sp('/'))).toBe('[data-czap-slot="/"]');
  });
});

// ---------------------------------------------------------------------------
// parent
// ---------------------------------------------------------------------------

describe('SlotAddressing.parent', () => {
  test('root has no parent', () => {
    expect(SlotAddressing.parent(sp('/'))).toBeNull();
  });

  test('single-segment path parent is root', () => {
    expect(SlotAddressing.parent(sp('/header'))).toBe('/');
  });

  test('multi-segment path returns parent segment', () => {
    expect(SlotAddressing.parent(sp('/app/sidebar/nav'))).toBe('/app/sidebar');
  });

  test('two-segment path returns first segment', () => {
    expect(SlotAddressing.parent(sp('/app/sidebar'))).toBe('/app');
  });
});

// ---------------------------------------------------------------------------
// ancestors
// ---------------------------------------------------------------------------

describe('SlotAddressing.ancestors', () => {
  test('root has no ancestors', () => {
    expect(SlotAddressing.ancestors(sp('/'))).toEqual([]);
  });

  test('single-segment returns just root', () => {
    expect(SlotAddressing.ancestors(sp('/header'))).toEqual(['/']);
  });

  test('deep path returns full ancestor chain (nearest first)', () => {
    const result = SlotAddressing.ancestors(sp('/app/sidebar/nav'));
    expect(result).toEqual(['/app/sidebar', '/app', '/']);
  });
});

// ---------------------------------------------------------------------------
// isDescendant
// ---------------------------------------------------------------------------

describe('SlotAddressing.isDescendant', () => {
  test('a path is not a descendant of itself', () => {
    expect(SlotAddressing.isDescendant(sp('/app'), sp('/app'))).toBe(false);
  });

  test('child is a descendant of parent', () => {
    expect(SlotAddressing.isDescendant(sp('/app/sidebar'), sp('/app'))).toBe(true);
  });

  test('deep descendant of root', () => {
    expect(SlotAddressing.isDescendant(sp('/app/sidebar/nav'), sp('/'))).toBe(true);
  });

  test('root is not a descendant of anything', () => {
    expect(SlotAddressing.isDescendant(sp('/'), sp('/'))).toBe(false);
  });

  test('sibling is not a descendant', () => {
    expect(SlotAddressing.isDescendant(sp('/app/footer'), sp('/app/sidebar'))).toBe(false);
  });

  test('prefix-but-not-segment-boundary is not a descendant', () => {
    expect(SlotAddressing.isDescendant(sp('/app-extra'), sp('/app'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// join
// ---------------------------------------------------------------------------

describe('SlotAddressing.join', () => {
  test('join with no segments returns base', () => {
    expect(SlotAddressing.join(sp('/app'))).toBe('/app');
  });

  test('join root with segment', () => {
    expect(SlotAddressing.join(sp('/'), 'header')).toBe('/header');
  });

  test('join base with segment', () => {
    expect(SlotAddressing.join(sp('/app'), 'sidebar')).toBe('/app/sidebar');
  });

  test('join with multiple segments', () => {
    expect(SlotAddressing.join(sp('/app'), 'sidebar', 'nav')).toBe('/app/sidebar/nav');
  });

  test('leading slashes on segments are stripped', () => {
    expect(SlotAddressing.join(sp('/app'), '/sidebar')).toBe('/app/sidebar');
  });

  test('empty segments are skipped', () => {
    expect(SlotAddressing.join(sp('/app'), '', 'sidebar')).toBe('/app/sidebar');
  });

  test('slash-only segments are skipped and root joins stay rooted', () => {
    expect(SlotAddressing.join(sp('/'), '/')).toBe('/');
    expect(SlotAddressing.join(sp('/'), '', '/')).toBe('/');
  });

  test('join throws if resulting path is invalid', () => {
    expect(() => SlotAddressing.join(sp('/'), 'foo bar')).toThrow(/Invalid slot path/);
  });
});

// ---------------------------------------------------------------------------
// basename
// ---------------------------------------------------------------------------

describe('SlotAddressing.basename', () => {
  test('root basename is empty string', () => {
    expect(SlotAddressing.basename(sp('/'))).toBe('');
  });

  test('single segment', () => {
    expect(SlotAddressing.basename(sp('/header'))).toBe('header');
  });

  test('multi-segment returns last', () => {
    expect(SlotAddressing.basename(sp('/app/sidebar/nav'))).toBe('nav');
  });
});
