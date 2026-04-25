/**
 * Pure DOM diff functions -- Effect-free morph primitives.
 *
 * Extracted from diff.ts for use by client directives that must
 * not ship the Effect runtime. These are the core synchronous
 * DOM manipulation functions with zero external dependencies
 * beyond the browser DOM API.
 *
 * @module
 */

import type { MorphConfig, MorphHints, MorphCallbacks } from '../types.js';
import { createHtmlFragment } from '../security/html-trust.js';
import * as SemanticIdModule from './semantic-id.js';

/**
 * Default morph configuration.
 */
export const defaultConfig: MorphConfig = {
  preserveFocus: true,
  preserveScroll: true,
  preserveSelection: true,
  morphStyle: 'innerHTML',
};

/**
 * Parse an HTML string into a DocumentFragment using a template element.
 */
export const parseHTML = (html: string): DocumentFragment => {
  return createHtmlFragment(html.trim(), { policy: 'sanitized-html' });
};

/**
 * Diff two nodes and determine if they should be considered "same".
 */
export const isSameNode = (oldNode: Element, newNode: Element, hints?: MorphHints): boolean => {
  if (SemanticIdModule.matches(oldNode, newNode)) {
    return true;
  }

  const oldId = SemanticIdModule.get(oldNode);
  const newId = SemanticIdModule.get(newNode);
  if (hints?.semanticIds && oldId && newId) {
    if (hints.semanticIds.includes(oldId) && hints.semanticIds.includes(newId)) {
      return true;
    }
  }

  if (oldNode.tagName === newNode.tagName) {
    const oldId = oldNode.getAttribute('id');
    const newId = newNode.getAttribute('id');
    if (oldId && oldId === newId) {
      return true;
    }
  }

  if (oldNode.tagName !== newNode.tagName) {
    return false;
  }

  if (oldNode instanceof HTMLInputElement && newNode instanceof HTMLInputElement) {
    return oldNode.type === newNode.type && oldNode.name === newNode.name;
  }

  return true;
};

/**
 * Synchronize attributes between nodes.
 */
export const syncAttributes = (oldNode: Element, newNode: Element, callbacks?: MorphCallbacks): void => {
  const oldAttrs = oldNode.attributes;
  for (let i = oldAttrs.length - 1; i >= 0; i--) {
    const attr = oldAttrs[i]!;
    if (!newNode.hasAttribute(attr.name)) {
      const shouldUpdate = callbacks?.beforeAttributeUpdate?.(oldNode, attr.name, null) ?? true;
      if (shouldUpdate) {
        oldNode.removeAttribute(attr.name);
      }
    }
  }

  const newAttrs = newNode.attributes;
  for (let i = 0; i < newAttrs.length; i++) {
    const attr = newAttrs[i]!;
    const oldValue = oldNode.getAttribute(attr.name);

    if (oldValue !== attr.value) {
      const shouldUpdate = callbacks?.beforeAttributeUpdate?.(oldNode, attr.name, attr.value) ?? true;
      if (shouldUpdate) {
        oldNode.setAttribute(attr.name, attr.value);
      }
    }
  }

  if (oldNode instanceof HTMLInputElement && newNode instanceof HTMLInputElement) {
    if (oldNode.value !== newNode.value) {
      oldNode.value = newNode.value;
    }
    if (oldNode.checked !== newNode.checked) {
      oldNode.checked = newNode.checked;
    }
  }

  if (oldNode instanceof HTMLTextAreaElement && newNode instanceof HTMLTextAreaElement) {
    if (oldNode.value !== newNode.value) {
      oldNode.value = newNode.value;
    }
  }

  if (oldNode instanceof HTMLSelectElement && newNode instanceof HTMLSelectElement) {
    if (oldNode.value !== newNode.value) {
      oldNode.value = newNode.value;
    }
  }
};

/**
 * Morph a single element (attributes + children).
 */
export function morphElement(oldElement: Element, newElement: Element, hints?: MorphHints): void {
  syncAttributes(oldElement, newElement);
  syncChildren(oldElement, newElement, hints);
}

function insertBeforeOrAppend(parent: Element, node: Node, referenceNode?: Node): void {
  if (referenceNode?.parentNode === parent) {
    parent.insertBefore(node, referenceNode);
    return;
  }

  parent.appendChild(node);
}

