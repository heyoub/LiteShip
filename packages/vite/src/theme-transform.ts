/**
 * `@theme` CSS block parser and compiler.
 *
 * Parses custom `@theme name { token: value; ... }` blocks from CSS
 * source and compiles them into `html[data-theme]` selector blocks
 * plus transition declarations using resolved `ThemeDef` definitions.
 *
 * @module
 */

import type { Theme } from '@czap/core';
import { ThemeCSSCompiler } from '@czap/compiler';
import { normalizeCssLineEndings } from './normalize-css-eol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed `@theme` block: the theme to apply and any inline token
 * overrides declared on the block itself.
 */
export interface ThemeBlock {
  /** Named theme (resolved against exported `ThemeDef` values). */
  readonly themeName: string;
  /** Inline token overrides (`{ tokenName: value }`). */
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
 * Parse every `@theme` block from CSS source text.
 *
 * Grammar:
 *
 * ```css
 * @theme name {
 *   tokenName: value;
 * }
 * ```
 */
export function parseThemeBlocks(css: string, sourceFile: string): readonly ThemeBlock[] {
  const blocks: ThemeBlock[] = [];
  const lines = normalizeCssLineEndings(css).split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const atMatch = line.match(/^\s*@theme\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/);

    if (atMatch) {
      const themeName = atMatch[1]!;
      const blockStartLine = i + 1; // 1-indexed
      const declarations: Record<string, string> = {};

      i++; // advance past @theme line

      while (i < lines.length) {
        const currentLine = lines[i]!.trim();

        // Closing brace for @theme block
        if (currentLine === '}') {
          i++;
          break;
        }

        const propMatch = currentLine.match(/^([a-zA-Z-][a-zA-Z0-9_-]*)\s*:\s*(.+?)\s*;?\s*$/);
        if (propMatch) {
          declarations[propMatch[1]!] = propMatch[2]!.replace(/;$/, '').trim();
        }
        i++;
      }

      blocks.push({ themeName, declarations, sourceFile, line: blockStartLine });
    } else {
      i++;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Compiler (delegates to @czap/compiler ThemeCSSCompiler)
// ---------------------------------------------------------------------------

/**
 * Compile a parsed {@link ThemeBlock} plus a resolved `ThemeDef` into
 * `html[data-theme]` selector blocks and transition declarations.
 * Delegates to the canonical `ThemeCSSCompiler` to avoid duplicating
 * theme-to-CSS logic.
 */
export function compileThemeBlock(block: ThemeBlock, theme: Theme.Shape): string {
  const result = ThemeCSSCompiler.compile(theme);
  const parts: string[] = [];

  if (result.selectors) {
    parts.push(result.selectors);
  }
  if (result.transitions) {
    parts.push(result.transitions);
  }

  if (Object.keys(block.declarations).length > 0) {
    const overrides = Object.entries(block.declarations)
      .map(([prop, value]) => `  ${prop}: ${value};`)
      .join('\n');
    parts.push(`html {\n${overrides}\n}`);
  }

  return parts.join('\n\n');
}
