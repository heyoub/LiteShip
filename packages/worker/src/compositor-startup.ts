/**
 * Startup packet building, startup mode management, and compositor lease
 * lifecycle helpers for the CompositorWorker module.
 *
 * @module
 */

import { RuntimeCoordinator } from '@czap/core';
import type {
  ToWorkerMessage,
  WorkerUpdate,
  BootstrapQuantizerRegistration,
  StartupComputePacket,
  ResolvedStateEntry,
} from './messages.js';
import type {
  CompositorWorkerStartupTelemetry,
  CompositorWorkerStartupDiagnosticStage,
  ResolvedStateAckPayload,
  StandbyCompositorLease,
  StartupPacketState,
} from './compositor-types.js';
import { COMPOSITOR_WORKER_SCRIPT } from './compositor-script.js';

// ---------------------------------------------------------------------------
// Module-level cached state
// ---------------------------------------------------------------------------

let cachedCompositorWorkerUrl: string | null = null;
let cachedCreateObjectUrl: typeof URL.createObjectURL | null = null;
let cleanupRegistered = false;
let standbyCompositorLease: StandbyCompositorLease | null = null;

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/**
 * Return the current high-resolution wall-clock time in nanoseconds.
 *
 * Uses `performance.now()` when available; falls back to `Date.now()`
 * in environments without the performance timeline.
 */
export function currentTimeNs(): number {
  const currentTimeMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return currentTimeMs * 1e6;
}

/**
 * Forward a fine-grained startup-diagnostic duration sample to a
 * telemetry sink (if the sink opts into diagnostic stages).
 *
 * Safe to call when `telemetry` is undefined or does not implement
 * `recordDiagnosticStage` -- the call becomes a no-op.
 */
export function recordStartupDiagnosticStage(
  telemetry: CompositorWorkerStartupTelemetry | undefined,
  stage: CompositorWorkerStartupDiagnosticStage,
  durationNs: number,
): void {
  const recordDiagnosticStage = (
    telemetry as
      | (CompositorWorkerStartupTelemetry & {
          readonly recordDiagnosticStage?: (
            diagnosticStage: CompositorWorkerStartupDiagnosticStage,
            diagnosticDurationNs: number,
          ) => void;
        })
      | undefined
  )?.recordDiagnosticStage;

  recordDiagnosticStage?.(stage, durationNs);
}

/**
 * Notify a telemetry sink that the worker acknowledged a resolved-state
 * hydration. Safe to call when the sink does not implement
 * `onResolvedStateSettled`.
 */
export function notifyResolvedStateSettled(
  telemetry: CompositorWorkerStartupTelemetry | undefined,
  states: readonly ResolvedStateEntry[],
): void {
  const onResolvedStateSettled = (
    telemetry as
      | (CompositorWorkerStartupTelemetry & {
          readonly onResolvedStateSettled?: (settledStates: readonly ResolvedStateEntry[]) => void;
        })
      | undefined
  )?.onResolvedStateSettled;

  onResolvedStateSettled?.(states);
}

// ---------------------------------------------------------------------------
// Startup packet state management
// ---------------------------------------------------------------------------

/**
 * Project a set of bootstrap registrations down to the minimal
 * `{ name, states }` shape the runtime coordinator needs to seed its
 * quantizer registry.
 */
export function registrationsToRuntimeSeed(registrations: readonly BootstrapQuantizerRegistration[]): readonly {
  readonly name: string;
  readonly states: readonly string[];
}[] {
  return registrations.map((registration) => ({
    name: registration.name,
    states: registration.states,
  }));
}

/**
 * Build a fresh {@link StartupPacketState} seeded with an initial
 * bootstrap mode and registration list. Used by the compositor worker to
 * stage messages before flushing them in a single `startup-compute` post.
 */
export function createStartupPacketState(
  bootstrapMode: StartupComputePacket['bootstrapMode'],
  initialRegistrations: readonly BootstrapQuantizerRegistration[] = [],
): StartupPacketState {
  return {
    bootstrapMode,
    registrations: new Map(initialRegistrations.map((registration) => [registration.name, registration] as const)),
    registrationList: initialRegistrations.length > 0 ? [...initialRegistrations] : [],
    runtimeSeedList: initialRegistrations.length > 0 ? registrationsToRuntimeSeed(initialRegistrations) : [],
    updates: [],
    runtimeSeedDirty: false,
  };
}

