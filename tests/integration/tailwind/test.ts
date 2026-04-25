/**
 * Tailwind v4 Integration Test
 *
 * Proves the czap token -> Tailwind pipeline works end-to-end:
 *   1. Create czap tokens via Token.make()
 *   2. Compile them to a @theme block via TokenTailwindCompiler
 *   3. Feed the @theme block into Tailwind v4's compile() API
 *   4. Build CSS for utility classes that reference the theme tokens
 *   5. Verify the generated CSS contains correct custom properties and values
 */

import { Token } from '@czap/core';
import { TokenTailwindCompiler } from '@czap/compiler';
import { compile } from '@tailwindcss/node';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert(haystack.includes(needle), `${label} -- contains "${needle}"`);
}

// ---------------------------------------------------------------------------
// 1. Define czap tokens
// ---------------------------------------------------------------------------

const tokens = [
  Token.make({
    name: 'primary',
    category: 'color',
    axes: ['theme'] as const,
    values: { light: '#3b82f6', dark: '#60a5fa' },
    fallback: '#3b82f6',
  }),
  Token.make({
    name: 'surface',
    category: 'color',
    axes: ['theme'] as const,
    values: { light: '#ffffff', dark: '#1e293b' },
    fallback: '#ffffff',
  }),
  Token.make({
    name: 'sm',
    category: 'spacing',
    axes: ['density'] as const,
    values: { compact: '0.25rem', normal: '0.5rem', loose: '0.75rem' },
    fallback: '0.5rem',
  }),
  Token.make({
    name: 'base',
    category: 'radius',
    axes: ['density'] as const,
    values: { compact: '0.25rem', normal: '0.5rem' },
    fallback: '0.5rem',
  }),
  Token.make({
    name: 'card',
    category: 'shadow',
    axes: ['theme'] as const,
    values: { light: '0 1px 3px rgba(0,0,0,0.12)', dark: '0 1px 3px rgba(0,0,0,0.4)' },
    fallback: '0 1px 3px rgba(0,0,0,0.12)',
  }),
  Token.make({
    name: 'sans',
    category: 'typography',
    axes: ['platform'] as const,
    values: {},
    fallback: 'Inter, system-ui, sans-serif',
  }),
] as const;

// ---------------------------------------------------------------------------
// 2. Compile tokens -> @theme block
// ---------------------------------------------------------------------------

console.log('\n=== czap -> Tailwind v4 Integration Test ===\n');

console.log('[Phase 1] TokenTailwindCompiler output\n');

const result = TokenTailwindCompiler.compile(tokens);

assert(typeof result.themeBlock === 'string', 'themeBlock is a string');
assert(result.themeBlock.startsWith('@theme {'), 'themeBlock starts with @theme {');
assert(result.themeBlock.endsWith('}'), 'themeBlock ends with }');

// Verify expected custom properties in the theme block
assertContains(result.themeBlock, '--color-primary:', 'color token mapped to --color-primary');
assertContains(result.themeBlock, '--color-surface:', 'color token mapped to --color-surface');
assertContains(result.themeBlock, '--spacing-sm:', 'spacing token mapped to --spacing-sm');
assertContains(result.themeBlock, '--radius-base:', 'radius token mapped to --radius-base');
assertContains(result.themeBlock, '--shadow-card:', 'shadow token mapped to --shadow-card');
assertContains(result.themeBlock, '--font-sans:', 'typography token mapped to --font-sans');

// Verify axis-suffixed variants exist
assertContains(result.themeBlock, '--color-primary-light: #3b82f6;', 'light axis value for primary');
assertContains(result.themeBlock, '--color-primary-dark: #60a5fa;', 'dark axis value for primary');
assertContains(result.themeBlock, '--spacing-sm-compact: 0.25rem;', 'compact axis value for spacing-sm');
assertContains(result.themeBlock, '--spacing-sm-normal: 0.5rem;', 'normal axis value for spacing-sm');
assertContains(result.themeBlock, '--spacing-sm-loose: 0.75rem;', 'loose axis value for spacing-sm');

