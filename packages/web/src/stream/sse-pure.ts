/**
 * Pure SSE utilities -- Effect-free.
 *
 * Extracted from sse.ts for use by client directives.
 *
 * @module
 */

import { Millis } from '@czap/core';
import type { SSEMessage, ReconnectConfig } from '../types.js';

const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;

/**
 * Default reconnection configuration.
 */
export const defaultReconnectConfig: ReconnectConfig = {
  maxAttempts: 10,
  initialDelay: Millis(1000),
  maxDelay: Millis(30000),
  factor: 2,
};

/**
 * Return the char code of the first non-whitespace character, or -1.
 * Used as a pre-flight check to skip JSON.parse on obviously non-JSON input.
 */
const firstMeaningfulCharCode = (raw: string): number => {
  for (let index = 0; index < raw.length; index++) {
    const code = raw.charCodeAt(index);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      return code;
    }
  }

  return -1;
};

/**
 * Parse an SSE MessageEvent into a typed SSEMessage.
 * Returns null if the event data is not valid JSON or lacks a type field.
 *
 * Preflight is mandatory and unconditional: a fast first-character scan
 * runs before `JSON.parse` on every string payload. Only strings that start
 * with `{` or `[` (after leading whitespace) proceed to parse; all other
 * inputs are rejected immediately. This avoids the ~15us try/catch cost on
 * obviously non-JSON strings and closes the injection vector where a server
 * sends plain-text or numeric data that could trigger unexpected parse paths.
 * There is intentionally no opt-out — see red-team regression suite.
 */
export const parseMessage = (event: MessageEvent): SSEMessage | null => {
  let data: unknown;

  if (typeof event.data === 'string') {
    const firstChar = firstMeaningfulCharCode(event.data);
    // Only `{` (123) and `[` (91) can start valid JSON objects/arrays.
    // Anything else (plain text, numbers, empty strings) is not a structured message.
    if (firstChar !== 123 && firstChar !== 91) {
      return null;
    }

    try {
      data = JSON.parse(event.data);
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
      return null;
    }
  } else {
    // event.data is already a parsed object (e.g. from structured clone)
    data = event.data;
  }

  if (data === null || typeof data !== 'object') {
    return null;
  }
  if (!('type' in data) || typeof data.type !== 'string') {
    return null;
  }

  return data as SSEMessage;
};

/**
 * Calculate reconnection delay using exponential backoff with jitter.
 */
export const calculateDelay = (attempt: number, config: ReconnectConfig): number => {
  const delay = config.initialDelay * Math.pow(config.factor, attempt);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelay);
};

/**
 * Validate that an artifact ID is safe to use as a single URL path segment.
 */
export const validateArtifactId = (artifactId: string): string => {
  if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
    throw new Error(`Invalid artifactId "${artifactId}". Artifact IDs must be path-safe single segments.`);
  }

  return artifactId;
};

/**
 * Append an artifact ID to the end of a URL pathname exactly once.
 */
export const appendArtifactIdToUrl = (url: URL, artifactId: string): URL => {
  const safeArtifactId = validateArtifactId(artifactId);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments.at(-1);

  if (lastSegment === safeArtifactId) {
    return url;
  }

  const trimmedPath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${trimmedPath}/${encodeURIComponent(safeArtifactId)}`;
  return url;
};

/**
 * Build an SSE endpoint URL with optional artifact ID and lastEventId.
 */
export const buildUrl = (baseUrl: string, artifactId?: string, lastEventId?: string): string => {
  const url = baseUrl.startsWith('http')
    ? new URL(baseUrl)
    : new URL(baseUrl, globalThis.location?.origin ?? 'http://localhost');

  if (artifactId) {
    appendArtifactIdToUrl(url, artifactId);
  }

  if (lastEventId) {
    url.searchParams.set('lastEventId', lastEventId);
  }

  return url.toString();
};
