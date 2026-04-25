/**
 * CompositorWorker -- off-main-thread compositor running in a Web Worker.
 *
 * The worker maintains a simplified compositor that:
 * - Tracks quantizer definitions (name maps to boundary plus current state)
 * - Evaluates threshold-based quantization
 * - Maintains blend weight overrides
 * - Produces CompositeState on `compute` commands
 * - Uses DirtyFlags for selective recomputation
 *
 * The worker script is inlined as a Blob URL to avoid bundler complexity
 * with separate worker entry files.
 *
 * @module
 */

import { Diagnostics } from '@czap/core';
import type { RuntimeCoordinator } from '@czap/core';
import type {
  FromWorkerMessage,
  WorkerConfig,
  WorkerUpdate,
  BootstrapQuantizerRegistration,
  ResolvedStateEntry,
} from './messages.js';
import { makeResolvedStateEnvelope } from './messages.js';

// Re-export types from compositor-types
export type { CompositorWorkerStartupStage, CompositorWorkerStartupTelemetry } from './compositor-types.js';

import type {
  CompositorWorkerState,
  CompositorWorkerStartupStage,
  ResolvedStateAckPayload,
  CompositorWorkerShape,
  CompositorWorkerStartupTelemetry,
} from './compositor-types.js';

// Import startup/lifecycle helpers
import {
  currentTimeNs,
  recordStartupDiagnosticStage,
  notifyResolvedStateSettled,
  createStartupPacketState,
  buildStartupComputePacket,
  getStartupPacketRuntimeSeed,
  runtimeMatchesStartupSeed,
  setStartupPacketRegistration,
  pushStartupPacketUpdate,
  setStartupPacketInitialState,
  setStartupPacketBlendWeights,
  removeStartupPacketEntries,
  resetStartupPacketTransientState,
  claimCompositorLease,
  parkOrDisposeCompositorLease,
  _send,
  prepareRegistrationForTransfer,
  sameBootstrapRegistration,
  evaluateRegistrationState,
  toResolvedStateEntriesFromAck,
} from './compositor-startup.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function _createCompositorWorker(
  config?: WorkerConfig,
  startupTelemetry?: CompositorWorkerStartupTelemetry,
): CompositorWorkerShape {
  const capacity = config?.poolCapacity ?? 64;
  const { worker, runtime, bootstrapSnapshot } = claimCompositorLease(capacity, startupTelemetry);
  const snapshotByName = new Map(bootstrapSnapshot.map((registration) => [registration.name, registration] as const));
  const activeRegistrations = new Map<string, BootstrapQuantizerRegistration>();
  const stateListeners = new Set<(state: CompositorWorkerState) => void>();
  const resolvedStateAckListeners = new Set<(ack: ResolvedStateAckPayload) => void>();
  const metricsListeners = new Set<(fps: number, budgetUsed: number) => void>();
  const confirmedSnapshotNames = new Set<string>();
  const preparedRegistrationCache = new Map<
    string,
    {
      readonly source: BootstrapQuantizerRegistration;
      readonly transferRegistration: BootstrapQuantizerRegistration;
      readonly buffer: ArrayBuffer;
    }
  >();
  const startupPacket = createStartupPacketState(
    bootstrapSnapshot.length > 0 ? 'warm-snapshot' : 'cold',
    bootstrapSnapshot,
  );
  let steadyStatePendingUpdates: WorkerUpdate[] = [];
  let flushScheduled = false;
  let startupMode = true;
  let startupDispatchCompletedNs: number | null = null;
  let startupStatePending = false;
  let resolvedStateDispatchCompletedNs: number | null = null;
  let resolvedStateAckPending = false;
  let lastMetrics: { readonly fps: number; readonly budgetUsed: number } | null = null;
  let lastWorkerError: string | null = null;

  const getPreparedRegistration = (registration: BootstrapQuantizerRegistration) => {
    const cached = preparedRegistrationCache.get(registration.name);
    /* v8 ignore next — current call sites always delete the cache entry in the same
       synchronous turn that sets it (see `consumePreparedRegistrations`), so this
       cache-hit arm is reserved for a future pre-flight path that warms the cache
       before dispatch; unreachable under today's code paths. */
    if (cached && cached.source === registration && cached.buffer.byteLength > 0) {
      return cached;
    }

    const { registration: transferRegistration, buffer } = prepareRegistrationForTransfer(registration);
    const prepared = {
      source: registration,
      transferRegistration,
      buffer,
    };
    preparedRegistrationCache.set(registration.name, prepared);
    return prepared;
  };

  const consumePreparedRegistrations = (registrations: readonly BootstrapQuantizerRegistration[]) => {
    const buffers: ArrayBuffer[] = [];
    const transferRegistrations = registrations.map((registration) => {
      const prepared = getPreparedRegistration(registration);
      preparedRegistrationCache.delete(registration.name);
      buffers.push(prepared.buffer);
      return prepared.transferRegistration;
    });

    return {
      registrations: transferRegistrations,
      buffers,
    };
  };

  const flushPendingUpdates = (): void => {
    flushScheduled = false;
    if (steadyStatePendingUpdates.length === 0) {
      return;
    }

    const updates = steadyStatePendingUpdates;
    steadyStatePendingUpdates = [];
    _send(worker, {
      type: 'apply-updates',
      updates,
    });
  };

  const queueUpdate = (update: WorkerUpdate): void => {
    if (startupMode) {
      pushStartupPacketUpdate(startupPacket, update);
      return;
    }

    steadyStatePendingUpdates.push(update);
    if (flushScheduled) {
      return;
    }

    flushScheduled = true;
    queueMicrotask(flushPendingUpdates);
  };

  const markStartupBootstrapForRebuild = (): void => {
    if (startupPacket.bootstrapMode === 'warm-snapshot') {
      startupPacket.bootstrapMode = 'rebuild';
    }
  };

  const applyResolvedStatesToRuntime = (states: readonly ResolvedStateEntry[]): void => {
    for (const entry of states) {
      runtime.markDirty(entry.name);
      runtime.applyState(entry.name, entry.state);
    }
  };

  const ensureResolvedStateMode = (): void => {
    if (!startupMode) {
      flushPendingUpdates();
      return;
    }

    startupMode = false;
    startupStatePending = false;
    startupDispatchCompletedNs = null;
    flushScheduled = false;
    steadyStatePendingUpdates = [];
    const registrations = Array.from(activeRegistrations.values());

    if (startupPacket.bootstrapMode !== 'cold') {
      _send(worker, { type: 'init' });
    }
    if (registrations.length > 0) {
      const { registrations: transferRegs, buffers } = consumePreparedRegistrations(registrations);
      _send(
        worker,
        {
          type: 'bootstrap-quantizers',
          registrations: transferRegs,
        },
        buffers,
      );
    }

    resetStartupPacketTransientState(startupPacket);
  };

  const sendResolvedStateMessage = (
    type: 'bootstrap-resolved-state' | 'apply-resolved-state',
    states: readonly ResolvedStateEntry[],
  ): void => {
    if (states.length === 0) {
      return;
    }

    ensureResolvedStateMode();
    applyResolvedStatesToRuntime(states);
    const expectAck = resolvedStateAckListeners.size > 0 || startupTelemetry !== undefined;
    const dispatchStartNs = currentTimeNs();
    _send(worker, makeResolvedStateEnvelope(type, states, expectAck));
    resolvedStateDispatchCompletedNs = currentTimeNs();
    resolvedStateAckPending = expectAck;
    recordStartupDiagnosticStage(
      startupTelemetry,
      'request-compute:dispatch-send',
      resolvedStateDispatchCompletedNs - dispatchStartNs,
    );
    recordStartupDiagnosticStage(startupTelemetry, 'request-compute:packet-finalize', 0);
    recordStartupDiagnosticStage(startupTelemetry, 'request-compute:post-send-bookkeeping', 0);
  };

  const handleMessage = (e: MessageEvent<FromWorkerMessage>): void => {
    const msg = e.data;
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'ready':
        break;
      case 'state':
        if (startupStatePending) {
          const eventStartNs = currentTimeNs();
          recordStartupDiagnosticStage(
            startupTelemetry,
            'state-delivery:message-receipt',
            eventStartNs - startupDispatchCompletedNs!,
          );
          for (const [name, state] of Object.entries(msg.state.discrete ?? {})) {
            runtime.applyState(name, state);
          }
          const callbackStartNs = currentTimeNs();
          recordStartupDiagnosticStage(
            startupTelemetry,
            'state-delivery:callback-queue-turn',
            callbackStartNs - eventStartNs,
          );
          for (const cb of stateListeners) cb({ ...msg.state, resolvedStateGenerations: msg.resolvedStateGenerations });
          recordStartupDiagnosticStage(
            startupTelemetry,
            'state-delivery:host-callback-delivery',
            currentTimeNs() - callbackStartNs,
          );
          startupStatePending = false;
          startupDispatchCompletedNs = null;
          break;
        }
        for (const [name, state] of Object.entries(msg.state.discrete ?? {})) {
          runtime.applyState(name, state);
        }
        for (const cb of stateListeners) cb({ ...msg.state, resolvedStateGenerations: msg.resolvedStateGenerations });
        break;
      case 'resolved-state-ack':
        if (!resolvedStateAckPending || resolvedStateDispatchCompletedNs === null) {
          notifyResolvedStateSettled(startupTelemetry, toResolvedStateEntriesFromAck(msg));
          break;
        }
        const eventStartNs = currentTimeNs();
        recordStartupDiagnosticStage(
          startupTelemetry,
          'state-delivery:message-receipt',
          eventStartNs - resolvedStateDispatchCompletedNs,
        );
        const callbackStartNs = currentTimeNs();
        recordStartupDiagnosticStage(
          startupTelemetry,
          'state-delivery:callback-queue-turn',
          callbackStartNs - eventStartNs,
        );
        notifyResolvedStateSettled(startupTelemetry, toResolvedStateEntriesFromAck(msg));
        if (resolvedStateAckListeners.size > 0) {
          for (const cb of resolvedStateAckListeners) cb(msg);
          recordStartupDiagnosticStage(
            startupTelemetry,
            'state-delivery:host-callback-delivery',
            currentTimeNs() - callbackStartNs,
          );
        } else {
          recordStartupDiagnosticStage(startupTelemetry, 'state-delivery:host-callback-delivery', 0);
        }
        resolvedStateAckPending = false;
        resolvedStateDispatchCompletedNs = null;
        break;
      case 'metrics':
        lastMetrics = { fps: msg.fps, budgetUsed: msg.budgetUsed };
        for (const cb of metricsListeners) cb(msg.fps, msg.budgetUsed);
        break;
      case 'error':
        lastWorkerError = msg.message;
        Diagnostics.error({
          source: 'czap/worker.compositor-worker',
          code: 'worker-message-error',
          message: 'Compositor worker reported an error.',
          detail: msg.message,
        });
        break;
    }
  };

  const handleError = (e: ErrorEvent): void => {
    Diagnostics.error({
      source: 'czap/worker.compositor-worker',
      code: 'worker-unhandled-error',
      message: 'Compositor worker raised an unhandled error.',
      detail: e.message,
    });
  };

  const listenerBindStartNs = currentTimeNs();
  worker.addEventListener('message', handleMessage);
  worker.addEventListener('error', handleError);
  startupTelemetry?.recordStage('listener-bind', currentTimeNs() - listenerBindStartNs);

  if (startupPacket.bootstrapMode === 'cold') {
    _send(worker, { type: 'init' });
  }

  void lastMetrics;
  void lastWorkerError;

  return {
    get worker(): Worker {
      return worker;
    },

    get runtime(): RuntimeCoordinator.Shape {
      return runtime;
    },

    addQuantizer(name, boundary) {
      const registration = {
        name,
        boundaryId: boundary.id,
        states: boundary.states,
        thresholds: boundary.thresholds,
      } satisfies BootstrapQuantizerRegistration;
      const previousRequested = activeRegistrations.get(name);
      if (sameBootstrapRegistration(previousRequested, registration)) {
        if (startupPacket.bootstrapMode === 'warm-snapshot' && snapshotByName.has(name)) {
          confirmedSnapshotNames.add(name);
        }
        return;
      }

      preparedRegistrationCache.delete(name);
      activeRegistrations.set(name, registration);
      const snapshotRegistration = snapshotByName.get(name);
      const isSnapshotMatch = sameBootstrapRegistration(snapshotRegistration, registration);

      if (runtime.hasQuantizer(name) && !isSnapshotMatch) {
        runtime.removeQuantizer(name);
      }
      if (!runtime.hasQuantizer(name)) {
        runtime.registerQuantizer(name, boundary.states);
      }

      if (startupPacket.bootstrapMode === 'warm-snapshot' && isSnapshotMatch) {
        confirmedSnapshotNames.add(name);
        return;
      }

      confirmedSnapshotNames.delete(name);
      if (snapshotRegistration || startupPacket.bootstrapMode === 'warm-snapshot') {
        markStartupBootstrapForRebuild();
      }

      if (startupMode) {
        setStartupPacketRegistration(startupPacket, registration);
        return;
      }

      const { registrations: transferRegistrations, buffers } = consumePreparedRegistrations([registration]);
      _send(worker, { type: 'add-quantizer', ...transferRegistrations[0]! }, buffers);
    },

    removeQuantizer(name) {
      preparedRegistrationCache.delete(name);
      activeRegistrations.delete(name);
      confirmedSnapshotNames.delete(name);
      runtime.removeQuantizer(name);
      if (snapshotByName.has(name)) {
        markStartupBootstrapForRebuild();
      }

      if (startupMode) {
        removeStartupPacketEntries(startupPacket, name);
        return;
      }
      queueUpdate({ type: 'remove-quantizer', name });
    },

    evaluate(name, value) {
      if (startupMode && snapshotByName.has(name) && !confirmedSnapshotNames.has(name)) {
        markStartupBootstrapForRebuild();
      }
      if (startupMode) {
        const activeRegistration = activeRegistrations.get(name);
        if (activeRegistration) {
          const nextState = evaluateRegistrationState(activeRegistration, value);
          if (nextState !== activeRegistration.states[0]) {
            confirmedSnapshotNames.delete(name);
          }
          setStartupPacketInitialState(startupPacket, activeRegistration, nextState);
          runtime.markDirty(name);
          return;
        }
      }
      runtime.markDirty(name);
      queueUpdate({ type: 'evaluate', name, value });
    },

    setBlendWeights(name, weights) {
      if (startupMode && snapshotByName.has(name) && !confirmedSnapshotNames.has(name)) {
        markStartupBootstrapForRebuild();
      }
      if (startupMode && setStartupPacketBlendWeights(startupPacket, name, weights)) {
        confirmedSnapshotNames.delete(name);
        runtime.markDirty(name);
        return;
      }
      runtime.markDirty(name);
      queueUpdate({ type: 'set-blend', name, weights });
    },

    bootstrapResolvedState(states) {
      sendResolvedStateMessage('bootstrap-resolved-state', states);
    },

    applyResolvedState(states) {
      sendResolvedStateMessage('apply-resolved-state', states);
    },

    requestCompute() {
      const wasStartupMode = startupMode;
      startupMode = false;

      if (wasStartupMode) {
        startupStatePending = true;
        const runtimeSeed = getStartupPacketRuntimeSeed(startupPacket);
        if (
          startupPacket.bootstrapMode === 'warm-snapshot' &&
          activeRegistrations.size === snapshotByName.size &&
          confirmedSnapshotNames.size === snapshotByName.size &&
          runtimeMatchesStartupSeed(runtime, runtimeSeed)
        ) {
          const dispatchStartNs = currentTimeNs();
          _send(worker, { type: 'warm-reset' });
          _send(worker, { type: 'compute' });
          startupDispatchCompletedNs = currentTimeNs();
          recordStartupDiagnosticStage(
            startupTelemetry,
            'request-compute:dispatch-send',
            startupDispatchCompletedNs - dispatchStartNs,
          );
          recordStartupDiagnosticStage(startupTelemetry, 'request-compute:packet-finalize', 0);
          recordStartupDiagnosticStage(startupTelemetry, 'request-compute:post-send-bookkeeping', 0);
          return;
        } else {
          const packetFinalizeStartNs = currentTimeNs();
          const packet = buildStartupComputePacket(startupPacket);
          if (startupPacket.bootstrapMode === 'rebuild') {
            if (!runtimeMatchesStartupSeed(runtime, runtimeSeed)) {
              runtime.reset(runtimeSeed);
            }
          }
          const packetFinalizeEndNs = currentTimeNs();
          recordStartupDiagnosticStage(
            startupTelemetry,
            'request-compute:packet-finalize',
            packetFinalizeEndNs - packetFinalizeStartNs,
          );

          flushScheduled = false;
          const { registrations: transferRegs, buffers } = consumePreparedRegistrations(packet.registrations);
          const transferPacket = { ...packet, registrations: transferRegs };
          const dispatchStartNs = currentTimeNs();
          _send(
            worker,
            {
              type: 'startup-compute',
              packet: transferPacket,
            },
            buffers,
          );
          startupDispatchCompletedNs = currentTimeNs();
          recordStartupDiagnosticStage(
            startupTelemetry,
            'request-compute:dispatch-send',
            startupDispatchCompletedNs - dispatchStartNs,
          );
          recordStartupDiagnosticStage(startupTelemetry, 'request-compute:post-send-bookkeeping', 0);
          return;
        }
      }

      flushPendingUpdates();
      _send(worker, { type: 'compute' });
    },

    onState(callback) {
      stateListeners.add(callback);
      return () => {
        stateListeners.delete(callback);
      };
    },

    onResolvedStateAck(callback) {
      resolvedStateAckListeners.add(callback);
      return () => {
        resolvedStateAckListeners.delete(callback);
      };
    },

    onMetrics(callback) {
      metricsListeners.add(callback);
      return () => {
        metricsListeners.delete(callback);
      };
    },

    dispose() {
      resetStartupPacketTransientState(startupPacket);
      steadyStatePendingUpdates = [];
      flushScheduled = false;
      stateListeners.clear();
      resolvedStateAckListeners.clear();
      metricsListeners.clear();
      preparedRegistrationCache.clear();
      lastMetrics = null;
      lastWorkerError = null;
      if (typeof worker.removeEventListener === 'function') {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      }
      parkOrDisposeCompositorLease({
        worker,
        runtime,
        capacity,
        bootstrapSnapshot: Array.from(activeRegistrations.values()),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Factory namespace for the compositor worker.
 *
 * Call {@link CompositorWorker.create} on the main thread to spin up a
 * worker that evaluates quantizer boundaries and emits
 * {@link CompositorWorkerState} snapshots. The returned
 * {@link CompositorWorkerShape} owns the underlying `Worker` -- call
 * `dispose()` (or park via the lease pool) when finished.
 *
 * @example
 * ```ts
 * import { CompositorWorker } from '@czap/worker';
 *
 * const compositor = CompositorWorker.create({ poolCapacity: 64 });
 * compositor.addQuantizer('brightness', {
 *   id: 'boundary:brightness',
 *   states: ['dim', 'bright'],
 *   thresholds: [0.5],
 * });
 * const unsub = compositor.onState((state) => {
 *   // state.discrete.brightness === 'bright' | 'dim'
 * });
 * compositor.evaluate('brightness', 0.7);
 * compositor.requestCompute();
 * // ...later:
 * unsub();
 * compositor.dispose();
 * ```
 */
export const CompositorWorker = {
  /**
   * Spin up a new compositor worker. Returns immediately; the worker
   * posts `ready` asynchronously. Optionally provide startup telemetry
   * to capture per-stage timings.
   */
  create: _createCompositorWorker,
} as const;

export declare namespace CompositorWorker {
  /** Public host-side surface returned by {@link CompositorWorker.create}. */
  export type Shape = CompositorWorkerShape;
  /** Named startup stage reported to telemetry sinks. */
  export type StartupStage = CompositorWorkerStartupStage;
  /** Telemetry sink accepted by {@link CompositorWorker.create}. */
  export type StartupTelemetry = CompositorWorkerStartupTelemetry;
}
