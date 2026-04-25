/**
 * ARIA Compiler -- `BoundaryDef` to accessibility attribute maps.
 *
 * Takes a boundary definition and state-specific ARIA attribute maps,
 * returns both the full `state -> attributes` mapping and the attributes
 * for the current active state.
 *
 * @module
 */

import { Diagnostics } from '@czap/core';
import type { Boundary, StateUnion } from '@czap/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Output of {@link ARIACompiler.compile}.
 *
 * `stateAttributes` is the full lookup keyed by state, ready for direct
 * spreading when the boundary transitions. `currentAttributes` is a
 * convenience pre-resolved for the active state so SSR can emit it
 * immediately without duplicating the lookup.
 */
export interface ARIACompileResult<S extends string = string> {
  /** Validated per-state ARIA attribute maps. */
  readonly stateAttributes: Record<S, Record<string, string>>;
  /** Attributes for the active state at compile time. */
  readonly currentAttributes: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a key looks like a valid ARIA attribute or role.
 * Accepts any aria-* prefixed attribute or the exact string 'role'.
 */
function isValidAriaKey(key: string): boolean {
  return key.startsWith('aria-') || key === 'role';
}

/**
 * Filter and validate ARIA attributes, keeping only valid ones.
 * Warns via Diagnostics when invalid keys are dropped.
 */
function validateAttributes(attrs: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (isValidAriaKey(key)) {
      result[key] = value;
    } else {
      Diagnostics.warn({
        source: 'czap/compiler.aria',
        code: 'invalid-aria-key',
        message: `Attribute "${key}" is not a valid ARIA key (expected aria-* or role) and was dropped.`,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ARIACompiler
// ---------------------------------------------------------------------------

/**
 * Compile a boundary definition and per-state ARIA attribute maps into a
 * validated result containing the full state-to-attributes mapping and the
 * attributes for the current active state.
 *
 * Only valid ARIA attributes (`aria-*`) and `role` are retained; all other
 * keys are dropped and trigger a diagnostic warning.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { ARIACompiler } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['collapsed', 'expanded'] as const,
 *   thresholds: [0, 768],
 * });
 * const result = ARIACompiler.compile(boundary, {
 *   collapsed: { 'aria-expanded': 'false', 'aria-label': 'Show more' },
 *   expanded: { 'aria-expanded': 'true', 'aria-label': 'Show less' },
 * }, 'collapsed');
 * console.log(result.currentAttributes);
 * // { 'aria-expanded': 'false', 'aria-label': 'Show more' }
 * ```
 *
 * @param boundary     - The boundary definition with states
 * @param states       - Per-state ARIA attribute maps
 * @param currentState - The currently active state
 * @returns An {@link ARIACompileResult} with validated state attributes
 */
function compile<B extends Boundary.Shape>(
  boundary: B,
  states: { [S in StateUnion<B> & string]: Record<string, string> },
  currentState: StateUnion<B>,
): ARIACompileResult<StateUnion<B> & string> {
  const stateNames: readonly (StateUnion<B> & string)[] = boundary.states as readonly (StateUnion<B> & string)[];

  // Populate a fully-keyed record by iterating boundary.states; each key is
  // a narrow state literal, so the accumulator is typed correctly from the
  // start without an empty-initializer cast.
  const stateAttributes: Record<StateUnion<B> & string, Record<string, string>> = Object.create(null);
  for (const stateName of stateNames) {
    const raw = states[stateName];
    stateAttributes[stateName] = raw ? validateAttributes(raw) : {};
  }

  // StateUnion<B> already extends string via Boundary.Shape's non-empty-tuple S constraint.
  const currentAttributes = stateAttributes[currentState] ?? {};

  return { stateAttributes, currentAttributes };
}

/**
 * ARIA compiler namespace.
 *
 * Compiles boundary definitions into validated ARIA attribute maps keyed by
 * state. Invalid attribute keys (not `aria-*` or `role`) are filtered and
 * trigger a diagnostic warning. Returns both the full state mapping and the
 * attributes for the current active state.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { ARIACompiler } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const,
 *   thresholds: [0, 768],
 * });
 * const result = ARIACompiler.compile(boundary, {
 *   sm: { 'aria-hidden': 'true' },
 *   lg: { 'aria-hidden': 'false' },
 * }, 'sm');
 * const attrs = result.currentAttributes;
 * // { 'aria-hidden': 'true' }
 * ```
 */
export const ARIACompiler = { compile } as const;
