/**
 * @czap config type spine -- Config.Shape and defineConfig() contract.
 */

import type { ContentAddress, Boundary } from './core.d.ts';
import type { Token, Theme, Style } from './design.d.ts';

export declare namespace Config {
  /** User-facing input — no id, no _tag */
  export interface Input {
    readonly boundaries?: Record<string, Boundary.Shape>;
    readonly tokens?: Record<string, Token.Shape>;
    readonly themes?: Record<string, Theme.Shape>;
    readonly styles?: Record<string, Style.Shape>;
    readonly vite?: {
      readonly dirs?: Partial<Record<'boundary' | 'token' | 'theme' | 'style', string>>;
      readonly hmr?: boolean;
      readonly environments?: readonly ('browser' | 'server' | 'shader')[];
      readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
    };
    readonly astro?: {
      readonly satellite?: boolean;
      readonly edgeRuntime?: boolean;
    };
  }

  /** Frozen, content-addressed config artifact */
  export interface Shape {
    readonly _tag: 'ConfigDef';
    readonly id: ContentAddress;
    readonly boundaries: Record<string, Boundary.Shape>;
    readonly tokens: Record<string, Token.Shape>;
    readonly themes: Record<string, Theme.Shape>;
    readonly styles: Record<string, Style.Shape>;
    readonly vite?: Input['vite'];
    readonly astro?: Input['astro'];
  }
}

/** Ergonomic alias for czap.config.ts usage at the workspace root */
export declare function defineConfig(input: Config.Input): Config.Shape;
