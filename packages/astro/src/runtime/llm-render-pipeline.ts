/**
 * Internal render-pipeline building block used by the `client:llm`
 * directive. Owns the token buffer, the `GenFrame` scheduler, the
 * quality controller, and the fast-lane state machine.
 *
 * @module
 */
import { GenFrame, TokenBuffer, UIQuality } from '@czap/core';
import type { UIFrame } from '@czap/core';

type DeviceTier = 'none' | 'transitions' | 'animations' | 'physics' | 'compute';

/**
 * Bundle of runtime objects one LLM session owns: the token buffer,
 * the adaptive quality controller, and the frame scheduler.
 */
export interface LLMRenderRuntime {
  /** Ring of incoming text fragments feeding the scheduler. */
  readonly tokenBuffer: TokenBuffer.Shape<string>;
  /** Adaptive quality controller. Reassigned on each reset. */
  quality: ReturnType<typeof UIQuality.make>;
  /** Frame scheduler bound to `tokenBuffer` + `quality`. */
  scheduler: ReturnType<typeof GenFrame.make>;
}

/**
 * Host callbacks the pipeline invokes when it wants to render a text
 * delta or a finalised `UIFrame`. Callbacks return `true` when the
 * frame/text was actually rendered so the pipeline can advance state.
 */
export interface LLMRenderHost {
  renderText(text: string, accumulated: string, mode: string): boolean;
  renderFrame(frame: UIFrame, accumulated: string, mode: string): boolean;
  emitToken(text: string, accumulated: string): void;
  emitFrame(frame: UIFrame): void;
}

/**
 * Pipeline construction options. `mode` is the LLM render mode label;
 * `getDeviceTier` is called on every quality evaluation so tier
 * changes flow into the scheduler without explicit re-wiring.
 */
export interface LLMRenderPipelineConfig {
  /** User-provided render mode label (e.g. `"fast"`, `"stream"`). */
  readonly mode: string;
  /** Current device tier getter; consulted per evaluation. */
  readonly getDeviceTier: () => DeviceTier;
}

/** Manages render runtime pooling, token buffering, frame flushing, and fast lane logic. */
export interface LLMRenderPipeline {
  readonly fastLanePrimed: boolean;
  readonly flushQueued: boolean;
  readonly queuedTextFragments: string[];
  readonly llmRuntime: LLMRenderRuntime | null;
  accumulated: string;

  isRenderTierEnabled(): boolean;
  canQueueRenderBurst(): boolean;
  shouldUseFastLane(toolCallBufferIsNull: boolean, receiptChainIsNull: boolean, runtimeState: string): boolean;

  getLLMRuntime(): LLMRenderRuntime;
  promoteFastLane(): void;
  resetRenderRuntime(): void;

  renderImmediateText(text: string, host: LLMRenderHost): boolean;
  renderFrame(frame: UIFrame, host: LLMRenderHost): boolean;
  flushFrames(
    activeRuntime: LLMRenderRuntime,
    canRender: boolean,
    host: LLMRenderHost,
    recordFrame: (frame: UIFrame) => void,
    shouldRecordFrame?: boolean,
  ): boolean;
  flushQueuedText(host: LLMRenderHost, recordFrame: (frame: UIFrame) => void, shouldRecordFrame?: boolean): void;
  enqueueFlush(host: LLMRenderHost, recordFrame: (frame: UIFrame) => void, shouldRecordFrame?: boolean): void;
  flushPendingText(host: LLMRenderHost, recordFrame: (frame: UIFrame) => void): void;

  pushText(fragment: string): void;
  clearQueuedText(): void;
  setFastLanePrimed(value: boolean): void;
  resetPipelineState(): void;
  releaseRuntime(): void;
}

// -- Standby runtime pool (module-level singleton) --

let standbyLLMRuntime: LLMRenderRuntime | null = null;

function resetLLMRuntime(runtime: LLMRenderRuntime): void {
  runtime.tokenBuffer.reset();
  runtime.quality = UIQuality.make();
  runtime.scheduler.reset();
}

