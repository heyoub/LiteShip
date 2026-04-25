/**
 * CSS Compiler -- `BoundaryDef` to `@container` query rules.
 *
 * Takes a boundary definition and state-specific CSS property maps,
 * generates `@container` query rules using boundary thresholds as
 * breakpoints.
 *
 * @module
 */

import type { Boundary, StateUnion } from '@czap/core';
import { inferSyntax } from './css-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single CSS rule — a selector plus a property map.
 *
 * Emitted inside a {@link CSSContainerRule} by {@link CSSCompiler.compile}.
 */
export interface CSSRule {
  /** CSS selector (e.g. `.card`, `[data-state="open"]`). */
  readonly selector: string;
  /** Flat property map applied inside the selector block. */
  readonly properties: Record<string, string>;
}

/**
 * A `@container` at-rule grouping rules that apply at a given container query.
 *
 * Produced per-state by {@link CSSCompiler.compile}; the container `name`
 * is derived from the boundary's `input` identifier.
 */
export interface CSSContainerRule {
  /** Container name (sanitized from the boundary input). */
  readonly name: string;
  /** Condition text like `(width >= 768px)`. */
  readonly query: string;
  /** Rules evaluated inside the container query. */
  readonly rules: readonly CSSRule[];
}

/**
 * Output of {@link CSSCompiler.compile}.
 *
 * `raw` is the serialized form of `containerRules`, pre-joined so most
 * consumers can inject it directly into a `<style>` element without a
 * separate serialize call.
 */
export interface CSSCompileResult {
  /** Structured container rules, one per non-empty state. */
  readonly containerRules: readonly CSSContainerRule[];
  /** Pre-serialized CSS text ready for injection. */
  readonly raw: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a `Record<string, string>` of CSS properties into a declaration block.
 */
function serializeDeclarations(props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `  ${k}: ${v};`).join('\n');
}

/**
 * Serialize a single CSSRule into its textual form.
 */
function serializeRule(rule: CSSRule): string {
  const decls = serializeDeclarations(rule.properties);
  if (!decls) return `${rule.selector} {}`;
  return `${rule.selector} {\n${decls}\n}`;
}

/**
 * Build the `@container` query string for a given state index based on
 * the boundary thresholds array.
 *
 * For N states and N-1 thresholds (first threshold is always 0 and
 * is implicitly the lower bound):
 *   - First state:  `(width < thresholds[1])`
 *   - Middle state: `(width >= thresholds[i]) and (width < thresholds[i+1])`
 *   - Last state:   `(width >= thresholds[last])`
 *
 * The thresholds array from BoundaryDef has length = `states.length`.
 * `thresholds[0]` is the start of the first state, `thresholds[1]` is
 * the boundary between state 0 and state 1, etc.
 */
function buildContainerQuery(thresholds: readonly number[], stateIndex: number, stateCount: number): string {
  if (stateCount === 1) return '(width >= 0px)';

  // The threshold at index `i` is the lower bound for state `i`.
  // State 0: width < thresholds[1]
  // State i (middle): width >= thresholds[i] and width < thresholds[i+1]
  // State last: width >= thresholds[last]

  if (stateIndex === 0) {
    const upper = thresholds[1];
    return `(width < ${upper}px)`;
  }

  if (stateIndex === stateCount - 1) {
    const lower = thresholds[stateIndex];
    return `(width >= ${lower}px)`;
  }

  const lower = thresholds[stateIndex];
  const upper = thresholds[stateIndex + 1];
  return `(width >= ${lower}px) and (width < ${upper}px)`;
}

// ---------------------------------------------------------------------------
// CSSCompiler
// ---------------------------------------------------------------------------

/**
 * Compile a boundary definition and per-state CSS property maps into
 * `@container` query rules.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { CSSCompiler } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const,
 *   thresholds: [0, 768],
 * });
 * const result = CSSCompiler.compile(boundary, {
 *   sm: { 'font-size': '14px' },
 *   lg: { 'font-size': '18px' },
 * }, '.card');
 * console.log(result.raw);
 * // @container width (width < 768px) { .card { font-size: 14px; } }
 * // @container width (width >= 768px) { .card { font-size: 18px; } }
 * ```
 *
 * @param boundary - The boundary definition with states and thresholds
 * @param states   - Per-state CSS property maps
 * @param selector - Optional CSS selector (defaults to `.czap-boundary`)
 * @returns A {@link CSSCompileResult} with structured rules and raw CSS text
 */
