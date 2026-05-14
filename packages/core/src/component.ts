/**
 * ComponentDef -- adaptive component primitive for constraint-based rendering.
 *
 * A component binds a boundary, styles, and named slots into a single
 * content-addressed unit. Content-addressed via FNV-1a.
 *
 * @module
 */

import type { ContentAddress } from './brands.js';
import type { Boundary } from './boundary.js';
import type { Style } from './style.js';
import { CanonicalCbor } from './cbor.js';
import { fnv1aBytes } from './fnv.js';

/** Per-slot configuration on a component — whether the slot must be provided, plus optional description. */
export interface SlotConfig {
  readonly required: boolean;
  readonly description?: string;
}

interface ComponentDef<
  B extends Boundary.Shape = Boundary.Shape,
  SlotNames extends readonly string[] = readonly string[],
> {
  readonly _tag: 'ComponentDef';
  readonly _version: 1;
  readonly id: ContentAddress;
  readonly name: string;
  readonly boundary?: B;
  readonly styles: Style.Shape<B>;
  readonly slots: { readonly [K in SlotNames[number]]: SlotConfig };
  readonly defaultSlot?: SlotNames[number];
}

interface ComponentFactory {
  make<B extends Boundary.Shape, const SN extends readonly [string, ...string[]]>(config: {
    readonly name: string;
    readonly boundary?: B;
    readonly styles: Style.Shape<B>;
    readonly slots: { readonly [K in SN[number]]: SlotConfig };
    readonly defaultSlot?: SN[number];
  }): ComponentDef<B, SN>;
}

function deterministicId<SlotNames extends readonly string[]>(
  name: string,
  boundaryId: string | undefined,
  stylesId: string,
  slots: { readonly [K in SlotNames[number]]: SlotConfig },
  defaultSlot?: string,
): ContentAddress {
  return fnv1aBytes(
    CanonicalCbor.encode({
      _tag: 'ComponentDef',
      _version: 1,
      name,
      boundaryId: boundaryId ?? null,
      stylesId,
      slots,
      defaultSlot: defaultSlot ?? null,
    }),
  );
}

/**
 * Component — the content-addressed unit that binds a {@link Boundary}, a
 * {@link Style}, and named slots into a single declaration compilers can
 * target. The optional boundary gates style variants; the slots describe
 * the consumer-facing API.
 */
export const Component: ComponentFactory = {
  make<B extends Boundary.Shape, const SN extends readonly [string, ...string[]]>(config: {
    readonly name: string;
    readonly boundary?: B;
    readonly styles: Style.Shape<B>;
    readonly slots: { readonly [K in SN[number]]: SlotConfig };
    readonly defaultSlot?: SN[number];
  }): ComponentDef<B, SN> {
    const id = deterministicId<SN>(
      config.name,
      config.boundary?.id,
      config.styles.id,
      config.slots,
      config.defaultSlot,
    );

    const def: ComponentDef<B, SN> = {
      _tag: 'ComponentDef',
      _version: 1,
      id,
      name: config.name,
      ...(config.boundary !== undefined ? { boundary: config.boundary } : {}),
      styles: config.styles,
      slots: config.slots,
      ...(config.defaultSlot !== undefined ? { defaultSlot: config.defaultSlot } : {}),
    };
    return Object.freeze(def);
  },
};

export declare namespace Component {
  /** Structural shape of a component definition, parameterized by its boundary and slot names. */
  export type Shape<
    B extends Boundary.Shape = Boundary.Shape,
    SN extends readonly string[] = readonly string[],
  > = ComponentDef<B, SN>;
}
