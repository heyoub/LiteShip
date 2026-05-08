/**
 * `@quantize` CSS block parser and compiler.
 *
 * Parses custom `@quantize boundaryName { state { prop: value } }` blocks
 * from CSS source and compiles them into native `@container` queries using
 * resolved `BoundaryDef` thresholds.
 *
 * @module
 */

import type { Boundary } from '@czap/core';
import { CSSCompiler } from '@czap/compiler';
import { normalizeCssLineEndings } from './normalize-css-eol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single parsed `@quantize` block: the boundary being quantised, the
 * per-state property bag, and provenance info so HMR can emit
 * source-mapped warnings.
 */
export interface QuantizeBlock {
  /** Boundary name referenced in the at-rule preamble. */
  readonly boundaryName: string;
  /** `{ stateName: { cssProp: value } }` mapping. */
  readonly states: Record<string, Record<string, string>>;
  /** Absolute path of the CSS source file. */
  readonly sourceFile: string;
  /** 1-based source line where the block begins. */
  readonly line: number;
}

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

/**
 * Parse all property declarations inside a state block starting at `pos`
 * (the character immediately after the opening `{` of the state block).
 *
 * Uses character-level scanning so multi-line values -- e.g.
 *   background: linear-gradient(
 *     to bottom,
 *     red,
 *     blue
 *   );
 * -- are collected as a single declaration before matching.
 *
 * Tracks paren depth so commas/semicolons inside functional notation
 * (var(), calc(), linear-gradient(), etc.) are not treated as delimiters.
 * Tracks brace depth so values containing braces (e.g. `var(--x, empty)`)
 * do not prematurely close the state block.
 *
 * Returns the parsed properties and the position immediately after the
 * closing `}` of the state block.
 */