/**
 * Snapshot a {@link StartupPacketState} into an immutable
 * {@link StartupComputePacket} suitable for `postMessage`.
 */
export function buildStartupComputePacket(packet: StartupPacketState): StartupComputePacket {
  const builtPacket = {
    bootstrapMode: packet.bootstrapMode,
    registrations: getStartupPacketRegistrations(packet),
    updates: packet.updates,
  };

  return builtPacket;
}

/**
 * Return the ordered list of registrations in the startup packet,
 * caching the result so repeated reads are O(1).
 */
export function getStartupPacketRegistrations(packet: StartupPacketState): readonly BootstrapQuantizerRegistration[] {
  if (packet.registrationList !== null) {
    return packet.registrationList;
  }

  packet.registrationList = Array.from(packet.registrations.values());
  return packet.registrationList;
}

/**
 * Return the runtime-seed projection of the startup packet's
 * registrations, recomputing on demand if invalidated.
 */
export function getStartupPacketRuntimeSeed(packet: StartupPacketState): readonly {
  readonly name: string;
  readonly states: readonly string[];
}[] {
  if (packet.runtimeSeedList !== null && !packet.runtimeSeedDirty) {
    return packet.runtimeSeedList;
  }

  packet.runtimeSeedList = registrationsToRuntimeSeed(getStartupPacketRegistrations(packet));
  packet.runtimeSeedDirty = false;
  return packet.runtimeSeedList;
}

/**
 * Return `true` when the given runtime coordinator already has every
 * quantizer referenced by the runtime seed registered (by name).
 *
 * Used to decide whether a pre-warmed lease's runtime can be reused
 * as-is or must be reset before replay.
 */
export function runtimeMatchesStartupSeed(
  runtime: RuntimeCoordinator.Shape,
  runtimeSeed: readonly {
    readonly name: string;
    readonly states: readonly string[];
  }[],
): boolean {
  const registeredNames = runtime.registeredNames();
  if (
    !sameArray(
      registeredNames,
      runtimeSeed.map((registration) => registration.name),
    )
  ) {
    return false;
  }

  for (const registration of runtimeSeed) {
    if (!runtime.hasQuantizer(registration.name)) {
      return false;
    }
  }

  return true;
}

/**
 * Insert or overwrite a registration in the startup packet, invalidating
 * derived caches. Pass `invalidateRuntimeSeed: false` when the caller
 * already knows the runtime seed is structurally unchanged (e.g. only
 * initial state or blend weights changed).
 */
export function setStartupPacketRegistration(
  packet: StartupPacketState,
  registration: BootstrapQuantizerRegistration,
  invalidateRuntimeSeed = true,
): void {
  packet.registrations.set(registration.name, registration);
  packet.registrationList = null;
  if (invalidateRuntimeSeed) {
    packet.runtimeSeedList = null;
    packet.runtimeSeedDirty = true;
  }
}

/**
 * Drop a registration by name from the startup packet and invalidate
 * derived caches.
 */
export function removeStartupPacketRegistration(packet: StartupPacketState, name: string): void {
  packet.registrations.delete(name);
  packet.registrationList = null;
  packet.runtimeSeedList = null;
  packet.runtimeSeedDirty = true;
}

/**
 * Queue a {@link WorkerUpdate} to be replayed after bootstrap. Order is
 * preserved to match main-thread issue order.
 */
export function pushStartupPacketUpdate(packet: StartupPacketState, update: WorkerUpdate): void {
  packet.updates.push(update);
}

/**
 * Filter the packet's pending update queue in-place. Typically used to
 * drop redundant updates (e.g. newer `set-blend` supersedes older ones).
 */
export function filterStartupPacketUpdates(packet: StartupPacketState, keep: (update: WorkerUpdate) => boolean): void {
  if (packet.updates.length === 0) {
    return;
  }
  const filtered = packet.updates.filter(keep);
  if (filtered.length !== packet.updates.length) {
    packet.updates = filtered;
  }
}

