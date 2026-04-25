import { RuntimeCoordinator, type CompositeState } from '@czap/core';
import { LLMChunkNormalization, type LLMChunk } from '@czap/web';
import type { WorkerHost } from '@czap/worker';
import { parseLLMChunk } from '../../../packages/astro/src/runtime/llm.ts';

export type WorkerStartupStage =
  | 'claim-or-create'
  | 'coordinator-reset-or-create'
  | 'listener-bind'
  | 'quantizer-bootstrap'
  | 'request-compute'
  | 'state-delivery'
  | 'dispose';

export type WorkerStartupDiagnosticStage =
  | 'coordinator-reset-or-create:runtime-reset-reuse'
  | 'request-compute:packet-finalize'
  | 'request-compute:dispatch-send'
  | 'request-compute:post-send-bookkeeping'
  | 'state-delivery:message-receipt'
  | 'state-delivery:callback-queue-turn'
  | 'state-delivery:host-callback-delivery';

export const WORKER_STARTUP_STAGE_LABELS: readonly {
  readonly stage: WorkerStartupStage;
  readonly label: string;
}[] = [
  { stage: 'claim-or-create', label: 'worker claim or create' },
  { stage: 'coordinator-reset-or-create', label: 'runtime coordinator reset or create' },
  { stage: 'listener-bind', label: 'worker listener binding' },
  { stage: 'quantizer-bootstrap', label: 'startup quantizer bootstrap' },
  { stage: 'request-compute', label: 'compute request dispatch' },
  { stage: 'state-delivery', label: 'first state delivery' },
  { stage: 'dispose', label: 'host disposal' },
] as const;

export interface WorkerStartupStageDurationsMs {
  readonly 'claim-or-create': number;
  readonly 'coordinator-reset-or-create': number;
  readonly 'listener-bind': number;
  readonly 'quantizer-bootstrap': number;
  readonly 'request-compute': number;
  readonly 'state-delivery': number;
  readonly 'dispose': number;
}

export interface WorkerStartupDiagnosticDurationsMs {
  readonly 'coordinator-reset-or-create:runtime-reset-reuse': number;
  readonly 'request-compute:packet-finalize': number;
  readonly 'request-compute:dispatch-send': number;
  readonly 'request-compute:post-send-bookkeeping': number;
  readonly 'state-delivery:message-receipt': number;
  readonly 'state-delivery:callback-queue-turn': number;
  readonly 'state-delivery:host-callback-delivery': number;
}

export const WORKER_STARTUP_DIAGNOSTIC_STAGE_LABELS: readonly {
  readonly stage: WorkerStartupDiagnosticStage;
  readonly label: string;
  readonly inclusion: 'both' | 'support-only';
}[] = [
  {
    stage: 'coordinator-reset-or-create:runtime-reset-reuse',
    label: 'claimed runtime reset before reuse',
    inclusion: 'support-only',
  },
  {
    stage: 'request-compute:packet-finalize',
    label: 'startup packet finalize or in-process apply',
    inclusion: 'both',
  },
  {
    stage: 'request-compute:dispatch-send',
    label: 'worker message send and dispatch handoff',
    inclusion: 'support-only',
  },
  {
    stage: 'request-compute:post-send-bookkeeping',
    label: 'post-send startup bookkeeping',
    inclusion: 'support-only',
  },
  {
    stage: 'state-delivery:message-receipt',
    label: 'worker message receipt latency',
    inclusion: 'support-only',
  },
  {
    stage: 'state-delivery:callback-queue-turn',
    label: 'queue turn before host callback entry',
    inclusion: 'both',
  },
  {
    stage: 'state-delivery:host-callback-delivery',
    label: 'host callback delivery',
    inclusion: 'both',
  },
] as const;

export interface WorkerStartupScenarioResult {
  readonly totalStartupMs: number;
  readonly visibleFirstPaintMs: number;
  readonly workerTakeoverMs: number;
  readonly stages: WorkerStartupStageDurationsMs;
  readonly diagnostics: WorkerStartupDiagnosticDurationsMs;
}