function parseStateDeclarations(css: string, pos: number): { props: Record<string, string>; end: number } {
  const props: Record<string, string> = {};
  let braceDepth = 0;

  while (pos < css.length) {
    // Skip whitespace between declarations
    while (pos < css.length && /\s/.test(css[pos]!)) pos++;
    if (pos >= css.length) break;

    const ch = css[pos]!;

    // Skip block comments
    if (ch === '/' && css[pos + 1] === '*') {
      pos += 2;
      while (pos < css.length - 1 && !(css[pos] === '*' && css[pos + 1] === '/')) pos++;
      pos += 2;
      continue;
    }

    // Closing brace of the state block
    if (ch === '}' && braceDepth === 0) {
      pos++;
      return { props, end: pos };
    }

    // Opening brace nested inside a value (e.g. var(--x, {}))
    if (ch === '{') {
      braceDepth++;
      pos++;
      continue;
    }

    if (ch === '}') {
      braceDepth--;
      pos++;
      continue;
    }

    // Accumulate a full declaration: collect until `;` at paren-depth 0,
    // or until `}` that closes this state block, whichever comes first.
    let declBuf = '';
    let parenDepth = 0;

    while (pos < css.length) {
      const dc = css[pos]!;

      // Skip block comments inside declaration
      if (dc === '/' && css[pos + 1] === '*') {
        pos += 2;
        while (pos < css.length - 1 && !(css[pos] === '*' && css[pos + 1] === '/')) pos++;
        pos += 2;
        continue;
      }

      // Skip quoted strings
      if (dc === '"' || dc === "'") {
        const quote = dc;
        declBuf += dc;
        pos++;
        while (pos < css.length && css[pos] !== quote) {
          if (css[pos] === '\\') {
            declBuf += css[pos]!;
            pos++;
          }
          declBuf += css[pos]!;
          pos++;
        }
        if (pos < css.length) {
          declBuf += css[pos]!;
          pos++;
        }
        continue;
      }

      if (dc === '(') {
        parenDepth++;
        declBuf += dc;
        pos++;
        continue;
      }
      if (dc === ')') {
        parenDepth--;
        declBuf += dc;
        pos++;
        continue;
      }

      // Semicolon at paren-depth 0 ends the declaration
      if (dc === ';' && parenDepth === 0) {
        pos++;
        break;
      }

      // Unmatched `}` at paren-depth 0 closes the state block --
      // do NOT consume it here; the outer loop will handle it.
      if (dc === '}' && parenDepth === 0) {
        break;
      }

      declBuf += dc;
      pos++;
    }

    const decl = declBuf.trim();
    if (decl.length === 0) continue;

    // Match `property-name: value` (property names are [a-zA-Z-][a-zA-Z0-9-]*)
    const colonIdx = decl.indexOf(':');
    if (colonIdx > 0) {
      const propName = decl.slice(0, colonIdx).trim();
      const propValue = decl.slice(colonIdx + 1).trim();
      if (/^[a-zA-Z-][a-zA-Z0-9-]*$/.test(propName) && propValue.length > 0) {
        props[propName] = propValue;
      }
    }
  }

  return { props, end: pos };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse every `@quantize` block from CSS source text.
 *
 * Grammar:
 *
 * ```css
 * @quantize boundaryName {
 *   stateName {
 *     property: value;
 *   }
 * }
 * ```
 *
 * The outer `@quantize` and state-name matching is line-based for
 * simplicity; property declarations inside state blocks use a
 * character-level parser so that multi-line values (e.g.
 * `linear-gradient` spread across lines) are collected correctly
 * before being matched.
 */
export function parseQuantizeBlocks(css: string, sourceFile: string): readonly QuantizeBlock[] {
  const normalized = normalizeCssLineEndings(css);
  const blocks: QuantizeBlock[] = [];
  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const atMatch = line.match(/^\s*@quantize\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/);

    if (atMatch) {
      const boundaryName = atMatch[1]!;
      const blockStartLine = i + 1; // 1-indexed
      const states: Record<string, Record<string, string>> = {};

      i++; // advance past @quantize line
      let braceDepth = 1;

      while (i < lines.length && braceDepth > 0) {
        const currentLine = lines[i]!;
        const trimmed = currentLine.trim();

        if (braceDepth === 1) {
          // Look for a state block opening: `stateName {`
          const stateMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/);
          if (stateMatch) {
            const stateName = stateMatch[1]!;

            // Compute the character offset of the `{` that opens this state
            // block inside the full CSS string so we can hand off to the
            // character-level parser.
            const lineOffset = normalized.split('\n').slice(0, i).join('\n').length + 1;
            const openBrace = lineOffset + currentLine.indexOf('{') + 1;

            const { props, end } = parseStateDeclarations(normalized, openBrace);
            states[stateName] = props;

            // Advance the line cursor to the line that contains `end`
            let charCount = 0;
            let lineIdx = 0;
            for (const l of normalized.split('\n')) {
              charCount += l.length + 1; // +1 for the '\n'
              lineIdx++;
              if (charCount >= end) break;
            }
            i = lineIdx;
            continue;
          }

          // Closing brace for the @quantize block
          if (trimmed === '}') {
            braceDepth--;
            i++;
            continue;
          }
        }

        // Track nested braces outside of state blocks for robustness
        for (const ch of trimmed) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        i++;
      }

      blocks.push({
        boundaryName,
        states,
        sourceFile,
        line: blockStartLine,
      });
    } else {
      i++;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Compiler (delegates to @czap/compiler CSSCompiler)
// ---------------------------------------------------------------------------

/**
 * Compile a parsed {@link QuantizeBlock} plus its resolved
 * {@link Boundary.Shape} into CSS `@container` query rules. Delegates
 * to the canonical `CSSCompiler` to avoid duplicating threshold-to-query
 * logic.
 */
export function compileQuantizeBlock(block: QuantizeBlock, boundary: Boundary.Shape): string {
  const result = CSSCompiler.compile(boundary, block.states);
  return CSSCompiler.serialize(result);
}
