/**
 * Astro 6 `AstroIntegration` for czap.
 *
 * Registers the `@czap/vite` plugin, injects the detect/boot scripts,
 * registers every client directive (`client:satellite`,
 * `client:stream`, `client:llm`, `client:worker`, `client:gpu`,
 * `client:wasm`) that the host opts into, and turns on Astro's
 * `serverIslands` experimental flag when requested.
 *
 * @module
 */

import type { AstroIntegration } from 'astro';
import { plugin } from '@czap/vite';
import type { PluginConfig } from '@czap/vite';
import { DETECT_UPGRADE_SCRIPT } from './detect-upgrade.js';
import { getCzapHeaderEntries } from './headers.js';
import type { RuntimeEndpointPolicy } from '@czap/web';
import {
  normalizeRuntimeSecurityPolicy,
  type RuntimeHtmlPolicy,
  type RuntimeSecurityPolicy,
} from './runtime/policy.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options passed to {@link integration} from `astro.config.mjs`. Every
 * field is optional; omitted features fall back to conservative
 * defaults (detect enabled, stream/llm/gpu enabled, workers/wasm/server
 * islands opt-in).
 */
export interface IntegrationConfig {
  /** Overrides passed through to `@czap/vite`'s plugin. */
  readonly vite?: PluginConfig;
  /** Enable the inline detect script (default `true`). */
  readonly detect?: boolean;
  /** Turn on Astro's experimental server-islands flag (default `false`). */
  readonly serverIslands?: boolean;
  /** WASM runtime configuration. */
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
  /** GPU runtime configuration. */
  readonly gpu?: { readonly enabled?: boolean; readonly preferWebGPU?: boolean };
  /** Off-thread worker runtime configuration. */
  readonly workers?: { readonly enabled?: boolean };
  /** SSE streaming runtime configuration. */
  readonly stream?: { readonly enabled?: boolean };
  /** LLM streaming runtime configuration. */
  readonly llm?: { readonly enabled?: boolean };
  /** Security policies applied to runtime fetch/HTML boundaries. */
  readonly security?: {
    readonly endpointPolicy?: RuntimeEndpointPolicy;
    readonly htmlPolicy?: RuntimeHtmlPolicy;
  };
}

// ---------------------------------------------------------------------------
// Detect Script
// ---------------------------------------------------------------------------

/**
 * Inline script that runs device detection on page load and stores
 * the result as CSS custom properties on the <html> element and
 * as a global for runtime access.
 */
const DETECT_INLINE_SCRIPT = `
(function(){
  function writeDetectState(next) {
    var safe = Object.freeze(Object.assign({}, next));
    try {
      Object.defineProperty(window, '__CZAP_DETECT__', {
        value: safe,
        configurable: true,
        enumerable: false,
        writable: false
      });
    } catch (_) {
      try {
        window.__CZAP_DETECT__ = safe;
      } catch (_) {}
    }
  }

  try {
    var h = document.documentElement;
    var w = window.innerWidth || 0;
    var cores = navigator.hardwareConcurrency || 2;
    var mem = navigator.deviceMemory || 4;
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dpr = window.devicePixelRatio || 1;

    h.style.setProperty('--czap-vw', w + 'px');
    h.style.setProperty('--czap-cores', String(cores));
    h.style.setProperty('--czap-dpr', String(dpr));
    h.setAttribute('data-czap-touch', String(touch));
    h.setAttribute('data-czap-motion', motion ? 'reduce' : 'no-preference');
    h.setAttribute('data-czap-scheme', dark ? 'dark' : 'light');

    // Provisional tier -- conservative, no GPU probe available inline.
    // Full detect package overrides on hydration via data-czap-tier attribute.
    var tier = 'reactive';
    if (motion) tier = 'static';
    else if (cores <= 2 || mem <= 2) tier = 'styled';
    h.setAttribute('data-czap-tier', tier);
    h.setAttribute('data-czap-tier-provisional', 'true');

    writeDetectState({
      tier: tier,
      provisional: true
    });
  } catch(e) {}
})();
`.trim();

