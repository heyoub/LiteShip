import { describe, expect, test } from 'vitest';
import type { UIFrame } from '@czap/core';
import {
  createLLMRenderPipeline,
  type LLMRenderHost,
} from '../../../packages/astro/src/runtime/llm-render-pipeline.js';
import { createLLMSessionWithHost } from '../../../packages/astro/src/runtime/llm-session.js';

function createHost() {
  const renderedFrames: UIFrame[] = [];
  const emittedTokens: Array<{ text: string; accumulated: string }> = [];

  const host: LLMRenderHost = {
    renderText: () => true,
    renderFrame(frame) {
      renderedFrames.push(frame);
      return true;
    },
    emitToken(text, accumulated) {
      emittedTokens.push({ text, accumulated });
    },
    emitFrame: () => {},
    emitToolStart: () => {},
    emitToolEnd: () => {},
    emitDone: () => {},
  };

  return { host, renderedFrames, emittedTokens };
}

describe('llm render pipeline', () => {
  test('coalesces multiple queued text chunks into one scheduled flush', async () => {
    const pipeline = createLLMRenderPipeline({
      mode: 'append',
      getDeviceTier: () => 'animations',
    });
    const { host, emittedTokens } = createHost();
    const recordedFrames: UIFrame[] = [];

    pipeline.pushText('alpha');
    pipeline.enqueueFlush(host, (frame) => recordedFrames.push(frame));
    pipeline.pushText('beta');
    pipeline.enqueueFlush(host, (frame) => recordedFrames.push(frame));

    await Promise.resolve();

    expect(emittedTokens).toEqual([{ text: 'alphabeta', accumulated: 'alphabeta' }]);
    expect(recordedFrames.length).toBeGreaterThan(0);
  });

  test('flushes a single queued text chunk without changing the rendered output', () => {
    const pipeline = createLLMRenderPipeline({
      mode: 'append',
      getDeviceTier: () => 'animations',
    });
    const { host, emittedTokens } = createHost();

    pipeline.pushText('solo');
    pipeline.flushPendingText(host, () => {});

    expect(emittedTokens).toEqual([{ text: 'solo', accumulated: 'solo' }]);
  });

  test('exposes accumulated text through the public setter and getter', () => {
    const pipeline = createLLMRenderPipeline({
      mode: 'append',
      getDeviceTier: () => 'animations',
    });

    pipeline.accumulated = 'updated';

    expect(pipeline.accumulated).toBe('updated');
  });

  test('upgrades recordFrame for an already queued flush when later fragments require it', async () => {
    const pipeline = createLLMRenderPipeline({
      mode: 'append',
      getDeviceTier: () => 'animations',
    });
    const { host } = createHost();
    const recordedFrames: UIFrame[] = [];

    pipeline.pushText('first');
    pipeline.enqueueFlush(host, (frame) => recordedFrames.push(frame), false);
    pipeline.pushText('second');
    pipeline.enqueueFlush(host, (frame) => recordedFrames.push(frame), true);

    await Promise.resolve();

    expect(recordedFrames.length).toBeGreaterThan(0);
  });

  test('flushes pending text before handling tool-call deltas', () => {
    const emittedTokens: Array<{ text: string; accumulated: string }> = [];
    const session = createLLMSessionWithHost(
      {
        mode: 'append',
        getDeviceTier: () => 'animations',
      },
      {
        setTarget: () => {},
        renderText: () => true,
        renderFrame: () => true,
        emitToken(text, accumulated) {
          emittedTokens.push({ text, accumulated });
        },
        emitFrame: () => {},
        emitToolStart: () => {},
        emitToolEnd: () => {},
        emitDone: () => {},
      },
    );

    session.beginReconnect();
    session.ingest({ type: 'text', partial: false, content: 'hello ' });
    session.ingest({ type: 'tool-call-delta', partial: true, toolName: 'search', content: '{"q":"czap"}' });

    expect(emittedTokens).toEqual([{ text: 'hello ', accumulated: 'hello ' }]);
  });

  test('drops queued work benignly when disposed before the scheduled flush runs', async () => {
    const pipeline = createLLMRenderPipeline({
      mode: 'append',
      getDeviceTier: () => 'animations',
    });
    const { host, emittedTokens } = createHost();

    pipeline.pushText('ghost');
    pipeline.enqueueFlush(host, () => {});
    pipeline.releaseRuntime();

    await Promise.resolve();

    expect(emittedTokens).toEqual([]);
    expect(pipeline.flushQueued).toBe(false);
    expect(pipeline.queuedTextFragments).toEqual([]);
  });
});
