/**
 * Device capability detection -- probes browser APIs for GPU tier,
 * CPU cores, memory, input modality, preferences, and network info.
 *
 * Every probe uses Effect.sync with internal try/catch for graceful
 * fallback on environments where APIs are unavailable (SSR, restricted
 * contexts, etc.).
 */

import type { Scope } from 'effect';
import { Effect } from 'effect';
import type { CapLevel, CapSet } from '@czap/core';

// ---------------------------------------------------------------------------
// Navigator augmentation -- non-standard but widely-shipped APIs
// ---------------------------------------------------------------------------

declare global {
  interface Navigator {
    /** Device RAM in GiB (rounded). Chrome 63+, not in Safari/Firefox. */
    readonly deviceMemory?: number;
    /** Network Information API. Chrome 61+, not in Safari/Firefox. */
    readonly connection?: NavigatorConnectionInfo;
  }
}

// Forward-declare NavigatorConnectionInfo here; the full interface is defined
// below alongside its probe function.
interface NavigatorConnectionInfo {
  readonly effectiveType: string;
  readonly downlink: number;
  readonly saveData: boolean;
}
import {
  tierFromCapabilities,
  capSetFromCapabilities,
  designTierFromCapabilities,
  motionTierFromCapabilities,
} from './tiers.js';
import type { DesignTier, MotionTier } from './tiers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Coarse GPU fidelity bucket inferred from the WebGL renderer string.
 *
 * `0` = software/virtualized, `1` = integrated (Intel UHD, early Adreno),
 * `2` = mid-range (Adreno 5xx+, Apple M1/M2), `3` = discrete high-end
 * (RTX, RX 6xxx+, Apple M3+). Drives motion and design tier resolution.
 */
export type GPUTier = 0 | 1 | 2 | 3;

/**
 * Baseline detected device capabilities.
 *
 * All probes gracefully fall back to conservative defaults when APIs are
 * unavailable (SSR, hardened browsers, CI environments). See
 * {@link ExtendedDeviceCapabilities} for the superset that also carries
 * accessibility-related media-query results.
 */
export interface DeviceCapabilities {
  /** GPU fidelity bucket; see {@link GPUTier}. */
  readonly gpu: GPUTier;
  /** Logical CPU cores reported by `navigator.hardwareConcurrency`. */
  readonly cores: number;
  /** Device memory in GiB (rounded by the Device Memory API). */
  readonly memory: number;
  /** Whether `navigator.gpu` is present (WebGPU available). */
  readonly webgpu: boolean;
  /** Whether touch is a primary input modality (maxTouchPoints or ontouchstart). */
  readonly touchPrimary: boolean;
  /** `prefers-reduced-motion: reduce` match. */
  readonly prefersReducedMotion: boolean;
  /** Effective color scheme (`prefers-color-scheme`). */
  readonly prefersColorScheme: 'light' | 'dark';
  /** `window.innerWidth` at detection time. */
  readonly viewportWidth: number;
  /** `window.innerHeight` at detection time. */
  readonly viewportHeight: number;
  /** `window.devicePixelRatio` at detection time. */
  readonly devicePixelRatio: number;
  /** Network Information API snapshot; undefined when unsupported. */
  readonly connection?: {
    /** `'slow-2g' | '2g' | '3g' | '4g'`. */
    readonly effectiveType: string;
    /** Downlink estimate in Mb/s. */
    readonly downlink: number;
    /** Whether the user has opted into data-saving mode. */
    readonly saveData: boolean;
  };
}

/**
 * Result of a single detection sweep.
 *
 * Bundles the probed capabilities together with the derived {@link CapLevel}
 * tier, its monotone {@link CapSet}, and a confidence score reflecting how
 * many probes returned real values (vs. defaults).
 */
export interface DetectionResult {
  /** The probed capabilities. */
  readonly capabilities: DeviceCapabilities;
  /** Highest {@link CapLevel} the device qualifies for. */
  readonly tier: CapLevel;
  /** Monotone set of every {@link CapLevel} at or below `tier`. */
  readonly capSet: CapSet;
  /** Heuristic confidence in `[0.5, 1]` based on how many probes succeeded. */
  readonly confidence: number;
}

/**
 * Extended capabilities adding accessibility and display metadata.
 *
 * Superset of {@link DeviceCapabilities} with media-query-derived fields that
 * feed the {@link DesignTier} resolver: contrast preferences, forced colors,
 * reduced transparency, HDR/dynamic range, color gamut, and update rate.
 */