// Verify fallback values
assertContains(result.themeBlock, '--color-primary: #3b82f6;', 'primary fallback value');
assertContains(result.themeBlock, '--spacing-sm: 0.5rem;', 'spacing-sm fallback value');
assertContains(result.themeBlock, '--font-sans: Inter, system-ui, sans-serif;', 'font-sans fallback value');

console.log('\n[Phase 2] Tailwind v4 compilation\n');

// ---------------------------------------------------------------------------
// 3. Feed @theme block into Tailwind v4
// ---------------------------------------------------------------------------

// Compose a minimal CSS input that includes our @theme block
// plus a Tailwind utilities layer
const inputCSS = `
${result.themeBlock}

@tailwind utilities;
`;

const base = resolve(import.meta.dirname ?? '.', '.');

const compiled = await compile(inputCSS, {
  base,
  onDependency: () => {},
});

assert(typeof compiled.build === 'function', 'compile() returned a build function');

// ---------------------------------------------------------------------------
// 4. Build CSS for utility classes that reference our tokens
// ---------------------------------------------------------------------------

// Tailwind v4 generates utilities from the @theme namespace.
// For --color-primary, Tailwind creates bg-primary, text-primary, etc.
// For --spacing-sm, Tailwind creates p-sm, m-sm, gap-sm, etc.
// For --radius-base, Tailwind creates rounded-base.
// For --shadow-card, Tailwind creates shadow-card.

const candidates = [
  // Color utilities
  'bg-primary',
  'text-primary',
  'bg-surface',
  'text-surface',
  // Axis-suffixed color utilities
  'bg-primary-light',
  'bg-primary-dark',
  // Spacing utilities
  'p-sm',
  'm-sm',
  'gap-sm',
  // Axis-suffixed spacing
  'p-sm-compact',
  'p-sm-loose',
  // Radius
  'rounded-base',
  // Shadow
  'shadow-card',
  // Font
  'font-sans',
];

const css = compiled.build(candidates);

assert(typeof css === 'string', 'build() returned a string');
assert(css.length > 0, 'generated CSS is non-empty');

// ---------------------------------------------------------------------------
// 5. Verify generated CSS
// ---------------------------------------------------------------------------

console.log('\n[Phase 3] Generated CSS verification\n');

// The generated CSS should contain our token values as custom property references.
// Tailwind v4 emits utility classes that reference the @theme variables.

// Color utilities should reference the color custom properties
assertContains(css, '--color-primary', 'CSS references --color-primary');
assertContains(css, '--color-surface', 'CSS references --color-surface');

// Spacing utilities
assertContains(css, '--spacing-sm', 'CSS references --spacing-sm');

// Check that actual utility class selectors were generated
assertContains(css, '.bg-primary', 'bg-primary utility class generated');
assertContains(css, '.text-primary', 'text-primary utility class generated');
assertContains(css, '.bg-surface', 'bg-surface utility class generated');
assertContains(css, '.p-sm', 'p-sm utility class generated');
assertContains(css, '.m-sm', 'm-sm utility class generated');
assertContains(css, '.gap-sm', 'gap-sm utility class generated');
assertContains(css, '.rounded-base', 'rounded-base utility class generated');
assertContains(css, '.shadow-card', 'shadow-card utility class generated');
assertContains(css, '.font-sans', 'font-sans utility class generated');

// Axis-suffixed utilities
assertContains(css, '.bg-primary-light', 'bg-primary-light axis utility generated');
assertContains(css, '.bg-primary-dark', 'bg-primary-dark axis utility generated');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(48)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(48)}\n`);

if (failed > 0) {
  console.error('INTEGRATION TEST FAILED');
  process.exit(1);
}

console.log('INTEGRATION TEST PASSED');