export interface WorkerStartupScenarioTelemetry {
  recordStage(stage: 'claim-or-create' | 'coordinator-reset-or-create' | 'listener-bind', durationNs: number): void;
  onResolvedStateSettled?(states: readonly { name: string; state: string; generation: number }[]): void;
}

export interface WorkerStartupComparisonAuditRow {
  readonly stage: WorkerStartupDiagnosticStage;
  readonly label: string;
  readonly inclusion: 'both' | 'support-only';
  readonly supportMeanNs: number;
  readonly parityMeanNs: number | null;
  readonly residualMeanNs: number;
}

export interface WorkerStartupComparisonAudit {
  readonly posture: 'optimize-current-contract' | 'accept-honest-residual' | 'reframe-parity-envelope';
  readonly conclusion: string;
  readonly dominantStage: WorkerStartupDiagnosticStage | null;
  readonly rows: readonly WorkerStartupComparisonAuditRow[];
}

export interface WorkerStartupSharedMetric {
  readonly label: 'worker-runtime-startup-shared';
  readonly supportMeanNs: number;
  readonly parityMeanNs: number;
  readonly residualMeanNs: number;
  readonly overheadPct: number | null;
  readonly thresholdPct: number;
  readonly conclusion: string;
}

export interface WorkerStartupSeamComponent {
  readonly stage: WorkerStartupDiagnosticStage;
  readonly label: string;
  readonly kind: 'worker-only' | 'shared-residual';
  readonly residualMeanNs: number;
}

export interface WorkerStartupSeamMetric {
  readonly label: 'worker-runtime-startup-seam';
  readonly absoluteMeanNs: number;
  readonly derivedPct: number | null;
  readonly dominantStage: WorkerStartupDiagnosticStage | null;
  readonly messageReceiptResidualNs: number;
  readonly dispatchSendResidualNs: number;
  readonly messageReceiptSharePct: number | null;
  readonly dispatchSendSharePct: number | null;
  readonly sharedResidualSharePct: number | null;
  readonly toBrowserStartupMedianPct: number | null;
  readonly tailRatioP99ToMedian: number | null;
  readonly conclusion: string;
  readonly components: readonly WorkerStartupSeamComponent[];
}

export interface WorkerStartupSplitMetrics {
  readonly visibleFirstPaintMeanNs: number;
  readonly workerTakeoverMeanNs: number;
  readonly shared: WorkerStartupSharedMetric;
  readonly seam: WorkerStartupSeamMetric;
}

function createWorkerStartupDiagnostics(): WorkerStartupDiagnosticDurationsMs {
  return {
    'coordinator-reset-or-create:runtime-reset-reuse': 0,
    'request-compute:packet-finalize': 0,
    'request-compute:dispatch-send': 0,
    'request-compute:post-send-bookkeeping': 0,
    'state-delivery:message-receipt': 0,
    'state-delivery:callback-queue-turn': 0,
    'state-delivery:host-callback-delivery': 0,
  };
}

export const WORKER_STARTUP_QUANTIZER = {
  name: 'layout',
  id: 'layout',
  states: ['compact', 'comfortable', 'wide'],
  thresholds: [0, 640, 1024],
  evaluateValue: 800,
} as const;

const WORKER_STARTUP_REGISTRATIONS = [
  {
    name: WORKER_STARTUP_QUANTIZER.name,
    states: WORKER_STARTUP_QUANTIZER.states,
  },
] as const;

function evaluateWorkerStartupState(value: number): string {
  const { thresholds, states } = WORKER_STARTUP_QUANTIZER;
  for (let index = thresholds.length - 1; index >= 0; index--) {
    if (value >= thresholds[index]!) {
      return states[index]!;
    }
  }

  return states[0]!;
}

