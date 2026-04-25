import type { Receipt, UIFrame } from '@czap/core';
import {
  LLMChunkNormalization,
  resolveHtmlString,
  type HtmlPolicy,
  type LLMChunk,
  type ToolCallAccumulator,
} from '@czap/web';
import { createLLMRenderPipeline, type LLMRenderPipeline } from './llm-render-pipeline.js';
import { createLLMReceiptTracker, type LLMReceiptTracker } from './llm-receipt-tracker.js';
import type { RuntimeSessionState } from './runtime-session.js';

type DeviceTier = 'none' | 'transitions' | 'animations' | 'physics' | 'compute';

/**
 * Config accepted by {@link createLLMSession}. Drives a DOM-bound LLM
 * session: `element` is the root the `client:llm` directive attaches
 * to, `target` is where text is appended, and `mode` selects render
 * strategy.
 */
export interface LLMSessionConfig {
  /** Host element (directive root). Receives `czap:llm-*` events. */
  readonly element: HTMLElement;
  /** Text-sink element (typically a child of `element`). */
  readonly target: HTMLElement;
  /** Render mode label forwarded to the pipeline. */
  readonly mode: string;
  /** Device-tier getter used by the quality controller. */
  readonly getDeviceTier: () => DeviceTier;
  /** HTML trust policy governing text-sink writes. Defaults to `text`. */
  readonly htmlPolicy?: HtmlPolicy;
  /** Opt-in to `trusted-html` (pairs with `htmlPolicy`). */
  readonly allowTrustedHtml?: boolean;
}

/**
 * Controller surface of an LLM session. Tracks runtime state, ingests
 * chunks from a stream adapter, and releases resources on
 * {@link LLMSessionShape.dispose}.
 */
export interface LLMSessionShape {
  /** Current session state (`idle` / `active` / `reconnecting` / `disposed`). */
  readonly state: RuntimeSessionState;
  /** Transition from idle to active. */
  activate(): void;
  /** Enter the reconnecting state so incoming chunks are gated. */
  beginReconnect(): void;
  /** Consume one chunk; returns `done` on stream end. */
  ingest(chunk: LLMChunk): 'continue' | 'done';
  /** Replay receipts after a gap; returns the chosen strategy type. */
  replayGap(): { readonly type: string };
  /** Remember a server-emitted receipt envelope for later replay. */
  rememberEnvelope(envelope: Receipt.Envelope): void;
  /** Reset accumulated state; optionally re-bind the target element. */
  reset(target?: HTMLElement): void;
  /** Terminate the session and release pooled runtimes. */
  dispose(): void;
}

/**
 * Pluggable callbacks a session uses to render text/frames and emit
 * observability events. Implementations either write to the DOM
 * ({@link createDOMLLMSessionHost}) or funnel data into external
 * observers ({@link createSupportLLMSessionHost}).
 */
export interface LLMSessionHost {
  setTarget(target?: HTMLElement): void;
  renderText(text: string, accumulated: string, mode: string): boolean;
  renderFrame(frame: UIFrame, accumulated: string, mode: string): boolean;
  emitToken(text: string, accumulated: string): void;
  emitFrame(frame: UIFrame): void;
  emitToolStart(name: string): void;
  emitToolEnd(name: string, args: unknown): void;
  emitDone(accumulated: string): void;
}

interface SupportLLMSessionHostHandlers {
  readonly onToken?: (detail: { readonly text: string; readonly accumulated: string }) => void;
  readonly onTokenValue?: (text: string, accumulated: string) => void;
  readonly onFrame?: (frame: UIFrame) => void;
  readonly onToolStart?: (detail: { readonly name: string }) => void;
  readonly onToolStartValue?: (name: string) => void;
  readonly onToolEnd?: (detail: { readonly name: string; readonly args: unknown }) => void;
  readonly onToolEndValue?: (name: string, args: unknown) => void;
  readonly onDone?: (detail: { readonly accumulated: string }) => void;
  readonly onDoneValue?: (accumulated: string) => void;
}

const noopSetTarget = (): void => {};
const noopEmitToken = (): void => {};
const noopEmitFrame = (): void => {};
const noopEmitToolStart = (): void => {};
const noopEmitToolEnd = (): void => {};
const noopEmitDone = (): void => {};
const alwaysRenderText = (): boolean => true;
const renderFrameTokensOnly = (frame: UIFrame): boolean => frame.tokens.length > 0;

