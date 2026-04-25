import { Diagnostics } from '@czap/core';
import { WorkerHost } from '@czap/worker';
import {
  applyBoundaryState,
  attachViewportObserver,
  evaluateBoundary,
  normalizeBoundaryState,
  parseBoundary,
  readSignalValue,
  type BoundaryStateDetail,
} from './boundary.js';

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function sameNumberRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function sameBoundaryDetail(left: BoundaryStateDetail | null, right: BoundaryStateDetail): boolean {
  if (!left) {
    return false;
  }

  return (
    sameStringRecord(left.discrete, right.discrete) &&
    sameStringRecord(left.aria, right.aria) &&
    sameStringRecord(
      Object.fromEntries(Object.entries(left.css).map(([key, value]) => [key, String(value)])),
      Object.fromEntries(Object.entries(right.css).map(([key, value]) => [key, String(value)])),
    ) &&
    sameNumberRecord(left.glsl, right.glsl)
  );
}

function canUseWorkerRuntime(): boolean {
  return typeof Worker !== 'undefined' && typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;
}

/**
 * Entry point used by the `client:worker` directive.
 *
 * Parses the serialised boundary off `element`, spins up (or reuses)
 * a {@link WorkerHost.Shape} from `@czap/worker`, bootstraps the
 * boundary in the worker, and streams resolved state back into DOM
 * via {@link applyBoundaryState}. Falls back to an inline evaluation
 * when `SharedArrayBuffer` / cross-origin isolation is unavailable.
 */