function buildWorkerStartupCompositeState(name: string, state: string): CompositeState {
  return {
    discrete: { [name]: state },
    blend: {
      [name]: Object.fromEntries(WORKER_STARTUP_QUANTIZER.states.map((candidate) => [candidate, candidate === state ? 1 : 0])),
    },
    outputs: {
      css: { [`--czap-${name}`]: state },
      glsl: { [`u_${name}`]: WORKER_STARTUP_QUANTIZER.states.indexOf(state) },
      aria: { [`data-czap-${name}`]: state },
    },
  };
}

export function currentTimeNs(): number {
  return performance.now() * 1e6;
}

export async function runWorkerStartupScenario(
  createHost: (startupTelemetry?: WorkerStartupScenarioTelemetry) => WorkerHost.Shape,
  options?: {
    readonly startupTelemetry?: WorkerStartupScenarioTelemetry;
    readonly now?: () => number;
    readonly nowNs?: () => number;
    readonly onDiagnosticStage?: (stage: WorkerStartupDiagnosticStage, durationNs: number) => void;
  },
): Promise<WorkerStartupScenarioResult> {
  const now = options?.now ?? (() => performance.now());
  const nowNs = options?.nowNs ?? currentTimeNs;
  const stageDurations: WorkerStartupStageDurationsMs = {
    'claim-or-create': 0,
    'coordinator-reset-or-create': 0,
    'listener-bind': 0,
    'quantizer-bootstrap': 0,
    'request-compute': 0,
    'state-delivery': 0,
    dispose: 0,
  };
  const diagnosticDurations = createWorkerStartupDiagnostics();
  let deliveredResolve: ((value: number) => void) | null = null;
  let deliveredSettled = false;
  const settleDelivered = (): void => {
    if (deliveredSettled) {
      return;
    }
    deliveredSettled = true;
    deliveredResolve?.(now());
  };
  const startupTelemetry: WorkerStartupScenarioTelemetry = {
    recordStage(stage, durationNs) {
      stageDurations[stage] = Number((durationNs / 1e6).toFixed(4));
      options?.startupTelemetry?.recordStage(stage, durationNs);
    },
  };
  const startupTelemetryWithDiagnostics = Object.assign(startupTelemetry, {
    recordDiagnosticStage(stage: WorkerStartupDiagnosticStage, durationNs: number): void {
      diagnosticDurations[stage] = Number((durationNs / 1e6).toFixed(4));
      options?.onDiagnosticStage?.(stage, durationNs);
    },
    onResolvedStateSettled(): void {
      settleDelivered();
    },
  });
  const totalStart = now();
  const host = createHost(startupTelemetryWithDiagnostics);

  const delivered = new Promise<number>((resolve) => {
    deliveredResolve = resolve;
  });

  const bootstrapStart = now();
  host.compositor.addQuantizer(WORKER_STARTUP_QUANTIZER.name, {
    id: WORKER_STARTUP_QUANTIZER.id,
    states: WORKER_STARTUP_QUANTIZER.states,
    thresholds: WORKER_STARTUP_QUANTIZER.thresholds,
  });
  const quantizerBootstrapMs = now() - bootstrapStart;

  const visibleStart = now();
  const visibleState = evaluateWorkerStartupState(WORKER_STARTUP_QUANTIZER.evaluateValue);
  const visibleFirstPaintMs = now() - visibleStart;
  const requestStartNs = nowNs();
  host.compositor.bootstrapResolvedState([
    {
      name: WORKER_STARTUP_QUANTIZER.name,
      state: visibleState,
      generation: 1,
    },
  ]);
  const requestEndNs = nowNs();
  stageDurations['quantizer-bootstrap'] = Number(quantizerBootstrapMs.toFixed(4));
  stageDurations['request-compute'] = Number(((requestEndNs - requestStartNs) / 1e6).toFixed(4));

  const deliveredAt = await delivered;
  const totalStartupMs = deliveredAt - totalStart;
  stageDurations['state-delivery'] = Number((deliveredAt - requestEndNs / 1e6).toFixed(4));

  const disposeStart = now();
  host.dispose();
  const disposeMs = now() - disposeStart;
  stageDurations.dispose = Number(disposeMs.toFixed(4));

  return {
    totalStartupMs: Number(totalStartupMs.toFixed(4)),
    visibleFirstPaintMs: Number(visibleFirstPaintMs.toFixed(4)),
    workerTakeoverMs: Number((deliveredAt - requestStartNs / 1e6).toFixed(4)),
    stages: stageDurations,
    diagnostics: diagnosticDurations,
  };
}