/**
 * Structural equality check for `Record<string, number>` blend-weight
 * maps. `undefined === undefined` is true; mismatched presence is false.
 */
export function sameNumericRecord(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

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

/**
 * Merge an updated initial-state assignment into an existing registration.
 * Also scrubs any queued `evaluate` update targeting the same quantizer,
 * since the new initial state supersedes it.
 */
export function setStartupPacketInitialState(
  packet: StartupPacketState,
  registration: BootstrapQuantizerRegistration,
  state: string,
): void {
  const currentRegistration = packet.registrations.get(registration.name)!;

  const defaultState = currentRegistration.states[0];
  const nextRegistration =
    state === defaultState
      ? (() => {
          const { initialState: _initialState, ...withoutInitialState } = currentRegistration;
          return withoutInitialState;
        })()
      : { ...currentRegistration, initialState: state };
  const nextInitialState = 'initialState' in nextRegistration ? nextRegistration.initialState : undefined;
  if (
    currentRegistration.boundaryId !== nextRegistration.boundaryId ||
    !sameArray(currentRegistration.states, nextRegistration.states) ||
    !sameArray(currentRegistration.thresholds, nextRegistration.thresholds) ||
    currentRegistration.initialState !== nextInitialState ||
    !sameNumericRecord(currentRegistration.blendWeights, nextRegistration.blendWeights)
  ) {
    setStartupPacketRegistration(packet, nextRegistration, false);
  }
  filterStartupPacketUpdates(packet, (update) => !(update.type === 'evaluate' && update.name === registration.name));
}

/**
 * Merge updated blend weights for an existing registration. Returns
 * `false` when no registration with that name is present (the update is
 * ignored). Scrubs superseded `set-blend` updates from the queue.
 */
export function setStartupPacketBlendWeights(
  packet: StartupPacketState,
  name: string,
  weights: Record<string, number>,
): boolean {
  const registration = packet.registrations.get(name);
  if (!registration) {
    return false;
  }

  if (!sameNumericRecord(registration.blendWeights, weights)) {
    setStartupPacketRegistration(
      packet,
      {
        ...registration,
        blendWeights: weights,
      },
      false,
    );
  }
  filterStartupPacketUpdates(packet, (update) => !(update.type === 'set-blend' && update.name === name));
  return true;
}

/**
 * Remove a registration and every pending update targeting it.
 * Equivalent to undoing `add-quantizer` + any in-flight mutations.
 */
export function removeStartupPacketEntries(packet: StartupPacketState, name: string): void {
  removeStartupPacketRegistration(packet, name);
  if (packet.updates.length === 0) {
    return;
  }

  const filtered = packet.updates.filter((update) => update.name !== name);
  if (filtered.length !== packet.updates.length) {
    packet.updates = filtered;
  }
}

/**
 * Clear all transient state on a startup packet, leaving only the
 * `bootstrapMode` in place. Used when the lease is recycled and the
 * caller wants to start accumulating fresh messages.
 */
export function resetStartupPacketTransientState(packet: StartupPacketState): void {
  packet.registrations.clear();
  packet.registrationList = [];
  packet.runtimeSeedList = [];
  packet.updates = [];
  packet.runtimeSeedDirty = false;
}

// ---------------------------------------------------------------------------
// Compositor worker URL and blob management
// ---------------------------------------------------------------------------

function revokeCachedCompositorWorkerUrl(): void {
  if (!cachedCompositorWorkerUrl) {
    return;
  }

  URL.revokeObjectURL(cachedCompositorWorkerUrl);
  cachedCompositorWorkerUrl = null;
  cachedCreateObjectUrl = null;
}

function disposeStandbyCompositorLease(): void {
  standbyCompositorLease?.worker.terminate();
  standbyCompositorLease = null;
}

/** Typed helper that extracts globalThis.process without casting at call sites. */
function getNodeProcess(): { once?: (event: string, fn: () => void) => void } | null {
  /* v8 ignore next — `globalThis` is available in every ES2020+ host (Node, browsers,
     workers). The guard is defense-in-depth in case the module is ever loaded in a
     pre-ES2020 sandbox where `globalThis` is missing. */
  if (typeof globalThis === 'undefined' || !('process' in globalThis)) return null;
  const p = (globalThis as unknown as { process?: unknown }).process;
  /* v8 ignore next — Node's `process` is always the NodeJS.Process object; this guard
     covers hosts that define `process` as a non-object (e.g. a compatibility shim that
     sets it to `undefined` while still keeping the property slot). */
  if (typeof p !== 'object' || p === null) return null;
  return p as { once?: (event: string, fn: () => void) => void };
}

function registerCachedWorkerCleanup(): void {
  if (cleanupRegistered) {
    return;
  }

  cleanupRegistered = true;
  const cleanup = (): void => {
    disposeStandbyCompositorLease();
    revokeCachedCompositorWorkerUrl();
  };
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('pagehide', cleanup, { once: true });
    return;
  }

  const proc = getNodeProcess();
  if (proc !== null && typeof proc.once === 'function') proc.once('exit', cleanup);
}

