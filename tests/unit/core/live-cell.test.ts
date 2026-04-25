/**
 * LiveCell -- protocol envelope, crossings, kind, _tag, content addressing.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Stream, Fiber } from 'effect';
import { LiveCell, HLC, StateName, Boundary } from '@czap/core';
import type { CellKind } from '@czap/core';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

// ---------------------------------------------------------------------------
// Construction and _tag
// ---------------------------------------------------------------------------

describe('LiveCell', () => {
  test('_tag is LiveCell', async () => {
    const cell = await runScoped(LiveCell.make('state', 0));
    expect(cell._tag).toBe('LiveCell');
  });

  test('kind matches constructor argument', async () => {
    const cell = await runScoped(LiveCell.make('boundary', 'test'));
    expect(cell.kind).toBe('boundary');
  });

  test('accepts all valid CellKind values', async () => {
    const kinds: CellKind[] = [
      'boundary',
      'state',
      'output',
      'signal',
      'transition',
      'timeline',
      'compositor',
      'blend',
      'css',
      'glsl',
      'wgsl',
      'aria',
      'ai',
    ];
    for (const kind of kinds) {
      const cell = await runScoped(LiveCell.make(kind, null));
      expect(cell.kind).toBe(kind);
    }
  });

  // ---------------------------------------------------------------------------
  // get / set / update (inherited from Cell)
  // ---------------------------------------------------------------------------

  test('get returns initial value', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 42);
        return yield* cell.get;
      }),
    );
    expect(value).toBe(42);
  });

  test('set updates value', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 'hello');
        yield* cell.set('world');
        return yield* cell.get;
      }),
    );
    expect(value).toBe('world');
  });

  test('update transforms value', async () => {
    const value = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 10);
        yield* cell.update((n) => n * 2);
        return yield* cell.get;
      }),
    );
    expect(value).toBe(20);
  });

  test('update also advances envelope metadata and content address', async () => {
    const [before, after] = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', { count: 1 });
        const initial = yield* cell.envelope;
        yield* cell.update((current) => ({ count: current.count + 1 }));
        yield* Effect.sleep('10 millis');
        const updated = yield* cell.envelope;
        return [initial, updated] as const;
      }),
    );

    expect(after.value).toEqual({ count: 2 });
    expect(after.meta.version).toBe(before.meta.version + 1);
    expect(after.id).not.toBe(before.id);
  });

  // ---------------------------------------------------------------------------
  // Envelope
  // ---------------------------------------------------------------------------

  test('envelope has correct shape', async () => {
    const env = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('signal', { x: 1 });
        return yield* cell.envelope;
      }),
    );
    expect(env.kind).toBe('signal');
    expect(env.value).toEqual({ x: 1 });
    expect(env.meta.version).toBe(1);
    expect(env.meta.created).toBeDefined();
    expect(env.meta.updated).toBeDefined();
    expect(env.id).toMatch(/^sha256:/);
  });

  test('envelope version increments on set', async () => {
    const [v1, v2] = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 'a');
        const e1 = yield* cell.envelope;
        yield* cell.set('b');
        // Let the forked stream process the update
        yield* Effect.sleep('10 millis');
        const e2 = yield* cell.envelope;
        return [e1.meta.version, e2.meta.version] as const;
      }),
    );
    expect(v1).toBe(1);
    expect(v2).toBe(2);
  });

  test('envelope content address changes with value', async () => {
    const [id1, id2] = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 'first');
        const e1 = yield* cell.envelope;
        yield* cell.set('second');
        yield* Effect.sleep('10 millis');
        const e2 = yield* cell.envelope;
        return [e1.id, e2.id] as const;
      }),
    );
    expect(id1).not.toBe(id2);
  });

  test('envelope updated HLC advances on mutation', async () => {
    const [created, updated] = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 0);
        const e1 = yield* cell.envelope;
        yield* cell.set(1);
        yield* Effect.sleep('10 millis');
        const e2 = yield* cell.envelope;
        return [e1.meta.created, e2.meta.updated] as const;
      }),
    );
    expect(HLC.compare(created, updated)).toBeLessThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // Crossings
  // ---------------------------------------------------------------------------

  test('publishCrossing emits on crossings stream', async () => {
    const crossing = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('boundary', 0);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 1)));
        yield* Effect.sleep('1 millis');
        yield* cell.publishCrossing({
          from: StateName('mobile'),
          to: StateName('desktop'),
          timestamp: HLC.create('test'),
          value: 1024,
        });
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk)[0]!;
      }),
    );
    expect(crossing.from).toBe('mobile');
    expect(crossing.to).toBe('desktop');
    expect(crossing.value).toBe(1024);
  });

  test('multiple crossings arrive in order', async () => {
    const crossings = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('boundary', 0);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 3)));
        yield* Effect.sleep('1 millis');
        const mkCrossing = (from: string, to: string, val: number) => ({
          from: StateName(from),
          to: StateName(to),
          timestamp: HLC.create('test'),
          value: val,
        });
        yield* cell.publishCrossing(mkCrossing('a', 'b', 1));
        yield* cell.publishCrossing(mkCrossing('b', 'c', 2));
        yield* cell.publishCrossing(mkCrossing('c', 'd', 3));
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk);
      }),
    );
    expect(crossings).toHaveLength(3);
    expect(crossings.map((c) => c.value)).toEqual([1, 2, 3]);
  });

  test('boundary live cells expose envelope metadata and support manual crossing publication', async () => {
    const [envelope, crossing] = await runScoped(
      Effect.gen(function* () {
        const boundary = Boundary.make({
          input: 'viewport.width',
          at: [
            [0, 'mobile'],
            [768, 'desktop'],
          ] as const,
        });
        const cell = yield* LiveCell.makeBoundary(boundary, 320);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 1)));
        yield* Effect.sleep('1 millis');
        yield* cell.publishCrossing({
          from: StateName('mobile'),
          to: StateName('desktop'),
          timestamp: HLC.create('boundary-test'),
          value: 1024,
        });
        const events = Array.from(yield* Fiber.join(fiber));
        const currentEnvelope = yield* cell.envelope;
        return [currentEnvelope, events[0]!] as const;
      }),
    );

    expect(envelope.kind).toBe('boundary');
    expect(envelope.value).toBe(320);
    expect(envelope.meta.version).toBe(1);
    expect(crossing.to).toBe('desktop');
    expect(crossing.value).toBe(1024);
  });

  // ---------------------------------------------------------------------------
  // Changes stream
  // ---------------------------------------------------------------------------

  test('changes stream emits on mutations', async () => {
    // SubscriptionRef.changes emits current value first, then updates
    const values = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.make('state', 0);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.changes, 3)));
        yield* Effect.sleep('1 millis');
        yield* cell.set(10);
        yield* cell.set(20);
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk);
      }),
    );
    expect(values).toEqual([0, 10, 20]);
  });

  // ---------------------------------------------------------------------------
  // Content address determinism
  // ---------------------------------------------------------------------------

  test('same kind + value produces same content address', async () => {
    const [id1, id2] = await runScoped(
      Effect.gen(function* () {
        const cell1 = yield* LiveCell.make('state', { x: 1 });
        const cell2 = yield* LiveCell.make('state', { x: 1 });
        const e1 = yield* cell1.envelope;
        const e2 = yield* cell2.envelope;
        return [e1.id, e2.id] as const;
      }),
    );
    expect(id1).toBe(id2);
  });

  test('different kind with same value produces different content address', async () => {
    const [id1, id2] = await runScoped(
      Effect.gen(function* () {
        const cell1 = yield* LiveCell.make('state', { x: 1 });
        const cell2 = yield* LiveCell.make('signal', { x: 1 });
        const e1 = yield* cell1.envelope;
        const e2 = yield* cell2.envelope;
        return [e1.id, e2.id] as const;
      }),
    );
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// LiveCell.makeBoundary -- automatic crossing on state transition
// ---------------------------------------------------------------------------

describe('LiveCell.makeBoundary', () => {
  const viewport = Boundary.make({
    input: 'viewport.width',
    at: [
      [0, 'mobile'],
      [768, 'tablet'],
      [1024, 'desktop'],
    ] as const,
  });

  test('_tag is LiveCell and kind is boundary', async () => {
    const cell = await runScoped(LiveCell.makeBoundary(viewport, 400));
    expect(cell._tag).toBe('LiveCell');
    expect(cell.kind).toBe('boundary');
  });

  test('auto-publishes crossing when value crosses threshold', async () => {
    const crossing = await runScoped(
      Effect.gen(function* () {
        // Start in mobile (400 < 768)
        const cell = yield* LiveCell.makeBoundary(viewport, 400);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 1)));
        yield* Effect.sleep('1 millis');
        // Cross into desktop (1200 >= 1024)
        yield* cell.set(1200);
        yield* Effect.sleep('10 millis');
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk)[0]!;
      }),
    );
    expect(crossing.from).toBe('mobile');
    expect(crossing.to).toBe('desktop');
    expect(crossing.value).toBe(1200);
  });

  test('does not publish crossing when state stays the same', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        // Start in mobile (400 < 768)
        const cell = yield* LiveCell.makeBoundary(viewport, 400);
        const collected: string[] = [];
        const fiber = yield* Effect.forkScoped(
          Stream.runForEach(cell.crossings, (c) =>
            Effect.sync(() => {
              collected.push(`${c.from}->${c.to}`);
            }),
          ),
        );
        yield* Effect.sleep('1 millis');
        // Stay in mobile (500 < 768)
        yield* cell.set(500);
        yield* Effect.sleep('10 millis');
        // Still mobile (600 < 768)
        yield* cell.set(600);
        yield* Effect.sleep('10 millis');
        yield* Fiber.interrupt(fiber);
        return collected;
      }),
    );
    expect(result).toEqual([]);
  });

  test('boundary update publishes crossings through the update path too', async () => {
    const crossing = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.makeBoundary(viewport, 400);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 1)));
        yield* Effect.sleep('1 millis');
        yield* cell.update(() => 900);
        yield* Effect.sleep('10 millis');
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk)[0]!;
      }),
    );

    expect(crossing.from).toBe('mobile');
    expect(crossing.to).toBe('tablet');
    expect(crossing.value).toBe(900);
  });

  test('publishes multiple crossings for sequential transitions', async () => {
    const crossings = await runScoped(
      Effect.gen(function* () {
        // Start in mobile (300 < 768)
        const cell = yield* LiveCell.makeBoundary(viewport, 300);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 2)));
        yield* Effect.sleep('1 millis');
        // Cross to tablet (800 >= 768, < 1024)
        yield* cell.set(800);
        yield* Effect.sleep('10 millis');
        // Cross to desktop (1100 >= 1024)
        yield* cell.set(1100);
        yield* Effect.sleep('10 millis');
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk);
      }),
    );
    expect(crossings).toHaveLength(2);
    expect(crossings[0]!.from).toBe('mobile');
    expect(crossings[0]!.to).toBe('tablet');
    expect(crossings[1]!.from).toBe('tablet');
    expect(crossings[1]!.to).toBe('desktop');
  });

  test('crossing includes HLC timestamp', async () => {
    const crossing = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.makeBoundary(viewport, 400);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 1)));
        yield* Effect.sleep('1 millis');
        yield* cell.set(1200);
        yield* Effect.sleep('10 millis');
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk)[0]!;
      }),
    );
    expect(crossing.timestamp).toBeDefined();
    expect(crossing.timestamp.node_id).toBe('live-cell-boundary');
  });

  test('crossing works in reverse direction (desktop -> mobile)', async () => {
    const crossing = await runScoped(
      Effect.gen(function* () {
        // Start in desktop (1200 >= 1024)
        const cell = yield* LiveCell.makeBoundary(viewport, 1200);
        const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(cell.crossings, 1)));
        yield* Effect.sleep('1 millis');
        // Cross down to mobile (300 < 768)
        yield* cell.set(300);
        yield* Effect.sleep('10 millis');
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk)[0]!;
      }),
    );
    expect(crossing.from).toBe('desktop');
    expect(crossing.to).toBe('mobile');
    expect(crossing.value).toBe(300);
  });

  test('envelope still tracks correctly alongside crossings', async () => {
    const [v1, v2] = await runScoped(
      Effect.gen(function* () {
        const cell = yield* LiveCell.makeBoundary(viewport, 400);
        const e1 = yield* cell.envelope;
        yield* cell.set(1200);
        yield* Effect.sleep('10 millis');
        const e2 = yield* cell.envelope;
        return [e1, e2] as const;
      }),
    );
    expect(v1.value).toBe(400);
    expect(v2.value).toBe(1200);
    expect(v2.meta.version).toBe(2);
    expect(v1.id).not.toBe(v2.id);
  });
});
