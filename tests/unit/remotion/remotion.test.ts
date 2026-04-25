// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Effect } from 'effect';
import { Compositor, VideoRenderer } from '@czap/core';
import type { CompositeState, VideoFrameOutput } from '@czap/core';
import { Internals } from 'remotion';
import {
  Provider,
  cssVarsFromState,
  precomputeFrames,
  stateAtFrame,
  useCompositeState,
  useCzapState,
} from '@czap/remotion';

function withRemotionFrame(frame: number, child: React.ReactElement): React.ReactElement {
  (window as Window & { remotion_initialFrame?: number }).remotion_initialFrame = frame;
  return React.createElement(
    Internals.CanUseRemotionHooks.Provider,
    { value: true },
    React.createElement(Internals.TimelineContext.Provider, { value: { frame: {} } }, child),
  );
}

function makeFrames(count: number): VideoFrameOutput[] {
  return Array.from({ length: count }, (_, i) => ({
    frame: i,
    timestamp: (i * 1000) / 30,
    progress: count > 1 ? i / (count - 1) : 1,
    state: {
      discrete: { index: String(i) },
      blend: {},
      outputs: {
        css: { '--czap-index': i },
        glsl: { u_index: i },
        aria: { 'data-czap-index': String(i) },
      },
    },
  }));
}

describe('@czap/remotion cssVarsFromState', () => {
  test('converts css outputs to string values', () => {
    const state: CompositeState = {
      discrete: {},
      blend: {},
      outputs: {
        css: { '--czap-size': 16, '--czap-theme': 'dark' },
        glsl: {},
        aria: {},
      },
    };

    expect(cssVarsFromState(state)).toEqual({
      '--czap-size': '16',
      '--czap-theme': 'dark',
    });
  });
});

describe('@czap/remotion stateAtFrame', () => {
  test('clamps frame lookups to the available range', () => {
    const frames = makeFrames(3);
    expect(stateAtFrame(frames, -1).discrete['index']).toBe('0');
    expect(stateAtFrame(frames, 1).discrete['index']).toBe('1');
    expect(stateAtFrame(frames, 99).discrete['index']).toBe('2');
  });

  test('returns the empty state for empty frame arrays', () => {
    expect(stateAtFrame([], 5)).toEqual({
      discrete: {},
      blend: {},
      outputs: { css: {}, glsl: {}, aria: {} },
    });
  });
});

describe('@czap/remotion hooks', () => {
  test('useCompositeState reads the mocked current frame', () => {
    const frames = makeFrames(4);
    let observed: CompositeState | null = null;

    function Probe(): React.JSX.Element {
      observed = useCompositeState(frames);
      return React.createElement('div');
    }

    renderToStaticMarkup(withRemotionFrame(2, React.createElement(Probe)));
    expect(observed?.discrete['index']).toBe('2');
  });

  test('useCzapState reads frames from Provider context', () => {
    const frames = makeFrames(3);
    let observed: CompositeState | null = null;

    function Probe(): React.JSX.Element {
      observed = useCzapState();
      return React.createElement('div');
    }

    renderToStaticMarkup(withRemotionFrame(1, React.createElement(Provider, { frames, children: React.createElement(Probe) })));
    expect(observed?.discrete['index']).toBe('1');
  });

  test('useCzapState falls back to the empty state when no frames exist', () => {
    let observed: CompositeState | null = null;

    function Probe(): React.JSX.Element {
      observed = useCzapState();
      return React.createElement('div');
    }

    renderToStaticMarkup(withRemotionFrame(0, React.createElement(Provider, { frames: [], children: React.createElement(Probe) })));
    expect(observed).toEqual({
      discrete: {},
      blend: {},
      outputs: { css: {}, glsl: {}, aria: {} },
    });
  });
});

describe('@czap/remotion precomputeFrames', () => {
  test('collects frames from a renderer', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 10, width: 640, height: 480, durationMs: 500 }, compositor);

    const frames = await precomputeFrames(renderer);
    expect(frames).toHaveLength(5);
    expect(frames[0]?.frame).toBe(0);
    expect(frames[4]?.frame).toBe(4);
  });

  test('returns an empty array for zero-duration renders', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 30, width: 640, height: 480, durationMs: 0 }, compositor);

    await expect(precomputeFrames(renderer)).resolves.toEqual([]);
  });
});
