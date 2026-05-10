# LiteShip for Astro static sites

## Purpose

How to think with LiteShip when building visually rich Astro websites. The CZAP engine evaluates boundaries, casts styles, and keeps the working deck trim; you still install and import `@czap/*` packages.

Naming: [GLOSSARY.md](./GLOSSARY.md).

This is not a migration guide and not a product comparison. It's a mental model for authoring; for the concrete shape of the authoring loop (what you actually type and what comes out), read [AUTHORING-MODEL.md](./AUTHORING-MODEL.md) alongside this doc.

The right question is not:

- "How do I rewrite React components?"

The right questions are:

- "What signals matter?"
- "What discrete states should exist?"
- "What outputs should those states drive?"
- "What is the cheapest runtime that can deliver the effect?"

LiteShip is strongest when the site is visual, adaptive, media-aware, and mostly about presentation rather than application logic.

---

## Core idea

The CZAP engine partitions continuous signals into discrete visual bearings, with hysteresis at every threshold to prevent flicker.

Reality is continuous:

- viewport width
- scroll position
- device capability
- buffer occupancy
- network conditions
- audio amplitude
- time

The UI should usually not be continuous. It should move through named, intentional states:

- `compact`
- `comfortable`
- `immersive`
- `quiet`
- `loud`
- `preview`
- `full`

That is the center of the system:

`signal -> boundary -> state -> outputs`

Once this is clear, the rest of the architecture follows.

---

## The authoring model

### 1. Signals

A signal is a measurable input.

Examples:

- `viewport.width`
- `viewport.height`
- `scroll.y`
- `audio.level`
- `network.effectiveType`

Signals are not presentation. They are observations.

If React tends to make authors think in terms of component-local state, LiteShip starts earlier, at the level of environment and perception.

### 2. Boundaries

A boundary defines where one named state becomes another.

This is not raw breakpoint logic. It is a semantic partition of experience.

Example:

```ts
Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'stacked'],
    [760, 'split'],
    [1180, 'cinematic'],
  ] as const,
  hysteresis: 40,
});
```

A good boundary names experiences, not numbers.

Bad:

- `small`
- `medium`
- `large`

Better:

- `stacked`
- `reading`
- `gallery`

The state names should describe how the composition behaves.

### 3. Tokens

Tokens are the material system.

They hold:

- color
- spacing
- radius
- shadow
- typography
- opacity
- timing

Tokens belong to the design language, not to a single section.

If boundaries answer "what state are we in?", tokens answer "what are this brand system's materials?"

### 4. Themes

Themes are coordinated token value maps.

They answer:

- what changes between light and dark
- what changes between neutral and campaign palettes
- what changes between seasonal or narrative variants

Themes are not ad-hoc class switches. They are explicit token-space variants.

### 5. Styles

Styles define what each named bearing casts: the properties projected when that state is active.

A style is where the author says:

- in `stacked`, use these properties
- in `split`, use these properties
- in `cinematic`, use these properties

This is the authored visual behavior.

The important shift is:

- React often computes UI by re-running component logic
- LiteShip selects UI by choosing named, authored outputs

That produces a more deliberate visual system.

### 6. Satellites

A satellite is the shell that binds authored definitions to real DOM.

For Astro, this matters a lot. Astro wants HTML first. LiteShip fits that posture because the shell is fundamentally DOM-and-attribute based, not virtual-DOM dependent.

Satellites are the bridge between:

- authored boundaries, tokens, themes, and styles
- runtime detection and hydration
- the actual DOM that ships to the browser

### 7. Outputs

The same state can cast to multiple projection targets:

- CSS
- GLSL
- WGSL
- ARIA
- AI / tool manifests

A boundary is not "for CSS only." It is a shared semantic contract, one rigged partition that multiple runtimes consume.

That means a single authored decision can drive:

- layout shifts
- shader uniforms
- accessibility labels
- streamed content behavior

without duplicating the logic in each layer. By the way, the boundary's content address (FNV-1a of the canonical CBOR encoding) means the same definition produces byte-identical IDs across runtimes. CSS, GLSL, and ARIA read from that one hash; the partition is shared, not duplicated.