export interface ExtendedDeviceCapabilities extends DeviceCapabilities {
  /** `prefers-contrast` value. */
  readonly prefersContrast: 'no-preference' | 'more' | 'less' | 'custom';
  /** `forced-colors: active` match (high-contrast/OS theme). */
  readonly forcedColors: boolean;
  /** `prefers-reduced-transparency: reduce` match. */
  readonly prefersReducedTransparency: boolean;
  /** Display dynamic range (HDR) from `(dynamic-range: high)`. */
  readonly dynamicRange: 'standard' | 'high';
  /** Display color gamut from `(color-gamut: ...)`. */
  readonly colorGamut: 'srgb' | 'p3' | 'rec2020';
  /** Update rate from `(update: ...)`; `none` = e-ink / print. */
  readonly updateRate: 'fast' | 'slow' | 'none';
}

/**
 * Full detection result including design and motion tiers.
 *
 * Returned by {@link Detect.detect}. Consumers typically destructure
 * `{ capSet, designTier, motionTier }` and pass them to boundary evaluation
 * and compiler dispatch.
 */
export interface ExtendedDetectionResult extends DetectionResult {
  /** Extended capabilities (superset of `DeviceCapabilities`). */
  readonly capabilities: ExtendedDeviceCapabilities;
  /** Visual fidelity tier derived from display metadata. */
  readonly designTier: DesignTier;
  /** Motion complexity tier derived from GPU, cores, and reduced-motion. */
  readonly motionTier: MotionTier;
}

type ProbeResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error'; readonly error: unknown };

interface DetectionProbes {
  readonly renderer: ProbeResult<string>;
  readonly webgpu: ProbeResult<boolean>;
  readonly cores: ProbeResult<number>;
  readonly memory: ProbeResult<number>;
  readonly touch: ProbeResult<boolean>;
  readonly reducedMotion: ProbeResult<boolean>;
  readonly colorScheme: ProbeResult<'light' | 'dark'>;
  readonly viewport: ProbeResult<{ width: number; height: number }>;
  readonly dpr: ProbeResult<number>;
  readonly connection: ProbeResult<NavigatorConnection>;
  readonly contrast: ProbeResult<'no-preference' | 'more' | 'less' | 'custom'>;
  readonly forcedColors: ProbeResult<boolean>;
  readonly reducedTransparency: ProbeResult<boolean>;
  readonly dynamicRange: ProbeResult<'standard' | 'high'>;
  readonly colorGamut: ProbeResult<'srgb' | 'p3' | 'rec2020'>;
  readonly updateRate: ProbeResult<'fast' | 'slow' | 'none'>;
}

function probeOk<T>(value: T): ProbeResult<T> {
  return { status: 'ok', value };
}

function probeUnavailable<T>(): ProbeResult<T> {
  return { status: 'unavailable' };
}

function probeError<T>(error: unknown): ProbeResult<T> {
  return { status: 'error', error };
}

function valueOr<T>(result: ProbeResult<T>, fallback: T): T {
  return result.status === 'ok' ? result.value : fallback;
}

function hasProbeValue<T>(result: ProbeResult<T>): result is Extract<ProbeResult<T>, { readonly status: 'ok' }> {
  return result.status === 'ok';
}

// ---------------------------------------------------------------------------
// GPU Tier Heuristics
// ---------------------------------------------------------------------------

const GPU_TIER_0_PATTERNS = [
  /swiftshader/i,
  /llvmpipe/i,
  /software/i,
  /virtualbox/i,
  /vmware/i,
  /microsoft basic/i,
] as const;

const GPU_TIER_1_PATTERNS = [
  /intel.*hd/i,
  /intel.*uhd/i,
  /intel.*iris/i,
  /mali-[gt][0-9]/i,
  /adreno.*[0-3][0-9]{2}/i,
  /powervr/i,
  /apple gpu/i,
] as const;

const GPU_TIER_2_PATTERNS = [
  /adreno.*[4-5][0-9]{2}/i,
  /mali-g[0-9]{2}/i,
  /geforce.*[0-9]{3}m/i,
  /geforce.*mx/i,
  /radeon.*rx\s*[0-5][0-9]{2}/i,
  /radeon.*vega/i,
  /intel.*arc/i,
  /apple.*m[12]/i,
] as const;

const GPU_TIER_3_PATTERNS = [
  /geforce.*rtx/i,
  /radeon.*rx\s*[6-9][0-9]{2,}/i,
  /radeon.*rx\s*7[0-9]{3}/i,
  /apple.*m[3-9]/i,
  /adreno.*[6-9][0-9]{2}/i,
  /mali-g[7-9][0-9]/i,
  /nvidia.*a[0-9]{3,}/i,
] as const;

