/**
 * StyleDef -- adaptive style primitive for constraint-based rendering.
 *
 * A style binds a base style layer to optional boundary states with
 * per-state overrides and transitions. Content-addressed via FNV-1a.
 *
 * @module
 */

import type { ContentAddress, Millis } from './brands.js';
import type { Boundary } from './boundary.js';
import type { StateUnion } from './type-utils.js';
import { CanonicalCbor } from './cbor.js';
import { fnv1aBytes } from './fnv.js';
import { CzapValidationError } from './validation-error.js';

/** Single `box-shadow` layer — compiled into a space-separated CSS value by {@link Style.tap}. */
export interface ShadowLayer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread?: number;
  readonly color: string;
  readonly inset?: boolean;
}

/**
 * One layer of a {@link Style}: a flat property bag plus optional pseudo
 * selectors (`:hover`, `::before`, …) and structured `box-shadow` layers.
 */
export interface StyleLayer {
  readonly properties: Record<string, string>;
  readonly pseudo?: Record<string, Record<string, string>>;
  readonly boxShadow?: readonly ShadowLayer[];
}

interface StyleDef<B extends Boundary.Shape = Boundary.Shape> {
  readonly _tag: 'StyleDef';
  readonly _version: 1;
  readonly id: ContentAddress;
  readonly boundary?: B;
  readonly base: StyleLayer;
  readonly states?: { readonly [S in StateUnion<B> & string]?: StyleLayer };
  readonly transition?: {
    readonly duration: Millis;
    readonly easing?: string;
    readonly properties?: readonly string[];
  };
}

interface StyleFactory {
  make<B extends Boundary.Shape>(config: {
    readonly boundary?: B;
    readonly base: StyleLayer;
    readonly states?: { readonly [S in StateUnion<B> & string]?: StyleLayer };
    readonly transition?: StyleDef['transition'];
  }): StyleDef<B>;
}

function deterministicId<B extends Boundary.Shape>(
  boundary: B | undefined,
  base: StyleLayer,
  states: StyleDef<B>['states'],
  transition: StyleDef['transition'] | undefined,
): ContentAddress {
  return fnv1aBytes(
    CanonicalCbor.encode({
      _tag: 'StyleDef',
      _version: 1,
      boundaryId: boundary?.id ?? null,
      base,
      states: states ?? {},
      transition: transition ?? null,
    }),
  );
}

/**
 * Deep merge two style layers: properties spread, pseudo merge per selector, boxShadow concat.
 *
 * Override properties win over base. Pseudo-element selectors are merged per
 * key. Box shadows are concatenated (base first, then override).
 *
 * @example
 * ```ts
 * const base = { properties: { color: 'red', padding: '4px' } };
 * const override = { properties: { color: 'blue', margin: '8px' } };
 * const merged = Style.mergeLayers(base, override);
 * // merged.properties === { color: 'blue', padding: '4px', margin: '8px' }
 * ```
 */
function _mergeLayers(base: StyleLayer, override: StyleLayer): StyleLayer {
  const properties = { ...base.properties, ...override.properties };

  let pseudo: Record<string, Record<string, string>> | undefined;
  if (base.pseudo || override.pseudo) {
    const allSelectors = new Set([...Object.keys(base.pseudo ?? {}), ...Object.keys(override.pseudo ?? {})]);
    pseudo = {};
    for (const sel of allSelectors) {
      pseudo[sel] = { ...base.pseudo?.[sel], ...override.pseudo?.[sel] };
    }
  }

  let boxShadow: readonly ShadowLayer[] | undefined;
  if (base.boxShadow || override.boxShadow) {
    boxShadow = [...(base.boxShadow ?? []), ...(override.boxShadow ?? [])];
  }

  return {
    properties,
    ...(pseudo !== undefined ? { pseudo } : {}),
    ...(boxShadow !== undefined ? { boxShadow } : {}),
  };
}

