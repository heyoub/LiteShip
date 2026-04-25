/**
 * `@token` CSS block parser and compiler.
 *
 * Parses custom `@token name { prop: value; ... }` blocks from CSS
 * source and compiles them into CSS custom properties plus
 * `@property` registrations using resolved `TokenDef` definitions.
 *
 * @module
 */

import type { Token } from '@czap/core';
import { TokenCSSCompiler } from '@czap/compiler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed `@token` block: the token to emit and any inline overrides.
 */
export interface TokenBlock {
  /** Named token (resolved against exported `TokenDef` values). */
  readonly tokenName: string;
  /** Inline overrides (`{ cssProp: value }`). */
  readonly declarations: Record<string, string>;
  /** Absolute source file path. */
  readonly sourceFile: string;
  /** 1-based line where the block begins. */
  readonly line: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse every `@token` block from CSS source text.
 *
 * Grammar:
 *
 * ```css
 * @token name {
 *   property: value;
 * }
 * ```
 */
export function parseTokenBlocks(css: string, sourceFile: string): readonly TokenBlock[] {
  const blocks: TokenBlock[] = [];
  const lines = css.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const atMatch = line.match(/^\s*@token\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/);

    if (atMatch) {
      const tokenName = atMatch[1]!;
      const blockStartLine = i + 1; // 1-indexed
      const declarations: Record<string, string> = {};

      i++; // advance past @token line

      while (i < lines.length) {
        const currentLine = lines[i]!.trim();

        // Closing brace for @token block
        if (currentLine === '}') {
          i++;
          break;
        }

        const propMatch = currentLine.match(/^([a-zA-Z-][a-zA-Z0-9-]*)\s*:\s*(.+?)\s*;?\s*$/);
        if (propMatch) {
          declarations[propMatch[1]!] = propMatch[2]!.replace(/;$/, '').trim();
        }
        i++;
      }

      blocks.push({ tokenName, declarations, sourceFile, line: blockStartLine });
    } else {
      i++;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Compiler (delegates to @czap/compiler TokenCSSCompiler)
// ---------------------------------------------------------------------------

/**
 * Compile a parsed {@link TokenBlock} plus a resolved `TokenDef` into
 * CSS custom property declarations. Delegates to the canonical
 * `TokenCSSCompiler` to avoid duplicating token-to-CSS logic.
 */
export function compileTokenBlock(block: TokenBlock, token: Token.Shape): string {
  const result = TokenCSSCompiler.compile(token);
  const parts: string[] = [];

  if (result.customProperties) {
    parts.push(result.customProperties);
  }
  if (result.themed) {
    parts.push(result.themed);
  }

  if (Object.keys(block.declarations).length > 0) {
    const overrides = Object.entries(block.declarations)
      .map(([prop, value]) => `  ${prop}: ${value};`)
      .join('\n');
    parts.push(`:root {\n${overrides}\n}`);
  }

  return parts.join('\n\n');
}
