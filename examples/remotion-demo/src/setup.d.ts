/**
 * Demo setup -- boundary definition, compositor wiring, frame precomputation.
 *
 * Defines a 3-state "scale" boundary (small -> medium -> large) that drives
 * CSS custom properties for scale transform, background color, and foreground color.
 * The boundary is driven by a normalized 0-100 progress signal where
 * thresholds fire at 0, 33, and 66.
 *
 * @module
 */
import type { VideoFrameOutput } from '@czap/core';
export declare const FPS = 30;
export declare const DURATION_MS = 3000;
export declare const WIDTH = 1280;
export declare const HEIGHT = 720;
export declare function buildFrames(): Promise<ReadonlyArray<VideoFrameOutput>>;
//# sourceMappingURL=setup.d.ts.map