/**
 * Resolve a style to a flat `Record<string, string>` for the given state.
 *
 * Merges base layer with the state-specific override (if any), flattens
 * pseudo selectors and box-shadow into the result map.
 *
 * @example
 * ```ts
 * const style = Style.make({
 *   base: { properties: { color: 'black' } },
 *   states: { dark: { properties: { color: 'white' } } },
 * });
 * const props = Style.tap(style, 'dark');
 * // props === { color: 'white' }
 * const baseProps = Style.tap(style);
 * // baseProps === { color: 'black' }
 * ```
 */
function _tap(style: StyleDef, state?: string): Record<string, string> {
  let layer = style.base;

  if (state && style.states) {
    const stateLayer = style.states[state];
    if (stateLayer) {
      layer = _mergeLayers(layer, stateLayer);
    }
  }

  const result: Record<string, string> = { ...layer.properties };

  if (layer.pseudo) {
    for (const [sel, props] of Object.entries(layer.pseudo)) {
      for (const [prop, val] of Object.entries(props)) {
        result[`${sel}::${prop}`] = val;
      }
    }
  }

  if (layer.boxShadow && layer.boxShadow.length > 0) {
    result['box-shadow'] = layer.boxShadow
      .map((s) => {
        const parts: string[] = [];
        if (s.inset) parts.push('inset');
        parts.push(`${s.x}px`, `${s.y}px`, `${s.blur}px`);
        if (s.spread !== undefined) parts.push(`${s.spread}px`);
        parts.push(s.color);
        return parts.join(' ');
      })
      .join(', ');
  }

  return result;
}

/**
 * Style namespace -- adaptive style primitive for constraint-based rendering.
 *
 * Bind base styles to optional boundary states with per-state overrides and
 * CSS transitions. Resolve to flat property maps for any given state.
 *
 * @example
 * ```ts
 * import { Boundary, Style } from '@czap/core';
 *
 * const bp = Boundary.make({ input: 'viewport.width', at: [[0, 'sm'], [768, 'lg']] });
 * const style = Style.make({
 *   boundary: bp,
 *   base: { properties: { 'font-size': '14px' } },
 *   states: { lg: { properties: { 'font-size': '18px' } } },
 *   transition: { duration: Millis(200) },
 * });
 * const resolved = Style.tap(style, 'lg');
 * // resolved === { 'font-size': '18px' }
 * ```
 */
export const Style: StyleFactory & {
  tap: typeof _tap;
  mergeLayers: typeof _mergeLayers;
} = {
  /**
   * Create a new StyleDef from a configuration object.
   *
   * Validates that state keys match the boundary's states (if a boundary is
   * provided). The resulting object is frozen and content-addressed.
   *
   * @example
   * ```ts
   * const style = Style.make({
   *   base: { properties: { display: 'flex', gap: '8px' } },
   * });
   * // style._tag === 'StyleDef'
   * // style.id === 'fnv1a:...'
   * ```
   */
  make<B extends Boundary.Shape>(config: {
    readonly boundary?: B;
    readonly base: StyleLayer;
    readonly states?: { readonly [S in StateUnion<B> & string]?: StyleLayer };
    readonly transition?: StyleDef['transition'];
  }): StyleDef<B> {
    if (config.boundary && config.states) {
      const boundaryStates = config.boundary.states as readonly string[];
      const stateKeys = Object.keys(config.states);
      for (const key of stateKeys) {
        if (!boundaryStates.includes(key)) {
          throw new CzapValidationError(
            'Style.make',
            `state "${key}" does not match boundary states [${boundaryStates.join(', ')}]`,
          );
        }
      }
    }

    const id = deterministicId<B>(config.boundary, config.base, config.states, config.transition);

    const def: StyleDef<B> = {
      _tag: 'StyleDef',
      _version: 1,
      id,
      ...(config.boundary !== undefined ? { boundary: config.boundary } : {}),
      base: config.base,
      ...(config.states !== undefined ? { states: config.states } : {}),
      ...(config.transition !== undefined ? { transition: config.transition } : {}),
    };
    return Object.freeze(def);
  },
  tap: _tap,
  mergeLayers: _mergeLayers,
};

export declare namespace Style {
  /** Structural shape of a style definition parameterized by its governing {@link Boundary}. */
  export type Shape<B extends Boundary.Shape = Boundary.Shape> = StyleDef<B>;
}