function appendText(target: HTMLElement, text: string): void {
  if (typeof target.append === 'function') {
    target.append(text);
    return;
  }

  target.appendChild(document.createTextNode(text));
}

function replaceWithText(target: HTMLElement, text: string): void {
  target.textContent = text;
}

function writeHtml(target: HTMLElement, html: string, htmlPolicy: HtmlPolicy, allowTrustedHtml: boolean): void {
  target.innerHTML = resolveHtmlString(html, {
    policy: htmlPolicy,
    allowTrustedHtml,
  });
}

/**
 * Build an {@link LLMSessionHost} that writes text/frames directly to
 * the DOM and dispatches `czap:llm-*` custom events on `element`.
 * Default host used by {@link createLLMSession}.
 */
export function createDOMLLMSessionHost(
  element: HTMLElement,
  initialTarget: HTMLElement,
  options?: { readonly htmlPolicy?: HtmlPolicy; readonly allowTrustedHtml?: boolean },
): LLMSessionHost {
  let currentTarget = initialTarget;
  const htmlPolicy = options?.htmlPolicy ?? 'text';
  const allowTrustedHtml = options?.allowTrustedHtml ?? false;

  return {
    setTarget(target) {
      if (target) {
        currentTarget = target;
      }
    },

    renderText(text, accumulated, mode) {
      if (htmlPolicy !== 'text') {
        writeHtml(currentTarget, accumulated, htmlPolicy, allowTrustedHtml);
        return true;
      }

      if (mode === 'append') {
        appendText(currentTarget, text);
      } else {
        replaceWithText(currentTarget, accumulated);
      }

      return true;
    },

    renderFrame(frame, accumulated, mode) {
      const text = frame.tokens.join('');
      if (!text) {
        return false;
      }

      if (htmlPolicy !== 'text') {
        writeHtml(currentTarget, accumulated, htmlPolicy, allowTrustedHtml);
        return true;
      }

      if (mode === 'append') {
        appendText(currentTarget, text);
      } else {
        replaceWithText(currentTarget, accumulated);
      }

      return true;
    },

    emitToken(text, accumulated) {
      element.dispatchEvent(
        new CustomEvent('czap:llm-token', {
          detail: { text, accumulated },
          bubbles: true,
        }),
      );
    },

    emitFrame(frame) {
      element.dispatchEvent(
        new CustomEvent('czap:llm-frame', {
          detail: frame,
          bubbles: true,
        }),
      );
    },

    emitToolStart(name) {
      element.dispatchEvent(
        new CustomEvent('czap:llm-tool-start', {
          detail: { name },
          bubbles: true,
        }),
      );
    },

    emitToolEnd(name, args) {
      element.dispatchEvent(
        new CustomEvent('czap:llm-tool-end', {
          detail: { name, args },
          bubbles: true,
        }),
      );
    },

    emitDone(accumulated) {
      element.dispatchEvent(
        new CustomEvent('czap:llm-done', {
          detail: { accumulated },
          bubbles: true,
        }),
      );
    },
  };
}

/**
 * Build an {@link LLMSessionHost} that forwards events to the given
 * handler callbacks instead of touching the DOM. Useful for tests,
 * benchmarks, and any caller that wants to observe LLM output
 * programmatically.
 */
