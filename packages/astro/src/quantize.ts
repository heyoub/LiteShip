/**
 * Quantize component helpers -- server-side initial state resolution.
 *
 * Maps {@link ServerIslandContext} (user agent, client hints, detected
 * tier) to the best initial boundary state for SSR and server islands.
 *
 * @module
 */

import type { Boundary, CapLevel, Quantizer } from '@czap/core';
import { VIEWPORT } from '@czap/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Server-only context that {@link resolveInitialState} consumes. Astro
 * builds this from the incoming request (user agent + Client Hints)
 * and the tier detected by the edge middleware.
 */
export interface ServerIslandContext {
  /** Raw `User-Agent` header. */
  readonly userAgent: string;
  /** Flat Client Hints header map. */
  readonly clientHints: Record<string, string>;
  /** Tier detected by `@czap/edge`. */
  readonly detectedTier: CapLevel;
}

/**
 * Props accepted by the `Quantize` Astro component and by
 * {@link resolveInitialState}.
 */
export interface QuantizeProps<B extends Boundary.Shape = Boundary.Shape> {
  /** Boundary to quantize. */
  readonly boundary: B;
  /** Optional explicit quantizer definition. */
  readonly quantizer?: Quantizer<B>;
  /** Explicit initial state (skips resolution). */
  readonly initialState?: string;
  /** Final fallback if resolution fails. */
  readonly fallback?: string;
  /** Extra CSS class names. */
  readonly class?: string;
}

// ---------------------------------------------------------------------------
// Client Hint Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a viewport width from client hints.
 * Supports Sec-CH-Viewport-Width and Sec-CH-Width headers.
 */
function parseViewportWidth(clientHints: Record<string, string>): number | undefined {
  const raw =
    clientHints['sec-ch-viewport-width'] ??
    clientHints['Sec-CH-Viewport-Width'] ??
    clientHints['sec-ch-width'] ??
    clientHints['Sec-CH-Width'];

  if (raw === undefined) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parse prefers-reduced-motion from client hints.
 */
function parsePrefersReducedMotion(clientHints: Record<string, string>): boolean | undefined {
  const raw = clientHints['sec-ch-prefers-reduced-motion'] ?? clientHints['Sec-CH-Prefers-Reduced-Motion'];

  if (raw === undefined) return undefined;
  return raw === 'reduce';
}

// ---------------------------------------------------------------------------
// User Agent Heuristics
// ---------------------------------------------------------------------------

/**
 * Estimate a viewport width from user agent string for common device classes.
 */
function estimateViewportFromUA(ua: string): number {
  const lower = ua.toLowerCase();

  if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
    return VIEWPORT.mobile;
  }
  if (lower.includes('tablet') || lower.includes('ipad')) {
    return VIEWPORT.tablet;
  }
  return VIEWPORT.desktop;
}

// ---------------------------------------------------------------------------
// Tier-Based Heuristic
// ---------------------------------------------------------------------------

const TIER_ORDINALS: Record<CapLevel, number> = {
  static: 0,
  styled: 1,
  reactive: 2,
  animated: 3,
  gpu: 4,
};

/**
 * Map a CapLevel tier to a synthetic viewport-like value for boundary evaluation.
 * This bridges between the capability tier system and viewport-based boundaries.
 */
function syntheticValueFromTier(tier: CapLevel): number {
  const ord = TIER_ORDINALS[tier];
  // Map tier ordinal to viewport-like breakpoints: 320, 640, 960, 1280, 1920
  return 320 + ord * 320;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the initial boundary state for server-side rendering.
 *
 * Priority:
 *   1. Use viewport width from client hints if available
 *   2. Estimate viewport from user agent
 *   3. Fall back to tier-based synthetic value
 *
 * Evaluates the boundary thresholds to find the matching state.
 */
export function resolveInitialState<B extends Boundary.Shape>(boundary: B, context: ServerIslandContext): string {
  const stateNames = boundary.states as readonly string[];
  const thresholds = boundary.thresholds as readonly number[];

  if (stateNames.length === 0) return '';
  if (stateNames.length === 1) return stateNames[0]!;

  // Determine the signal value to evaluate against the boundary
  let value: number;

  // Check client hints first (most accurate)
  const hintWidth = parseViewportWidth(context.clientHints);
  const reducedMotion = parsePrefersReducedMotion(context.clientHints);

  if (hintWidth !== undefined) {
    value = hintWidth;
  } else if (context.userAgent) {
    value = estimateViewportFromUA(context.userAgent);
  } else {
    value = syntheticValueFromTier(context.detectedTier);
  }

  // If reduced motion is detected and the tier suggests limited capability,
  // bias toward the lowest state
  if (reducedMotion === true && TIER_ORDINALS[context.detectedTier] <= 1) {
    return stateNames[0]!;
  }

  // Evaluate against boundary thresholds to find the matching state.
  // thresholds[i] is the lower bound for state[i].
  // Walk backwards from the highest threshold to find the first match.
  for (let i = stateNames.length - 1; i >= 0; i--) {
    const threshold = thresholds[i];
    if (threshold !== undefined && value >= threshold) {
      return stateNames[i]!;
    }
  }

  // Fallback to first state
  return stateNames[0]!;
}
