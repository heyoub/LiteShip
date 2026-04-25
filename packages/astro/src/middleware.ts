/**
 * Edge middleware -- Client Hints parsing, tier detection, response headers.
 *
 * Framework-agnostic handler compatible with Astro middleware,
 * Cloudflare Workers, and Express/Vite dev server.
 *
 * @module
 */

import { ClientHints, createEdgeHostAdapter, EdgeTier } from '@czap/edge';
import type { CompiledOutputs, EdgeHostAdapterConfig, ThemeCompileResult } from '@czap/edge';
import type { ExtendedDeviceCapabilities } from '@czap/detect';
import { applyCzapHeaders } from './headers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of `context.locals.czap` injected by {@link czapMiddleware}.
 * Astro components (and downstream middleware) read this to drive
 * adaptive rendering decisions.
 */
export interface CzapLocals {
  /** Resolved tiers (capability, motion, design). */
  readonly tier: {
    readonly cap: string;
    readonly motion: string;
    readonly design: string;
  };
  /** Parsed device capabilities. */
  readonly capabilities: ExtendedDeviceCapabilities;
  /** Edge-host resolution result, present when an edge adapter is configured. */
  readonly edge?: {
    readonly theme?: ThemeCompileResult;
    readonly compiledOutputs?: CompiledOutputs;
    readonly htmlAttributes: string;
    readonly cacheStatus: 'disabled' | 'hit' | 'miss';
  };
}

/**
 * Options accepted by {@link czapMiddleware}.
 *
 * Omit `edge` to run in pure Client-Hints mode. Pass `edge` when you
 * have an `@czap/edge` host adapter (KV cache, theme compilation).
 */
export interface CzapMiddlewareConfig {
  /** Edge host adapter configuration (KV cache, theme compilation). */
  readonly edge?: EdgeHostAdapterConfig;
  /** Whether to include the Client Hints request headers (default `true`). */
  readonly detect?: boolean;
  /** Whether to emit COOP/COEP headers for worker features. */
  readonly workers?: { readonly enabled?: boolean };
}

interface MiddlewareContext {
  readonly request: Request;
  locals: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Create the czap edge middleware.
 *
 * Parses Client Hints from request headers, computes tier detection,
 * injects results into `context.locals.czap`, and sets Client Hints
 * response headers (`Accept-CH`, `Critical-CH`).
 *
 * @example
 * ```ts
 * // Astro middleware (src/middleware.ts)
 * import { czapMiddleware } from '@czap/astro';
 * export const onRequest = czapMiddleware();
 * ```
 */
export function czapMiddleware(
  config?: CzapMiddlewareConfig,
): (context: MiddlewareContext, next: () => Promise<Response>) => Promise<Response> {
  const edgeConfig = config?.edge;
  let edgeAdapter: ReturnType<typeof createEdgeHostAdapter> | null = null;
  if (edgeConfig) {
    edgeAdapter = createEdgeHostAdapter(edgeConfig);
  }
  const detectEnabled = config?.detect !== false;
  const workersEnabled = config?.workers?.enabled === true;

  return async (context: MiddlewareContext, next: () => Promise<Response>): Promise<Response> => {
    const edgeResolution = edgeAdapter ? await edgeAdapter.resolve(context.request.headers) : null;
    const capabilities = edgeResolution?.capabilities ?? ClientHints.parseClientHints(context.request.headers);
    const tier = edgeResolution?.tier ?? EdgeTier.detectTier(context.request.headers);

    // Inject into locals for component access
    context.locals.czap = {
      tier: {
        cap: tier.capLevel,
        motion: tier.motionTier,
        design: tier.designTier,
      },
      capabilities,
      ...(edgeResolution
        ? {
            edge: {
              theme: edgeResolution.theme,
              compiledOutputs: edgeResolution.compiledOutputs,
              htmlAttributes: edgeResolution.htmlAttributes,
              cacheStatus: edgeResolution.cacheStatus,
            },
          }
        : {}),
    } satisfies CzapLocals;

    // Continue to the route handler
    const response = await next();

    // Add Client Hints request headers to the response
    const headers = applyCzapHeaders(new Headers(response.headers), {
      detectEnabled,
      workersEnabled,
      acceptCH: edgeResolution?.responseHeaders.acceptCH ?? ClientHints.acceptCHHeader(),
      criticalCH: edgeResolution?.responseHeaders.criticalCH ?? ClientHints.criticalCHHeader(),
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