export async function runWorkerStartupParityScenario(
  options?: {
    readonly now?: () => number;
    readonly nowNs?: () => number;
  },
): Promise<WorkerStartupScenarioResult> {
  const now = options?.now ?? (() => performance.now());
  const nowNs = options?.nowNs ?? currentTimeNs;
  const stageDurations: WorkerStartupStageDurationsMs = {
    'claim-or-create': 0,
    'coordinator-reset-or-create': 0,
    'listener-bind': 0,
    'quantizer-bootstrap': 0,
    'request-compute': 0,
    'state-delivery': 0,
    dispose: 0,
  };
  const diagnosticDurations = createWorkerStartupDiagnostics();
  const listeners = new Set<(state: CompositeState) => void>();
  const totalStart = now();

  const claimStartNs = nowNs();
  const claimEndNs = nowNs();
  stageDurations['claim-or-create'] = Number(((claimEndNs - claimStartNs) / 1e6).toFixed(4));

  const coordinatorStartNs = nowNs();
  const coordinator = RuntimeCoordinator.create({ capacity: 8, name: 'startup-parity' });
  const coordinatorEndNs = nowNs();
  stageDurations['coordinator-reset-or-create'] = Number(((coordinatorEndNs - coordinatorStartNs) / 1e6).toFixed(4));

  const listenerStartNs = nowNs();
  const delivered = new Promise<number>((resolve) => {
    listeners.add(() => resolve(now()));
  });
  const listenerEndNs = nowNs();
  stageDurations['listener-bind'] = Number(((listenerEndNs - listenerStartNs) / 1e6).toFixed(4));

  const bootstrapStart = now();
  coordinator.reset(WORKER_STARTUP_REGISTRATIONS);
  const quantizerBootstrapMs = now() - bootstrapStart;
  stageDurations['quantizer-bootstrap'] = Number(quantizerBootstrapMs.toFixed(4));

  const visibleStart = now();
  const state = evaluateWorkerStartupState(WORKER_STARTUP_QUANTIZER.evaluateValue);
  coordinator.markDirty(WORKER_STARTUP_QUANTIZER.name);
  coordinator.applyState(WORKER_STARTUP_QUANTIZER.name, state);
  const visibleFirstPaintMs = now() - visibleStart;
  const requestStartNs = nowNs();
  const compositeState = buildWorkerStartupCompositeState(WORKER_STARTUP_QUANTIZER.name, state);
  const requestEndNs = nowNs();
  stageDurations['request-compute'] = Number(((requestEndNs - requestStartNs) / 1e6).toFixed(4));
  diagnosticDurations['request-compute:packet-finalize'] = Number(((requestEndNs - requestStartNs) / 1e6).toFixed(4));

  const queueTurnStartNs = nowNs();
  await Promise.resolve();
  const queueTurnEndNs = nowNs();
  diagnosticDurations['state-delivery:callback-queue-turn'] = Number(((queueTurnEndNs - queueTurnStartNs) / 1e6).toFixed(4));
  const callbackStartNs = nowNs();
  for (const listener of listeners) {
    listener(compositeState);
  }
  const callbackEndNs = nowNs();
  diagnosticDurations['state-delivery:host-callback-delivery'] = Number(((callbackEndNs - callbackStartNs) / 1e6).toFixed(4));

  const deliveredAt = await delivered;
  const totalStartupMs = deliveredAt - totalStart;
  stageDurations['state-delivery'] = Number((deliveredAt - requestEndNs / 1e6).toFixed(4));

  const disposeStart = now();
  listeners.clear();
  coordinator.reset();
  const disposeMs = now() - disposeStart;
  stageDurations.dispose = Number(disposeMs.toFixed(4));

  return {
    totalStartupMs: Number(totalStartupMs.toFixed(4)),
    visibleFirstPaintMs: Number(visibleFirstPaintMs.toFixed(4)),
    workerTakeoverMs: Number((deliveredAt - requestEndNs / 1e6).toFixed(4)),
    stages: stageDurations,
    diagnostics: diagnosticDurations,
  };
}

