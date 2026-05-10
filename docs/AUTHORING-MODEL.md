# LiteShip authoring model

## Purpose

How to author with LiteShip: the CZAP engine's rigging surface, shipped as `@czap/*` packages.

Naming: [GLOSSARY.md](./GLOSSARY.md).

This is about construction, not migration. It assumes the mental model in [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md).

## First-time reader vocabulary

For designers, brand directors, and agency PMs reading alongside an engineer. Engineering-fluent readers can skip this section.

- **signal** — a continuously changing value the system watches, such as viewport width, device capability tier, or the OS dark-mode flag.
- **boundary** — a definition that carves a continuous signal into a small set of named states (e.g. `stacked / split / cinematic`), so the rest of the system only ever sees discrete labels, not raw numbers.
- **hysteresis** — a deliberate gap between the threshold where a state turns on and the threshold where it turns off, like a thermostat's dead-band that prevents the heater from flickering on and off when the temperature hovers near the setpoint.
- **named state** — a label like `stacked`, `split`, or `cinematic` that the author chooses to stand in for a chunk of the signal range; the rest of the system reads names, not numbers.
- **content-addressed** — every definition has an automatic fingerprint computed from its contents; change one byte of the definition and the fingerprint changes too, which is how the build pipeline detects that derived outputs (CSS, GLSL, ARIA, cache keys) need to recompute. Prevents the failure mode where one output silently lags the others.
- **quantize** — the step that reads a live signal, evaluates the boundary, and resolves which named state is currently active.
- **cast** — to take an authored named state and emit it into a specific output format: a CSS custom property, a GLSL shader uniform, an ARIA attribute, and so on; always carries a target.
- **output target** — the concrete surface a cast writes to, such as a CSS file, a WebGL shader, an accessibility tree attribute, or an AI manifest.

For the full prose-register authority across this corpus, see [GLOSSARY.md](./GLOSSARY.md).

## What it feels like to author

You start by naming the few states a surface has. *Stacked, split, cinematic.* You don't pick numbers yet; you pick names. Then you write a boundary that says where one becomes the next, with hysteresis where you'd want some grace. Then you write the styles for each named state, and you move on.

The CSS variable, the GLSL preamble, and the ARIA attribute all come out of that one boundary without you authoring them three times. The AI manifest is its own structured artifact authored alongside, sharing the same state vocabulary. When you drag the window edge, the CSS re-paints; if you wired a shader in, the uniform changes the same tick; a screen reader sees the same state your styles do.

---

## The main authoring objects

> The four things you author: a *boundary* (where state changes), *tokens* (the design materials), *themes* (palettes that swap together), and *styles* (what each state looks like).

There are four primary authored definition types:

- `Boundary`
- `Token`
- `Theme`
- `Style`

Everything else composes around them.

### Boundary

A boundary names the discrete states that matter for one signal.

Use it when you need:

- layout regime changes
- motion regime changes
- semantic mode changes
- capability-conditioned output selection

Boundary guidance:

- name states by experience, not by number
- keep state counts small
- add hysteresis where oscillation would feel bad
- treat the boundary as a semantic contract, not a CSS trick

### Token

A token is a material primitive.

Use it when a value belongs to the design language:

- color
- spacing
- radius
- shadow
- typography
- timing

Token guidance:

- prefer semantic names over local names
- keep tokens global enough to matter beyond one section
- use axes when the value truly varies by theme or condition

### Theme

A theme is a coordinated token-space variant.

Use it when multiple tokens need to vary together in a controlled way.

Theme guidance:

- theme names should describe a coherent presentation mode
- themes are not one-off overrides
- keep theme logic in token space, not inline style space

### Style

A style maps named states to outputs.

Use it when a surface has:

- base properties
- state-specific properties
- pseudo or transition behavior
- a boundary-driven visual grammar

Style guidance:

- keep base rules for invariants
- keep state rules for real differences
- let states express composition changes, not token identity

---

## The authoring order

> Pick names before numbers, signals before states, states before styles. The order keeps the authored layer about *what the surface means* rather than *what numbers happened to fall out of CSS*.

When building a new surface, the clean order is:

1. name the signal
2. name the states
3. define the boundary
4. define the tokens
5. define the theme space
6. define the style outputs
7. decide the cheapest runtime that preserves intent

This order matters because it keeps authored behavior semantic.

Starting from signals and states keeps the authored layer semantic; starting from CSS first inverts the order and the partition leaks into selectors.

---

## Naming rules

