import type { Receipt, UIFrame } from '@czap/core';
import { GenFrame } from '@czap/core';
import { createReceiptChain } from './receipt-chain.js';
import type { LLMRenderPipeline, LLMRenderHost } from './llm-render-pipeline.js';

/** Tracks receipt chain, pending frames, envelope ingestion, and gap replay. */
export interface LLMReceiptTracker {
  readonly receiptChain: ReturnType<typeof createReceiptChain> | null;
  readonly lastAckReceiptId: UIFrame['receiptId'] | null;

  recordFrame(frame: UIFrame): void;
  rememberEnvelope(envelope: Receipt.Envelope): void;
  replayGap(pipeline: LLMRenderPipeline, host: LLMRenderHost): { readonly type: string };
  reset(): void;
}

/**
 * Build a fresh {@link LLMReceiptTracker}. Internally lazy-initialises
 * the receipt chain on the first envelope or gap replay, so idle LLM
 * sessions pay no storage cost.
 */
export function createLLMReceiptTracker(): LLMReceiptTracker {
  let _receiptChain: ReturnType<typeof createReceiptChain> | null = null;
  let _pendingFrames: UIFrame[] | null = null;
  let _lastAckReceiptId: UIFrame['receiptId'] | null = null;

  function getReceiptChain(): ReturnType<typeof createReceiptChain> {
    if (!_receiptChain) {
      _receiptChain = createReceiptChain();
      for (const frame of _pendingFrames ?? []) {
        _receiptChain.rememberFrame(frame);
      }
      _pendingFrames = null;
    }

    return _receiptChain;
  }

  const tracker: LLMReceiptTracker = {
    get receiptChain() {
      return _receiptChain;
    },
    get lastAckReceiptId() {
      return _lastAckReceiptId;
    },

    recordFrame(frame: UIFrame): void {
      _lastAckReceiptId = frame.receiptId;
      if (_receiptChain) {
        _receiptChain.rememberFrame(frame);
        return;
      }

      (_pendingFrames ??= []).push(frame);
    },

    rememberEnvelope(envelope: Receipt.Envelope): void {
      getReceiptChain().ingestEnvelope(envelope);
    },

    replayGap(pipeline: LLMRenderPipeline, host: LLMRenderHost): { readonly type: string } {
      pipeline.flushPendingText(host, tracker.recordFrame);
      const strategy = GenFrame.resolveGap(
        _lastAckReceiptId,
        pipeline.llmRuntime?.tokenBuffer.length ?? 0,
        getReceiptChain(),
        {
          canResume: false,
        },
      );
      if (strategy.type === 'replay') {
        for (const frame of strategy.frames) {
          pipeline.renderFrame(frame, host);
        }
      }

      return strategy;
    },

    reset(): void {
      _lastAckReceiptId = null;
      _receiptChain = null;
      _pendingFrames = null;
    },
  };

  return tracker;
}