export function createSupportLLMSessionHost(handlers?: SupportLLMSessionHostHandlers): LLMSessionHost {
  const onToken = handlers?.onToken;
  const onTokenValue = handlers?.onTokenValue;
  const onFrame = handlers?.onFrame;
  const onToolStart = handlers?.onToolStart;
  const onToolStartValue = handlers?.onToolStartValue;
  const onToolEnd = handlers?.onToolEnd;
  const onToolEndValue = handlers?.onToolEndValue;
  const onDone = handlers?.onDone;
  const onDoneValue = handlers?.onDoneValue;

  // The startup bench only needs the token boundary, so skip the generic
  // support-host composition work when no other callbacks are present.
  if (
    onTokenValue &&
    !onToken &&
    !onFrame &&
    !onToolStart &&
    !onToolStartValue &&
    !onToolEnd &&
    !onToolEndValue &&
    !onDone &&
    !onDoneValue
  ) {
    return {
      setTarget: noopSetTarget,
      renderText: alwaysRenderText,
      renderFrame: renderFrameTokensOnly,
      emitToken: onTokenValue,
      emitFrame: noopEmitFrame,
      emitToolStart: noopEmitToolStart,
      emitToolEnd: noopEmitToolEnd,
      emitDone: noopEmitDone,
    };
  }

  const emitToken =
    onTokenValue && onToken
      ? (text: string, accumulated: string): void => {
          onTokenValue(text, accumulated);
          onToken({ text, accumulated });
        }
      : onTokenValue
        ? onTokenValue
        : onToken
          ? (text: string, accumulated: string): void => {
              onToken({ text, accumulated });
            }
          : undefined;
  const emitFrame = onFrame ?? noopEmitFrame;
  const emitToolStart =
    onToolStartValue && onToolStart
      ? (name: string): void => {
          onToolStartValue(name);
          onToolStart({ name });
        }
      : onToolStartValue
        ? onToolStartValue
        : onToolStart
          ? (name: string): void => {
              onToolStart({ name });
            }
          : noopEmitToolStart;
  const emitToolEnd =
    onToolEndValue && onToolEnd
      ? (name: string, args: unknown): void => {
          onToolEndValue(name, args);
          onToolEnd({ name, args });
        }
      : onToolEndValue
        ? onToolEndValue
        : onToolEnd
          ? (name: string, args: unknown): void => {
              onToolEnd({ name, args });
            }
          : noopEmitToolEnd;
  const emitDone =
    onDoneValue && onDone
      ? (accumulated: string): void => {
          onDoneValue(accumulated);
          onDone({ accumulated });
        }
      : onDoneValue
        ? onDoneValue
        : onDone
          ? (accumulated: string): void => {
              onDone({ accumulated });
            }
          : noopEmitDone;

  return {
    setTarget: noopSetTarget,
    renderText: alwaysRenderText,
    renderFrame: renderFrameTokensOnly,
    emitToken: emitToken ?? noopEmitToken,
    emitFrame,
    emitToolStart,
    emitToolEnd,
    emitDone,
  };
}

/**
 * Minimal {@link LLMSessionHost} that only surfaces the token
 * boundary, skipping the branching composition in
 * {@link createSupportLLMSessionHost}. Exposed for startup benchmarks
 * that need the cheapest possible host.
 */
export function createSupportLLMTokenBoundaryHost(
  onTokenValue: (text: string, accumulated: string) => void,
): LLMSessionHost {
  return {
    setTarget: noopSetTarget,
    renderText: alwaysRenderText,
    renderFrame: alwaysRenderText,
    emitToken: onTokenValue,
    emitFrame: noopEmitFrame,
    emitToolStart: noopEmitToolStart,
    emitToolEnd: noopEmitToolEnd,
    emitDone: noopEmitDone,
  };
}

class LLMSessionController implements LLMSessionShape {
  private runtimeState: RuntimeSessionState = 'idle';
  private currentTarget: HTMLElement | undefined;
  private toolCallBuffer: ToolCallAccumulator = null;
  private readonly pipeline: LLMRenderPipeline;
  private readonly receiptTracker: LLMReceiptTracker;

  constructor(
    private readonly config: Pick<LLMSessionConfig, 'mode' | 'getDeviceTier'> & { readonly target?: HTMLElement },
    private readonly host: LLMSessionHost,
  ) {
    this.currentTarget = config.target;
    this.pipeline = createLLMRenderPipeline({ mode: config.mode, getDeviceTier: config.getDeviceTier });
    this.receiptTracker = createLLMReceiptTracker();
  }

  get state(): RuntimeSessionState {
    return this.runtimeState;
  }

  activate(): void {
    if (!this.isDisposed()) {
      this.runtimeState = 'active';
    }
  }

  beginReconnect(): void {
    if (!this.isDisposed()) {
      this.runtimeState = 'reconnecting';
    }
  }