export function initWorkerDirective(load: () => Promise<unknown>, element: HTMLElement): void {
  let runtimeBoundary = parseBoundary(element.getAttribute('data-czap-boundary'));
  if (!runtimeBoundary) {
    return;
  }

  let cleanupObserver: (() => void) | null = null;
  let host: WorkerHost.Shape | null = null;
  let unsubscribe: (() => void) | null = null;
  let ackUnsubscribe: (() => void) | null = null;
  let workerMessageHandler: ((event: MessageEvent<{ type?: string }>) => void) | null = null;
  let workerRef: Worker | null = null;
  let previousState = element.getAttribute('data-czap-state') ?? '';
  let lastAppliedDetail: BoundaryStateDetail | null = null;
  let seededGeneration = 0;
  let lastAppliedGeneration = 0;
  let pendingWorkerSeedAgreement = false;

  const cleanup = (): void => {
    cleanupObserver?.();
    cleanupObserver = null;
    unsubscribe?.();
    unsubscribe = null;
    ackUnsubscribe?.();
    ackUnsubscribe = null;
    if (workerMessageHandler && workerRef && typeof workerRef.removeEventListener === 'function') {
      workerRef.removeEventListener('message', workerMessageHandler);
    }
    workerMessageHandler = null;
    workerRef = null;
    host?.dispose();
    host = null;
  };

  const readValue = (): number | undefined => {
    return readSignalValue(runtimeBoundary!.input);
  };

  const initFallback = (): void => {
    const update = (reset = false): void => {
      if (!runtimeBoundary) {
        return;
      }

      const value = readValue();
      if (value === undefined) {
        return;
      }

      const nextState = reset
        ? evaluateBoundary(runtimeBoundary, value)
        : evaluateBoundary(runtimeBoundary, value, previousState);
      if (nextState === previousState) {
        return;
      }

      previousState = nextState;
      applyBoundaryState(
        element,
        runtimeBoundary,
        {
          discrete: { [runtimeBoundary.name]: nextState },
        },
        'czap:worker-state',
      );
    };

    update(true);
    if (runtimeBoundary) {
      cleanupObserver = attachViewportObserver(runtimeBoundary.input, () => update(false));
    }
  };

  const initWorkerHost = (): void => {
    if (!runtimeBoundary) {
      return;
    }
    const boundary = runtimeBoundary;
    const workerHost = WorkerHost.create();
    host = workerHost;

    const syncResolvedState = (stateName: string, generation: number, bootstrap = false): void => {
      const payload = [
        {
          name: boundary.name,
          state: stateName,
          generation,
        },
      ] as const;
      pendingWorkerSeedAgreement = true;
      seededGeneration = generation;
      lastAppliedGeneration = generation;
      if (bootstrap) {
        workerHost.compositor.bootstrapResolvedState(payload);
        return;
      }

      workerHost.compositor.applyResolvedState(payload);
    };

    const applyHostResolvedState = (stateName: string, generation: number): void => {
      const payload = {
        discrete: { [boundary.name]: stateName },
      };
      applyBoundaryState(element, boundary, payload, 'czap:worker-state');
      previousState = stateName;
      lastAppliedDetail = normalizeBoundaryState(payload);
      lastAppliedGeneration = generation;
    };

    workerHost.compositor.addQuantizer(boundary.name, {
      id: boundary.boundary.id,
      states: boundary.boundary.states,
      thresholds: boundary.boundary.thresholds,
    });

    const onWorkerMessage = (event: MessageEvent<{ type?: string }>): void => {
      if (event.data?.type === 'ready') {
        element.dispatchEvent(new CustomEvent('czap:worker-ready', { bubbles: true }));
      }
    };
    workerMessageHandler = onWorkerMessage;
    workerRef = workerHost.compositor.worker;
    workerHost.compositor.worker.addEventListener('message', onWorkerMessage);

    ackUnsubscribe = workerHost.compositor.onResolvedStateAck((ack) => {
      if (host !== workerHost || runtimeBoundary !== boundary) {
        return;
      }

      const ackState = ack.states.find((state) => state.name === boundary.name)?.state;
      if (
        pendingWorkerSeedAgreement &&
        ack.additionalOutputsChanged === false &&
        ack.generation === seededGeneration &&
        ackState !== undefined &&
        ackState === previousState
      ) {
        pendingWorkerSeedAgreement = false;
      }
    });

    unsubscribe = workerHost.onState((state) => {
      const currentState = state.discrete?.[boundary.name];
      if (currentState) {
        previousState = currentState;
      }

      const normalized = normalizeBoundaryState(state);
      const workerGeneration = state.resolvedStateGenerations?.[boundary.name];
      if (
        pendingWorkerSeedAgreement &&
        workerGeneration !== undefined &&
        workerGeneration === seededGeneration &&
        currentState === lastAppliedDetail?.discrete[boundary.name] &&
        sameBoundaryDetail(lastAppliedDetail, normalized)
      ) {
        pendingWorkerSeedAgreement = false;
        return;
      }

      applyBoundaryState(element, boundary, state, 'czap:worker-state');
      lastAppliedDetail = normalized;
      if (workerGeneration !== undefined) {
        lastAppliedGeneration = workerGeneration;
        pendingWorkerSeedAgreement = false;
      }
    });
    const update = (): void => {
      if (host !== workerHost || runtimeBoundary !== boundary) {
        return;
      }

      const value = readValue();
      if (value === undefined) {
        return;
      }

      const nextState = evaluateBoundary(boundary, value, previousState || undefined);
      if (nextState === previousState) {
        return;
      }

      const nextGeneration = lastAppliedGeneration + 1;
      applyHostResolvedState(nextState, nextGeneration);
      syncResolvedState(nextState, nextGeneration);
    };

    const initialValue = readValue();
    if (initialValue !== undefined) {
      const initialState = evaluateBoundary(boundary, initialValue, previousState || undefined);
      applyHostResolvedState(initialState, 1);
      syncResolvedState(initialState, 1, true);
    }
    cleanupObserver = attachViewportObserver(boundary.input, update);
  };

  const init = (): void => {
    if (canUseWorkerRuntime()) {
      try {
        initWorkerHost();
        return;
      } catch (error) {
        Diagnostics.warn({
          source: 'czap/astro.worker',
          code: 'worker-host-fallback',
          message: 'WorkerHost could not initialize, falling back to main-thread evaluation.',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    initFallback();
  };

  element.addEventListener('czap:reinit', () => {
    cleanup();
    runtimeBoundary = parseBoundary(element.getAttribute('data-czap-boundary'));
    previousState = element.getAttribute('data-czap-state') ?? '';
    lastAppliedDetail = null;
    seededGeneration = 0;
    lastAppliedGeneration = 0;
    pendingWorkerSeedAgreement = false;
    ackUnsubscribe = null;
    init();
  });

  element.addEventListener('czap:dispose', () => {
    cleanup();
  });

  init();
  load();
}
