/**
 * Viewport boundary definition.
 *
 * A boundary quantizes a continuous signal (viewport width in pixels) into
 * discrete named states. The czap runtime evaluates this boundary on the
 * client using a ResizeObserver, setting `data-czap-state="compact"` or
 * `data-czap-state="wide"` on the element. CSS rules then target these
 * states -- no JavaScript layout logic required.
 *
 * The `at` tuples define thresholds:
 *   [0, 'compact']  -- from 0px up, the state is "compact"
 *   [768, 'wide']   -- from 768px up, the state is "wide"
 *
 * This is intentionally simple: two states, one breakpoint. Real apps
 * may define 3-5 states with hysteresis to prevent jitter.
 */

import { Boundary } from '@czap/core';

export const viewportBoundary = Boundary.make({
  // The signal this boundary listens to. "viewport.width" is a built-in
  // signal that the satellite directive reads from window.innerWidth.
  input: 'viewport.width',

  // Threshold/state pairs, sorted ascending by threshold value.
  // Each tuple is [thresholdPixels, stateName].
  at: [
    [0, 'compact'],
    [768, 'wide'],
  ],
});