function serializeInlineRuntimePolicy(policy: RuntimeSecurityPolicy): string {
  return JSON.stringify(policy).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function runtimeBootstrapScript(policy: RuntimeSecurityPolicy): string {
  return `
import { bootstrapSlots, configureRuntimePolicy, installSwapReinit } from '@czap/astro/runtime';

configureRuntimePolicy(${serializeInlineRuntimePolicy(policy)});
bootstrapSlots();
installSwapReinit();
`.trim();
}

const WASM_RUNTIME_SCRIPT = `
import { wasmUrl } from 'virtual:czap/wasm-url';
import { configureWasmRuntime } from '@czap/astro/runtime';

configureWasmRuntime(wasmUrl);
`.trim();

/**
 * Build an `updateConfig` payload that toggles a single experimental flag
 * not yet present in Astro's declared `experimental` shape.
 *
 * The `experimental` field on `AstroConfig` is strictly keyed, so adding
 * an unknown flag requires a widening bridge. Containing that bridge
 * here keeps the cast off individual call sites.
 */
function withExperimentalFlag(flag: string, value: boolean): { experimental: Record<string, unknown> } {
  return { experimental: { [flag]: value } };
}

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

/**
 * Build the czap `AstroIntegration`.
 *
 * Plug the returned object into `astro.config.mjs`'s `integrations`
 * array. The integration wires Astro's `astro:config:setup`,
 * `astro:config:done`, `astro:server:setup`, and `astro:build:done`
 * hooks.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { integration as czap } from '@czap/astro';
 *
 * const config = defineConfig({
 *   integrations: [czap({ detect: true, workers: { enabled: true } })],
 * });
 * ```
 */
export function integration(config?: IntegrationConfig): AstroIntegration {
  const detectEnabled = config?.detect !== false;
  const serverIslandsEnabled = config?.serverIslands === true;
  const workersEnabled = config?.workers?.enabled === true;
  const gpuEnabled = config?.gpu?.enabled !== false;
  const streamEnabled = config?.stream?.enabled !== false;
  const llmEnabled = config?.llm?.enabled !== false;
  const wasmEnabled = config?.wasm?.enabled === true;
  const runtimePolicy = normalizeRuntimeSecurityPolicy({
    endpointPolicy: config?.security?.endpointPolicy,
    htmlPolicy: config?.security?.htmlPolicy,
  });

  return {
    name: '@czap/astro',

    hooks: {
      'astro:config:setup': ({ updateConfig, addClientDirective, injectScript, logger }) => {
        type AstroViteConfig = Parameters<typeof updateConfig>[0]['vite'];
        logger.info('Setting up @czap integration');

        // Astro may carry a different Vite type graph than @czap/vite. The plugin
        // runtime contract is still compatible, so the host integration owns the
        // version bridge here instead of leaking duplicate plugin shapes downstream.
        const astroViteConfig = {
          plugins: [
            plugin({
              ...(config?.vite ?? {}),
              ...(wasmEnabled ? { wasm: { enabled: true, path: config?.wasm?.path } } : {}),
            }),
          ],
        } as AstroViteConfig;

        updateConfig({
          vite: astroViteConfig,
        });

        // Register client directives
        addClientDirective({
          name: 'satellite',
          entrypoint: '@czap/astro/client-directives/satellite',
        });
        logger.info('Registered satellite client directive');

        if (streamEnabled) {
          addClientDirective({
            name: 'stream',
            entrypoint: '@czap/astro/client-directives/stream',
          });
          logger.info('Registered stream client directive');
        }

        if (llmEnabled) {
          addClientDirective({
            name: 'llm',
            entrypoint: '@czap/astro/client-directives/llm',
          });
          logger.info('Registered llm client directive');
        }

        if (workersEnabled) {
          addClientDirective({
            name: 'worker',
            entrypoint: '@czap/astro/client-directives/worker',
          });
          logger.info('Registered worker client directive');
        }

        if (gpuEnabled) {
          addClientDirective({
            name: 'gpu',
            entrypoint: '@czap/astro/client-directives/gpu',
          });
          logger.info('Registered gpu client directive');
        }

        if (wasmEnabled) {
          addClientDirective({
            name: 'wasm',
            entrypoint: '@czap/astro/client-directives/wasm',
          });
          logger.info('Registered wasm client directive');
        }

        // Inject detect script for client-side capability detection
        if (detectEnabled) {
          injectScript('head-inline', DETECT_INLINE_SCRIPT);
          logger.info('Injected detect script');

          // Inject GPU probe upgrade (deferred, non-blocking)
          if (gpuEnabled) {
            injectScript('page', DETECT_UPGRADE_SCRIPT);
            logger.info('Injected GPU probe upgrade');
          }
        }

        injectScript('page', runtimeBootstrapScript(runtimePolicy));

        if (wasmEnabled) {
          injectScript('page', WASM_RUNTIME_SCRIPT);
          logger.info('Injected wasm runtime bootstrap');
        }

        // Configure server islands if enabled.
        // `serverIslands` is not in Astro 6's declared experimental keys yet;
        // enablement is delegated via a named bridge so only the one call site
        // opts out of the declared-config shape.
        if (serverIslandsEnabled) {
          updateConfig(withExperimentalFlag('serverIslands', true));
          logger.info('Enabled server islands');
        }
      },

      'astro:config:done': ({ config: astroConfig, logger }) => {
        logger.info(`@czap configured for ${astroConfig.output} output`);
      },

      'astro:server:setup': ({ server, logger }) => {
        logger.info('@czap dev server middleware active');

        if (detectEnabled || workersEnabled) {
          server.middlewares.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
            for (const [header, value] of getCzapHeaderEntries({ detectEnabled, workersEnabled })) {
              res.setHeader(header, value);
            }
            next();
          });
        }
      },

      'astro:build:done': ({ logger }) => {
        logger.info('@czap build integration complete');
      },
    },
  };
}
