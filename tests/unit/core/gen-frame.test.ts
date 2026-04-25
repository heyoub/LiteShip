/**
 * GenFrame -- frame scheduler, type classification, receipt correlation.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { GenFrame, TokenBuffer } from '@czap/core';
import type { UIQualityTier } from '@czap/core';

function makeScheduler(initialTier: UIQualityTier = 'styled') {
  let tier: UIQualityTier = initialTier;
  const buf = TokenBuffer.make<string>({ capacity: 64 });

  const scheduler = GenFrame.make({
    tokenBuffer: buf,
    getQualityTier: () => tier,
  });

  return {
    scheduler,
    buf,
    setTier: (t: UIQualityTier) => {
      tier = t;
    },
  };
}

describe('GenFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('frame scheduling', () => {
    test('first frame is always a keyframe', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('hello');
      const frame = scheduler.tick();
      expect(frame).not.toBeNull();
      expect(frame!.type).toBe('keyframe');
    });

    test('subsequent frames with tokens are delta frames', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      scheduler.tick(); // keyframe

      buf.push('b');
      const frame = scheduler.tick();
      expect(frame).not.toBeNull();
      expect(frame!.type).toBe('delta');
    });

    test('quality tier change forces keyframe', () => {
      const { scheduler, buf, setTier } = makeScheduler('styled');
      buf.push('a');
      scheduler.tick(); // keyframe

      setTier('rich');
      buf.push('b');
      const frame = scheduler.tick();
      expect(frame!.type).toBe('keyframe');
    });

    test('no tokens and not stalled returns null', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      scheduler.tick(); // consume initial

      const frame = scheduler.tick();
      expect(frame).toBeNull();
    });

    test('markKeyframe forces next frame to be keyframe', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      scheduler.tick(); // keyframe

      buf.push('b');
      scheduler.markKeyframe();
      const frame = scheduler.tick();
      expect(frame!.type).toBe('keyframe');
    });
  });

  describe('morph strategy', () => {
    test('keyframe uses replace strategy', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      const frame = scheduler.tick();
      expect(frame!.morphStrategy).toBe('replace');
    });

    test('delta frame uses patch strategy', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      scheduler.tick();

      buf.push('b');
      const frame = scheduler.tick();
      expect(frame!.morphStrategy).toBe('patch');
    });
  });

  describe('token consumption', () => {
    test('drains tokens from buffer', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      buf.push('b');
      buf.push('c');

      const frame = scheduler.tick();
      expect(frame!.tokens).toEqual(['a', 'b', 'c']);
      expect(buf.length).toBe(0);
    });

    test('limits drain to 32 tokens per frame', () => {
      const { scheduler, buf } = makeScheduler();
      for (let i = 0; i < 50; i++) buf.push(`t${i}`);

      const frame = scheduler.tick();
      expect(frame!.tokens.length).toBe(32);
      expect(buf.length).toBe(18);
    });
  });

  describe('receipt correlation', () => {
    test('each frame gets a unique receiptId', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      const f1 = scheduler.tick();

      buf.push('b');
      const f2 = scheduler.tick();

      expect(f1!.receiptId).toBeDefined();
      expect(f2!.receiptId).toBeDefined();
      expect(f1!.receiptId).not.toBe(f2!.receiptId);
    });

    test('bufferPosition tracks cumulative tokens drained', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      buf.push('b');
      const f1 = scheduler.tick();
      expect(f1!.bufferPosition).toBe(2);

      buf.push('c');
      buf.push('d');
      buf.push('e');
      const f2 = scheduler.tick();
      expect(f2!.bufferPosition).toBe(5);
    });
  });

  describe('frameCount', () => {
    test('increments with each tick', () => {
      const { scheduler, buf } = makeScheduler();
      expect(scheduler.frameCount).toBe(0);

      buf.push('a');
      scheduler.tick();
      expect(scheduler.frameCount).toBe(1);

      buf.push('b');
      scheduler.tick();
      expect(scheduler.frameCount).toBe(2);
    });
  });

  describe('lastFrame and reset', () => {
    test('lastFrame reflects the most recently emitted frame', () => {
      const { scheduler, buf } = makeScheduler();
      expect(scheduler.lastFrame).toBeNull();

      buf.push('a');
      const frame = scheduler.tick();

      expect(scheduler.lastFrame).toEqual(frame);
    });

    test('reset clears frame counters and lastFrame', () => {
      const { scheduler, buf } = makeScheduler();
      buf.push('a');
      scheduler.tick();
      expect(scheduler.lastFrame).not.toBeNull();

      scheduler.reset();

      expect(scheduler.frameCount).toBe(0);
      expect(scheduler.lastFrame).toBeNull();
    });
  });

  describe('resolveGap', () => {
    test('returns resume when resumption is possible', () => {
      const result = GenFrame.resolveGap(
        null,
        42,
        { hasFramesAfter: () => false, getFramesAfter: () => [] },
        { canResume: true },
      );
      expect(result.type).toBe('resume');
      if (result.type === 'resume') {
        expect(result.bufferPosition).toBe(42);
      }
    });

    test('returns replay when receipt chain has frames', () => {
      const frames = [
        {
          type: 'keyframe' as const,
          tokens: ['a'],
          qualityTier: 'styled' as const,
          morphStrategy: 'replace' as const,
          timestamp: 0,
          receiptId: 'test' as any,
          bufferPosition: 1,
        },
      ];
      const result = GenFrame.resolveGap(
        null,
        0,
        { hasFramesAfter: () => true, getFramesAfter: () => frames },
        { canResume: false },
      );
      expect(result.type).toBe('replay');
    });

    test('returns re-request as last resort', () => {
      const result = GenFrame.resolveGap(
        null,
        0,
        { hasFramesAfter: () => false, getFramesAfter: () => [] },
        { canResume: false },
      );
      expect(result.type).toBe('re-request');
    });

    test('returns re-request when the receipt chain claims frames but none are available', () => {
      const result = GenFrame.resolveGap(
        null,
        0,
        { hasFramesAfter: () => true, getFramesAfter: () => [] },
        { canResume: false },
      );
      expect(result.type).toBe('re-request');
    });
  });

  test('uses Date.now when performance is unavailable', () => {
    const originalPerformance = globalThis.performance;
    vi.stubGlobal('performance', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(123);

    const { scheduler, buf } = makeScheduler();
    buf.push('a');
    const frame = scheduler.tick();

    expect(frame?.timestamp).toBe(123);
    globalThis.performance = originalPerformance;
  });
});
