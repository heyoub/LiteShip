/**
 * SSE Resumption Protocol
 *
 * Handles connection resumption using lastEventId.
 * Implements replay/snapshot fallback when events are missed.
 */

import { Effect } from 'effect';
import { Millis } from '@czap/core';
import type { ResumptionConfig, ResumptionState, ResumeResponse } from '../types.js';
import { appendArtifactIdToUrl, validateArtifactId } from './sse-pure.js';
import { resolveRuntimeUrl } from '../security/runtime-url.js';

// Import pure functions and re-export (Effect-free)
import { parseEventId as _parseEventId, canResume as _canResume } from './resumption-pure.js';
/** Re-export of the Effect-free event-id parser from `./resumption-pure.js`. */
export const parseEventId = _parseEventId;
/** Re-export of the Effect-free gap-size check from `./resumption-pure.js`. */
export const canResume = _canResume;

/**
 * Runtime shape check for data loaded from sessionStorage.
 * Returns true only if `v` has the exact shape of {@link ResumptionState}.
 */
const isResumptionState = (v: unknown): v is ResumptionState => {
  if (v === null || typeof v !== 'object') return false;
  if (!('lastEventId' in v) || !('lastSequence' in v) || !('artifactId' in v) || !('timestamp' in v)) return false;
  return (
    typeof v.lastEventId === 'string' &&
    typeof v.lastSequence === 'number' &&
    typeof v.artifactId === 'string' &&
    typeof v.timestamp === 'number'
  );
};

/**
 * Runtime shape check for snapshot responses.
 */
const isSnapshotPayload = (v: unknown): v is { html: string; signals: unknown; lastEventId: string } => {
  if (v === null || typeof v !== 'object') return false;
  if (!('html' in v) || !('lastEventId' in v)) return false;
  return typeof v.html === 'string' && typeof v.lastEventId === 'string';
};

/**
 * Runtime shape check for replay responses.
 */
const isReplayPayload = (v: unknown): v is { patches: readonly unknown[] } => {
  if (v === null || typeof v !== 'object') return false;
  if (!('patches' in v)) return false;
  return Array.isArray(v.patches);
};

/**
 * Default resumption configuration.
 */
export const defaultResumptionConfig: ResumptionConfig = {
  maxGapSize: 50,
  snapshotUrl: '/czap/snapshot',
  replayUrl: '/czap/replay',
  timeout: Millis(10000),
};

/**
 * Storage key for resumption state.
 */
const storageKey = (artifactId: string): string => `czap:resumption:${artifactId}`;

/**
 * Save resumption state to sessionStorage.
 *
 * @example
 * ```ts
 * import { Resumption } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * Effect.runSync(Resumption.saveState({
 *   artifactId: 'article-123',
 *   lastEventId: 'evt-42',
 *   lastSequence: 42,
 * }));
 * ```
 *
 * @param state - The resumption state to persist
 * @returns An Effect that saves the state
 */
export const saveState = (state: ResumptionState): Effect.Effect<void> =>
  Effect.sync(() => {
    const key = storageKey(validateArtifactId(state.artifactId));
    const value = JSON.stringify(state);
    sessionStorage.setItem(key, value);
  });

/**
 * Load resumption state from sessionStorage.
 *
 * @example
 * ```ts
 * import { Resumption } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * const state = Effect.runSync(Resumption.loadState('article-123'));
 * if (state) {
 *   console.log(state.lastEventId); // 'evt-42'
 * }
 * ```
 *
 * @param artifactId - The artifact ID to load state for
 * @returns An Effect yielding the saved state, or null if none exists
 */
export const loadState = (artifactId: string): Effect.Effect<ResumptionState | null> =>
  Effect.sync(() => {
    const key = storageKey(validateArtifactId(artifactId));
    const value = sessionStorage.getItem(key);

    if (!value) {
      return null;
    }

    let parsedState: ResumptionState | null = null;
    let invalidState = false;
    try {
      const raw: unknown = JSON.parse(value);
      if (!isResumptionState(raw)) {
        invalidState = true;
        sessionStorage.removeItem(key);
      } else {
        parsedState = raw;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }

      invalidState = true;
      sessionStorage.removeItem(key);
    }

    return invalidState ? null : parsedState;
  });

/**
 * Clear resumption state from sessionStorage.
 *
 * @example
 * ```ts
 * import { Resumption } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * Effect.runSync(Resumption.clearState('article-123'));
 * ```
 *
 * @param artifactId - The artifact ID whose state should be cleared
 * @returns An Effect that removes the state
 */
export const clearState = (artifactId: string): Effect.Effect<void> =>
  Effect.sync(() => {
    const key = storageKey(validateArtifactId(artifactId));
    sessionStorage.removeItem(key);
  });

// canResume is re-exported from resumption-pure.ts above

/**
 * Resume from a disconnection, choosing between event replay (small gap)
 * and full snapshot (large gap or no prior state).
 *
 * @example
 * ```ts
 * import { Resumption } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * const response = Effect.runPromise(
 *   Resumption.resume('article-123', 'evt-50', { maxGapSize: 100 }),
 * );
 * // response.type => 'replay' | 'snapshot'
 * ```
 *
 * @param artifactId     - The artifact to resume
 * @param currentEventId - The latest event ID from the reconnected stream
 * @param config         - Optional partial config overriding defaults
 * @returns An Effect yielding a {@link ResumeResponse}
 */
