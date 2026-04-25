/**
 * @czap/remotion type spine -- React adapter for Remotion video rendering.
 */

import type { CompositeState, VideoFrameOutput, VideoRenderer } from './core';

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. CSS VARS
// ═══════════════════════════════════════════════════════════════════════════════

export declare function cssVarsFromState(state: CompositeState): Record<string, string>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. FRAME LOOKUP
// ═══════════════════════════════════════════════════════════════════════════════

export declare function stateAtFrame(frames: ReadonlyArray<VideoFrameOutput>, frameIndex: number): CompositeState;

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. REMOTION HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export declare function useCompositeState(frames: ReadonlyArray<VideoFrameOutput>): CompositeState;

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. PRECOMPUTE
// ═══════════════════════════════════════════════════════════════════════════════

export declare function precomputeFrames(renderer: VideoRenderer): Promise<ReadonlyArray<VideoFrameOutput>>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 5. CONTEXT PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

export declare function Provider(props: { frames: ReadonlyArray<VideoFrameOutput>; children: unknown }): unknown;

export declare function useCzapState(): CompositeState;
