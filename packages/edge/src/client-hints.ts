/**
 * Client Hints header parsing for edge-side device capability detection.
 *
 * Converts HTTP Client Hints headers into the same `ExtendedDeviceCapabilities`
 * structure that `@czap/detect` uses, enabling reuse of the pure tier mapping
 * functions at the edge without browser APIs.
 *
 * @module
 */

import type { ExtendedDeviceCapabilities, GPUTier } from '@czap/detect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Plain-object header bag accepted by {@link ClientHints.parseClientHints}.
 *
 * All names are lowercased because Client Hints headers are always lowercase
 * in spec. Values that are missing simply fall back to conservative
 * defaults during parsing.
 */
export interface ClientHintsHeaders {
  /** `Sec-CH-UA-Platform` (e.g. `"macOS"`, `"Windows"`). */
  readonly 'sec-ch-ua-platform'?: string;
  /** `Sec-CH-Device-Memory` in GiB (one of the standard buckets). */
  readonly 'sec-ch-device-memory'?: string;
  /** `Sec-CH-DPR` — devicePixelRatio as a decimal string. */
  readonly 'sec-ch-dpr'?: string;
  /** `Sec-CH-Viewport-Width` in CSS pixels. */
  readonly 'sec-ch-viewport-width'?: string;
  /** `Sec-CH-Viewport-Height` in CSS pixels. */
  readonly 'sec-ch-viewport-height'?: string;
  /** `Sec-CH-Prefers-Reduced-Motion` (`reduce` / `no-preference`). */
  readonly 'sec-ch-prefers-reduced-motion'?: string;
  /** `Sec-CH-Prefers-Color-Scheme` (`light` / `dark`). */
  readonly 'sec-ch-prefers-color-scheme'?: string;
  /** `Sec-CH-UA-Mobile` as a structured boolean (`?1` / `?0`). */
  readonly 'sec-ch-ua-mobile'?: string;
  /** `Sec-CH-UA` — full user-agent brand list. */
  readonly 'sec-ch-ua'?: string;
  /** `Save-Data` (`on`). */
  readonly 'save-data'?: string;
  /** `Downlink` estimate in Mb/s. */
  readonly downlink?: string;
  /** `ECT` effective connection type. */
  readonly ect?: string;
  /** `RTT` round-trip-time estimate in ms. */
  readonly rtt?: string;
  /** `User-Agent` fallback for GPU-tier heuristics. */
  readonly 'user-agent'?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Type guard for Web API Headers objects (fetch Headers).
 * Checks for the `get` method that distinguishes Headers from plain objects.
 */
function isWebHeaders(value: ClientHintsHeaders | Headers): value is Headers {
  return typeof (value as Record<string, unknown>).get === 'function';
}

/**
 * Normalise a Headers-like input (Web API Headers or plain object) into
 * a case-insensitive getter function.
 */
function headerGetter(headers: ClientHintsHeaders | Headers): (name: string) => string | undefined {
  if (isWebHeaders(headers)) {
    return (name: string) => headers.get(name) ?? undefined;
  }
  // Client Hints headers are always lowercase in spec, but normalise anyway
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) lower[k.toLowerCase()] = v;
  }
  return (name: string) => lower[name.toLowerCase()];
}

/**
 * Parse a numeric header, returning undefined for missing / malformed values.
 */