function classifyGPURenderer(renderer: string): GPUTier {
  for (const pattern of GPU_TIER_0_PATTERNS) {
    if (pattern.test(renderer)) return 0;
  }
  for (const pattern of GPU_TIER_3_PATTERNS) {
    if (pattern.test(renderer)) return 3;
  }
  for (const pattern of GPU_TIER_2_PATTERNS) {
    if (pattern.test(renderer)) return 2;
  }
  for (const pattern of GPU_TIER_1_PATTERNS) {
    if (pattern.test(renderer)) return 1;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Detection Probes (safe -- never throw, always return structured outcomes)
// ---------------------------------------------------------------------------

/**
 * Acquire a WebGLRenderingContext from a canvas, falling back to the
 * prefixed 'experimental-webgl' context (required in some older browsers).
 * The cast is contained here; callers receive a typed context or null.
 */
function getWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  const standard = canvas.getContext('webgl');
  if (standard !== null) return standard;
  // 'experimental-webgl' returns RenderingContext | null; we validate it is a
  // WebGLRenderingContext by checking the isContextLost method which is specific
  // to WebGL contexts and not present on 2D/ImageBitmap contexts.
  const experimental = canvas.getContext('experimental-webgl');
  if (experimental === null || typeof (experimental as WebGLRenderingContext).isContextLost !== 'function') {
    return null;
  }
  return experimental as WebGLRenderingContext;
}

function probeWebGLRenderer(): ProbeResult<string> {
  try {
    if (typeof document === 'undefined') return probeUnavailable();
    const canvas = document.createElement('canvas');
    const gl = getWebGLContext(canvas);
    if (!gl) return probeUnavailable();
    const direct = gl.getParameter(gl.RENDERER) as string | null;
    if (direct && direct.length > 0) return probeOk(direct);
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return probeUnavailable();
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string | null;
    return renderer && renderer.length > 0 ? probeOk(renderer) : probeUnavailable();
  } catch (error) {
    return probeError(error);
  }
}

function probeWebGPU(): ProbeResult<boolean> {
  try {
    if (typeof navigator === 'undefined') return probeUnavailable();
    return probeOk('gpu' in navigator && navigator.gpu !== undefined);
  } catch (error) {
    return probeError(error);
  }
}

function probeCores(): ProbeResult<number> {
  try {
    if (typeof navigator === 'undefined') return probeUnavailable();
    return probeOk(navigator.hardwareConcurrency ?? 2);
  } catch (error) {
    return probeError(error);
  }
}

function probeMemory(): ProbeResult<number> {
  try {
    if (typeof navigator === 'undefined') return probeUnavailable();
    if ('deviceMemory' in navigator) {
      return probeOk(navigator.deviceMemory ?? 4);
    }
    return probeUnavailable();
  } catch (error) {
    return probeError(error);
  }
}

function probeTouch(): ProbeResult<boolean> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
  } catch (error) {
    return probeError(error);
  }
}

function probeReducedMotion(): ProbeResult<boolean> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (error) {
    return probeError(error);
  }
}

function probeColorScheme(): ProbeResult<'light' | 'dark'> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch (error) {
    return probeError(error);
  }
}

function probeViewport(): ProbeResult<{ width: number; height: number }> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk({
      width: window.innerWidth ?? 1920,
      height: window.innerHeight ?? 1080,
    });
  } catch (error) {
    return probeError(error);
  }
}

function probeDPR(): ProbeResult<number> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk(window.devicePixelRatio ?? 1);
  } catch (error) {
    return probeError(error);
  }
}

// NavigatorConnection is aliased to the augmented NavigatorConnectionInfo above.
type NavigatorConnection = NavigatorConnectionInfo;

function probeConnection(): ProbeResult<NavigatorConnection> {
  try {
    if (typeof navigator === 'undefined') return probeUnavailable();
    const conn = navigator.connection;
    if (!conn) return probeUnavailable();
    return probeOk({
      effectiveType: conn.effectiveType ?? '4g',
      downlink: conn.downlink ?? 10,
      saveData: conn.saveData ?? false,
    });
  } catch (error) {
    return probeError(error);
  }
}

function probeContrast(): ProbeResult<'no-preference' | 'more' | 'less' | 'custom'> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    if (window.matchMedia('(prefers-contrast: more)').matches) return probeOk('more');
    if (window.matchMedia('(prefers-contrast: less)').matches) return probeOk('less');
    if (window.matchMedia('(prefers-contrast: custom)').matches) return probeOk('custom');
    return probeOk('no-preference');
  } catch (error) {
    return probeError(error);
  }
}

