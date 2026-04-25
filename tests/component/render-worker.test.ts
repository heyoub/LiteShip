/**
 * Component test: RenderWorker off-thread renderer.
 *
 * Covers worker bootstrap, canvas transfer, message forwarding,
 * subscriptions, and cleanup behavior.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Boundary, Diagnostics } from '@czap/core';
import { RenderWorker } from '@czap/worker';
import { MockWorker } from '../helpers/mock-worker.js';

// ---------------------------------------------------------------------------
// Extracted evaluateThresholds -- mirrors the inline worker script exactly.
// Kept in sync so regression tests catch semantic drift vs Boundary.evaluate.
// ---------------------------------------------------------------------------
function evaluateThresholds(thresholds: number[], states: string[], value: number): string {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value >= thresholds[i]!) {
      return states[i] || states[0] || '';
    }
  }
  return states[0] || '';
}

let restoreWorker: () => void;
let diagnosticEvents: Diagnostics.Event[] = [];

beforeEach(() => {
  restoreWorker = MockWorker.install();
  const { sink, events } = Diagnostics.createBufferSink();
  Diagnostics.setSink(sink);
  diagnosticEvents = events;

  if (typeof globalThis.Blob === 'undefined') {
    (globalThis as { Blob?: unknown }).Blob = class MockBlob {
      constructor(
        public parts: unknown[],
        public options?: unknown,
      ) {}
    };
  }

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  Diagnostics.reset();
  restoreWorker();
  vi.restoreAllMocks();
});

describe('RenderWorker', () => {
  test('creates a worker and sends the init message', () => {
    const renderWorker = RenderWorker.create();
    const worker = MockWorker.instances[0]!;

    expect(renderWorker.worker).toBe(worker as never);
    expect(worker.postedMessages[0]?.data).toEqual({ type: 'init' });
  });

  test('transfers canvases through postMessage transfer lists', () => {
    const renderWorker = RenderWorker.create();
    const worker = MockWorker.instances[0]!;
    const canvas = { width: 640, height: 480 } as OffscreenCanvas;

    renderWorker.transferCanvas(canvas);

    expect(worker.postedMessages.at(-1)).toEqual({
      data: { type: 'transfer-canvas', canvas },
      transfer: [canvas],
    });
  });

  test('forwards render lifecycle messages', () => {
    const renderWorker = RenderWorker.create();
    const worker = MockWorker.instances[0]!;

    renderWorker.startRender({
      fps: 30,
      durationMs: 1000 as never,
      width: 640,
      height: 480,
    });
    renderWorker.stopRender();

    expect(worker.postedMessages.some((entry) => (entry.data as { type: string }).type === 'start-render')).toBe(true);
    expect(worker.postedMessages.some((entry) => (entry.data as { type: string }).type === 'stop-render')).toBe(true);
  });

  test('notifies frame and completion listeners and supports unsubscribe', () => {
    const renderWorker = RenderWorker.create();
    const worker = MockWorker.instances[0]!;
    const frames: number[] = [];
    const completions: number[] = [];

    const stopFrame = renderWorker.onFrame((frame) => {
      frames.push(frame.frame);
    });
    const stopComplete = renderWorker.onComplete((count) => {
      completions.push(count);
    });

    worker.simulateMessage({
      type: 'frame',
      output: {
        frame: 2,
        timestamp: 66.6,
        progress: 0.5,
        state: { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } },
      },
    });
    worker.simulateMessage({ type: 'render-complete', totalFrames: 10 });

    stopFrame();
    stopComplete();

    worker.simulateMessage({
      type: 'frame',
      output: {
        frame: 3,
        timestamp: 100,
        progress: 0.75,
        state: { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } },
      },
    });
    worker.simulateMessage({ type: 'render-complete', totalFrames: 11 });

    expect(frames).toEqual([2]);
    expect(completions).toEqual([10]);
  });

  test('routes worker and message errors through diagnostics and disposes cleanly', () => {
    const renderWorker = RenderWorker.create();
    const worker = MockWorker.instances[0]!;

    worker.simulateMessage({ type: 'error', message: 'render failed' });
    worker.simulateError('boom');

    renderWorker.dispose();

    expect(diagnosticEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          source: 'czap/worker.render-worker',
          code: 'worker-message-error',
          message: 'Render worker reported an error.',
          detail: 'render failed',
        }),
        expect.objectContaining({
          level: 'error',
          source: 'czap/worker.render-worker',
          code: 'worker-unhandled-error',
          message: 'Render worker raised an unhandled error.',
          detail: 'boom',
        }),
      ]),
    );
    expect(worker.postedMessages.some((entry) => (entry.data as { type: string }).type === 'dispose')).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  test('ignores malformed worker messages that do not carry a string type', () => {
    const renderWorker = RenderWorker.create();
    const worker = MockWorker.instances[0]!;
    const frameSpy = vi.fn();
    const doneSpy = vi.fn();

    renderWorker.onFrame(frameSpy);
    renderWorker.onComplete(doneSpy);

    worker.simulateMessage(null);
    worker.simulateMessage({ type: 42 });

    expect(frameSpy).not.toHaveBeenCalled();
    expect(doneSpy).not.toHaveBeenCalled();
    expect(diagnosticEvents).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Regression: evaluateThresholds must agree with Boundary.evaluate
// ---------------------------------------------------------------------------

describe('evaluateThresholds (render-worker inline logic)', () => {
  test('value 800 with thresholds [0, 768, 1024] returns states[1] ("tablet"), not states[2]', () => {
    const thresholds = [0, 768, 1024];
    const states = ['mobile', 'tablet', 'desktop'];

    const result = evaluateThresholds(thresholds, states, 800);
    expect(result).toBe('tablet');
  });

  test('agrees with Boundary.evaluate across a range of values', () => {
    const bp = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'] as const,
        [768, 'tablet'] as const,
        [1024, 'desktop'] as const,
      ],
    });

    const thresholds = [0, 768, 1024];
    const states = ['mobile', 'tablet', 'desktop'];

    for (const value of [0, 1, 400, 767, 768, 769, 800, 1023, 1024, 1025, 2000]) {
      const canonical = Boundary.evaluate(bp, value);
      const renderWorker = evaluateThresholds(thresholds, states, value);
      expect(renderWorker, `value=${value}`).toBe(canonical);
    }
  });

  test('returns first state when value is below all thresholds', () => {
    const result = evaluateThresholds([100, 200], ['a', 'b'], 50);
    expect(result).toBe('a');
  });

  test('returns last state when value exceeds all thresholds', () => {
    const result = evaluateThresholds([0, 100], ['a', 'b'], 999);
    expect(result).toBe('b');
  });
});
