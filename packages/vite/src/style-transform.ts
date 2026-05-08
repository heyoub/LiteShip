/**
 * `@style` CSS block parser and compiler.
 *
 * Parses custom `@style name { state { prop: value; } }` blocks from
 * CSS source and compiles them into scoped CSS with `@layer`,
 * `@scope`, and `@starting-style` rules using resolved `StyleDef`
 * definitions.
 *
 * @module
 */

import type { Style } from '@czap/core';
import { StyleCSSCompiler } from '@czap/compiler';
import { normalizeCssLineEndings } from './normalize-css-eol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Single parsed `@style` block: the style name being referenced, its
 * per-state CSS property overrides, and provenance.
 */
export interface StyleBlock {
  /** Named style (resolved against exported `StyleDef` values). */
  readonly styleName: string;
  /** `{ stateName: { cssProp: value } }` mapping. */
  readonly states: Record<string, Record<string, string>>;
  /** Absolute source file path. */
  readonly sourceFile: string;
  /** 1-based line where the block begins. */
  readonly line: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse every `@style` block from CSS source text.
 *
 * Grammar:
 *
 * ```css
 * @style name {
 *   stateName {
 *     property: value;
 *   }
 * }
 * ```
 *
 * Follows the same nested-brace pattern as `@quantize` blocks.
 */
export function parseStyleBlocks(css: string, sourceFile: string): readonly StyleBlock[] {
  const blocks: StyleBlock[] = [];
  const lines = normalizeCssLineEndings(css).split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const atMatch = line.match(/^\s*@style\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/);

    if (atMatch) {
      const styleName = atMatch[1]!;
      const blockStartLine = i + 1; // 1-indexed
      const states: Record<string, Record<string, string>> = {};

      i++; // advance past @style line
      let braceDepth = 1;

      while (i < lines.length && braceDepth > 0) {
        const currentLine = lines[i]!;
        const trimmed = currentLine.trim();

        if (braceDepth === 1) {
          // Look for state name opening
          const stateMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/);
          if (stateMatch) {
            const stateName = stateMatch[1]!;
            const props: Record<string, string> = {};
            i++; // advance past state name line

            let stateDepth = 0;
            while (i < lines.length) {
              const propLine = lines[i]!.trim();

              for (const ch of propLine) {
                if (ch === '{') stateDepth++;
                else if (ch === '}') stateDepth--;
              }

              if (stateDepth < 0) {
                i++;
                break;
              }

              const propMatch = propLine.match(/^([a-zA-Z-][a-zA-Z0-9-]*)\s*:\s*(.+?)\s*;?\s*$/);
              if (propMatch) {
                props[propMatch[1]!] = propMatch[2]!.replace(/;$/, '').trim();
              }
              i++;
            }

            states[stateName] = props;
            continue;
          }

          // Closing brace for @style block
          if (trimmed === '}') {
            braceDepth--;
            i++;
            continue;
          }
        }

        // Track nested braces for robustness
        for (const ch of trimmed) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        i++;
      }

      blocks.push({ styleName, states, sourceFile, line: blockStartLine });
    } else {
      i++;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Compiler (delegates to @czap/compiler StyleCSSCompiler)
// ---------------------------------------------------------------------------

/**
 * Compile a parsed {@link StyleBlock} plus a resolved `StyleDef` into
 * scoped CSS with `@layer`, `@scope`, and `@starting-style` rules.
 * Delegates to the canonical `StyleCSSCompiler` to avoid duplicating
 * style-to-CSS logic.
 */
export function compileStyleBlock(block: StyleBlock, style: Style.Shape): string {
  const result = StyleCSSCompiler.compile(style, block.styleName);
  const parts = [result.layers, result.startingStyle].filter((part): part is string => part.length > 0);

  for (const [stateName, props] of Object.entries(block.states)) {
    if (Object.keys(props).length > 0) {
      const declarations = Object.entries(props)
        .map(([prop, value]) => `  ${prop}: ${value};`)
        .join('\n');
      parts.push(`/* state: ${stateName} */\n.${block.styleName}[data-state="${stateName}"] {\n${declarations}\n}`);
    }
  }

  return parts.join('\n\n');
}