> State names describe *behavior* (`stacked`, `cinematic`), not size (`large`, `medium`). Token names describe *role* (`accent`, `surface`), not the implementation value (`blue-500`). Boundary identifiers name the *surface* (`heroLayout`), not the primitive type (`mainBoundary`).

### State names

Good state names describe behavior:

- `stacked`
- `split`
- `cinematic`
- `quiet`
- `dense`
- `reading`

Weak state names describe only scale:

- `small`
- `medium`
- `large`

Use scale names only when the surface truly has no stronger semantic distinction.

### Token names

Good token names describe role:

- `surface`
- `accent`
- `outline-muted`
- `space-section`
- `radius-card`

Weak token names describe implementation:

- `blue-500`
- `padding-lg`
- `card-shadow-2`

### Boundary names

Boundary identifiers should describe the surface domain:

- `heroLayout`
- `featureDensity`
- `narrativeMode`
- `ambientMotion`

Avoid IDs that merely restate the primitive type:

- `mainBoundary`
- `layoutBoundary`

---

## Example shapes

> Working code for each of the four primitives. Skim if you're getting the feel for the shapes; copy when you're authoring a real surface.

### Boundary

```ts
import { Boundary } from '@czap/core';

export const heroLayout = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'stacked'],
    [760, 'split'],
    [1180, 'cinematic'],
  ] as const,
  hysteresis: 40,
});
```

### Token

```ts
import { Token } from '@czap/core';

export const accent = Token.make({
  name: 'accent',
  category: 'color',
  axes: ['theme'] as const,
  values: {
    light: '#0b6bcb',
    dark: '#7dd3fc',
  },
  fallback: '#0b6bcb',
});
```

### Theme

```ts
import { Theme } from '@czap/core';

export const brandTheme = Theme.make({
  name: 'brand',
  variants: ['light', 'dark'] as const,
  tokens: {
    accent: {
      light: '#0b6bcb',
      dark: '#7dd3fc',
    },
  },
  meta: {
    light: { label: 'Light', mode: 'light' },
    dark: { label: 'Dark', mode: 'dark' },
  },
});
```

### Style

```ts
import { Style } from '@czap/core';
import { heroLayout } from './boundaries.js';

export const heroShell = Style.make({
  boundary: heroLayout,
  base: {
    properties: {
      display: 'grid',
      gap: 'var(--czap-space-section)',
    },
  },
  states: {
    stacked: {
      properties: {
        gridTemplateColumns: '1fr',
      },
    },
    split: {
      properties: {
        gridTemplateColumns: '1.1fr 0.9fr',
      },
    },
    cinematic: {
      properties: {
        gridTemplateColumns: '1.2fr 0.8fr',
        minHeight: '80vh',
      },
    },
  },
});
```

---

## File organization

> One file per primitive type at the surface level: `boundaries.ts`, `tokens.ts`, `themes.ts`, `styles.ts`. The Vite plugin expects this shape; you can deviate, but you'll lose the convention-driven HMR behavior.

The cleanest repo-level shape is convention-driven:

- `boundaries.ts`
- `tokens.ts`
- `themes.ts`
- `styles.ts`

The Vite plugin already expects this shape, and the resolver pipeline is built around it.

Recommended section-level layout:

```text
src/
  boundaries.ts
  tokens.ts
  themes.ts
  styles.ts
  hero.css
  features.css
  narrative.css
```

This works because authored definitions live in TypeScript, while emitted style consumers can stay in CSS with `@token`, `@theme`, `@style`, and `@quantize` blocks.

---

## Authoring surfaces in CSS

> CSS files reference your authored definitions through `@token`, `@theme`, `@style`, and `@quantize` blocks; the Vite plugin compiles those down at build/HMR time. This is how a stylesheet stays declarative while still reading from one canonical state vocabulary.

The Vite layer transforms authored blocks through four phases:

1. `@token`
2. `@theme`
3. `@style`
4. `@quantize`

CSS can stay declarative while still referencing authored definitions.

Example:

```css
@token accent {
  color: var(--czap-accent);
}

@theme brand {
  color: var(--czap-accent);
}

@style heroShell {
  cinematic {
    min-height: 80vh;
  }
}

@quantize heroLayout {
  stacked {
    gap: 1rem;
  }
  cinematic {
    gap: 3rem;
  }
}
```

The value of this model is that authored semantics remain centralized in the definition files, while CSS remains the expression layer.

---

## Outputs as contracts

> One authored state map drives many output targets (CSS variable, GLSL uniform, ARIA attribute) without you authoring the state logic separately for each. Define state once at the boundary; let compilers project it.