function moveChildIntoPosition(parent: Element, oldChildren: readonly ChildNode[], oldIdx: number, node: Node): void {
  if (oldIdx >= oldChildren.length || oldChildren[oldIdx] === node) {
    return;
  }

  insertBeforeOrAppend(parent, node, oldChildren[oldIdx]);
}

/**
 * Find the best matching node in a list.
 */
export const findBestMatch = (node: Element, candidates: Element[], hints?: MorphHints): Element | null => {
  if (candidates.length === 0) {
    return null;
  }

  const nodeSemanticId = SemanticIdModule.get(node);

  if (nodeSemanticId) {
    for (const candidate of candidates) {
      if (SemanticIdModule.get(candidate) === nodeSemanticId) {
        return candidate;
      }
    }
  }

  const nodeId = node.getAttribute('id');
  if (nodeId) {
    for (const candidate of candidates) {
      if (candidate.getAttribute('id') === nodeId) {
        return candidate;
      }
    }
  }

  for (const candidate of candidates) {
    if (isSameNode(node, candidate, hints)) {
      return candidate;
    }
  }

  return null;
};

/**
 * Synchronize children between nodes using diff algorithm.
 */
export const syncChildren = (oldParent: Element, newParent: Element, hints?: MorphHints): void => {
  const oldChildren = Array.from(oldParent.childNodes);
  const newChildren = Array.from(newParent.childNodes);

  const oldElementChildren = oldChildren.filter((n): n is Element => n instanceof Element);
  const oldSemanticIndex = new Map<string, Element>();

  for (const child of oldElementChildren) {
    const semanticId = SemanticIdModule.get(child);
    if (semanticId) {
      oldSemanticIndex.set(semanticId, child);
    }
  }

  const matched = new Set<Node>();

  let oldIdx = 0;
  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i]!;

    if (newChild instanceof Text) {
      const newText = newChild.data;

      if (oldIdx < oldChildren.length) {
        const oldChild = oldChildren[oldIdx]!;

        if (oldChild.nodeType === Node.TEXT_NODE) {
          if (oldChild.textContent !== newText) {
            oldChild.textContent = newText;
          }
          matched.add(oldChild);
          oldIdx++;
          continue;
        }
      }

      const textNode = document.createTextNode(newText);
      insertBeforeOrAppend(oldParent, textNode, oldChildren[oldIdx]);
      continue;
    }

    if (newChild instanceof Element) {
      const newElement = newChild;
      const semanticId = SemanticIdModule.get(newElement);

      if (semanticId && oldSemanticIndex.has(semanticId)) {
        const oldElement = oldSemanticIndex.get(semanticId)!;

        morphElement(oldElement, newElement, hints);
        matched.add(oldElement);

        moveChildIntoPosition(oldParent, oldChildren, oldIdx, oldElement);
        oldIdx++;
        continue;
      }

      const remainingOldChildren = oldElementChildren.filter((c) => !matched.has(c));
      const bestMatch = findBestMatch(newElement, remainingOldChildren, hints);

      if (bestMatch) {
        morphElement(bestMatch, newElement, hints);
        matched.add(bestMatch);

        moveChildIntoPosition(oldParent, oldChildren, oldIdx, bestMatch);
        oldIdx++;
        continue;
      }

      const clonedElement = newElement.cloneNode(true);
      /* v8 ignore next — `newElement` is already an Element in this branch, and
         Element.cloneNode(true) always returns an Element of the same kind; the
         instanceof guard narrows the DOM `Node` return type for TypeScript. */
      if (clonedElement instanceof Element) {
        insertBeforeOrAppend(oldParent, clonedElement, oldChildren[oldIdx]);
      }
      continue;
    }

    oldIdx++;
  }

  for (const oldChild of oldChildren) {
    if (!matched.has(oldChild) && oldChild.parentNode === oldParent) {
      oldParent.removeChild(oldChild);
    }
  }
};

/**
 * Apply a morph: parse new HTML and sync into the target element.
 * This is the Effect-free equivalent of Morph.morph().
 */
export const morphPure = (
  oldNode: Element,
  newHTML: string,
  config?: Partial<MorphConfig>,
  hints?: MorphHints,
): void => {
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
};