function createSessionRenderRuntime(config: Pick<LLMRenderPipelineConfig, 'getDeviceTier'>): LLMRenderRuntime {
  const tokenBuffer = TokenBuffer.make<string>({ capacity: 128 });
  const llmRuntime: LLMRenderRuntime = {
    tokenBuffer,
    quality: UIQuality.make(),
    scheduler: null as never,
  };
  llmRuntime.scheduler = GenFrame.make({
    tokenBuffer,
    getQualityTier: () => llmRuntime.quality.evaluate(tokenBuffer.occupancy, config.getDeviceTier()),
  });
  return llmRuntime;
}

/**
 * Claim the standby LLM runtime (if any) or mint a fresh one. The
 * standby pool holds at most one runtime so cold-start cost is
 * amortised across successive `client:llm` mounts on the same page.
 */
export function claimStandbyLLMRuntime(config: Pick<LLMRenderPipelineConfig, 'getDeviceTier'>): LLMRenderRuntime {
  const claimed = standbyLLMRuntime;
  standbyLLMRuntime = null;
  if (claimed) {
    resetLLMRuntime(claimed);
    return claimed;
  }

  return createSessionRenderRuntime(config);
}

/**
 * Return a no-longer-needed LLM runtime to the standby pool. Resets
 * the runtime in place so the next claimer observes a clean slate.
 * If the pool is already occupied the runtime is simply discarded.
 */
export function releaseStandbyLLMRuntime(runtime: LLMRenderRuntime): void {
  resetLLMRuntime(runtime);
  if (standbyLLMRuntime === null) {
    standbyLLMRuntime = runtime;
  }
}

// -- Pipeline implementation --

/**
 * Build a fresh {@link LLMRenderPipeline}. The pipeline lazily claims
 * a runtime from the standby pool on first use and exposes every hook
 * the `client:llm` directive needs to drive its render loop.
 */
