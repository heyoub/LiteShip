/**
 * Protocol types -- CellEnvelope, CellKind, CellMeta.
 *
 * These types form the wire-level protocol for cells in the czap system.
 * Every cell has a kind, content address, metadata, and value.
 *
 * @module
 */

import type { ContentAddress, HLC } from './brands.js';

/**
 * Discriminator tagging what a {@link CellEnvelope} carries — a boundary, a
 * discrete state, a target output (CSS/GLSL/WGSL/ARIA/AI), or one of the
 * other reactive shapes produced along the pipeline.
 */
export type CellKind =
  | 'boundary'
  | 'state'
  | 'output'
  | 'signal'
  | 'transition'
  | 'timeline'
  | 'compositor'
  | 'blend'
  | 'css'
  | 'glsl'
  | 'wgsl'
  | 'aria'
  | 'ai';

/** Protocol metadata attached to every {@link CellEnvelope}: HLC timestamps + monotonic version counter. */
export interface CellMeta {
  readonly created: HLC;
  readonly updated: HLC;
  readonly version: number;
}

/**
 * Wire-level envelope for a cell value: tagged by {@link CellKind}, identified
 * by its content address, stamped with {@link CellMeta}, carrying the typed
 * payload in `value`.
 */
export interface CellEnvelope<K extends CellKind = CellKind, T = unknown> {
  readonly kind: K;
  readonly id: ContentAddress;
  readonly meta: CellMeta;
  readonly value: T;
}
