/**
 * FNV-1a hash utility for content addressing.
 *
 * Shared implementation used by Boundary, Token, Style, Theme, Component,
 * and GenFrame modules. Produces `fnv1a:XXXXXXXX` ContentAddress values.
 *
 * @module
 */

import type { ContentAddress } from './brands.js';
import { ContentAddress as mkContentAddress } from './brands.js';

/** FNV-1a hash of a string, returned as a ContentAddress. */
export function fnv1a(str: string): ContentAddress {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mkContentAddress(`fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`);
}

/** FNV-1a hash of raw bytes, returned as a ContentAddress. */
export function fnv1aBytes(bytes: Uint8Array): ContentAddress {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return mkContentAddress(`fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`);
}