function probeForcedColors(): ProbeResult<boolean> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk(window.matchMedia('(forced-colors: active)').matches);
  } catch (error) {
    return probeError(error);
  }
}

function probeReducedTransparency(): ProbeResult<boolean> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk(window.matchMedia('(prefers-reduced-transparency: reduce)').matches);
  } catch (error) {
    return probeError(error);
  }
}

function probeDynamicRange(): ProbeResult<'standard' | 'high'> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    return probeOk(window.matchMedia('(dynamic-range: high)').matches ? 'high' : 'standard');
  } catch (error) {
    return probeError(error);
  }
}

function probeColorGamut(): ProbeResult<'srgb' | 'p3' | 'rec2020'> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    if (window.matchMedia('(color-gamut: rec2020)').matches) return probeOk('rec2020');
    if (window.matchMedia('(color-gamut: p3)').matches) return probeOk('p3');
    return probeOk('srgb');
  } catch (error) {
    return probeError(error);
  }
}

function probeUpdateRate(): ProbeResult<'fast' | 'slow' | 'none'> {
  try {
    if (typeof window === 'undefined') return probeUnavailable();
    if (window.matchMedia('(update: none)').matches) return probeOk('none');
    if (window.matchMedia('(update: slow)').matches) return probeOk('slow');
    return probeOk('fast');
  } catch (error) {
    return probeError(error);
  }
}

function collectDetectionProbes(): DetectionProbes {
  return {
    renderer: probeWebGLRenderer(),
    webgpu: probeWebGPU(),
    cores: probeCores(),
    memory: probeMemory(),
    touch: probeTouch(),
    reducedMotion: probeReducedMotion(),
    colorScheme: probeColorScheme(),
    viewport: probeViewport(),
    dpr: probeDPR(),
    connection: probeConnection(),
    contrast: probeContrast(),
    forcedColors: probeForcedColors(),
    reducedTransparency: probeReducedTransparency(),
    dynamicRange: probeDynamicRange(),
    colorGamut: probeColorGamut(),
    updateRate: probeUpdateRate(),
  };
}

function buildCapabilitiesFromProbes(probes: DetectionProbes): ExtendedDeviceCapabilities {
  const renderer = hasProbeValue(probes.renderer) ? probes.renderer.value : null;
  const viewport = valueOr(probes.viewport, { width: 1920, height: 1080 });
  return {
    gpu: renderer ? classifyGPURenderer(renderer) : (1 as GPUTier),
    cores: valueOr(probes.cores, 2),
    memory: valueOr(probes.memory, 4),
    webgpu: valueOr(probes.webgpu, false),
    touchPrimary: valueOr(probes.touch, false),
    prefersReducedMotion: valueOr(probes.reducedMotion, false),
    prefersColorScheme: valueOr(probes.colorScheme, 'light'),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    devicePixelRatio: valueOr(probes.dpr, 1),
    connection: hasProbeValue(probes.connection) ? probes.connection.value : undefined,
    prefersContrast: valueOr(probes.contrast, 'no-preference'),
    forcedColors: valueOr(probes.forcedColors, false),
    prefersReducedTransparency: valueOr(probes.reducedTransparency, false),
    dynamicRange: valueOr(probes.dynamicRange, 'standard'),
    colorGamut: valueOr(probes.colorGamut, 'srgb'),
    updateRate: valueOr(probes.updateRate, 'fast'),
  };
}

