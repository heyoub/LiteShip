import { describe, expect, test } from 'vitest';
import type { CompositeState } from '@czap/core';
import type { WorkerHost } from '@czap/worker';
import {
  buildWorkerStartupSplitMetrics,
  buildWorkerStartupComparisonAudit,
  runWorkerStartupParityScenario,
  runWorkerStartupScenario,
  type WorkerStartupScenarioResult,
  type WorkerStartupScenarioTelemetry,
} from '../../e2e/fixtures/startup-scenarios.ts';

function createFakeWorkerHost(
  tickMs: (deltaMs: number) => void,
): (startupTelemetry?: WorkerStartupScenarioTelemetry) => WorkerHost.Shape {
  return (startupTelemetry) => {
    const listeners = new Set<(state: CompositeState) => void>();
    const ackListeners = new Set<
      (ack: {
        readonly generation: number;
        readonly states: readonly { name: string; state: string }[];
        readonly additionalOutputsChanged: boolean;
      }) => void
    >();
    let computeReturned = false;
    let deliveredBeforeReturn = false;

    const host = {
      compositor: {
        addQuantizer(): void {
          tickMs(0.05);
        },
        bootstrapResolvedState(states: readonly { name: string; state: string; generation: number }[]): void {
          tickMs(0.02);
          queueMicrotask(() => {
            if (!computeReturned) {
              deliveredBeforeReturn = true;
            }
            tickMs(0.04);
            (
              startupTelemetry as WorkerStartupScenarioTelemetry & {
                onResolvedStateSettled?: (states: readonly { name: string; state: string; generation: number }[]) => void;
              }
            )?.onResolvedStateSettled?.(states);
            const ack = {
              generation: states[0]?.generation ?? 0,
              states: states.map((state) => ({ name: state.name, state: state.state })),
              additionalOutputsChanged: false,
            } as const;
            for (const listener of ackListeners) {
              listener(ack);
            }
          });
          computeReturned = true;
        },
        onResolvedStateAck(
          callback: (ack: {
            readonly generation: number;
            readonly states: readonly { name: string; state: string }[];
            readonly additionalOutputsChanged: boolean;
          }) => void,
        ): () => void {
          ackListeners.add(callback);
          return () => {
            ackListeners.delete(callback);
          };
        },
      },
      onState(callback: (state: CompositeState) => void): () => void {
        listeners.add(callback);
        return () => {
          listeners.delete(callback);
        };
      },
      dispose(): void {
        tickMs(0.01);
        expect(deliveredBeforeReturn).toBe(false);
      },
    };

    return host as unknown as WorkerHost.Shape;
  };
}

