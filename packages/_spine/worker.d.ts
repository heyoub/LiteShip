/**
 * @czap/worker type spine -- off-main-thread compositor and render workers.
 */

import type { CompositeState, VideoConfig, VideoFrameOutput } from './core.d.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkerConfig {
  readonly poolCapacity?: number;
  readonly targetFps?: number;
}

interface InitMessage {
  readonly type: 'init';
}

interface AddQuantizerMessage {
  readonly type: 'add-quantizer';
  readonly name: string;
  readonly boundaryId: string;
  readonly states: readonly string[];
  readonly thresholds: readonly number[];
}

interface BootstrapQuantizerRegistration {
  readonly name: string;
  readonly boundaryId: string;
  readonly states: readonly string[];
  readonly thresholds: readonly number[];
  readonly initialState?: string;
  readonly blendWeights?: Record<string, number>;
}

interface StartupComputePacket {
  readonly bootstrapMode: 'cold' | 'warm-snapshot' | 'rebuild';
  readonly registrations: readonly BootstrapQuantizerRegistration[];
  readonly updates: readonly WorkerUpdate[];
}

interface BootstrapQuantizersMessage {
  readonly type: 'bootstrap-quantizers';
  readonly registrations: readonly BootstrapQuantizerRegistration[];
}

interface StartupComputeMessage {
  readonly type: 'startup-compute';
  readonly packet: StartupComputePacket;
}

interface RemoveQuantizerMessage {
  readonly type: 'remove-quantizer';
  readonly name: string;
}

interface EvaluateMessage {
  readonly type: 'evaluate';
  readonly name: string;
  readonly value: number;
}

interface SetBlendMessage {
  readonly type: 'set-blend';
  readonly name: string;
  readonly weights: Record<string, number>;
}

interface RemoveQuantizerUpdate {
  readonly type: 'remove-quantizer';
  readonly name: string;
}

interface EvaluateUpdate {
  readonly type: 'evaluate';
  readonly name: string;
  readonly value: number;
}

interface SetBlendUpdate {
  readonly type: 'set-blend';
  readonly name: string;
  readonly weights: Record<string, number>;
}

export type WorkerUpdate = RemoveQuantizerUpdate | EvaluateUpdate | SetBlendUpdate;

interface ApplyUpdatesMessage {
  readonly type: 'apply-updates';
  readonly updates: readonly WorkerUpdate[];
}

interface ComputeMessage {
  readonly type: 'compute';
}

interface WarmResetMessage {
  readonly type: 'warm-reset';
}

interface StartRenderMessage {
  readonly type: 'start-render';
  readonly config: VideoConfig;
}

interface StopRenderMessage {
  readonly type: 'stop-render';
}

interface TransferCanvasMessage {
  readonly type: 'transfer-canvas';
  readonly canvas: OffscreenCanvas;
}

interface DisposeMessage {
  readonly type: 'dispose';
}

export type ToWorkerMessage =
  | InitMessage
  | AddQuantizerMessage
  | BootstrapQuantizersMessage
  | StartupComputeMessage
  | ApplyUpdatesMessage
  | RemoveQuantizerMessage
  | EvaluateMessage
  | SetBlendMessage
  | WarmResetMessage
  | ComputeMessage
  | StartRenderMessage
  | StopRenderMessage
  | TransferCanvasMessage
  | DisposeMessage;

interface ReadyMessage {
  readonly type: 'ready';
}

interface StateMessage {
  readonly type: 'state';
  readonly state: CompositeState;
}

interface FrameMessage {
  readonly type: 'frame';
  readonly output: VideoFrameOutput;
}

interface RenderCompleteMessage {
  readonly type: 'render-complete';
  readonly totalFrames: number;
}

interface ErrorMessage {
  readonly type: 'error';
  readonly message: string;
}

interface MetricsMessage {
  readonly type: 'metrics';
  readonly fps: number;
  readonly budgetUsed: number;
}

export type FromWorkerMessage =
  | ReadyMessage
  | StateMessage
  | FrameMessage
  | RenderCompleteMessage
  | ErrorMessage
  | MetricsMessage;