export function buildWorkerStartupComparisonAudit(
  supportScenarios: readonly WorkerStartupScenarioResult[],
  parityScenarios: readonly WorkerStartupScenarioResult[],
): WorkerStartupComparisonAudit {
  const rows = WORKER_STARTUP_DIAGNOSTIC_STAGE_LABELS.map(({ stage, label, inclusion }) => {
    const supportSamples = supportScenarios.map((scenario) => scenario.diagnostics[stage] * 1e6);
    const paritySamples = parityScenarios.map((scenario) => scenario.diagnostics[stage] * 1e6);
    const supportMeanNs =
      supportSamples.length === 0 ? 0 : supportSamples.reduce((sum, value) => sum + value, 0) / supportSamples.length;
    const parityMeanNs =
      paritySamples.length === 0 ? 0 : paritySamples.reduce((sum, value) => sum + value, 0) / paritySamples.length;
    const roundedSupportMeanNs = Number(supportMeanNs.toFixed(2));
    const roundedParityMeanNs = inclusion === 'both' ? Number(parityMeanNs.toFixed(2)) : null;
    const residualMeanNs =
      inclusion === 'both'
        ? Number(Math.max(0, roundedSupportMeanNs - (roundedParityMeanNs ?? 0)).toFixed(2))
        : roundedSupportMeanNs;

    return {
      stage,
      label,
      inclusion,
      supportMeanNs: roundedSupportMeanNs,
      parityMeanNs: roundedParityMeanNs,
      residualMeanNs,
    } satisfies WorkerStartupComparisonAuditRow;
  });

  const dominantRow = [...rows].sort((left, right) => right.residualMeanNs - left.residualMeanNs)[0] ?? null;
  const dominantStage = dominantRow?.stage ?? null;
  const posture =
    dominantStage === 'request-compute:packet-finalize' || dominantStage === 'request-compute:post-send-bookkeeping'
      ? 'optimize-current-contract'
      : dominantStage === 'coordinator-reset-or-create:runtime-reset-reuse'
        ? 'reframe-parity-envelope'
        : 'accept-honest-residual';
  const conclusion =
    posture === 'optimize-current-contract'
      ? 'request-compute remains dominant because startup packet or dispatch-adjacent bookkeeping still looks mechanically reducible inside the current contract.'
      : posture === 'reframe-parity-envelope'
        ? 'the current parity baseline still under-charges equivalent lifecycle work, so part of the residual is metric-envelope drift rather than product debt.'
        : 'state delivery and worker-only handoff remain dominant, so the residual is mostly honest async worker seam cost inside the current contract.';

  return {
    posture,
    conclusion,
    dominantStage,
    rows,
  };
}

const SHARED_WORKER_STARTUP_STAGES: readonly WorkerStartupStage[] = [
  'claim-or-create',
  'coordinator-reset-or-create',
  'listener-bind',
  'quantizer-bootstrap',
] as const;

const SEAM_COMPONENT_STAGE_SET = new Set<WorkerStartupDiagnosticStage>([
  'request-compute:dispatch-send',
  'request-compute:post-send-bookkeeping',
  'state-delivery:message-receipt',
  'state-delivery:callback-queue-turn',
  'state-delivery:host-callback-delivery',
]);