function getCompositorWorkerUrl(): string {
  if (cachedCompositorWorkerUrl && cachedCreateObjectUrl === URL.createObjectURL) {
    return cachedCompositorWorkerUrl;
  }

  if (cachedCompositorWorkerUrl) {
    revokeCachedCompositorWorkerUrl();
  }

  cachedCompositorWorkerUrl = URL.createObjectURL(
    new Blob([COMPOSITOR_WORKER_SCRIPT], { type: 'application/javascript' }),
  );
  cachedCreateObjectUrl = URL.createObjectURL;
  registerCachedWorkerCleanup();
  return cachedCompositorWorkerUrl;
}

function createRawCompositorWorker(): Worker {
  const url = getCompositorWorkerUrl();
  return new Worker(url, { type: 'classic', name: 'czap-compositor' });
}

function createRuntimeCoordinator(capacity: number): RuntimeCoordinator.Shape {
  return RuntimeCoordinator.create({
    capacity,
    name: 'czap-worker-runtime',
  });
}

// ---------------------------------------------------------------------------
// Compositor lease lifecycle
// ---------------------------------------------------------------------------

/**
 * Claim a compositor lease: either hand back the standby pre-warmed
 * worker (if one is parked and matches the requested capacity) or mint a
 * fresh `Worker` + {@link RuntimeCoordinator}. Emits
 * `claim-or-create` and `coordinator-reset-or-create` stage samples to
 * the optional telemetry sink.
 *
 * @param capacity - Runtime coordinator capacity to request.
 * @param startupTelemetry - Optional sink for stage timings.
 * @returns The worker, its coordinator, and any bootstrap snapshot the
 *   parked lease brought with it.
 */
export function claimCompositorLease(
  capacity: number,
  startupTelemetry?: CompositorWorkerStartupTelemetry,
): {
  readonly worker: Worker;
  readonly runtime: RuntimeCoordinator.Shape;
  readonly bootstrapSnapshot: readonly BootstrapQuantizerRegistration[];
} {
  if (
    standbyCompositorLease &&
    (standbyCompositorLease.workerConstructor !== Worker ||
      standbyCompositorLease.createObjectUrl !== URL.createObjectURL ||
      standbyCompositorLease.capacity !== capacity)
  ) {
    disposeStandbyCompositorLease();
  }

  const claimStartNs = currentTimeNs();
  const claimedLease = standbyCompositorLease;
  standbyCompositorLease = null;
  const worker = claimedLease?.worker ?? createRawCompositorWorker();
  startupTelemetry?.recordStage('claim-or-create', currentTimeNs() - claimStartNs);

  const coordinatorStartNs = currentTimeNs();
  const runtime = claimedLease?.runtime ?? createRuntimeCoordinator(capacity);
  const bootstrapSnapshot = claimedLease?.bootstrapSnapshot ?? [];
  if (claimedLease) {
    const runtimeResetStartNs = currentTimeNs();
    runtime.reset();
    recordStartupDiagnosticStage(
      startupTelemetry,
      'coordinator-reset-or-create:runtime-reset-reuse',
      currentTimeNs() - runtimeResetStartNs,
    );
  }
  startupTelemetry?.recordStage('coordinator-reset-or-create', currentTimeNs() - coordinatorStartNs);

  return {
    worker,
    runtime,
    bootstrapSnapshot,
  };
}

