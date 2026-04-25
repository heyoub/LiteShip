/**
 * Remotion Root -- registers the CzapDemo composition.
 *
 * Precomputes all frames at composition-load time via calculateMetadata,
 * then wraps CzapDemo in the czap Provider so useCzapState() works.
 *
 * @module
 */

import { Composition } from 'remotion';
import { Provider } from '@czap/remotion';
import type { VideoFrameOutput } from '@czap/core';
import { CzapDemo } from './CzapDemo';
import { buildFrames, FPS, DURATION_MS, WIDTH, HEIGHT } from './setup';

interface CzapDemoProps {
  readonly frames: ReadonlyArray<VideoFrameOutput>;
}

function CzapDemoWithProvider({ frames }: CzapDemoProps) {
  return (
    <Provider frames={frames}>
      <CzapDemo />
    </Provider>
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="CzapDemo"
      component={CzapDemoWithProvider}
      durationInFrames={Math.ceil((DURATION_MS / 1000) * FPS)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ frames: [] as ReadonlyArray<VideoFrameOutput> }}
      calculateMetadata={async () => {
        const frames = await buildFrames();
        return {
          props: { frames },
          durationInFrames: frames.length || Math.ceil((DURATION_MS / 1000) * FPS),
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
        };
      }}
    />
  );
}
