/**
 * Config -- unified project configuration hub.
 *
 * Config.make() produces a frozen, FNV-1a content-addressed Config.Shape.
 * Projection functions are pure — no side effects, no I/O.
 */

import type { ContentAddress } from './brands.js';
import type { Boundary } from './boundary.js';
import type { Token } from './token.js';
import type { Theme } from './theme.js';
import type { Style } from './style.js';
import { fnv1a } from './fnv.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Top-level discriminator for czap primitives: which bucket a declaration belongs to. */
export type PrimitiveKind = 'boundary' | 'token' | 'theme' | 'style';

/**
 * Vite-plugin slice of a czap {@link Config.Shape}: source directories per
 * primitive kind, HMR opt-in, environment targeting, and optional WASM hints.
 */
export interface PluginConfig {
  readonly dirs?: Partial<Record<PrimitiveKind, string>>;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
}

/** Astro-integration slice of a czap {@link Config.Shape}. */
export interface AstroConfig {
  readonly satellite?: boolean;
  readonly edgeRuntime?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config namespace + value object (declaration merging — same pattern as Boundary)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Config namespace — the single hub that every czap adapter (Vite, Astro, test
 * runners, edge runtime) projects from. {@link Config.make} produces a frozen,
 * FNV-1a content-addressed {@link Config.Shape}; every projection function
 * (`toViteConfig`, `toAstroConfig`, `toTestAliases`) is pure.
 */
export const Config = {
  /** Build a frozen, content-addressed {@link Config.Shape} from raw input. */
  make(input: Config.Input): Config.Shape {
    // Sort named collection keys so insertion order doesn't affect the hash.
    const sortKeys = <V>(obj: Record<string, V>): Record<string, V> =>
      Object.fromEntries(Object.entries(obj).sort());
    const canonical = JSON.stringify({
      boundaries: sortKeys(input.boundaries ?? {}),
      tokens:     sortKeys(input.tokens     ?? {}),
      themes:     sortKeys(input.themes     ?? {}),
      styles:     sortKeys(input.styles     ?? {}),
      vite:       input.vite,
      astro:      input.astro,
    });
    const id = fnv1a(canonical);
    return Object.freeze({
      _tag:       'ConfigDef' as const,
      id,
      boundaries: input.boundaries ?? {},
      tokens:     input.tokens     ?? {},
      themes:     input.themes     ?? {},
      styles:     input.styles     ?? {},
      vite:       input.vite,
      astro:      input.astro,
    });
  },

  /** Project the Vite-plugin slice of a config for `@czap/vite`. */
  toViteConfig(cfg: Config.Shape): PluginConfig {
    return {
      ...(cfg.vite?.dirs         !== undefined && { dirs:         cfg.vite.dirs }),
      ...(cfg.vite?.hmr          !== undefined && { hmr:          cfg.vite.hmr }),
      ...(cfg.vite?.environments !== undefined && { environments: cfg.vite.environments }),
      ...(cfg.vite?.wasm         !== undefined && { wasm:         cfg.vite.wasm }),
    };
  },

  /** Project the Astro-integration slice of a config for `@czap/astro`. */
  toAstroConfig(cfg: Config.Shape): AstroConfig {
    return {
      ...(cfg.astro?.satellite   !== undefined && { satellite:   cfg.astro.satellite }),
      ...(cfg.astro?.edgeRuntime !== undefined && { edgeRuntime: cfg.astro.edgeRuntime }),
    };
  },

  /** Materialize the `@czap/*` → source-path alias map used by the vitest runner. */
  toTestAliases(cfg: Config.Shape, repoRoot: string): Record<string, string> {
    void cfg; // cfg reserved for future per-project customisation
    // Use forward-slash join so paths are portable across platforms.
    const r = (sub: string) => `${repoRoot.replace(/\\/g, '/')}/${sub}`;
    // NOTE: longer prefixes MUST come before shorter ones — vitest's alias
    // resolver matches the first prefix in iteration order, so e.g.
    // `@czap/core/testing` would be intercepted by `@czap/core` if listed first.
    return {
      '@czap/core/testing':        r('packages/core/src/testing.ts'),
      '@czap/core/harness':        r('packages/core/src/harness/index.ts'),
      '@czap/core':                r('packages/core/src/index.ts'),
      '@czap/quantizer/testing':   r('packages/quantizer/src/testing.ts'),
      '@czap/quantizer':           r('packages/quantizer/src/index.ts'),
      '@czap/compiler':            r('packages/compiler/src/index.ts'),
      '@czap/web/lite':            r('packages/web/src/lite.ts'),
      '@czap/web':                 r('packages/web/src/index.ts'),
      '@czap/detect':              r('packages/detect/src/index.ts'),
      '@czap/vite/html-transform': r('packages/vite/src/html-transform.ts'),
      '@czap/vite':                r('packages/vite/src/index.ts'),
      '@czap/astro/runtime':       r('packages/astro/src/runtime/index.ts'),
      '@czap/astro':               r('packages/astro/src/index.ts'),
      '@czap/remotion':            r('packages/remotion/src/index.ts'),
      '@czap/scene/dev':           r('packages/scene/src/dev/server.ts'),
      '@czap/scene':               r('packages/scene/src/index.ts'),
      '@czap/assets/testing':      r('packages/assets/src/testing.ts'),
      '@czap/assets':              r('packages/assets/src/index.ts'),
      '@czap/cli':                 r('packages/cli/src/index.ts'),
      '@czap/mcp-server':          r('packages/mcp-server/src/index.ts'),
      '@czap/edge':                r('packages/edge/src/index.ts'),
      '@czap/worker':              r('packages/worker/src/index.ts'),
      '@czap/_spine':              r('packages/_spine'),
    };
  },
};

export declare namespace Config {
  /** Raw user-facing input to {@link Config.make} — every field is optional. */
  interface Input {
    readonly boundaries?: Record<string, Boundary.Shape>;
    readonly tokens?: Record<string, Token.Shape>;
    readonly themes?: Record<string, Theme.Shape>;
    readonly styles?: Record<string, Style.Shape>;
    readonly vite?: Partial<PluginConfig>;
    readonly astro?: Partial<AstroConfig>;
  }

  /** Frozen, content-addressed result of {@link Config.make}. */
  interface Shape {
    readonly _tag: 'ConfigDef';
    readonly id: ContentAddress;
    readonly boundaries: Record<string, Boundary.Shape>;
    readonly tokens: Record<string, Token.Shape>;
    readonly themes: Record<string, Theme.Shape>;
    readonly styles: Record<string, Style.Shape>;
    readonly vite?: Partial<PluginConfig>;
    readonly astro?: Partial<AstroConfig>;
  }
}

/** Thin alias for {@link Config.make} — matches the `defineConfig(...)` ergonomics other tools use. */
export function defineConfig(input: Config.Input): Config.Shape {
  return Config.make(input);
}