function parseFloat_(get: (name: string) => string | undefined, name: string): number | undefined {
  const raw = get(name);
  if (raw === undefined || raw === '') return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Clamp device memory to the set of valid values browsers actually report.
 */
function clampMemory(raw: number): number {
  const buckets = [0.25, 0.5, 1, 2, 4, 8] as const;
  let closest: number = buckets[0]!;
  for (const b of buckets) {
    if (Math.abs(b - raw) < Math.abs(closest - raw)) closest = b;
  }
  return closest;
}

/**
 * Crude GPU tier heuristic from User-Agent string.
 * Without WebGL renderer info we can only make rough guesses.
 */
function gpuTierFromUA(ua: string | undefined): GPUTier {
  if (!ua) return 1;
  const lower = ua.toLowerCase();

  // Very low-end indicators
  if (/kaios|nokia|feature/i.test(lower)) return 0;

  // High-end mobile
  if (/iphone\s*1[4-9]|iphone\s*[2-9]\d/i.test(lower)) return 2;
  if (/sm-s9|sm-s2[4-9]|pixel\s*[8-9]/i.test(lower)) return 2;

  // Desktop with common high-end hints
  if (/windows nt.*win64|macintosh.*mac os x 1[4-9]/i.test(lower)) return 2;

  // Default to low-mid -- conservative
  return 1;
}

/**
 * Map the ECT (effective connection type) string to a normalised form.
 */
function normaliseECT(ect: string | undefined): string {
  if (!ect) return '4g';
  const lower = ect.toLowerCase().trim();
  if (['slow-2g', '2g', '3g', '4g'].includes(lower)) return lower;
  return '4g';
}

// ---------------------------------------------------------------------------
// Accept-CH / Critical-CH header values
// ---------------------------------------------------------------------------

const ALL_HINTS = [
  'Sec-CH-Device-Memory',
  'Sec-CH-DPR',
  'Sec-CH-Viewport-Width',
  'Sec-CH-Viewport-Height',
  'Sec-CH-Prefers-Reduced-Motion',
  'Sec-CH-Prefers-Color-Scheme',
  'Sec-CH-UA-Mobile',
  'Sec-CH-UA',
  'Sec-CH-UA-Platform',
  'Save-Data',
  'Downlink',
  'ECT',
  'RTT',
] as const;

const CRITICAL_HINTS = [
  'Sec-CH-Prefers-Reduced-Motion',
  'Sec-CH-Prefers-Color-Scheme',
  'Sec-CH-UA-Mobile',
  'Sec-CH-Device-Memory',
] as const;

// ---------------------------------------------------------------------------
// Public API -- namespace object pattern
// ---------------------------------------------------------------------------

/**
 * Parse Client Hints headers into an {@link ExtendedDeviceCapabilities} structure.
 *
 * For properties that cannot be determined from headers (GPU tier, WebGPU
 * support, CPU cores), conservative defaults are used.
 *
 * @example
 * ```ts
 * import { ClientHints } from '@czap/edge';
 *
 * const caps = ClientHints.parseClientHints({
 *   'sec-ch-device-memory': '8',
 *   'sec-ch-dpr': '2',
 *   'sec-ch-viewport-width': '1440',
 *   'sec-ch-prefers-color-scheme': 'dark',
 *   'sec-ch-ua-mobile': '?0',
 * });
 * console.log(caps.memory);             // 8
 * console.log(caps.devicePixelRatio);    // 2
 * console.log(caps.prefersColorScheme);  // 'dark'
 * ```
 *
 * @param headers - Client Hints headers (plain object or Web API Headers)
 * @returns An {@link ExtendedDeviceCapabilities} structure
 */
function parseClientHints(headers: ClientHintsHeaders | Headers): ExtendedDeviceCapabilities {
  const get = headerGetter(headers);

  // Memory
  const rawMemory = parseFloat_(get, 'sec-ch-device-memory');
  const memory = rawMemory !== undefined ? clampMemory(rawMemory) : 4;

  // DPR
  const dpr = parseFloat_(get, 'sec-ch-dpr') ?? 1;

  // Viewport
  const viewportWidth = parseFloat_(get, 'sec-ch-viewport-width') ?? 1920;
  const viewportHeight = parseFloat_(get, 'sec-ch-viewport-height') ?? 1080;

  // Preferences
  const reducedMotionRaw = get('sec-ch-prefers-reduced-motion');
  const prefersReducedMotion = reducedMotionRaw === 'reduce' || reducedMotionRaw === '"reduce"';

  const colorSchemeRaw = get('sec-ch-prefers-color-scheme');
  const prefersColorScheme: 'light' | 'dark' =
    colorSchemeRaw === 'dark' || colorSchemeRaw === '"dark"' ? 'dark' : 'light';

  // Touch (mobile hint)
  const mobileRaw = get('sec-ch-ua-mobile');
  const touchPrimary = mobileRaw === '?1' || mobileRaw === 'true';

  // Save-Data
  const saveDataRaw = get('save-data');
  const saveData = saveDataRaw === 'on' || saveDataRaw === '1' || saveDataRaw === 'true';

  // Network
  const downlink = parseFloat_(get, 'downlink') ?? 10;
  const ect = normaliseECT(get('ect'));

  // GPU tier heuristic from UA
  const gpu = gpuTierFromUA(get('user-agent'));

  return {
    // Base DeviceCapabilities
    gpu,
    cores: 4, // Conservative default -- not available via Client Hints
    memory,
    webgpu: false, // Cannot determine from headers
    touchPrimary,
    prefersReducedMotion,
    prefersColorScheme,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: dpr,
    connection: {
      effectiveType: ect,
      downlink,
      saveData,
    },

    // Extended properties -- conservative defaults for edge
    prefersContrast: 'no-preference',
    forcedColors: false,
    prefersReducedTransparency: false,
    dynamicRange: 'standard',
    colorGamut: 'srgb',
    updateRate: 'fast',
  };
}

/**
 * Generate the `Accept-CH` header value for requesting all useful Client Hints
 * on subsequent requests.
 *
 * @example
 * ```ts
 * import { ClientHints } from '@czap/edge';
 *
 * const response = new Response('OK', {
 *   headers: { 'Accept-CH': ClientHints.acceptCHHeader() },
 * });
 * ```
 *
 * @returns A comma-separated list of Client Hint header names
 */
function acceptCHHeader(): string {
  return ALL_HINTS.join(', ');
}

/**
 * Generate the `Critical-CH` header value for hints needed on the very first
 * request (triggers a browser retry if missing).
 *
 * @example
 * ```ts
 * import { ClientHints } from '@czap/edge';
 *
 * const response = new Response('OK', {
 *   headers: {
 *     'Accept-CH': ClientHints.acceptCHHeader(),
 *     'Critical-CH': ClientHints.criticalCHHeader(),
 *   },
 * });
 * ```
 *
 * @returns A comma-separated list of critical Client Hint header names
 */
function criticalCHHeader(): string {
  return CRITICAL_HINTS.join(', ');
}

// ---------------------------------------------------------------------------
// Namespace export
// ---------------------------------------------------------------------------

/**
 * Client Hints namespace.
 *
 * Parses HTTP Client Hints headers into the same
 * {@link ExtendedDeviceCapabilities} structure used by `@czap/detect`,
 * enabling server-side / edge-side tier mapping without browser APIs.
 * Also generates the `Accept-CH` and `Critical-CH` response headers needed
 * to request hints from the browser.
 *
 * @example
 * ```ts
 * import { ClientHints } from '@czap/edge';
 *
 * // In an edge handler:
 * const caps = ClientHints.parseClientHints(request.headers);
 * const response = new Response(body, {
 *   headers: {
 *     'Accept-CH': ClientHints.acceptCHHeader(),
 *     'Critical-CH': ClientHints.criticalCHHeader(),
 *   },
 * });
 * ```
 */
export const ClientHints = {
  /** Parse Client Hints headers into {@link ExtendedDeviceCapabilities}. */
  parseClientHints,
  /** Produce the `Accept-CH` response header value listing all useful hints. */
  acceptCHHeader,
  /** Produce the `Critical-CH` response header value listing boot-required hints. */
  criticalCHHeader,
} as const;

export declare namespace ClientHints {
  /** Alias for {@link ClientHintsHeaders} — plain-object header bag shape. */
  export type Headers = ClientHintsHeaders;
}