A single authored state may need to drive several targets:

- CSS custom properties
- shader uniforms
- ARIA attributes
- stream or media behavior

Do not duplicate the state logic for each target. Instead:

- let the boundary define state
- let compilers project the state into each target

The projection is content-addressed: the boundary's FNV-1a hash (over the canonical CBOR encoding) is the contract every compiler reads from. CSS, GLSL, and ARIA can't drift because they're emitted from the same canonical definition.

---

## Authoring for accessibility

> Boundaries that drive layout drive ARIA from the same definition. Author your `aria-expanded` / `aria-hidden` per state once on the boundary; the screen reader sees the same state your styles do, no second sync to maintain.

Boundaries that drive layout almost always drive an a11y story too. The ARIA compiler (`packages/compiler/src/aria.ts`) takes the same boundary and a per-state attribute map; it validates that every key starts with `aria-` or is exactly `role`, drops anything else with a diagnostic warning, and emits the attributes via `applyBoundaryState` (`packages/astro/src/runtime/boundary.ts`) onto the same satellite element the CSS variable lives on. So the screen reader and the styled element observe the same boundary identity.

Two concrete patterns:

```ts
// A disclosure surface: states correspond to expanded/collapsed; aria-expanded
// flips with the layout.
import { ARIACompiler } from '@czap/compiler';
import { disclosureBoundary } from './boundaries.js';

const aria = ARIACompiler.compile(disclosureBoundary, {
  collapsed: { 'aria-expanded': 'false', 'aria-hidden': 'true' },
  expanded: { 'aria-expanded': 'true', 'aria-hidden': 'false' },
});
```

```ts
// A reduced-motion-aware surface: when motionTier is 'none', the boundary
// pins to a still state and the live-region announces transitions instead of
// animating them.
import { Boundary } from '@czap/core';
import { motionTierFromCapabilities } from '@czap/detect';

export const heroMotion = Boundary.make({
  input: 'motion.tier',
  at: [
    [0, 'still'], // motionTier === 'none'
    [1, 'subtle'],
    [2, 'full'],
  ] as const,
});
```

A few rules of thumb:

- The state vocabulary is the contract. Whatever names appear in the boundary are the same names the ARIA author keys into; if you rename a state, both surfaces update from the one definition. There is no separate "ARIA state" concept to keep in sync.
- Pair a `motionTier`-driven boundary with `prefers-reduced-motion`. `motionTierFromCapabilities` (`packages/detect/src/tiers.ts`) returns `'none'` unconditionally when `caps.prefersReducedMotion` is true, regardless of GPU tier — author for the `'none'` case explicitly (still imagery, `aria-live="polite"` announcements for state transitions, no transform/translate animations).
- Never stash arbitrary attributes through the ARIA compiler. The validator drops anything that isn't `aria-*` or `role`; that's intentional. Use `data-*` attributes via your own template if you need extra DOM hooks.
- Boundary state is applied as `data-czap-state` on the satellite, so CSS attribute selectors keyed on `[data-czap-state="expanded"]` and ARIA attributes resolve from the same evaluator on the same element. There is no two-write race; both are written synchronously inside `applyBoundaryState`.

---

## Runtime escalation

> Default to CSS; reach for a client directive only when the surface needs to observe live signals; reach for a worker / WASM / GPU only when the visual meaning depends on it. Author the surface so it stays valid even when the host runs at the lowest tier.

A surface should always choose the cheapest runtime that preserves its intent.

Authoring rule:

- start with CSS as the default expression target
- add directive runtime only for behavior that truly requires observation or coordination
- add worker or GPU paths only for effects whose meaning depends on them

Do not author everything as if the richest runtime will always be present.

The authored design should remain valid under capability ceilings.

---

## What not to do

> Five common mistakes that make the system fight you instead of working with you. The fix for each is "move that decision back to the boundary / token / theme layer where it belongs."

### Do not author too many states

If a surface has many states, authors stop thinking semantically and start encoding implementation noise.

### Do not use thresholds as names

`state-768` is not a real authored concept.

### Do not hide tokens inside per-section styles

If a value belongs to the design language, it should be a token.

### Do not duplicate the same boundary idea in multiple files

One semantic partition should have one authoritative definition.

### Do not escalate runtime cost casually

The visual effect should justify the runtime.

---

## Working definition

Authoring in LiteShip means:

- defining semantic partitions of reality
- naming the states those partitions produce
- mapping those states to intentional outputs
- letting the host and runtime choose the cheapest valid execution path
