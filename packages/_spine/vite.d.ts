/**
 * @czap/vite type spine -- Vite 8 plugin for @token, @theme, @style, @quantize processing + HMR.
 */

import type { Boundary } from './core.d.ts';
import type { Token, Theme, Style } from './design.d.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// § 0. PRIMITIVE KIND
// ═══════════════════════════════════════════════════════════════════════════════

export type PrimitiveKind = 'boundary' | 'token' | 'theme' | 'style';

export type PrimitiveShape<K extends PrimitiveKind> =
  K extends 'boundary' ? Boundary.Shape :
  K extends 'token' ? Token.Shape :
  K extends 'theme' ? Theme.Shape :
  Style.Shape;

export interface PrimitiveResolution<K extends PrimitiveKind> {
  readonly primitive: PrimitiveShape<K>;
  readonly source: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. PLUGIN CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export interface PluginConfig {
  readonly dirs?: Partial<Record<PrimitiveKind, string>>;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. PLUGIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════════

export declare function plugin(config?: PluginConfig): import('vite').Plugin;

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. @quantize CSS TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════════

export interface QuantizeBlock {
  readonly boundaryName: string;
  readonly states: Record<string, Record<string, string>>;
  readonly sourceFile: string;
  readonly line: number;
}

export declare function parseQuantizeBlocks(css: string, sourceFile: string): readonly QuantizeBlock[];

export declare function compileQuantizeBlock(block: QuantizeBlock, boundary: Boundary.Shape): string;

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. @token CSS TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════════

export interface TokenBlock {
  readonly tokenName: string;
  readonly declarations: Record<string, string>;
  readonly sourceFile: string;
  readonly line: number;
}

export declare function parseTokenBlocks(css: string, sourceFile: string): readonly TokenBlock[];

export declare function compileTokenBlock(block: TokenBlock, token: Token.Shape): string;

// ═══════════════════════════════════════════════════════════════════════════════
// § 5. @theme CSS TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════════

export interface ThemeBlock {
  readonly themeName: string;
  readonly declarations: Record<string, string>;
  readonly sourceFile: string;
  readonly line: number;
}

export declare function parseThemeBlocks(css: string, sourceFile: string): readonly ThemeBlock[];

export declare function compileThemeBlock(block: ThemeBlock, theme: Theme.Shape): string;

// ═══════════════════════════════════════════════════════════════════════════════
// § 6. @style CSS TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════════

export interface StyleBlock {
  readonly styleName: string;
  readonly states: Record<string, Record<string, string>>;
  readonly sourceFile: string;
  readonly line: number;
}

export declare function parseStyleBlocks(css: string, sourceFile: string): readonly StyleBlock[];

export declare function compileStyleBlock(block: StyleBlock, style: Style.Shape): string;

// ═══════════════════════════════════════════════════════════════════════════════
// § 7. PRIMITIVE RESOLUTION (generic)
// ═══════════════════════════════════════════════════════════════════════════════

export declare function resolvePrimitive<K extends PrimitiveKind>(
  kind: K,
  name: string,
  fromFile: string,
  projectRoot: string,
  userDir?: string,
): Promise<PrimitiveResolution<K> | null>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 11. VIRTUAL MODULES
// ═══════════════════════════════════════════════════════════════════════════════

export type VirtualModuleId =
  | 'virtual:czap/tokens'
  | 'virtual:czap/tokens.css'
  | 'virtual:czap/boundaries'
  | 'virtual:czap/themes'
  | 'virtual:czap/config';

export declare function resolveVirtualId(id: string): string | undefined;
export declare function isVirtualId(id: string): boolean;
export declare function loadVirtualModule(id: string): string | undefined;

// ═══════════════════════════════════════════════════════════════════════════════
// § 12. HMR
// ═══════════════════════════════════════════════════════════════════════════════

export interface HMRPayload {
  readonly type: 'czap:update';
  readonly boundary: string;
  readonly css?: string;
  readonly uniforms?: Record<string, number>;
}

export declare function handleHMR(payload: HMRPayload): void;
