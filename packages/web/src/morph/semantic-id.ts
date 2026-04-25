/**
 * Semantic ID Matching
 *
 * Nodes with the same data-czap-id are considered the "same" node
 * across morphs, preserving DOM identity and associated state.
 */

import type { MatchPriority, MatchResult } from '../types.js';

/**
 * The attribute name for semantic IDs.
 */
export const ATTR = 'data-czap-id';

/**
 * Get the semantic ID of an element.
 */
export const get = (element: Element): string | null => {
  return element.getAttribute(ATTR);
};

/**
 * Set the semantic ID of an element.
 */
export const set = (element: Element, id: string): void => {
  element.setAttribute(ATTR, id);
};

/**
 * Check if two elements have matching semantic IDs.
 */
export const matches = (a: Element, b: Element): boolean => {
  const aId = get(a);
  const bId = get(b);
  return aId !== null && bId !== null && aId === bId;
};

/**
 * Generate a semantic ID for an element based on its position.
 * Used when no explicit semantic ID is provided.
 */
export const generate = (element: Element, index: number): string => {
  const tagName = element.tagName.toLowerCase();
  const id = element.id;
  const className = element.className;

  if (id) {
    return `${tagName}#${id}`;
  }

  if (className && typeof className === 'string') {
    const classes = className.trim().replace(/\s+/g, '.');
    if (classes) {
      return `${tagName}.${classes}:${index}`;
    }
  }

  return `${tagName}:${index}`;
};

/**
 * Build an index of elements by semantic ID.
 */
export const buildIndex = (root: Element): Map<string, Element> => {
  const index = new Map<string, Element>();

  const rootId = get(root);
  if (rootId) {
    index.set(rootId, root);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;

  while ((node = walker.nextNode())) {
    /* v8 ignore next — TreeWalker created with NodeFilter.SHOW_ELEMENT only yields
       Element nodes; the guard narrows the Node|null return for TypeScript. */
    if (!(node instanceof Element)) continue;
    const id = get(node);
    if (id) {
      index.set(id, node);
    }
  }

  return index;
};

/**
 * Find an element by semantic ID within a root.
 */
export const find = (root: Element, id: string): Element | null => {
  if (get(root) === id) {
    return root;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;

  while ((node = walker.nextNode())) {
    /* v8 ignore next — TreeWalker(SHOW_ELEMENT) only yields Element nodes; guard narrows Node|null. */
    if (!(node instanceof Element)) continue;
    if (get(node) === id) {
      return node;
    }
  }

  return null;
};

/**
 * Apply ID remapping to an element tree.
 * Used when server renames semantic IDs.
 */
export const applyIdMap = (root: Element, map: ReadonlyMap<string, string> | Record<string, string>): void => {
  const entries = map instanceof Map ? map : new Map(Object.entries(map));

  const rootId = get(root);
  if (rootId && entries.has(rootId)) {
    set(root, entries.get(rootId)!);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;

  while ((node = walker.nextNode())) {
    /* v8 ignore next — TreeWalker(SHOW_ELEMENT) only yields Element nodes; guard narrows Node|null. */
    if (!(node instanceof Element)) continue;
    const id = get(node);
    if (id && entries.has(id)) {
      set(node, entries.get(id)!);
    }
  }
};

/**
 * Match nodes with priority ordering:
 * 1. Semantic ID (highest priority)
 * 2. DOM ID
 * 3. Structural match (tag name, attributes)
 */
export const matchNodes = (oldNode: Element, newNode: Element): MatchResult => {
  const oldSemanticId = get(oldNode);
  const newSemanticId = get(newNode);

  if (oldSemanticId && newSemanticId) {
    if (oldSemanticId === newSemanticId) {
      return {
        matches: true,
        priority: 'semantic',
        matchedId: oldSemanticId,
      };
    }
    return { matches: false, priority: 'none' };
  }

  if (oldNode.id && newNode.id) {
    if (oldNode.id === newNode.id) {
      return {
        matches: true,
        priority: 'dom-id',
        matchedId: oldNode.id,
      };
    }
    return { matches: false, priority: 'none' };
  }

  if (oldNode.tagName !== newNode.tagName) {
    return { matches: false, priority: 'none' };
  }

  if (isFormElement(oldNode) && isFormElement(newNode)) {
    if (oldNode.type !== newNode.type) {
      return { matches: false, priority: 'none' };
    }

    if (oldNode.name && newNode.name && oldNode.name !== newNode.name) {
      return { matches: false, priority: 'none' };
    }

    return { matches: true, priority: 'structural' };
  }

  return { matches: true, priority: 'structural' };
};

/**
 * Check if element is a form element.
 */
function isFormElement(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

/**
 * Find the best matching element in a list of candidates.
 * Returns the match with highest priority.
 */
export const findBestMatch = (
  target: Element,
  candidates: Element[],
): { element: Element; result: MatchResult } | null => {
  if (candidates.length === 0) {
    return null;
  }

  let bestMatch: { element: Element; result: MatchResult } | null = null;
  const priorityOrder: MatchPriority[] = ['semantic', 'dom-id', 'structural'];

  for (const candidate of candidates) {
    const result = matchNodes(target, candidate);

    if (!result.matches) {
      continue;
    }

    if (!bestMatch) {
      bestMatch = { element: candidate, result };
      continue;
    }

    const currentPriorityIndex = priorityOrder.indexOf(result.priority);
    const bestPriorityIndex = priorityOrder.indexOf(bestMatch.result.priority);

    if (currentPriorityIndex < bestPriorityIndex) {
      bestMatch = { element: candidate, result };
    }
  }

  return bestMatch;
};

/**
 * Consolidated namespace export matching the spine contract.
 */
export const SemanticId = {
  ATTR,
  get,
  set,
  matches,
  generate,
  buildIndex,
  find,
  matchNodes,
  findBestMatch,
} as const;