export const resume = (
  artifactId: string,
  currentEventId: string,
  config?: Partial<ResumptionConfig>,
): Effect.Effect<ResumeResponse, Error> =>
  Effect.gen(function* () {
    validateArtifactId(artifactId);
    const finalConfig = { ...defaultResumptionConfig, ...config };
    const prevState = yield* loadState(artifactId);

    if (!prevState) {
      const snapshot = yield* requestSnapshot(artifactId, finalConfig.snapshotUrl!, finalConfig.endpointPolicy);
      return snapshot;
    }

    const expectedSequence = prevState.lastSequence + 1;
    const parsed = parseEventId(currentEventId);
    const gap = parsed.sequence - expectedSequence;

    if (gap <= 0) {
      return {
        type: 'replay' as const,
        patches: [],
      };
    }

    if (gap > finalConfig.maxGapSize) {
      const snapshot = yield* requestSnapshot(artifactId, finalConfig.snapshotUrl!, finalConfig.endpointPolicy);
      return snapshot;
    }

    const patches = yield* requestReplay(
      artifactId,
      prevState.lastEventId,
      currentEventId,
      finalConfig.replayUrl!,
      finalConfig.endpointPolicy,
    );

    return {
      type: 'replay' as const,
      patches,
    };
  });

/**
 * Request a snapshot when resumption is not possible.
 */
const requestSnapshot = (
  artifactId: string,
  snapshotUrl: string,
  endpointPolicy: ResumptionConfig['endpointPolicy'],
): Effect.Effect<ResumeResponse, Error> =>
  Effect.gen(function* () {
    const resolved = resolveRuntimeUrl(snapshotUrl, {
      kind: 'snapshot',
      policy: endpointPolicy,
    });
    if (resolved.type !== 'allowed') {
      return yield* Effect.fail(new Error(`Snapshot URL rejected: ${resolved.type}`));
    }

    const url = new URL(resolved.resolved.toString());
    appendArtifactIdToUrl(url, artifactId);

    const response = yield* Effect.tryPromise({
      try: () => fetch(url.toString()),
      catch: (error) => new Error(`Failed to fetch snapshot: ${error}`),
    });

    if (!response.ok) {
      return yield* Effect.fail(new Error(`Snapshot request failed: ${response.status} ${response.statusText}`));
    }

    const data: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new Error(`Failed to parse snapshot: ${error}`),
    });

    if (!isSnapshotPayload(data)) {
      return yield* Effect.fail(new Error('Malformed snapshot response: missing or invalid html/lastEventId fields'));
    }

    return {
      type: 'snapshot' as const,
      html: data.html,
      signals: data.signals,
      lastEventId: data.lastEventId,
    };
  });

/**
 * Request missed events to replay.
 */
const requestReplay = (
  artifactId: string,
  fromEventId: string,
  toEventId: string,
  replayUrl: string,
  endpointPolicy: ResumptionConfig['endpointPolicy'],
): Effect.Effect<readonly unknown[], Error> =>
  Effect.gen(function* () {
    const resolved = resolveRuntimeUrl(replayUrl, {
      kind: 'replay',
      policy: endpointPolicy,
    });
    if (resolved.type !== 'allowed') {
      return yield* Effect.fail(new Error(`Replay URL rejected: ${resolved.type}`));
    }

    const url = new URL(resolved.resolved.toString());
    appendArtifactIdToUrl(url, artifactId);
    url.searchParams.set('from', fromEventId);
    url.searchParams.set('to', toEventId);

    const response = yield* Effect.tryPromise({
      try: () => fetch(url.toString()),
      catch: (error) => new Error(`Failed to fetch replay: ${error}`),
    });

    if (!response.ok) {
      return yield* Effect.fail(new Error(`Replay request failed: ${response.status} ${response.statusText}`));
    }

    const data: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new Error(`Failed to parse replay: ${error}`),
    });

    if (!isReplayPayload(data)) {
      return yield* Effect.fail(new Error('Malformed replay response: missing or invalid patches array'));
    }

    return data.patches;
  });

// parseEventId is re-exported from resumption-pure.ts above

/**
 * SSE resumption protocol namespace.
 *
 * Handles connection resumption using `lastEventId`. Persists resumption
 * state to `sessionStorage`, compares event IDs to determine if replay
 * is possible, and falls back to full snapshot when the gap is too large.
 *
 * @example
 * ```ts
 * import { Resumption } from '@czap/web';
 * import { Effect } from 'effect';
 *
 * // Save state on each SSE message
 * Effect.runSync(Resumption.saveState({
 *   artifactId: 'doc-1', lastEventId: 'evt-99', lastSequence: 99,
 * }));
 *
 * // On reconnect, resume from where we left off
 * const response = Effect.runPromise(Resumption.resume('doc-1', 'evt-105'));
 * // response.type => 'replay' (patches) or 'snapshot' (full state)
 * ```
 */
export const Resumption = {
  saveState,
  loadState,
  clearState,
  canResume,
  resume,
  parseEventId,
} as const;
