/**
 * GenFrame -- generative UI frame scheduler.
 *
 * Fixed-step scheduler producing "UI frames" at configurable fps
 * from token buffer. Each frame classified as keyframe (I-frame),
 * delta (P-frame), or interpolated (B-frame).
 *
 * Integrates with FrameBudget for priority scheduling and receipt
 * chain for disconnect-resilient generative UI state.
 *
 * @module
 */

import type { ContentAddress } from './brands.js';
import type { TokenBuffer } from './token-buffer.js';
import { fnv1a } from './fnv.js';
import type { UIQualityTier } from './ui-quality.js';

// ---------------------------------------------------------------------------
// UIFrame
// ---------------------------------------------------------------------------

/**
 * Classification of a {@link UIFrame} in the generative-UI pipeline, analogous to
 * I/P/B frames in video: `keyframe` replaces, `delta` patches, `interpolated`
 * keeps the DOM still and animates via CSS only.
 */
export type FrameType = 'keyframe' | 'delta' | 'interpolated';

/** How a {@link UIFrame} is applied to the DOM: full replace, patch, or CSS-only motion. */
export type MorphStrategy = 'replace' | 'patch' | 'css-only';

/**
 * A single frame emitted by the {@link GenFrame} scheduler — the unit of work
 * the DOM runtime consumes. Carries the drained tokens, its classification,
 * the quality tier that produced it, and a content-addressed receipt for
 * disconnect-resilient replay.
 */
export interface UIFrame {
  readonly type: FrameType;
  readonly tokens: readonly string[];
  readonly qualityTier: UIQualityTier;
  readonly morphStrategy: MorphStrategy;
  readonly timestamp: number;
  readonly receiptId: ContentAddress;
  readonly bufferPosition: number;
}

// ---------------------------------------------------------------------------
// Gap resolution
// ---------------------------------------------------------------------------

/**
 * Recovery plan returned by {@link GenFrame.resolveGap} when a stream disconnects:
 * resume from a buffer position, replay cached frames, request a full restart,
 * or do nothing.
 */
export type GapStrategy =
  | { readonly type: 'resume'; readonly bufferPosition: number }
  | { readonly type: 'replay'; readonly frames: readonly UIFrame[] }
  | { readonly type: 're-request'; readonly fromScratch: true }
  | { readonly type: 'noop' };

/** Transport-layer snapshot indicating whether the stream can resume from its last event. */
export interface ResumptionInfo {
  readonly canResume: boolean;
  readonly lastEventId?: string;
}

/** Accessor bundle that exposes the receipt chain to {@link GenFrame.resolveGap}. */
export interface ReceiptChainInfo {
  readonly hasFramesAfter: (receiptId: ContentAddress | null) => boolean;
  readonly getFramesAfter: (receiptId: ContentAddress | null) => readonly UIFrame[];
}

function resolveGap(
  lastAckReceiptId: ContentAddress | null,
  currentStreamPosition: number,
  receiptChain: ReceiptChainInfo,
  resumptionState: ResumptionInfo,
): GapStrategy {
  // 1. Can the stream resume?
  if (resumptionState.canResume) {
    return { type: 'resume', bufferPosition: currentStreamPosition };
  }

  // 2. Do we have cached frames in the receipt chain?
  if (receiptChain.hasFramesAfter(lastAckReceiptId)) {
    const frames = receiptChain.getFramesAfter(lastAckReceiptId);
    if (frames.length > 0) {
      return { type: 'replay', frames };
    }
  }

  // 3. Neither available — full re-request
  return { type: 're-request', fromScratch: true };
}

// ---------------------------------------------------------------------------
// Frame scheduler
// ---------------------------------------------------------------------------

interface GenFrameConfig {
  readonly fps?: number;
  readonly tokenBuffer: TokenBuffer.Shape<string>;
  readonly getQualityTier: () => UIQualityTier;
}

interface GenFrameSchedulerShape {
  tick(): UIFrame | null;
  readonly frameCount: number;
  readonly lastFrame: UIFrame | null;
  markKeyframe(): void;
  reset(): void;
}

// FNV-1a for receipt IDs — delegated to shared fnv.ts (see fnv.ts)

function _make(config: GenFrameConfig): GenFrameSchedulerShape {
  const { tokenBuffer, getQualityTier } = config;

  let frameCount = 0;
  let lastFrame: UIFrame | null = null;
  let lastQualityTier: UIQualityTier | null = null;
  let forceKeyframe = true; // First frame is always a keyframe
  let totalTokensDrained = 0;

  return {
    tick(): UIFrame | null {
      const tier = getQualityTier();
      const tokens = tokenBuffer.drain(32); // Drain up to 32 tokens per frame

      // Determine frame type
      let type: FrameType;
      if (forceKeyframe || lastQualityTier !== tier) {
        type = 'keyframe';
        forceKeyframe = false;
      } else if (tokens.length === 0) {
        // Stall — produce interpolated frame (CSS-only, no DOM mutation)
        if (tokenBuffer.isStalled) {
          type = 'interpolated';
        } else {
          // No tokens but not stalled — skip frame
          return null;
        }
      } else {
        type = 'delta';
      }

      // Determine morph strategy
      let morphStrategy: MorphStrategy;
      switch (type) {
        case 'keyframe':
          morphStrategy = 'replace';
          break;
        case 'interpolated':
          morphStrategy = 'css-only';
          break;
        default:
          morphStrategy = 'patch';
      }

      totalTokensDrained += tokens.length;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

      // Generate receipt ID from frame content
      const receiptId = fnv1a(`${frameCount}:${now}:${tokens.join('')}`);

      const frame: UIFrame = {
        type,
        tokens,
        qualityTier: tier,
        morphStrategy,
        timestamp: now,
        receiptId,
        bufferPosition: totalTokensDrained,
      };

      lastFrame = frame;
      lastQualityTier = tier;
      frameCount++;

      return frame;
    },

    get frameCount(): number {
      return frameCount;
    },

    get lastFrame(): UIFrame | null {
      return lastFrame;
    },

    markKeyframe(): void {
      forceKeyframe = true;
    },

    reset(): void {
      frameCount = 0;
      lastFrame = null;
      lastQualityTier = null;
      forceKeyframe = true;
      totalTokensDrained = 0;
    },
  };
}

/**
 * Generative-UI frame scheduler namespace.
 *
 * Turns a bursty LLM token stream into evenly-paced frames the DOM runtime
 * can apply without stalling, and resolves disconnect gaps using the receipt
 * chain or transport resumption.
 */
export const GenFrame = {
  /** Create a new fixed-step scheduler bound to a {@link TokenBuffer} and quality-tier probe. */
  make: _make,
  /** Pick a recovery {@link GapStrategy} after a stream disconnect. */
  resolveGap,
};

export declare namespace GenFrame {
  /** Structural shape of a scheduler instance returned by {@link GenFrame.make}. */
  export type Shape = GenFrameSchedulerShape;
  /** Configuration accepted by {@link GenFrame.make}. */
  export type Config = GenFrameConfig;
  /** Alias for {@link UIFrame}. */
  export type Frame = UIFrame;
}
