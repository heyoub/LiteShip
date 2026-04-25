/**
 * Centralized default constants for `@czap/core` and downstream packages.
 *
 * Avoids magic numbers scattered across modules. Each constant documents
 * its purpose and which modules consume it.
 *
 * @module
 */

/** Default target frames per second for frame budget calculation. Used by: frame-budget.ts */
export const DEFAULT_TARGET_FPS = 60;

/** Milliseconds per second. Used by: frame-budget.ts, easing.ts */
export const MS_PER_SEC = 1000;

/** Default SSE message queue buffer size. Used by: web/stream/sse.ts */
export const SSE_BUFFER_SIZE = 100;

/** Default SSE heartbeat interval in ms. Used by: web/stream/sse.ts */
export const SSE_HEARTBEAT_MS = 30_000;

/** Default SSE initial reconnect delay in ms. Used by: web/stream/sse.ts */
export const SSE_RECONNECT_INITIAL_MS = 1_000;

/** Default SSE max reconnect delay in ms. Used by: web/stream/sse.ts */
export const SSE_RECONNECT_MAX_MS = 30_000;

/** Default compositor state pool capacity. Used by: compositor.ts, compositor-pool.ts */
export const COMPOSITOR_POOL_CAP = 8;

/** Maximum number of dirty flag keys (bitset width limit). Used by: dirty.ts */
export const DIRTY_FLAGS_MAX = 31;

/** WASM linear memory scratch offset for boundary/spring kernels. Used by: wasm-dispatch.ts */
export const WASM_SCRATCH_BASE = 32768;

/** Default keyframe interval in frames for video encoding. Used by: web/capture/webcodecs.ts */
export const CAPTURE_KEYFRAME_INTERVAL = 30;

/** Number of sub-steps for spring animation resolution. Used by: easing.ts */
export const EASING_SPRING_STEPS = 2000;

/** Default theme transition duration in ms. Used by: compiler/theme-css.ts */
export const THEME_TRANSITION_DURATION_MS = 200;

/** Default theme transition easing function. Used by: compiler/theme-css.ts */
export const THEME_TRANSITION_EASING = 'ease-in-out';

/** Default canvas fallback width when clientWidth is 0. Used by: astro/runtime/gpu.ts */
export const CANVAS_FALLBACK_WIDTH = 300;

/** Default canvas fallback height when clientHeight is 0. Used by: astro/runtime/gpu.ts */
export const CANVAS_FALLBACK_HEIGHT = 150;

/** Viewport breakpoints in CSS pixels. Used by: astro/quantize.ts */
export const VIEWPORT = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
} as const;