function meanMs(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sharedStageMeanNs(
  scenarios: readonly WorkerStartupScenarioResult[],
  stage: WorkerStartupStage,
): number {
  return Number((meanMs(scenarios.map((scenario) => scenario.stages[stage])) * 1e6).toFixed(2));
}

function findAuditRow(
  audit: WorkerStartupComparisonAudit,
  stage: WorkerStartupDiagnosticStage,
): WorkerStartupComparisonAuditRow | null {
  return audit.rows.find((row) => row.stage === stage) ?? null;
}

export function buildWorkerStartupSplitMetrics(
  supportScenarios: readonly WorkerStartupScenarioResult[],
  parityScenarios: readonly WorkerStartupScenarioResult[],
  audit: WorkerStartupComparisonAudit = buildWorkerStartupComparisonAudit(supportScenarios, parityScenarios),
): WorkerStartupSplitMetrics {
  const visibleFirstPaintMeanNs = Number(
    (meanMs(supportScenarios.map((scenario) => scenario.visibleFirstPaintMs)) * 1e6).toFixed(2),
  );
  const workerTakeoverMeanNs = Number(
    (meanMs(supportScenarios.map((scenario) => scenario.workerTakeoverMs)) * 1e6).toFixed(2),
  );
  const supportSharedStageTotalNs = SHARED_WORKER_STARTUP_STAGES.reduce(
    (sum, stage) => sum + sharedStageMeanNs(supportScenarios, stage),
    0,
  );
  const paritySharedStageTotalNs = SHARED_WORKER_STARTUP_STAGES.reduce(
    (sum, stage) => sum + sharedStageMeanNs(parityScenarios, stage),
    0,
  );
  const packetFinalizeRow = findAuditRow(audit, 'request-compute:packet-finalize');
  const supportSharedMeanNs = Number((supportSharedStageTotalNs + (packetFinalizeRow?.supportMeanNs ?? 0)).toFixed(2));
  const paritySharedMeanNs = Number((paritySharedStageTotalNs + (packetFinalizeRow?.parityMeanNs ?? 0)).toFixed(2));
  const sharedResidualMeanNs = Number((supportSharedMeanNs - paritySharedMeanNs).toFixed(2));
  const sharedOverheadPct =
    paritySharedMeanNs > 0 ? Number((((supportSharedMeanNs - paritySharedMeanNs) / paritySharedMeanNs) * 100).toFixed(2)) : null;

  const seamComponents = audit.rows
    .filter((row) => SEAM_COMPONENT_STAGE_SET.has(row.stage))
    .map((row) => ({
      stage: row.stage,
      label: row.label,
      kind: row.inclusion === 'support-only' ? 'worker-only' : 'shared-residual',
      residualMeanNs: row.residualMeanNs,
    })) satisfies readonly WorkerStartupSeamComponent[];
  const seamAbsoluteMeanNs = Number(
    seamComponents.reduce((sum, component) => sum + component.residualMeanNs, 0).toFixed(2),
  );
  const seamDerivedPct =
    paritySharedMeanNs > 0 ? Number(((seamAbsoluteMeanNs / paritySharedMeanNs) * 100).toFixed(2)) : null;
  const dominantSeamComponent = [...seamComponents].sort((left, right) => right.residualMeanNs - left.residualMeanNs)[0] ?? null;
  const messageReceiptResidualNs = seamComponents.find((component) => component.stage === 'state-delivery:message-receipt')?.residualMeanNs ?? 0;
  const dispatchSendResidualNs = seamComponents.find((component) => component.stage === 'request-compute:dispatch-send')?.residualMeanNs ?? 0;
  const sharedResidualComponentNs = seamComponents
    .filter((component) => component.kind === 'shared-residual')
    .reduce((sum, component) => sum + component.residualMeanNs, 0);
  const messageReceiptSharePct =
    seamAbsoluteMeanNs > 0 ? Number(((messageReceiptResidualNs / seamAbsoluteMeanNs) * 100).toFixed(2)) : null;
  const dispatchSendSharePct =
    seamAbsoluteMeanNs > 0 ? Number(((dispatchSendResidualNs / seamAbsoluteMeanNs) * 100).toFixed(2)) : null;
  const sharedResidualSharePct =
    seamAbsoluteMeanNs > 0 ? Number(((sharedResidualComponentNs / seamAbsoluteMeanNs) * 100).toFixed(2)) : null;
  const stateDeliverySamplesNs = supportScenarios.map((scenario) => scenario.stages['state-delivery'] * 1e6);
  const seamTailRatioP99ToMedian =
    (messageReceiptResidualNs > 0 ? messageReceiptResidualNs : seamAbsoluteMeanNs) > 0
      ? Number(
          (
            (stateDeliverySamplesNs.length === 0 ? seamAbsoluteMeanNs : Math.max(...stateDeliverySamplesNs)) /
            (messageReceiptResidualNs > 0 ? messageReceiptResidualNs : seamAbsoluteMeanNs)
          ).toFixed(2),
        )
      : null;

  return {
    visibleFirstPaintMeanNs,
    workerTakeoverMeanNs,
    shared: {
      label: 'worker-runtime-startup-shared',
      supportMeanNs: supportSharedMeanNs,
      parityMeanNs: paritySharedMeanNs,
      residualMeanNs: sharedResidualMeanNs,
      overheadPct: sharedOverheadPct,
      thresholdPct: 25,
      conclusion:
        sharedOverheadPct !== null && sharedOverheadPct <= 25
          ? 'Shared startup work is within the diagnostic target, so the remaining broad worker drift is no longer driven by bootstrap or coordinator parity.'
          : 'Shared startup work still carries meaningful support-lane drift, so bootstrap or coordinator-side parity remains a valid optimization target.',
    },
    seam: {
      label: 'worker-runtime-startup-seam',
      absoluteMeanNs: seamAbsoluteMeanNs,
      derivedPct: seamDerivedPct,
      dominantStage: dominantSeamComponent?.stage ?? null,
      messageReceiptResidualNs: Number(messageReceiptResidualNs.toFixed(2)),
      dispatchSendResidualNs: Number(dispatchSendResidualNs.toFixed(2)),
      messageReceiptSharePct,
      dispatchSendSharePct,
      sharedResidualSharePct,
      toBrowserStartupMedianPct: null,
      tailRatioP99ToMedian: seamTailRatioP99ToMedian,
      conclusion:
        dominantSeamComponent === null
          ? 'No worker-only seam residual was captured in the current startup audit.'
          : 'Worker-only dispatch, receipt, and callback residual now represent the off-thread seam directly, so absolute time is the primary reading and the derived percent is only supporting context.',
      components: seamComponents,
    },
  };
}

export type LLMStartupMode = 'simple' | 'promoted';

export interface LLMStartupScenario {
  readonly mode: LLMStartupMode;
  readonly messages: readonly string[];
  readonly firstTokenOrdinal: number;
}

export function buildLLMStartupScenario(mode: LLMStartupMode): LLMStartupScenario {
  if (mode === 'simple') {
    return {
      mode,
      messages: [JSON.stringify({ type: 'text', content: 'startup token' }), JSON.stringify({ type: 'done' })],
      firstTokenOrdinal: 1,
    };
  }

  return {
    mode,
    messages: [
      JSON.stringify({ type: 'text', content: 'startup token' }),
      JSON.stringify({ type: 'text', content: ' promoted token' }),
      JSON.stringify({ type: 'done' }),
    ],
    firstTokenOrdinal: 2,
  };
}

export function collectNormalizedLLMStartupChunks(mode: LLMStartupMode): readonly LLMChunk[] {
  const scenario = buildLLMStartupScenario(mode);
  const chunks: LLMChunk[] = [];
  let toolCallBuffer = null;
  let tokenCount = 0;

  for (const raw of scenario.messages) {
    const parsed = parseLLMChunk({ data: raw });
    if (!parsed) {
      continue;
    }

    const normalized = LLMChunkNormalization.normalize(parsed, toolCallBuffer);
    toolCallBuffer = normalized.toolCallBuffer;
    if (!normalized.chunk) {
      continue;
    }

    chunks.push(normalized.chunk);
    if (normalized.chunk.type === 'text' && normalized.chunk.content) {
      tokenCount += 1;
      if (tokenCount >= scenario.firstTokenOrdinal) {
        break;
      }
    }
  }

  return chunks;
}
