/**
 * Type definitions for the CompositorWorker module.
 *
 * @module
 */

import type { RuntimeCoordinator, CompositeState } from '@czap/core';
import type {
  WorkerUpdate,
  BootstrapQuantizerRegistration,
  StartupComputePacket,
  ResolvedStateEntry,
} from './messages.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A `CompositeState` snapshot emitted by the compositor worker, optionally
 * annotated with per-quantizer generation counters. The generation map
 * enables receivers to drop stale out-of-order messages.
 */
export type CompositorWorkerState = CompositeState & {
  readonly resolvedStateGenerations?: Record<string, number>;
};

/**
 * Acknowledgement payload emitted by the worker after it applies a
 * resolved-state update from the main thread.
 */
export interface ResolvedStateAckPayload {
  /** Generation counter the worker acknowledges. */
  readonly generation: number;
  /** The state transitions the worker actually observed. */
  readonly states: readonly {
    readonly name: string;
    readonly state: string;
  }[];
  /** Whether non-discrete outputs (blend, CSS, etc.) changed in this round. */
  readonly additionalOutputsChanged: boolean;
}

/**
 * Host-facing surface of a compositor worker. Returned by
 * {@link CompositorWorker} as the public control/observation API. Owns
 * the underlying `Worker` -- call {@link CompositorWorkerShape.dispose}
 * to terminate and release resources.
 */
export interface CompositorWorkerShape {
  /** The underlying Worker instance. */
  readonly worker: Worker;
  /** Shared runtime coordination surface reflecting host-side worker state. */
  readonly runtime: RuntimeCoordinator.Shape;

  /** Register a quantizer in the worker. */
  addQuantizer(
    name: string,
    boundary: {
      readonly id: string;
      readonly states: readonly string[];
      readonly thresholds: readonly number[];
    },
  ): void;

  /** Remove a quantizer from the worker. */
  removeQuantizer(name: string): void;

  /** Evaluate a quantizer with a numeric value (threshold-based). */
  evaluate(name: string, value: number): void;

  /** Override blend weights for a quantizer. */
  setBlendWeights(name: string, weights: Record<string, number>): void;

  /** Seed resolved quantizer state into the worker without raw threshold evaluation. */
  bootstrapResolvedState(states: readonly ResolvedStateEntry[]): void;

  /** Mirror resolved quantizer state updates into the worker without raw threshold evaluation. */
  applyResolvedState(states: readonly ResolvedStateEntry[]): void;

  /** Request the worker to compute and return a CompositeState. */
  requestCompute(): void;

  /** Subscribe to state updates from the worker. Returns an unsubscribe function. */
  onState(callback: (state: CompositorWorkerState) => void): () => void;

  /** Subscribe to resolved-state acknowledgement updates. Returns an unsubscribe function. */
  onResolvedStateAck(callback: (ack: ResolvedStateAckPayload) => void): () => void;

  /** Subscribe to metrics updates. Returns an unsubscribe function. */
  onMetrics(callback: (fps: number, budgetUsed: number) => void): () => void;

  /** Terminate the worker and clean up resources. */
  dispose(): void;
}

/**
 * Named stages of the compositor-worker startup handshake. Used for
 * structured telemetry so hosts can instrument how long each phase took.
 */
export type CompositorWorkerStartupStage = 'claim-or-create' | 'coordinator-reset-or-create' | 'listener-bind';

/**
 * Pluggable telemetry sink invoked during compositor-worker startup.
 * `recordStage` is called once per stage with an elapsed-time sample;
 * `onResolvedStateSettled` (optional) fires once the worker confirms a
 * resolved-state hydration.
 */
export interface CompositorWorkerStartupTelemetry {
  /** Record how long a startup stage took. `durationNs` is in nanoseconds. */
  recordStage(stage: CompositorWorkerStartupStage, durationNs: number): void;
  /** Fired when the worker acknowledges the resolved-state bootstrap. */
  onResolvedStateSettled?(states: readonly ResolvedStateEntry[]): void;
}

/**
 * Finer-grained diagnostic stages emitted during startup and compute
 * dispatch. Useful for pinpointing message-queue / callback latency in
 * profiling builds.
 */
export type CompositorWorkerStartupDiagnosticStage =
  | 'coordinator-reset-or-create:runtime-reset-reuse'
  | 'request-compute:packet-finalize'
  | 'request-compute:dispatch-send'
  | 'request-compute:post-send-bookkeeping'
  | 'state-delivery:message-receipt'
  | 'state-delivery:callback-queue-turn'
  | 'state-delivery:host-callback-delivery';

/**
 * A pre-warmed compositor worker held in a standby pool, ready to be
 * claimed by a new host without paying the Worker+Blob-URL boot cost.
 *
 * The lease exposes both the raw `Worker` and its associated coordinator,
 * plus the constructors used to mint more workers if the pool is empty.
 */
export interface StandbyCompositorLease {
  /** The warm Worker instance. */
  readonly worker: Worker;
  /** Shared runtime coordinator already attached to the worker. */
  readonly runtime: RuntimeCoordinator.Shape;
  /** Pooled pool capacity advertised by the lease. */
  readonly capacity: number;
  /** Worker constructor used to mint peers. */
  readonly workerConstructor: typeof Worker;
  /** Blob URL factory used to mint worker sources. */
  readonly createObjectUrl: typeof URL.createObjectURL;
  /** Previously-bootstrapped registrations the lease already knows about. */
  readonly bootstrapSnapshot: readonly BootstrapQuantizerRegistration[];
}

/**
 * Mutable scratch state used while coalescing startup messages into a
 * single {@link StartupComputePacket}. Internal to the startup pipeline;
 * exported for tests and host-side diagnostic inspectors.
 */
export interface StartupPacketState {
  /** The bootstrap mode the packet will advertise. */
  bootstrapMode: StartupComputePacket['bootstrapMode'];
  /** Deduplicated registrations keyed by quantizer name. */
  registrations: Map<string, BootstrapQuantizerRegistration>;
  /** Cached ordered registration list (invalidated when the map mutates). */
  registrationList: readonly BootstrapQuantizerRegistration[] | null;
  /** Cached runtime seed list derived from registrations. */
  runtimeSeedList:
    | readonly {
        readonly name: string;
        readonly states: readonly string[];
      }[]
    | null;
  /** Pending updates to replay after bootstrap. */
  updates: WorkerUpdate[];
  /** Whether `runtimeSeedList` needs to be recomputed. */
  runtimeSeedDirty: boolean;
}