function compile<B extends Boundary.Shape>(
  boundary: B,
  states: { readonly [S in StateUnion<B> & string]?: Record<string, string> },
  selector?: string,
): CSSCompileResult {
  const sel = selector ?? '.czap-boundary';
  const containerName = boundary.input.replace(/[^a-zA-Z0-9_-]/g, '-');
  // The state map is keyed by StateUnion<B> & string literals; treat the runtime array
  // as that keyed shape so indexing with boundary.states[i] is exact.
  const stateNames: ReadonlyArray<StateUnion<B> & string> = boundary.states as ReadonlyArray<StateUnion<B> & string>;
  const thresholds = boundary.thresholds as readonly number[];

  const containerRules: CSSContainerRule[] = [];

  for (let i = 0; i < stateNames.length; i++) {
    const stateName = stateNames[i]!;
    const props = states[stateName];
    if (!props || Object.keys(props).length === 0) continue;

    const query = buildContainerQuery(thresholds, i, stateNames.length);
    const rule: CSSRule = { selector: sel, properties: props };

    containerRules.push({
      name: containerName,
      query,
      rules: [rule],
    });
  }

  const raw = serializeContainerRules(containerRules);
  return { containerRules, raw };
}

/**
 * Serialize a {@link CSSCompileResult} back to valid CSS text.
 *
 * @example
 * ```ts
 * import { CSSCompiler } from '@czap/compiler';
 *
 * const result = CSSCompiler.compile(boundary, states);
 * const css = CSSCompiler.serialize(result);
 * document.head.appendChild(
 *   Object.assign(document.createElement('style'), { textContent: css }),
 * );
 * ```
 *
 * @param result - The compile result to serialize
 * @returns A string of valid CSS text
 */
function serialize(result: CSSCompileResult): string {
  return serializeContainerRules(result.containerRules);
}

function serializeContainerRules(containerRules: readonly CSSContainerRule[]): string {
  const blocks: string[] = [];

  for (const cr of containerRules) {
    const innerRules = cr.rules.map(serializeRule).join('\n');
    blocks.push(`@container ${cr.name} ${cr.query} {\n${innerRules}\n}`);
  }

  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// @property Registration
// ---------------------------------------------------------------------------

// COLOR_RE, NUMBER_RE, and inferSyntax are imported from ./css-utils.js

function initialValueForSyntax(syntax: string): string {
  switch (syntax) {
    case '<color>':
      return 'transparent';
    case '<length>':
      return '0px';
    case '<time>':
      return '0s';
    case '<angle>':
      return '0deg';
    case '<percentage>':
      return '0%';
    case '<frequency>':
      return '0Hz';
    default:
      return '0';
  }
}

/**
 * Scan all CSS values across all states and emit `@property` declarations
 * for properties whose values parse as numbers or colors. This enables
 * GPU-interpolated transitions on custom properties.
 *
 * @example
 * ```ts
 * import { CSSCompiler } from '@czap/compiler';
 *
 * const states = {
 *   sm: { '--card-bg': '#ffffff', '--card-radius': '4px' },
 *   lg: { '--card-bg': '#f0f0f0', '--card-radius': '8px' },
 * };
 * const registrations = CSSCompiler.generatePropertyRegistrations(states);
 * // @property --card-bg { syntax: "<color>"; inherits: true; initial-value: transparent; }
 * // @property --card-radius { syntax: "<length>"; inherits: true; initial-value: 0px; }
 * ```
 *
 * @param states - Per-state CSS property maps to scan for custom properties
 * @returns A string of `@property` declarations, or empty string if none found
 */
export function generatePropertyRegistrations(states: Record<string, Record<string, string>>): string {
  const propSyntax = new Map<string, string>();

  for (const stateProps of Object.values(states)) {
    for (const [prop, value] of Object.entries(stateProps)) {
      if (!prop.startsWith('--')) continue;
      if (propSyntax.has(prop)) continue;
      const syntax = inferSyntax(value);
      if (syntax) propSyntax.set(prop, syntax);
    }
  }

  if (propSyntax.size === 0) return '';

  const blocks: string[] = [];
  for (const [prop, syntax] of propSyntax) {
    const initial = initialValueForSyntax(syntax);
    blocks.push(`@property ${prop} {\n  syntax: "${syntax}";\n  inherits: true;\n  initial-value: ${initial};\n}`);
  }
  return blocks.join('\n\n');
}

/**
 * CSS compiler namespace.
 *
 * Compiles boundary definitions into `@container` query rules, serializes
 * compile results to CSS text, and generates `@property` registrations for
 * custom properties that enable GPU-interpolated transitions.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { CSSCompiler } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const,
 *   thresholds: [0, 768],
 * });
 * const result = CSSCompiler.compile(boundary, {
 *   sm: { '--gap': '8px' }, lg: { '--gap': '24px' },
 * });
 * const css = CSSCompiler.serialize(result);
 * const props = CSSCompiler.generatePropertyRegistrations({
 *   sm: { '--gap': '8px' }, lg: { '--gap': '24px' },
 * });
 * ```
 */
export const CSSCompiler = { compile, serialize, generatePropertyRegistrations } as const;
