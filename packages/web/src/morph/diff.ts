/**
 * DOM Diff Algorithm
 *
 * Idiomorph-inspired DOM diffing that:
 * - Matches nodes by semantic ID (data-czap-id)
 * - Minimizes DOM mutations
 * - Preserves element identity where possible
 * - Captures and restores physical state
 * - Validates preserve constraints and emits rejections
 */

import { Diagnostics } from '@czap/core';
import { Effect } from 'effect';
import type { MorphConfig, MorphHints, MorphResult } from '../types.js';
import * as SemanticIdModule from './semantic-id.js';
import * as HintsModule from './hints.js';
import * as Physical from '../physical/capture.js';
import * as PhysicalRestore from '../physical/restore.js';

// Import pure functions from diff-pure.ts (Effect-free)
import { defaultConfig, parseHTML, isSameNode, syncAttributes, syncChildren, findBestMatch } from './diff-pure.js';

// Re-export pure functions for backwards compatibility
export { defaultConfig, parseHTML, isSameNode, syncAttributes, syncChildren, findBestMatch };

/**
 * Morph an existing DOM element to match new HTML using idiomorph-inspired
 * diffing that minimizes DOM mutations and preserves element identity.
 */
export const morph = (
  oldNode: Element,
  newHTML: string,
  config?: Partial<MorphConfig>,
  hints?: MorphHints,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const finalConfig = { ...defaultConfig, ...config };
    const fragment = parseHTML(newHTML);
    const newNodes = Array.from(fragment.childNodes);

    if (newNodes.length === 0) {
      return;
    }

    if (hints?.idMap) {
      for (const node of newNodes) {
        if (node instanceof Element) {
          SemanticIdModule.applyIdMap(node, hints.idMap);
        }
      }
    }

    if (finalConfig.morphStyle === 'outerHTML') {
      const firstNode = newNodes[0];
      if (newNodes.length === 1 && firstNode instanceof Element) {
        if (isSameNode(oldNode, firstNode, hints)) {
          syncAttributes(oldNode, firstNode, finalConfig.callbacks);
          syncChildren(oldNode, firstNode, hints);
        } else {
          oldNode.replaceWith(firstNode);
        }
      }
    } else {
      const tempParent = document.createElement(oldNode.tagName);
      tempParent.append(parseHTML(newHTML));
      syncChildren(oldNode, tempParent, hints);
    }
  });

/**
 * Morph with physical state capture and restore.
 */
export const morphWithState = (
  oldNode: Element,
  newHTML: string,
  config?: Partial<MorphConfig>,
  hints?: MorphHints,
): Effect.Effect<MorphResult> =>
  Effect.gen(function* () {
    const finalConfig = { ...defaultConfig, ...config };

    const state =
      finalConfig.preserveFocus || finalConfig.preserveScroll || finalConfig.preserveSelection
        ? yield* Physical.capture(oldNode)
        : null;

    const preserveIds = hints?.preserve ?? hints?.preserveIds ?? [];
    if (preserveIds.length > 0) {
      const preserveIndex = SemanticIdModule.buildIndex(oldNode);
      for (const id of preserveIds) {
        if (!preserveIndex.has(id)) {
          Diagnostics.warn({
            source: 'czap/web.morph',
            code: 'preserve-id-missing',
            message: `Preserve ID "${id}" was not found in the old DOM tree.`,
          });
        }
      }
    }

    yield* morph(oldNode, newHTML, finalConfig, hints);

    const rejection = HintsModule.rejectIfMissing(hints ?? {}, oldNode);
    if (rejection) {
      oldNode.dispatchEvent(
        new CustomEvent('czap:morph-rejected', {
          detail: rejection,
          bubbles: true,
        }),
      );

      oldNode.dispatchEvent(
        new CustomEvent('czap:request-snapshot', {
          detail: { reason: rejection.reason },
          bubbles: true,
        }),
      );

      return { type: 'rejected' as const, rejection };
    }

    const remapIds = hints?.remap ?? (hints?.idMap ? Object.fromEntries(hints.idMap) : undefined);
    if (remapIds) {
      SemanticIdModule.applyIdMap(oldNode, remapIds);
    }

    if (state) {
      const remappedState = remapIds ? HintsModule.applyRemap(state, remapIds) : state;
      yield* PhysicalRestore.restore(remappedState, oldNode, remapIds);
    }

    return { type: 'success' as const };
  });

/**
 * DOM morph namespace.
 */
export const Morph = {
  morph,
  morphWithState,
  parseHTML,
  defaultConfig,
} as const;
