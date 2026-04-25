/**
 * @czap/astro type spine -- Astro 6 integration + <Quantize> component.
 */

import type { Boundary, Quantizer, CapLevel } from './core.d.ts';
import type { PluginConfig } from './vite.d.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface IntegrationConfig {
  readonly vite?: PluginConfig;
  readonly detect?: boolean;
  readonly serverIslands?: boolean;
}

export declare function integration(config?: IntegrationConfig): import('astro').AstroIntegration;

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. QUANTIZE COMPONENT PROPS
// ═══════════════════════════════════════════════════════════════════════════════

export interface QuantizeProps<B extends Boundary.Shape = Boundary.Shape> {
  readonly boundary: B;
  readonly quantizer?: Quantizer<B>;
  readonly initialState?: string;
  readonly fallback?: string;
  readonly class?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. SERVER ISLAND RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ServerIslandContext {
  readonly userAgent: string;
  readonly clientHints: Record<string, string>;
  readonly detectedTier: CapLevel;
}

export declare function resolveInitialState<B extends Boundary.Shape>(
  boundary: B,
  context: ServerIslandContext,
): string;
