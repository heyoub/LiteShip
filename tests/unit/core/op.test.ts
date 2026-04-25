/**
 * Op<A,E,R> -- Effect.Effect wrapper with named factories.
 *
 * Property: succeed then map is equivalent to succeed(f(value)).
 * Property: allSettled never fails (wraps errors in Result).
 * Property: race returns first completed.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Effect, Result } from 'effect';
import { Op, Millis } from '@czap/core';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

describe('Op factories', () => {
  test('succeed creates immediate value', async () => {
    const result = await Effect.runPromise(Op.succeed(42).run());
    expect(result).toBe(42);
  });

  test('fail creates immediate error', async () => {
    const op = Op.fail('boom');
    await expect(Effect.runPromise(op.run())).rejects.toBe('boom');
  });

  test('make wraps an effect', async () => {
    const op = Op.make(Effect.succeed(99));
    const result = await Effect.runPromise(op.run());
    expect(result).toBe(99);
  });

  test('fromPromise wraps resolved promise', async () => {
    const op = Op.fromPromise(() => Promise.resolve(7));
    const result = await Effect.runPromise(op.run());
    expect(result).toBe(7);
  });

  test('fromPromise wraps rejected promise as Error', async () => {
    const op = Op.fromPromise(() => Promise.reject(new Error('fail')));
    await expect(Effect.runPromise(op.run())).rejects.toBeInstanceOf(Error);
  });

  test('fromPromise wraps non-Error rejections into Error instances', async () => {
    const op = Op.fromPromise(() => Promise.reject('fail'));
    await expect(Effect.runPromise(op.run())).rejects.toEqual(new Error('fail'));
  });
});

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

describe('Op.map', () => {
  test('transforms value', async () => {
    const result = await Effect.runPromise(
      Op.succeed(10)
        .map((n) => n * 2)
        .run(),
    );
    expect(result).toBe(20);
  });
});

describe('Op.flatMap', () => {
  test('chains op computations', async () => {
    const result = await Effect.runPromise(
      Op.succeed(10)
        .flatMap((n) => Op.succeed(n + 5))
        .run(),
    );
    expect(result).toBe(15);
  });
});

describe('Op.all', () => {
  test('runs all in parallel', async () => {
    const ops = [Op.succeed(1), Op.succeed(2), Op.succeed(3)] as const;
    const result = await Effect.runPromise(Op.all(ops).run());
    expect(result).toEqual([1, 2, 3]);
  });

  test('fails if any op fails', async () => {
    const ops = [Op.succeed(1), Op.fail('boom'), Op.succeed(3)] as const;
    await expect(Effect.runPromise(Op.all(ops).run())).rejects.toBe('boom');
  });
});

describe('Op.allSettled', () => {
  test('wraps successes and failures in Result', async () => {
    const ops = [Op.succeed(1), Op.fail('err'), Op.succeed(3)] as const;
    const results = await Effect.runPromise(Op.allSettled(ops).run());
    expect(results).toHaveLength(3);
  });

  test('never throws', async () => {
    const ops = [Op.fail('a'), Op.fail('b')] as const;
    const results = await Effect.runPromise(Op.allSettled(ops).run());
    expect(results).toHaveLength(2);
  });

  test('preserves success and failure result tags', async () => {
    const ops = [Op.succeed(1), Op.fail('err')] as const;
    const [ok, fail] = await Effect.runPromise(Op.allSettled(ops).run());

    expect(Result.isSuccess(ok)).toBe(true);
    expect(Result.isFailure(fail)).toBe(true);
  });
});

describe('Op.race', () => {
  test('returns first completed value', async () => {
    const ops = [Op.succeed(1), Op.succeed(2)];
    const result = await Effect.runPromise(Op.race(ops).run());
    expect([1, 2]).toContain(result);
  });

  test('empty array fails', async () => {
    const result = Op.race([]);
    await expect(Effect.runPromise(result.run())).rejects.toBeDefined();
  });

  test('single task returns its value', async () => {
    const result = await Effect.runPromise(Op.race([Op.succeed(42)]).run());
    expect(result).toBe(42);
  });
});

describe('Op.retry', () => {
  test('retries on failure', async () => {
    let attempts = 0;
    const op = Op.make(
      Effect.suspend(() => {
        attempts++;
        if (attempts < 3) return Effect.fail(new Error('not yet'));
        return Effect.succeed('ok');
      }),
    );

    const result = await Effect.runPromise(Op.retry(op, { times: 3, delay: Millis(10) }).run());
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('uses default retry options when delay and factor are omitted', async () => {
    let attempts = 0;
    const op = Op.make(
      Effect.suspend(() => {
        attempts++;
        if (attempts < 2) return Effect.fail(new Error('not yet'));
        return Effect.succeed('ok');
      }),
    );

    const result = await Effect.runPromise(Op.retry(op, { times: 2 }).run());
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});

describe('Op.timeout', () => {
  test('succeeds within time limit', async () => {
    const result = await Effect.runPromise(Op.timeout(Op.succeed(42), Millis(1000)).run());
    expect(result).toBe(42);
  });

  test('fails with a timeout error when the task exceeds the deadline', async () => {
    const slow = Op.fromPromise(
      () =>
        new Promise<number>((resolve) => {
          setTimeout(() => resolve(42), 25);
        }),
    );

    await expect(Effect.runPromise(Op.timeout(slow, Millis(1)).run())).rejects.toEqual(
      new Error('Op timed out after 1ms'),
    );
  });
});

// ---------------------------------------------------------------------------
// Property-based
// ---------------------------------------------------------------------------

describe('Op properties', () => {
  test('succeed(x).map(f) === succeed(f(x))', () => {
    fc.assert(
      fc.asyncProperty(fc.integer(), fc.integer(), async (x, addend) => {
        const f = (n: number) => n + addend;
        const a = await Effect.runPromise(Op.succeed(x).map(f).run());
        const b = await Effect.runPromise(Op.succeed(f(x)).run());
        expect(a).toBe(b);
      }),
    );
  });
});
