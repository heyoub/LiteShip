/**
 * Slot Path Addressing
 *
 * Slots are forward-slash prefixed paths that address DOM regions.
 */

import { SlotPath } from '../types.js';
export { SlotPath } from '../types.js';

/**
 * The root slot path constant.
 */
const ROOT: SlotPath = SlotPath('/');

/**
 * Parse a string into a validated SlotPath.
 * Throws if the path is invalid.
 */
export const parse = (path: string): SlotPath => {
  if (!isValid(path)) {
    throw new Error(
      `Invalid slot path: ${path}. Must start with "/" and contain only alphanumeric, hyphens, underscores.`,
    );
  }
  return path;
};

/**
 * Check if a string is a valid slot path.
 */
export const isValid = (path: string): path is SlotPath => {
  if (!path.startsWith('/')) {
    return false;
  }

  if (path === '/') {
    return true;
  }

  const segments = path.slice(1).split('/');

  for (const segment of segments) {
    if (segment === '') {
      return false;
    }

    if (segment === '.' || segment === '..') {
      return false;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
      return false;
    }
  }

  return true;
};

/**
 * Convert a SlotPath to a CSS selector.
 */
export const toSelector = (path: SlotPath): string => {
  return `[data-czap-slot="${path}"]`;
};

/**
 * Get the parent path of a slot.
 */
export const parent = (path: SlotPath): SlotPath | null => {
  if ((path as string) === '/') {
    return null;
  }

  const lastSlashIndex = path.lastIndexOf('/');

  if (lastSlashIndex === 0) {
    return ROOT;
  }

  return SlotPath(path.slice(0, lastSlashIndex));
};

/**
 * Get all ancestor paths of a slot.
 */
export const ancestors = (path: SlotPath): readonly SlotPath[] => {
  const result: SlotPath[] = [];
  let current = path;

  while (true) {
    const parentPath = parent(current);
    if (parentPath === null) {
      break;
    }
    result.push(parentPath);
    current = parentPath;
  }

  return result;
};

/**
 * Check if a path is a descendant of another.
 */
export const isDescendant = (path: SlotPath, ancestor: SlotPath): boolean => {
  if (path === ancestor) {
    return false;
  }

  if ((ancestor as string) === '/') {
    return (path as string) !== '/';
  }

  return path.startsWith(ancestor + '/');
};

/**
 * Join path segments into a SlotPath.
 */
export const join = (base: SlotPath, ...segments: string[]): SlotPath => {
  if (segments.length === 0) {
    return base;
  }

  let result = (base as string) === '/' ? '' : (base as string);

  for (const segment of segments) {
    if (segment === '') {
      continue;
    }

    const cleanSegment = segment.startsWith('/') ? segment.slice(1) : segment;

    if (cleanSegment === '') {
      continue;
    }

    result += '/' + cleanSegment;
  }

  if (result === '') {
    result = '/';
  }

  return parse(result);
};

/**
 * Get the last segment of a path.
 */
export const basename = (path: SlotPath): string => {
  if ((path as string) === '/') {
    return '';
  }

  const lastSlashIndex = path.lastIndexOf('/');
  return path.slice(lastSlashIndex + 1);
};

/**
 * Consolidated namespace export matching the spine contract.
 */
export const SlotAddressing = {
  parse,
  isValid,
  toSelector,
  parent,
  ancestors,
  isDescendant,
  join,
  basename,
  brand: SlotPath,
} as const;
