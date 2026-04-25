/**
 * Virtual module resolution and loading for czap design primitives.
 *
 * Handles Vite's `resolveId` and `load` for virtual module specifiers
 * that provide runtime access to token, boundary, and theme
 * definitions. The modules export placeholder content that the
 * transform pipeline later replaces inline.
 *
 * Virtual IDs:
 *
 * - `virtual:czap/tokens` -- JS exports of token definitions.
 * - `virtual:czap/tokens.css` -- CSS custom properties from tokens.
 * - `virtual:czap/boundaries` -- JS exports of boundary definitions.
 * - `virtual:czap/themes` -- JS exports of theme definitions.
 * - `virtual:czap/hmr-client` -- Client-side HMR handler for
 *   `czap:update` events.
 * - `virtual:czap/wasm-url` -- Resolved WASM runtime URL (or `null`).
 * - `virtual:czap/config` -- Typed handle for the workspace
 *   `czap.config.ts` hub.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIRTUAL_PREFIX = '\0virtual:czap/';

const VIRTUAL_IDS = [
  'virtual:czap/tokens',
  'virtual:czap/tokens.css',
  'virtual:czap/boundaries',
  'virtual:czap/themes',
  'virtual:czap/hmr-client',
  'virtual:czap/wasm-url',
  'virtual:czap/config',
] as const;

/** Recognised virtual module specifiers. */
export type VirtualModuleId = (typeof VIRTUAL_IDS)[number];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a virtual module ID to its internal null-byte-prefixed form
 * (as expected by Vite's module graph). Returns `undefined` when `id`
 * is not a recognised czap virtual module.
 */
export function resolveVirtualId(id: string): string | undefined {
  if (VIRTUAL_IDS.includes(id as VirtualModuleId)) {
    return VIRTUAL_PREFIX + id.slice('virtual:czap/'.length);
  }
  return undefined;
}

/**
 * Return `true` when `id` is a fully-resolved czap virtual module
 * (null-byte-prefixed). Callers use this to gate `load` handler
 * dispatch.
 */
export function isVirtualId(id: string): boolean {
  return id.startsWith(VIRTUAL_PREFIX);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Return the source for a resolved virtual module ID.
 *
 * Data modules (tokens, boundaries, themes) return empty-object stubs
 * that provide valid JS/CSS so downstream tooling (type-checkers,
 * bundlers) can operate without the full transform pipeline running.
 * Their real content flows through the CSS transform hooks in the
 * plugin -- at build time the transform replaces token, theme, and
 * quantize blocks inline, so these stubs are only hit when a consumer
 * explicitly imports the virtual module (e.g. for runtime JS access
 * to definitions).
 *
 * The `hmr-client` module is the client-side HMR handler that the
 * plugin injects into the page via `transformIndexHtml`.
 */
export function loadVirtualModule(id: string): string | undefined {
  if (!id.startsWith(VIRTUAL_PREFIX)) return undefined;

  const name = id.slice(VIRTUAL_PREFIX.length);

  switch (name) {
    case 'tokens':
      return 'export const tokens = {};';

    case 'tokens.css':
      return ':root {}';

    case 'boundaries':
      return 'export const boundaries = {};';

    case 'themes':
      return 'export const themes = {};';

    case 'hmr-client':
      return HMR_CLIENT_SOURCE;

    case 'wasm-url':
      return 'export const wasmUrl = null;';

    case 'config':
      return [
        '/** czap/config virtual module -- typed stub served by czap/vite */',
        '/** Full config is available via czap.config.ts at the workspace root */',
        'export const config = null;',
      ].join('\n');

    default:
      return undefined;
  }
}

/**
 * Client-side HMR handler injected via virtual module.
 * Listens for czap:update events on import.meta.hot and applies
 * CSS or shader uniform updates surgically without full reload.
 */
const HMR_CLIENT_SOURCE = `
if (import.meta.hot) {
  import.meta.hot.on('czap:update', (payload) => {
    if (typeof document === 'undefined') return;
    if (payload.css !== undefined) {
      const sel = 'style[data-czap-boundary="' + payload.boundary + '"]';
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('style');
        el.setAttribute('data-czap-boundary', payload.boundary);
        document.head.appendChild(el);
      }
      el.textContent = payload.css;
    }
    if (payload.uniforms !== undefined) {
      document.dispatchEvent(new CustomEvent('czap:uniform-update', {
        detail: { boundary: payload.boundary, uniforms: payload.uniforms },
        bubbles: true,
      }));
      document.querySelectorAll('canvas[data-czap-boundary="' + payload.boundary + '"]').forEach((canvas) => {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (!gl) return;
        const program = canvas.__czapProgram;
        if (!program) return;
        Object.entries(payload.uniforms).forEach(([name, value]) => {
          const loc = gl.getUniformLocation(program, name);
          if (loc !== null) gl.uniform1f(loc, value);
        });
      });
    }
  });
}
`.trim();