export declare const Messages: {
  isToWorker(msg: unknown): msg is ToWorkerMessage;
  isFromWorker(msg: unknown): msg is FromWorkerMessage;
};

export declare namespace Messages {
  export type ToWorker = ToWorkerMessage;
  export type FromWorker = FromWorkerMessage;
  export type Config = WorkerConfig;
  export type Update = WorkerUpdate;
  export type BootstrapRegistration = BootstrapQuantizerRegistration;
  export type StartupPacket = StartupComputePacket;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. SPSC RING BUFFER
// ═══════════════════════════════════════════════════════════════════════════════

export interface SPSCRingBufferShape {
  push(data: Float64Array): boolean;
  pop(out: Float64Array): boolean;
}

export declare const SPSCRing: {
  createPair(
    slotCount: number,
    slotSize: number,
  ): {
    readonly buffer: SharedArrayBuffer;
    producer: SPSCRingBufferShape;
    consumer: SPSCRingBufferShape;
  };
  attachProducer(sab: SharedArrayBuffer, slotCount: number, slotSize: number): SPSCRingBufferShape;
  attachConsumer(sab: SharedArrayBuffer, slotCount: number, slotSize: number): SPSCRingBufferShape;
};

export declare namespace SPSCRing {
  export type Shape = SPSCRingBufferShape;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. COMPOSITOR WORKER
// ═══════════════════════════════════════════════════════════════════════════════

export type CompositorWorkerStartupStage =
  | 'claim-or-create'
  | 'coordinator-reset-or-create'
  | 'listener-bind';

export interface CompositorWorkerStartupTelemetry {
  recordStage(stage: CompositorWorkerStartupStage, durationNs: number): void;
}

export interface CompositorWorkerShape {
  readonly worker: Worker;
  /** Runtime coordination surface (internal shape, see @czap/core RuntimeCoordinator). */
  readonly runtime: unknown;
  addQuantizer(
    name: string,
    boundary: {
      readonly id: string;
      readonly states: readonly string[];
      readonly thresholds: readonly number[];
    },
  ): void;
  removeQuantizer(name: string): void;
  evaluate(name: string, value: number): void;
  setBlendWeights(name: string, weights: Record<string, number>): void;
  requestCompute(): void;
  onState(callback: (state: CompositeState) => void): () => void;
  onMetrics(callback: (fps: number, budgetUsed: number) => void): () => void;
  dispose(): void;
}

export declare const CompositorWorker: {
  create(config?: WorkerConfig, startupTelemetry?: CompositorWorkerStartupTelemetry): CompositorWorkerShape;
};

export declare namespace CompositorWorker {
  export type Shape = CompositorWorkerShape;
  export type StartupStage = CompositorWorkerStartupStage;
  export type StartupTelemetry = CompositorWorkerStartupTelemetry;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. RENDER WORKER
// ═══════════════════════════════════════════════════════════════════════════════

export interface RenderWorkerShape {
  readonly worker: Worker;
  transferCanvas(canvas: OffscreenCanvas): void;
  startRender(config: VideoConfig): void;
  stopRender(): void;
  onFrame(callback: (output: VideoFrameOutput) => void): () => void;
  onComplete(callback: (totalFrames: number) => void): () => void;
  dispose(): void;
}

export declare const RenderWorker: {
  create(): RenderWorkerShape;
};

export declare namespace RenderWorker {
  export type Shape = RenderWorkerShape;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 5. WORKER HOST
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkerHostShape {
  readonly compositor: CompositorWorkerShape;
  readonly renderer: RenderWorkerShape | null;
  attachCanvas(canvas: HTMLCanvasElement): void;
  startRender(config: VideoConfig): void;
  stopRender(): void;
  onState(callback: (state: CompositeState) => void): () => void;
  dispose(): void;
}

export declare const WorkerHost: {
  create(config?: WorkerConfig, startupTelemetry?: CompositorWorkerStartupTelemetry): WorkerHostShape;
};

export declare namespace WorkerHost {
  export type Shape = WorkerHostShape;
  export type StartupTelemetry = CompositorWorkerStartupTelemetry;
}
