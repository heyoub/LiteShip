/**
 * Canvas rendering -- project a {@link CompositeState} onto an
 * `OffscreenCanvas` or `HTMLCanvasElement`.
 *
 * The default renderer reads a handful of well-known CSS variables from
 * `state.outputs.css` and paints a background/foreground fill. Pass a
 * custom {@link RenderFn} for full creative control.
 *
 * @module
 */

import type { CompositeState } from '@czap/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canvas surface accepted by {@link renderToCanvas}. */
export type Canvas2DTarget = OffscreenCanvas | HTMLCanvasElement;

/** 2D rendering context produced by {@link Canvas2DTarget}. */
export type RenderContext2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * Callback that paints a frame. Receives the 2D context, the composite
 * state for the current frame, and the canvas itself (useful for
 * dimension reads).
 */
export type RenderFn = (ctx: RenderContext2D, state: CompositeState, canvas: Canvas2DTarget) => void;

// ---------------------------------------------------------------------------
// Default render function
// ---------------------------------------------------------------------------

const defaultRenderFn: RenderFn = (ctx, state, canvas) => {
  const { css } = state.outputs;
  const width = canvas.width;
  const height = canvas.height;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Apply background from CSS vars if available
  const bg = css['--czap-background'] ?? css['--czap-bg'];
  if (typeof bg === 'string') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  // Apply foreground color
  const fg = css['--czap-foreground'] ?? css['--czap-fg'] ?? css['--czap-color'];
  if (typeof fg === 'string') {
    ctx.fillStyle = fg;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render CompositeState to an OffscreenCanvas.
 *
 * If no custom renderFn is provided, the default renderer applies
 * CSS vars from CompositeState.outputs.css as basic canvas fills.
 */
export function renderToCanvas(state: CompositeState, canvas: Canvas2DTarget, renderFn?: RenderFn): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas');

  const fn = renderFn ?? defaultRenderFn;
  fn(ctx, state, canvas);
}