/**
 * Park a compositor lease in the module-level standby slot so a future
 * {@link claimCompositorLease} can reuse it. If the standby slot is
 * already occupied, the incoming lease is disposed (`dispose` message +
 * `terminate()`) instead.
 */
export function parkOrDisposeCompositorLease(lease: {
  readonly worker: Worker;
  readonly runtime: RuntimeCoordinator.Shape;
  readonly capacity: number;
  readonly bootstrapSnapshot: readonly BootstrapQuantizerRegistration[];
}): void {
  if (
    !standbyCompositorLease &&
    typeof Worker !== 'undefined' &&
    Worker === lease.worker.constructor &&
    typeof URL.createObjectURL === 'function' &&
    URL.createObjectURL === cachedCreateObjectUrl
  ) {
    standbyCompositorLease = {
      ...lease,
      workerConstructor: Worker,
      createObjectUrl: URL.createObjectURL,
    };
    return;
  }

  _send(lease.worker, { type: 'dispose' });
  lease.worker.terminate();
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Internal `postMessage` helper with an explicit transfer-list default.
 * Named with a leading underscore to signal that host code should use
 * the typed methods on {@link CompositorWorkerShape} instead.
 */
export function _send(worker: Worker, msg: ToWorkerMessage, transfer?: Transferable[]): void {
  worker.postMessage(msg, transfer ?? []);
}

/**
 * Convert a registration's thresholds to a Float64Array for transfer.
 * Returns a new registration object with the typed array and the ArrayBuffer to transfer.
 */
export function prepareRegistrationForTransfer(registration: BootstrapQuantizerRegistration): {
  registration: BootstrapQuantizerRegistration;
  buffer: ArrayBuffer;
} {
  const f64 = new Float64Array(registration.thresholds);
  return {
    registration: { ...registration, thresholds: f64 },
    buffer: f64.buffer,
  };
}

/**
 * Prepare a list of registrations for transfer, returning new registrations
 * and the collected ArrayBuffers to include in the transfer list.
 */
export function prepareRegistrationsForTransfer(registrations: readonly BootstrapQuantizerRegistration[]): {
  registrations: readonly BootstrapQuantizerRegistration[];
  buffers: ArrayBuffer[];
} {
  const buffers: ArrayBuffer[] = [];
  const prepared = registrations.map((reg) => {
    const { registration, buffer } = prepareRegistrationForTransfer(reg);
    buffers.push(buffer);
    return registration;
  });
  return { registrations: prepared, buffers };
}

/**
 * Structural equality for two `ArrayLike` sequences (same length, same
 * `===` elements at every index). Works for both plain arrays and typed
 * arrays.
 */
export function sameArray<T>(left: ArrayLike<T>, right: ArrayLike<T>): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Return `true` when two bootstrap registrations share the same
 * `boundaryId`, state list, and threshold list. Used to elide redundant
 * `add-quantizer` messages during bootstrap coalescing.
 */
export function sameBootstrapRegistration(
  left: BootstrapQuantizerRegistration | undefined,
  right: BootstrapQuantizerRegistration,
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.boundaryId === right.boundaryId &&
    sameArray(left.states, right.states) &&
    sameArray(left.thresholds, right.thresholds)
  );
}

/**
 * Quantize a numeric value against a registration's thresholds and
 * return the corresponding state label. Falls back to `states[0]` if the
 * value lies below every threshold.
 */
export function evaluateRegistrationState(registration: BootstrapQuantizerRegistration, value: number): string {
  for (let index = registration.thresholds.length - 1; index >= 0; index--) {
    if (value >= registration.thresholds[index]!) {
      return registration.states[index] ?? registration.states[0]!;
    }
  }

  return registration.states[0]!;
}

/**
 * Re-shape a {@link ResolvedStateAckPayload} into the flat
 * {@link ResolvedStateEntry} form that the main-thread state store
 * consumes. Propagates `ack.generation` into each entry.
 */
export function toResolvedStateEntriesFromAck(ack: ResolvedStateAckPayload): readonly ResolvedStateEntry[] {
  return ack.states.map((state) => ({
    name: state.name,
    state: state.state,
    generation: ack.generation,
  }));
}