function computeConfidenceFromProbes(probes: DetectionProbes): number {
  let confidence = 0.5;
  if (hasProbeValue(probes.renderer)) confidence += 0.2;
  if (hasProbeValue(probes.memory)) confidence += 0.1;
  if (hasProbeValue(probes.connection)) confidence += 0.1;
  if (hasProbeValue(probes.cores) && probes.cores.value > 0) confidence += 0.1;
  return Math.min(confidence, 1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect GPU tier from WebGL renderer string heuristics.
 * Falls back to tier 1 (integrated) when WebGL is unavailable.
 *
 * @example
 * ```ts
 * import { Detect } from '@czap/detect';
 * import { Effect } from 'effect';
 *
 * const tier = Effect.runSync(Detect.detectGPUTier());
 * // tier => 0 (software) | 1 (integrated) | 2 (mid) | 3 (high-end)
 * ```
 *
 * @returns An Effect yielding a {@link GPUTier} (0-3)
 */
export function detectGPUTier(): Effect.Effect<GPUTier> {
  return Effect.sync(() => {
    const renderer = probeWebGLRenderer();
    return hasProbeValue(renderer) ? classifyGPURenderer(renderer.value) : (1 as GPUTier);
  });
}

/**
 * Run a full device capability detection sweep.
 * All probes are synchronous with internal error handling -- gracefully
 * falls back to conservative defaults when APIs are unavailable.
 *
 * @example
 * ```ts
 * import { Detect } from '@czap/detect';
 * import { Effect } from 'effect';
 *
 * const result = Effect.runSync(Detect.detect());
 * console.log(result.capabilities.gpu);       // 0-3
 * console.log(result.tier);                   // 'low' | 'mid' | 'high'
 * console.log(result.designTier);             // 'basic' | 'standard' | 'rich'
 * console.log(result.motionTier);             // 'none' | 'transitions' | ...
 * console.log(result.confidence);             // 0.5 - 1.0
 * ```
 *
 * @returns An Effect yielding an {@link ExtendedDetectionResult}
 */
export function detect(): Effect.Effect<ExtendedDetectionResult> {
  return Effect.sync(() => {
    const probes = collectDetectionProbes();
    const capabilities = buildCapabilitiesFromProbes(probes);

    const tier = tierFromCapabilities(capabilities);
    const capSet = capSetFromCapabilities(capabilities);
    const designTier = designTierFromCapabilities(capabilities);
    const motionTier = motionTierFromCapabilities(capabilities);
    const confidence = computeConfidenceFromProbes(probes);

    return { capabilities, tier, capSet, confidence, designTier, motionTier };
  });
}

/**
 * Device capability detection namespace.
 *
 * Probes browser APIs for GPU tier, CPU cores, memory, input modality,
 * user preferences, and network info. Maps detected capabilities to
 * {@link CapLevel}, {@link CapSet}, {@link DesignTier}, and {@link MotionTier}.
 * Supports live watching for preference and viewport changes.
 *
 * @example
 * ```ts
 * import { Detect } from '@czap/detect';
 * import { Effect } from 'effect';
 *
 * const result = Effect.runSync(Detect.detect());
 * console.log(result.capabilities.prefersColorScheme); // 'light' | 'dark'
 * console.log(result.motionTier); // 'none' | 'transitions' | 'animations' | ...
 *
 * // Watch for changes
 * const watch = Effect.scoped(
 *   Detect.watchCapabilities((r) => console.log('tier:', r.tier)),
 * );
 * ```
 */
export const Detect = {
  detect,
  detectGPUTier,
  watchCapabilities,
} as const;

/**
 * Watch for capability changes via matchMedia listeners and resize observer.
 * Emits a fresh DetectionResult whenever viewport, color scheme, or
 * reduced motion preferences change.
 *
 * The stream is scoped -- listeners are cleaned up when the scope finalizes.
 *
 * @example
 * ```ts
 * import { Detect } from '@czap/detect';
 * import { Effect } from 'effect';
 *
 * const program = Effect.scoped(
 *   Detect.watchCapabilities((result) => {
 *     console.log('Capabilities changed:', result.tier);
 *   }),
 * );
 * ```
 *
 * @param onChange - Callback invoked with fresh detection results on change
 * @returns An Effect (scoped) that sets up listeners
 */
export function watchCapabilities(
  onChange: (result: ExtendedDetectionResult) => void,
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* () {
    if (typeof window === 'undefined') return;

    const triggerUpdate = () => {
      const result = Effect.runSync(detect());
      onChange(result);
    };

    const resizeHandler = () => triggerUpdate();
    window.addEventListener('resize', resizeHandler);

    const reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colorSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
    const contrastMql = window.matchMedia('(prefers-contrast: more)');
    const forcedColorsMql = window.matchMedia('(forced-colors: active)');
    const reducedTransparencyMql = window.matchMedia('(prefers-reduced-transparency: reduce)');

    const mqlHandler = () => triggerUpdate();
    reducedMotionMql.addEventListener('change', mqlHandler);
    colorSchemeMql.addEventListener('change', mqlHandler);
    contrastMql.addEventListener('change', mqlHandler);
    forcedColorsMql.addEventListener('change', mqlHandler);
    reducedTransparencyMql.addEventListener('change', mqlHandler);

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        window.removeEventListener('resize', resizeHandler);
        reducedMotionMql.removeEventListener('change', mqlHandler);
        colorSchemeMql.removeEventListener('change', mqlHandler);
        contrastMql.removeEventListener('change', mqlHandler);
        forcedColorsMql.removeEventListener('change', mqlHandler);
        reducedTransparencyMql.removeEventListener('change', mqlHandler);
      }),
    );
  });
}
