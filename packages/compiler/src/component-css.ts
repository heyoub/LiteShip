/**
 * Component CSS Compiler -- `ComponentDef` to `StyleCSSResult` with slot + satellite markers.
 *
 * Delegates to {@link StyleCSSCompiler} for the core style output, then
 * appends slot-marker styling and satellite container-type declarations so
 * mounted component instances automatically opt into container queries.
 *
 * @module
 */

import type { Component } from '@czap/core';
import type { StyleCSSResult } from './style-css.js';
import { StyleCSSCompiler } from './style-css.js';

// ---------------------------------------------------------------------------
// ComponentCSSCompiler
// ---------------------------------------------------------------------------

/**
 * Compile a {@link Component.Shape} into scoped CSS with slot and satellite
 * markers appended inside the component's `@layer` block.
 */
function compile(component: Component.Shape): StyleCSSResult {
  const base = StyleCSSCompiler.compile(component.styles, component.name);

  // Slot marker: children of [data-czap-slot] use display: contents to avoid
  // layout interference from the slot wrapper element.
  const slotRule = `[data-czap-slot] { display: contents; }`;

  // Satellite container: enables container queries on satellite-mounted instances.
  const satelliteRule = `[data-czap-satellite="${component.name}"] { container-type: inline-size; }`;

  // Append slot + satellite rules to the scoped output
  const scoped = [base.scoped, '', slotRule, '', satelliteRule].join('\n');

  // Append slot + satellite rules into the existing layer block produced by
  // StyleCSSCompiler instead of wrapping in a second independent block. This
  // prevents duplicate / mis-nested @layer declarations and preserves any
  // @container rules already emitted by the base compiler.
  const layers = base.layers
    ? base.layers.replace(/\}\s*$/, `\n  ${slotRule}\n\n  ${satelliteRule}\n}`)
    : `@layer czap.components {\n  ${slotRule}\n\n  ${satelliteRule}\n}`;

  return {
    scoped,
    layers,
    startingStyle: base.startingStyle,
  };
}

/**
 * Component CSS compiler namespace.
 *
 * Wraps {@link StyleCSSCompiler} with component-scoped conventions: children
 * inside `[data-czap-slot]` use `display: contents` so slotted content
 * inherits layout from the surrounding parent, and elements tagged
 * `[data-czap-satellite="<name>"]` get `container-type: inline-size` so
 * satellite-mounted instances participate in container queries.
 */
export const ComponentCSSCompiler = {
  /** Compile a component definition into scoped CSS with slot + satellite markers. */
  compile,
} as const;