  ingest(chunk: LLMChunk): 'continue' | 'done' {
    if (this.isDisposed()) {
      return 'done';
    }

    const recordFrame = (frame: UIFrame): void => this.receiptTracker.recordFrame(frame);

    switch (chunk.type) {
      case 'text': {
        if (!chunk.content) {
          return 'continue';
        }

        if (
          this.pipeline.shouldUseFastLane(
            this.toolCallBuffer === null,
            this.receiptTracker.receiptChain === null,
            this.runtimeState,
          ) &&
          this.pipeline.renderImmediateText(chunk.content, this.host)
        ) {
          this.pipeline.setFastLanePrimed(true);
          this.host.emitToken(chunk.content, this.pipeline.accumulated);
          return 'continue';
        }

        this.pipeline.pushText(chunk.content);
        if (this.isDisposed()) {
          this.pipeline.clearQueuedText();
          return 'done';
        }
        if (!this.pipeline.canQueueRenderBurst()) {
          this.pipeline.clearQueuedText();
          return 'continue';
        }

        if (this.pipeline.fastLanePrimed && !this.pipeline.llmRuntime) {
          this.pipeline.promoteFastLane();
        }
        this.pipeline.enqueueFlush(this.host, recordFrame);
        return 'continue';
      }

      case 'tool-call-start': {
        if (this.pipeline.flushQueued || this.pipeline.queuedTextFragments.length > 0) {
          this.pipeline.flushPendingText(this.host, recordFrame);
        }
        const normalized = LLMChunkNormalization.normalize(chunk, this.toolCallBuffer);
        this.toolCallBuffer = normalized.toolCallBuffer;
        this.host.emitToolStart(normalized.chunk?.toolName ?? '');
        return 'continue';
      }

      case 'tool-call-delta': {
        if (this.pipeline.flushQueued || this.pipeline.queuedTextFragments.length > 0) {
          this.pipeline.flushPendingText(this.host, recordFrame);
        }
        const normalized = LLMChunkNormalization.normalize(chunk, this.toolCallBuffer);
        this.toolCallBuffer = normalized.toolCallBuffer;
        return 'continue';
      }

      case 'tool-call-end': {
        if (this.pipeline.flushQueued || this.pipeline.queuedTextFragments.length > 0) {
          this.pipeline.flushPendingText(this.host, recordFrame);
        }
        if (!this.pipeline.llmRuntime) {
          this.pipeline.promoteFastLane();
        }
        const normalized = LLMChunkNormalization.normalize(chunk, this.toolCallBuffer);
        this.toolCallBuffer = normalized.toolCallBuffer;
        const name = normalized.chunk?.toolName ?? '';
        const args = normalized.chunk?.toolArgs;
        this.host.emitToolEnd(name, args);
        return 'continue';
      }

      case 'done':
        this.pipeline.flushPendingText(this.host, recordFrame);
        this.host.emitDone(this.pipeline.accumulated);
        return 'done';
    }
  }

  replayGap(): { readonly type: string } {
    return this.receiptTracker.replayGap(this.pipeline, this.host);
  }

  rememberEnvelope(envelope: Receipt.Envelope): void {
    if (this.isDisposed()) {
      return;
    }

    this.receiptTracker.rememberEnvelope(envelope);
  }

  reset(target?: HTMLElement): void {
    if (this.isDisposed()) {
      return;
    }

    // Preserve 'reconnecting' state so that chunks arriving between reset() and
    // activate() cannot re-engage the fast lane prematurely.  The caller must
    // explicitly call activate() to advance past the reconnecting gate.
    if (this.runtimeState !== 'reconnecting') {
      this.runtimeState = 'idle';
    }
    this.resetSession(target);
  }

  dispose(): void {
    this.resetSession(this.currentTarget);
    this.pipeline.releaseRuntime();
    this.runtimeState = 'disposed';
  }

  private isDisposed(): boolean {
    return this.runtimeState === 'disposed';
  }

  private resetSession(target = this.currentTarget): void {
    this.currentTarget = target;
    this.host.setTarget(target);
    this.toolCallBuffer = null;
    this.pipeline.resetPipelineState();
    this.receiptTracker.reset();
  }
}

/**
 * Build an {@link LLMSessionShape} backed by a caller-supplied
 * {@link LLMSessionHost}. Tests and bench harnesses prefer this
 * variant over {@link createLLMSession} so they can observe output
 * without a DOM.
 */
export function createLLMSessionWithHost(
  config: Pick<LLMSessionConfig, 'mode' | 'getDeviceTier'> & { readonly target?: HTMLElement },
  host: LLMSessionHost,
): LLMSessionShape {
  return new LLMSessionController(config, host);
}

/**
 * Default `client:llm` factory: builds a session wired to the DOM.
 * Equivalent to composing {@link createDOMLLMSessionHost} with
 * {@link createLLMSessionWithHost}.
 */
export function createLLMSession(config: LLMSessionConfig): LLMSessionShape {
  const domHost = createDOMLLMSessionHost(config.element, config.target, {
    htmlPolicy: config.htmlPolicy,
    allowTrustedHtml: config.allowTrustedHtml,
  });
  return createLLMSessionWithHost(
    {
      mode: config.mode,
      getDeviceTier: config.getDeviceTier,
      target: config.target,
    },
    domHost,
  );
}
