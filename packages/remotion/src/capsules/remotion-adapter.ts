/**
 * Capsule declaration treating `@czap/remotion` as the first siteAdapter
 * instance. Bridges Remotion's React composition surface to czap's
 * VideoFrameOutput stream. License obligations stay with the downstream
 * user who consumes Remotion — czap provides the adapter shell only.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

const VideoRendererShapeSchema = Schema.Unknown;
const VideoFrameOutputSchema = Schema.Struct({
  frame: Schema.Number,
  timestamp: Schema.Number,
  progress: Schema.Number,
  state: Schema.Unknown,
});

/**
 * Declared capsule for `@czap/remotion`. Registered in the module-level
 * catalog at import time; walked by the factory compiler.
 */
export const remotionAdapterCapsule = defineCapsule({
  _kind: 'siteAdapter',
  name: 'remotion.video-frame-output',
  input: VideoRendererShapeSchema,
  output: Schema.Array(VideoFrameOutputSchema),
  capabilities: { reads: [], writes: [] },
  invariants: [
    {
      name: 'frame-count-matches-totalFrames',
      check: (_i, o) => {
        const frames = o as ReadonlyArray<{ frame: number }>;
        if (!Array.isArray(frames)) return false;
        return frames.every((f, idx) => f.frame === idx);
      },
      message: 'frames must arrive in order with contiguous indices',
    },
  ],
  budgets: { p95Ms: 8 },
  site: ['node', 'browser'],
  attribution: {
    license: 'Remotion-Company-License',
    author: 'Remotion (@remotion-dev)',
    url: 'https://www.remotion.dev/docs/license',
  },
});