describe('startup-scenarios worker diagnostics', () => {
  test('worker startup scenario measures through first state delivery before disposal', async () => {
    let nowMs = 0;
    const tickMs = (deltaMs: number): void => {
      nowMs += deltaMs;
    };

    const result = await runWorkerStartupScenario(createFakeWorkerHost(tickMs), {
      now: () => nowMs,
      nowNs: () => nowMs * 1e6,
    });

    expect(result.totalStartupMs).toBeGreaterThan(0);
    expect(result.visibleFirstPaintMs).toBeGreaterThanOrEqual(0);
    expect(result.workerTakeoverMs).toBeGreaterThan(0);
    expect(result.stages['state-delivery']).toBeGreaterThan(0);
    expect(result.stages.dispose).toBeGreaterThan(0);
  });

  test('parity startup scenario keeps worker-only diagnostics at zero while modeling the callback queue turn', async () => {
    const result = await runWorkerStartupParityScenario();

    expect(result.diagnostics['request-compute:dispatch-send']).toBe(0);
    expect(result.diagnostics['state-delivery:message-receipt']).toBe(0);
    expect(result.diagnostics['state-delivery:callback-queue-turn']).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics['state-delivery:host-callback-delivery']).toBeGreaterThanOrEqual(0);
  });

  test('comparison audit classifies async-delivery dominant residual as honest worker seam', () => {
    const supportScenario: WorkerStartupScenarioResult = {
      totalStartupMs: 0.4,
      visibleFirstPaintMs: 0.02,
      workerTakeoverMs: 0.07,
      stages: {
        'claim-or-create': 0.01,
        'coordinator-reset-or-create': 0.01,
        'listener-bind': 0.01,
        'quantizer-bootstrap': 0.02,
        'request-compute': 0.06,
        'state-delivery': 0.08,
        dispose: 0.01,
      },
      diagnostics: {
        'coordinator-reset-or-create:runtime-reset-reuse': 0,
        'request-compute:packet-finalize': 0.01,
        'request-compute:dispatch-send': 0.03,
        'request-compute:post-send-bookkeeping': 0.002,
        'state-delivery:message-receipt': 0.05,
        'state-delivery:callback-queue-turn': 0.01,
        'state-delivery:host-callback-delivery': 0.01,
      },
    };
    const parityScenario: WorkerStartupScenarioResult = {
      totalStartupMs: 0.2,
      visibleFirstPaintMs: 0.01,
      workerTakeoverMs: 0.01,
      stages: supportScenario.stages,
      diagnostics: {
        'coordinator-reset-or-create:runtime-reset-reuse': 0,
        'request-compute:packet-finalize': 0.009,
        'request-compute:dispatch-send': 0,
        'request-compute:post-send-bookkeeping': 0,
        'state-delivery:message-receipt': 0,
        'state-delivery:callback-queue-turn': 0.003,
        'state-delivery:host-callback-delivery': 0.004,
      },
    };

    const audit = buildWorkerStartupComparisonAudit([supportScenario], [parityScenario]);

    expect(audit.posture).toBe('accept-honest-residual');
    expect(audit.dominantStage).toBe('state-delivery:message-receipt');
  });

  test('split metrics separate shared startup work from worker-only seam cost', () => {
    const supportScenario: WorkerStartupScenarioResult = {
      totalStartupMs: 0.4,
      visibleFirstPaintMs: 0.02,
      workerTakeoverMs: 0.07,
      stages: {
        'claim-or-create': 0.01,
        'coordinator-reset-or-create': 0.015,
        'listener-bind': 0.01,
        'quantizer-bootstrap': 0.02,
        'request-compute': 0.06,
        'state-delivery': 0.08,
        dispose: 0.01,
      },
      diagnostics: {
        'coordinator-reset-or-create:runtime-reset-reuse': 0.003,
        'request-compute:packet-finalize': 0.008,
        'request-compute:dispatch-send': 0.03,
        'request-compute:post-send-bookkeeping': 0.002,
        'state-delivery:message-receipt': 0.05,
        'state-delivery:callback-queue-turn': 0.01,
        'state-delivery:host-callback-delivery': 0.01,
      },
    };
    const parityScenario: WorkerStartupScenarioResult = {
      totalStartupMs: 0.2,
      visibleFirstPaintMs: 0.01,
      workerTakeoverMs: 0.01,
      stages: {
        'claim-or-create': 0.005,
        'coordinator-reset-or-create': 0.008,
        'listener-bind': 0.006,
        'quantizer-bootstrap': 0.012,
        'request-compute': 0.02,
        'state-delivery': 0.02,
        dispose: 0.01,
      },
      diagnostics: {
        'coordinator-reset-or-create:runtime-reset-reuse': 0,
        'request-compute:packet-finalize': 0.006,
        'request-compute:dispatch-send': 0,
        'request-compute:post-send-bookkeeping': 0,
        'state-delivery:message-receipt': 0,
        'state-delivery:callback-queue-turn': 0.003,
        'state-delivery:host-callback-delivery': 0.004,
      },
    };

    const audit = buildWorkerStartupComparisonAudit([supportScenario], [parityScenario]);
    const split = buildWorkerStartupSplitMetrics([supportScenario], [parityScenario], audit);

    expect(split.shared.label).toBe('worker-runtime-startup-shared');
    expect(split.visibleFirstPaintMeanNs).toBeGreaterThan(0);
    expect(split.workerTakeoverMeanNs).toBeGreaterThan(0);
    expect(split.shared.parityMeanNs).toBeGreaterThan(0);
    expect(split.shared.overheadPct).toBeGreaterThan(0);
    expect(split.seam.label).toBe('worker-runtime-startup-seam');
    expect(split.seam.absoluteMeanNs).toBeGreaterThan(split.shared.residualMeanNs);
    expect(split.seam.dominantStage).toBe('state-delivery:message-receipt');
    expect(split.seam.messageReceiptResidualNs).toBe(50000);
    expect(split.seam.dispatchSendResidualNs).toBe(30000);
    expect(split.seam.messageReceiptSharePct).toBeGreaterThan(split.seam.dispatchSendSharePct ?? 0);
    expect(split.seam.tailRatioP99ToMedian).toBeGreaterThan(1);
  });
});
