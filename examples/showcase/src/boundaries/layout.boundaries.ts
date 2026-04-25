import { Boundary } from '@czap/core';

/**
 * Viewport-width boundary for adaptive layout.
 *
 * Quantizes continuous viewport width into three discrete states:
 *   mobile  [0, 768)
 *   tablet  [768, 1280)
 *   desktop [1280, +Inf)
 *
 * Hysteresis of 40px prevents rapid toggling near thresholds.
 */
export const layout = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ],
  hysteresis: 40,
});
