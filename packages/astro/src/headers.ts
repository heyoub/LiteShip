/**
 * HTTP header helpers shipped by `@czap/astro`.
 *
 * Encodes the two concerns the integration cares about: asking browsers
 * for the Client Hints czap uses (tier detection), and shipping the
 * COOP/COEP pair required by `SharedArrayBuffer`-backed workers.
 *
 * @module
 */

/**
 * Default `Accept-CH` / `Critical-CH` response headers czap requests
 * so the browser sends viewport width, device memory, motion
 * preference, and DPR on the next navigation.
 */
export const CLIENT_HINTS_HEADERS: Record<string, string> = {
  'Accept-CH': 'Sec-CH-Viewport-Width, Sec-CH-Device-Memory, Sec-CH-Prefers-Reduced-Motion, Sec-CH-DPR',
  'Critical-CH': 'Sec-CH-Viewport-Width',
};

/**
 * COOP/COEP header pair required for `SharedArrayBuffer` (used by
 * `@czap/worker`'s SPSC ring). Applied only when the integration is
 * configured with `workers: { enabled: true }`.
 */
export const CROSS_ORIGIN_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * Build the `[header, value]` entries czap wants to emit for a given
 * feature toggle set. Used by dev-server middleware and edge adapters
 * that prefer tuple iteration over the `Headers` API.
 */
export function getCzapHeaderEntries(options: {
  readonly detectEnabled: boolean;
  readonly workersEnabled: boolean;
  readonly acceptCH?: string;
  readonly criticalCH?: string;
}): Array<readonly [string, string]> {
  const entries: Array<readonly [string, string]> = [];

  if (options.detectEnabled) {
    const acceptCH = options.acceptCH ?? CLIENT_HINTS_HEADERS['Accept-CH'];
    const criticalCH = options.criticalCH ?? CLIENT_HINTS_HEADERS['Critical-CH'];
    if (acceptCH) {
      entries.push(['Accept-CH', acceptCH]);
    }
    if (criticalCH) {
      entries.push(['Critical-CH', criticalCH]);
    }
  }

  if (options.workersEnabled) {
    for (const [header, value] of Object.entries(CROSS_ORIGIN_HEADERS)) {
      entries.push([header, value]);
    }
  }

  return entries;
}

/**
 * Apply the czap header set to an existing {@link Headers} bag and
 * return it (for chaining). Convenience wrapper over
 * {@link getCzapHeaderEntries} for middleware that already has a
 * `Headers` object in hand.
 */
export function applyCzapHeaders(
  headers: Headers,
  options: {
    readonly detectEnabled: boolean;
    readonly workersEnabled: boolean;
    readonly acceptCH?: string;
    readonly criticalCH?: string;
  },
): Headers {
  for (const [header, value] of getCzapHeaderEntries(options)) {
    headers.set(header, value);
  }

  return headers;
}