---

## The runtime model

The working deck should stay as light as the workload allows.

This is the opposite of a framework that raises every sail at the dock and reefs them later when something tears.

The intended order is:

1. pure HTML and CSS if possible
2. client directive only where needed
3. off-deck work only where justified
4. GPU or media pipelines only where the visual payoff warrants it

This matters most for static websites because a rich site is still often a trim-sensitive site. The homepage can be visually ambitious without turning into a JavaScript app.

LiteShip is trimmed around that constraint.

---

## The Astro model

Astro is a strong host for LiteShip because Astro already assumes:

- server-rendered HTML first
- limited client runtime
- selective enhancement

In practice, the Astro side of the model is:

1. render semantic HTML
2. attach `data-czap-*` meaning to shells
3. let CSS and compiled outputs carry as much of the experience as possible
4. use directives where the experience truly needs runtime adaptation

That is why the combination makes sense for static visual sites.

Astro gives the document. LiteShip gives the adaptive visual logic.

---

## How to think about sections

Do not start from implementation units. Start from perceptual units.

A good authored section usually has:

- one dominant signal
- one or two boundaries
- a small number of named states
- a clear material system
- a clear cheapest-valid runtime

Examples:

### Hero

Questions:

- When does the hero stack?
- When does it become panoramic?
- When does motion become decorative rather than essential?
- When does the background become GPU-worthy instead of CSS-worthy?

### Feature grid

Questions:

- When is it a list?
- When is it a grid?
- When does density change?
- Which tokens shift to preserve hierarchy?

### Narrative section

Questions:

- What are the reading states?
- What changes under scroll?
- Which changes are CSS-only and which require runtime coordination?

### Streamed or generative block

Questions:

- What is the buffer state?
- What is the stable presentation state?
- What should happen under slow arrival or partial content?

Each section is best understood as a state machine with authored outputs, not as a tree of reactive components.

---

## What replaces React thinking

The replacement is not "no components." The replacement is a different center of gravity.

React centers:

- component identity
- render cycles
- local state
- prop flow

LiteShip centers:

- signals
- boundaries
- named states
- compiled outputs
- capability-aware runtime selection

That means the main design object is no longer "the component." It is "the authored behavior of a surface."

This is a good fit for brand sites, editorial sites, launch pages, and other highly visual work where the page is choreography more than application.

---

## A practical theory of rich static sites

For this class of site, every section should answer five questions:

### 1. What is the signal?

What is the real-world input that matters?

### 2. What are the named states?

What are the distinct modes the section can occupy?

### 3. What outputs change with state?

What changes in:

- layout
- typography
- color
- depth
- motion
- media
- accessibility

### 4. What is the cheapest runtime that can express it?

Can CSS do it? Does it need directive runtime? Does it need a worker? Does it need GPU?

### 5. What happens on weak devices?

What is the graceful version of the same experience?

This is the part many systems treat as fallback. In LiteShip, it is part of the authored model.

---

## Capability and taste

LiteShip is not only about trim on the working line. It is also about taste.

A visually rich site should not merely "respond." It should choose.

The system is strongest when authored with:

- few but meaningful states
- distinct names
- intentional escalation of runtime cost
- a coherent token system
- motion that reflects meaning, not decoration

The best outcome is not a maximal runtime. The best outcome is a small set of well-named states delivering the right output at the lowest necessary cost.

---

## What this means for you

For a solo builder working with many agents, the system is usable if the agents share one mental model:

- define signals first
- define boundaries second
- define tokens and themes as the material language
- define styles as named-state outputs
- let Astro own the document
- let LiteShip own adaptive visual behavior
- prefer the cheapest runtime that preserves intent

If the agents start from React habits, they will ask the wrong questions. If they start from signals, boundaries, and authored states, they will usually generate much better results.

---

## Working definition

For visually rich Astro sites, LiteShip is best understood as:

> a signal-aware authored state system that casts named-state outputs into the cheapest runtime capable of delivering them.