export function createLLMRenderPipeline(config: LLMRenderPipelineConfig): LLMRenderPipeline {
  let _accumulated = '';
  let _queuedTextFragments: string[] = [];
  let _flushQueued = false;
  let _fastLanePrimed = false;
  let _llmRuntime: LLMRenderRuntime | null = null;
  let _disposed = false;
  let _queuedTextCount = 0;
  let _queuedRecordFrame = false;
  let _queuedHost: LLMRenderHost | null = null;
  let _queuedRecordFrameHandler: ((frame: UIFrame) => void) | null = null;

  const flushTask = (): void => {
    if (!_flushQueued) {
      return;
    }

    _flushQueued = false;
    const host = _queuedHost;
    const recordFrame = _queuedRecordFrameHandler;
    const shouldRecordFrame = _queuedRecordFrame;
    _queuedHost = null;
    _queuedRecordFrameHandler = null;
    _queuedRecordFrame = false;

    if (_disposed || !host || !recordFrame) {
      _queuedTextFragments = [];
      _queuedTextCount = 0;
      return;
    }

    pipeline.flushQueuedText(host, recordFrame, shouldRecordFrame);
  };

  const pipeline: LLMRenderPipeline = {
    get fastLanePrimed() {
      return _fastLanePrimed;
    },
    get flushQueued() {
      return _flushQueued;
    },
    get queuedTextFragments() {
      return _queuedTextFragments;
    },
    get llmRuntime() {
      return _llmRuntime;
    },
    get accumulated() {
      return _accumulated;
    },
    set accumulated(value: string) {
      _accumulated = value;
    },

    isRenderTierEnabled(): boolean {
      return config.getDeviceTier() !== 'none';
    },

    canQueueRenderBurst(): boolean {
      return pipeline.isRenderTierEnabled();
    },

    shouldUseFastLane(toolCallBufferIsNull: boolean, receiptChainIsNull: boolean, runtimeState: string): boolean {
      return (
        !_fastLanePrimed &&
        !_llmRuntime &&
        _queuedTextCount === 0 &&
        !_flushQueued &&
        toolCallBufferIsNull &&
        receiptChainIsNull &&
        _accumulated.length === 0 &&
        runtimeState !== 'reconnecting' &&
        pipeline.isRenderTierEnabled()
      );
    },

    getLLMRuntime(): LLMRenderRuntime {
      if (_llmRuntime) {
        return _llmRuntime;
      }

      _llmRuntime = claimStandbyLLMRuntime(config);
      return _llmRuntime;
    },

    promoteFastLane(): void {
      if (!_fastLanePrimed || _llmRuntime) {
        return;
      }

      pipeline.getLLMRuntime();
    },

    resetRenderRuntime(): void {
      if (_llmRuntime) {
        resetLLMRuntime(_llmRuntime);
      }
    },

    renderImmediateText(text: string, host: LLMRenderHost): boolean {
      _accumulated += text;
      return host.renderText(text, _accumulated, config.mode);
    },

    renderFrame(frame: UIFrame, host: LLMRenderHost): boolean {
      const text = frame.tokens.join('');
      if (!text) {
        return false;
      }

      _accumulated += text;
      return host.renderFrame(frame, _accumulated, config.mode);
    },

    flushFrames(
      activeRuntime: LLMRenderRuntime,
      canRender: boolean,
      host: LLMRenderHost,
      recordFrame: (frame: UIFrame) => void,
      shouldRecordFrame = true,
    ): boolean {
      let renderedFrames = false;
      while (true) {
        const frame = activeRuntime.scheduler.tick();
        if (!frame || frame.tokens.length === 0) {
          return renderedFrames;
        }

        if (shouldRecordFrame) {
          recordFrame(frame);
        }
        if (!canRender || !pipeline.renderFrame(frame, host)) {
          continue;
        }

        renderedFrames = true;
        host.emitFrame(frame);
      }
    },

    flushQueuedText(host: LLMRenderHost, recordFrame: (frame: UIFrame) => void, shouldRecordFrame = true): void {
      const fragments = _queuedTextFragments;
      _queuedTextFragments = [];
      _queuedTextCount = 0;

      const canRender = pipeline.isRenderTierEnabled();
      if (!canRender) {
        return;
      }

      const activeRuntime = pipeline.getLLMRuntime();
      for (const fragment of fragments) {
        activeRuntime.tokenBuffer.push(fragment);
      }

      if (pipeline.flushFrames(activeRuntime, canRender, host, recordFrame, shouldRecordFrame)) {
        host.emitToken(fragments.length === 1 ? fragments[0]! : fragments.join(''), _accumulated);
      }
    },

    enqueueFlush(host: LLMRenderHost, recordFrame: (frame: UIFrame) => void, shouldRecordFrame = true): void {
      _queuedHost = host;
      _queuedRecordFrameHandler = recordFrame;
      _queuedRecordFrame ||= shouldRecordFrame;
      if (_flushQueued) {
        return;
      }

      _flushQueued = true;
      queueMicrotask(flushTask);
    },

    flushPendingText(host: LLMRenderHost, recordFrame: (frame: UIFrame) => void): void {
      if (!_flushQueued && _queuedTextCount === 0) {
        return;
      }

      _flushQueued = false;
      _queuedHost = null;
      _queuedRecordFrameHandler = null;
      const shouldRecordFrame = _queuedRecordFrame;
      _queuedRecordFrame = false;
      pipeline.flushQueuedText(host, recordFrame, shouldRecordFrame);
    },

    pushText(fragment: string): void {
      _queuedTextFragments.push(fragment);
      _queuedTextCount += 1;
    },

    clearQueuedText(): void {
      _queuedTextFragments = [];
      _queuedTextCount = 0;
    },

    setFastLanePrimed(value: boolean): void {
      _fastLanePrimed = value;
    },

    resetPipelineState(): void {
      _accumulated = '';
      _queuedTextFragments = [];
      _queuedTextCount = 0;
      _flushQueued = false;
      _queuedRecordFrame = false;
      _queuedHost = null;
      _queuedRecordFrameHandler = null;
      _fastLanePrimed = false;
      pipeline.resetRenderRuntime();
    },

    releaseRuntime(): void {
      if (_llmRuntime) {
        releaseStandbyLLMRuntime(_llmRuntime);
        _llmRuntime = null;
      }
      _disposed = true;
    },
  };

  return pipeline;
}
