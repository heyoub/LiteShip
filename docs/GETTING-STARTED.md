# Getting Started with czap

This walkthrough takes you from a fresh clone to a runnable boundary that
compiles to CSS, hydrates via Astro, and updates as you change a slider.
~10 minutes end-to-end on a fast machine.

## Prerequisites

- Node.js 22+
- pnpm 10+
- A POSIX shell (bash, zsh) **or** PowerShell on Windows

## 1. Clone and install

```bash
git clone https://github.com/TheFreeBatteryFactory/czap.git
cd czap
pnpm install
```

The first install pulls workspace dependencies + Playwright browsers. Takes
a minute or two; subsequent installs are seconds.

## 2. Build everything

```bash
pnpm run build
```

This runs `tsc --build` across **14** compiled packages (everything under
`packages/*` except type-only `@czap/_spine`). `@czap/_spine` is validated via
`pnpm run typecheck:spine`. Together there are **15** publishable `@czap/*`
scopes on npm. Composite project references mean `tsc` figures out the order;
you don't have to.

## 3. Run the fast test loop

```bash
pnpm test
```

Vitest prints the current file and test counts in the summary line; totals
shift as suites land. If anything fails, that's a real signal — open an issue
with the failure tail.

## 4. Your first boundary

Create `try-czap.ts` at the repo root:

```ts
import { Boundary, Token, Style } from '@czap/core';

// A boundary is a continuous-to-discrete signal mapping.
// Here: viewport width -> {mobile, tablet, desktop}
const viewport = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
  hysteresis: 20,
});

// Evaluate the boundary against a sample value
console.log(Boundary.evaluate(viewport, 320));   // 'mobile'
console.log(Boundary.evaluate(viewport, 1024));  // 'tablet'
console.log(Boundary.evaluate(viewport, 1440));  // 'desktop'

// A token can have axis variants (theme, density, motion-tier...)
const primary = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['theme'] as const,
  values: { dark: '#00e5ff', light: 'hsl(175 70% 50%)' },
  fallback: '#00e5ff',
});

console.log(Token.cssVar(primary));              // 'var(--czap-primary)'
console.log(Token.tap(primary, { theme: 'dark' })); // '#00e5ff'

// A style that responds to the boundary
const card = Style.make({
  boundary: viewport,
  base: { properties: { padding: '1rem' } },
  states: {
    mobile: { properties: { padding: '0.5rem' } },
    desktop: { properties: { padding: '2rem' } },
  },
});

console.log(card.boundary === viewport);  // true
```

Run it (the repo's devDependencies already include `tsx` for executing
TypeScript directly; you don't need to install anything):

```bash
pnpm exec tsx try-czap.ts
```

You should see the three boundary evaluations print, then the token's CSS
variable name and dark-theme value, then `true`. If `tsx` is not on
PATH for some reason, `pnpm install` at the repo root pulls it in.

## 5. Compile to CSS

The boundary above doesn't *do* anything until something compiles it. Add
the CSS compiler — note that `compile()` takes the boundary, a per-state
property map, and an optional selector:

```ts
import { CSSCompiler } from '@czap/compiler';

const result = CSSCompiler.compile(
  viewport,
  {
    mobile: { 'font-size': '14px', padding: '0.5rem' },
    tablet: { 'font-size': '16px', padding: '1rem' },
    desktop: { 'font-size': '18px', padding: '2rem' },
  },
  '.card',
);

// `.raw` is the serialized CSS string; `.containerRules` is the
// structured form (rule per state) you'd feed into a build pipeline.
console.log(result.raw);
// @container viewport-width (...) { .card { font-size: 14px; padding: 0.5rem } }
// @container viewport-width (...) { .card { font-size: 16px; padding: 1rem } }
// @container viewport-width (...) { .card { font-size: 18px; padding: 2rem } }

// You can also call CSSCompiler.serialize(result) to produce the same
// string from the structured form — useful when you want to inspect
// individual rules first.
```

You'll get a CSS block keyed by the boundary states — ready to paste into
a stylesheet, or wire through Astro / Vite for hot reload.

## 6. Wire it into Astro (optional, full pipeline)

If you want the runtime hydration story:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import czap from '@czap/astro';

export default defineConfig({
  integrations: [czap()],
});
```

Then in any `.astro` page:

```astro
---
import { Satellite } from '@czap/astro/Satellite';
---

<Satellite boundary={viewport} client:satellite>
  <div class="card">
    Resize the window to see the boundary state change.
  </div>
</Satellite>
```

The `client:satellite` directive hydrates only the boundary evaluator —
not a whole React tree — and the compiled CSS handles the visual response
without round-tripping through JavaScript.

## 7. Where to go from here

- **[docs/ARCHITECTURE.md](./ARCHITECTURE.md)** — full system architecture
  and the dependency graph between packages
- **[docs/adr/](./adr)** — architecture decision records explaining *why*
  each major choice was made
- **[docs/api/](./api)** — generated API reference for every package
- **[docs/DOCS.md](./DOCS.md)** — full documentation map
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — how to develop in the repo,
  the gauntlet, PR conventions

## Troubleshooting

**PowerShell shows `Γåô` / `Γ£ô` mojibake in logs** — your terminal is
decoding czap's UTF-8 output as cp437. Use `Out-File -Encoding utf8` or
run `chcp 65001` first.

**Tests hang in browser mode** — make sure Playwright browsers are
installed (`pnpm exec playwright install`).

Found a different issue? Open one at
[github.com/TheFreeBatteryFactory/czap/issues](https://github.com/TheFreeBatteryFactory/czap/issues).
