# LiteShip authoring model

## Purpose

How to author with LiteShip: the CZAP engine's rigging surface, shipped as `@czap/*` packages.

Naming: [GLOSSARY.md](./GLOSSARY.md).

This is about construction, not migration. It assumes the mental model in [ASTRO-STATIC-MENTAL-MODEL.md](./ASTRO-STATIC-MENTAL-MODEL.md).

---

## The main authoring objects

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

When building a new surface, the clean order is:

1. name the signal
2. name the states
3. define the boundary
4. define the tokens
5. define the theme space
6. define the style outputs
7. decide the cheapest runtime that preserves intent

This order matters because it keeps authored behavior semantic.

If you start from CSS declarations, the system becomes accidental. If you start from signals and states, the system becomes legible.

---

## Naming rules

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

A single authored state may need to drive several targets:

- CSS custom properties
- shader uniforms
- ARIA attributes
- stream or media behavior

Do not duplicate the state logic for each target. Instead:

- let the boundary define state
- let compilers project the state into each target

This is what gives LiteShip coherence across presentation layers. By the way, the projection is content-addressed: the boundary's FNV-1a hash is the contract every compiler reads from. CSS, GLSL, and ARIA can't drift on each other because they're emitted from the same canonical definition.

---

## Runtime escalation

A surface should always choose the cheapest runtime that preserves its intent.

Authoring rule:

- start with CSS as the default expression target
- add directive runtime only for behavior that truly requires observation or coordination
- add worker or GPU paths only for effects whose meaning depends on them

Do not author everything as if the richest runtime will always be present.

The authored design should remain valid under capability ceilings.

---

## What not to do

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
