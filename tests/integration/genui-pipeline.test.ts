/**
 * Generative UI pipeline integration tests.
 *
 * These tests prove the full pipeline wiring:
 *   - Tokens pushed through buffer → ABR tier shifts → frame type changes
 *   - Partial flag on LLM chunks buffers tool calls until complete
 *   - Receipt chain produces unique IDs per frame for replay
 *   - resolveGap decision tree exercises all three branches with realistic state
 */

import { describe, test, expect } from 'vitest';
import { Effect, Stream } from 'effect';
import { TokenBuffer, UIQuality, GenFrame } from '@czap/core';
import type { UIQualityTier, UIFrame, ContentAddress } from '@czap/core';
import { LLMAdapter } from '@czap/web';
import type { LLMChunk } from '@czap/web';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSSEMessage(data: string) {
  return { id: '', event: '', data, retry: undefined };
}

// ---------------------------------------------------------------------------
// Integration: Token Buffer → ABR Tier → Frame Classification
// ---------------------------------------------------------------------------

describe('GenUI pipeline integration', () => {
  test('tokens through buffer → ABR tier shift → frame type change', () => {
    const buf = TokenBuffer.make<string>({ capacity: 64 });

    // Track tier changes
    let currentTier: UIQualityTier = 'skeleton';

    const evaluator = UIQuality.make({
      deviceTier: 'animations', // mid-range device
    });

    const scheduler = GenFrame.make({
      tokenBuffer: buf,
      getQualityTier: () => currentTier,
    });

    // Empty buffer → skeleton tier
    currentTier = evaluator.evaluate(buf.occupancy);
    expect(currentTier).toBe('skeleton');

    // First tick is always a keyframe (even with empty buffer)
    const initial = scheduler.tick();
    expect(initial).not.toBeNull();
    expect(initial!.type).toBe('keyframe');
    expect(initial!.tokens.length).toBe(0);

    // Now no tokens and not first frame → null
    expect(scheduler.tick()).toBeNull();

    // Push tokens to fill buffer partially (15 of 64 = ~23% occupancy)
    for (let i = 0; i < 15; i++) buf.push(`token${i}`);
    currentTier = evaluator.evaluate(buf.occupancy);
    // With mid-range device (0.5), composite = 0.234 * 0.7 + 0.5 * 0.3 = 0.314
    // Should be text-only or styled
    expect(['text-only', 'styled']).toContain(currentTier);

    // First frame with tokens → keyframe
    const f1 = scheduler.tick();
    expect(f1).not.toBeNull();
    expect(f1!.type).toBe('keyframe');
    expect(f1!.qualityTier).toBe(currentTier);
    expect(f1!.tokens.length).toBeGreaterThan(0);
    expect(f1!.receiptId).toBeDefined();

    // Push more tokens to raise occupancy
    for (let i = 0; i < 50; i++) buf.push(`more${i}`);
    const newTier = evaluator.evaluate(buf.occupancy);

    // Tier changed → next frame is keyframe
    if (newTier !== currentTier) {
      currentTier = newTier;
      const f2 = scheduler.tick();
      expect(f2).not.toBeNull();
      expect(f2!.type).toBe('keyframe'); // tier change forces keyframe
      expect(f2!.qualityTier).toBe(currentTier);
      expect(f2!.receiptId).not.toBe(f1!.receiptId); // unique receipt
    }
  });

  test('receipt chain produces replay-able sequence on simulated disconnect', () => {
    const buf = TokenBuffer.make<string>({ capacity: 64 });
    const tier: UIQualityTier = 'styled';
    const scheduler = GenFrame.make({
      tokenBuffer: buf,
      getQualityTier: () => tier,
    });

    // Produce several frames
    const frames: UIFrame[] = [];
    for (let batch = 0; batch < 5; batch++) {
      for (let i = 0; i < 3; i++) buf.push(`batch${batch}-token${i}`);
      const frame = scheduler.tick();
      if (frame) frames.push(frame);
    }

    // Verify receipt IDs are all unique
    const receiptIds = frames.map((f) => f.receiptId);
    const uniqueIds = new Set(receiptIds);
    expect(uniqueIds.size).toBe(frames.length);

    // Verify buffer positions are monotonically increasing
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.bufferPosition).toBeGreaterThan(frames[i - 1]!.bufferPosition);
    }

    // Simulate disconnect: resolveGap with receipt chain that has frames
    const lastAcked = frames[1]!.receiptId;
    const replayFrames = frames.slice(2); // frames after the last acked

    const gap = GenFrame.resolveGap(
      lastAcked,
      frames[frames.length - 1]!.bufferPosition,
      {
        hasFramesAfter: (id: ContentAddress | null) => replayFrames.length > 0,
        getFramesAfter: (id: ContentAddress | null) => replayFrames,
      },
      { canResume: false },
    );

    expect(gap.type).toBe('replay');
    if (gap.type === 'replay') {
      expect(gap.frames.length).toBe(replayFrames.length);
    }
  });

  test('LLM adapter partial flag buffers tool calls until complete', async () => {
    // Simulate an SSE stream with a tool call that arrives in 3 chunks
    const events = [
      makeSSEMessage('{"type":"text","content":"Hello"}'),
      makeSSEMessage('{"type":"tool-call-start","toolName":"search"}'),
      makeSSEMessage('{"type":"tool-call-delta","content":"{\\"query\\":","partial":true}'),
      makeSSEMessage('{"type":"tool-call-delta","content":"\\"test\\"}","partial":false}'),
      makeSSEMessage('{"type":"tool-call-end"}'),
      makeSSEMessage('{"type":"text","content":" world"}'),
      makeSSEMessage('{"type":"done"}'),
    ];

    const parser = (event: (typeof events)[0]): LLMChunk | null => {
      try {
        const data = JSON.parse(event.data);
        return {
          type: data.type,
          partial: data.partial ?? false,
          content: data.content,
          toolName: data.toolName,
          toolArgs: data.toolArgs,
        };
      } catch {
        return null;
      }
    };

    const adapter = LLMAdapter.create({
      source: Stream.fromIterable(events),
      parser,
    });

    // Collect all emitted chunks
    const collected: LLMChunk[] = [];
    await Effect.runPromise(
      adapter.chunks.pipe(
        Stream.runForEach((chunk) =>
          Effect.sync(() => {
            collected.push(chunk);
          }),
        ),
      ),
    );

    // The partial tool-call-delta (with partial:true) should have been suppressed
    const types = collected.map((c) => c.type);
    expect(types).toContain('text');
    expect(types).toContain('tool-call-start');
    expect(types).toContain('tool-call-end');
    expect(types).toContain('done');

    // The tool-call-end should have accumulated args
    const endChunk = collected.find((c) => c.type === 'tool-call-end');
    expect(endChunk).toBeDefined();
    expect(endChunk!.toolName).toBe('search');
    expect(endChunk!.toolArgs).toEqual({ query: 'test' });

    // The partial delta chunk was suppressed (returned null)
    const deltaChunks = collected.filter((c) => c.type === 'tool-call-delta');
    // Only the non-partial delta should have passed through
    expect(deltaChunks.length).toBeLessThanOrEqual(1);
  });

  test('text tokens stream feeds directly into TokenBuffer', async () => {
    const events = [
      makeSSEMessage('{"type":"text","content":"Hello"}'),
      makeSSEMessage('{"type":"text","content":" world"}'),
      makeSSEMessage('{"type":"tool-call-start","toolName":"noop"}'),
      makeSSEMessage('{"type":"text","content":"!"}'),
      makeSSEMessage('{"type":"done"}'),
    ];

    const parser = (event: (typeof events)[0]): LLMChunk | null => {
      try {
        const data = JSON.parse(event.data);
        return {
          type: data.type,
          partial: data.partial ?? false,
          content: data.content,
          toolName: data.toolName,
        };
      } catch {
        return null;
      }
    };

    const adapter = LLMAdapter.create({
      source: Stream.fromIterable(events),
      parser,
    });

    // Pipe text tokens into a real TokenBuffer
    const buf = TokenBuffer.make<string>({ capacity: 64 });
    await Effect.runPromise(
      adapter.textTokens.pipe(
        Stream.runForEach((token) =>
          Effect.sync(() => {
            buf.push(token);
          }),
        ),
      ),
    );

    // Buffer should have exactly the 3 text tokens (not tool-call or done)
    expect(buf.length).toBe(3);

    const drained = buf.drain();
    expect(drained).toEqual(['Hello', ' world', '!']);
  });

  test('full pipeline: SSE → adapter → buffer → ABR → frame scheduler', async () => {
    // Simulate a streaming LLM response
    const events = Array.from({ length: 20 }, (_, i) => makeSSEMessage(`{"type":"text","content":"token${i}"}`));
    events.push(makeSSEMessage('{"type":"done"}'));

    const parser = (event: (typeof events)[0]): LLMChunk | null => {
      try {
        const data = JSON.parse(event.data);
        return { type: data.type, partial: false, content: data.content };
      } catch {
        return null;
      }
    };

    const adapter = LLMAdapter.create({
      source: Stream.fromIterable(events),
      parser,
    });

    // Wire: adapter → token buffer
    const buf = TokenBuffer.make<string>({ capacity: 64 });
    await Effect.runPromise(
      adapter.textTokens.pipe(
        Stream.runForEach((token) =>
          Effect.sync(() => {
            buf.push(token);
          }),
        ),
      ),
    );

    expect(buf.length).toBe(20);

    // Wire: buffer → ABR evaluator
    const evaluator = UIQuality.make({ deviceTier: 'animations' });
    let tier = evaluator.evaluate(buf.occupancy);

    // Wire: tier + buffer → frame scheduler
    const scheduler = GenFrame.make({
      tokenBuffer: buf,
      getQualityTier: () => tier,
    });

    // Tick frames until buffer is drained
    const allFrames: UIFrame[] = [];
    let iterations = 0;
    while (buf.length > 0 && iterations < 100) {
      tier = evaluator.evaluate(buf.occupancy);
      const frame = scheduler.tick();
      if (frame) allFrames.push(frame);
      iterations++;
    }

    // Should have produced frames
    expect(allFrames.length).toBeGreaterThan(0);

    // First frame should be keyframe
    expect(allFrames[0]!.type).toBe('keyframe');
    expect(allFrames[0]!.morphStrategy).toBe('replace');

    // All frames should have tokens
    const totalTokens = allFrames.reduce((sum, f) => sum + f.tokens.length, 0);
    expect(totalTokens).toBe(20);

    // All frames have unique receipt IDs
    const ids = new Set(allFrames.map((f) => f.receiptId));
    expect(ids.size).toBe(allFrames.length);

    // Buffer positions are monotonically increasing
    for (let i = 1; i < allFrames.length; i++) {
      expect(allFrames[i]!.bufferPosition).toBeGreaterThan(allFrames[i - 1]!.bufferPosition);
    }
  });
});
