/**
 * `@czap/web/lite` -- Effect-free entry point.
 *
 * Provides pure DOM morph, SSE utilities, and resumption helpers
 * without any Effect runtime dependency. Used by Astro client
 * directives that must not ship the Effect framework.
 *
 * @module
 */

// Pure morph
export {
  parseHTML,
  isSameNode,
  syncAttributes,
  syncChildren,
  findBestMatch,
  morphElement,
  morphPure,
  defaultConfig as defaultMorphConfig,
} from './morph/diff-pure.js';
export { createHtmlFragment, resolveHtmlString, sanitizeHTML } from './security/html-trust.js';
export { isPrivateOrReservedIP, resolveRuntimeUrl } from './security/runtime-url.js';

// Semantic ID (already Effect-free)
export {
  ATTR as SEMANTIC_ID_ATTR,
  get as getSemanticId,
  set as setSemanticId,
  matches as matchSemanticIds,
  buildIndex as buildSemanticIndex,
  find as findBySemanticId,
  applyIdMap,
} from './morph/semantic-id.js';

// Pure SSE utilities
export { parseMessage, buildUrl, calculateDelay, defaultReconnectConfig } from './stream/sse-pure.js';

// Pure resumption utilities
export { parseEventId, canResume } from './stream/resumption-pure.js';

// Types (re-export what directives need)
export type {
  MorphHints,
  MorphConfig,
  MorphCallbacks,
  SSEMessage,
  ReconnectConfig,
  SSEState,
  HtmlPolicy,
  RuntimeEndpointKind,
  RuntimeEndpointPolicy,
} from './types.js';
