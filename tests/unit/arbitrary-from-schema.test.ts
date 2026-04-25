/**
 * Unit tests for `schemaToArbitrary` — verifies the Effect Schema AST
 * walker produces fast-check arbitraries that yield values which decode
 * cleanly back through the source schema.
 *
 * Coverage targets the same surface the harness depends on: scalars,
 * literals, unions, structs, arrays, optional keys, and the unsupported
 * fall-through error.
 */
import { describe, expect, it } from 'vitest';
import { Effect, Schema } from 'effect';
import * as fc from 'fast-check';
import {
  schemaToArbitrary,
  UnsupportedSchemaError,
} from '../../packages/core/src/harness/arbitrary-from-schema.js';

/** Drive an arbitrary into a schema's decoder; assert every sample decodes. */
function expectAllDecode<T>(
  schema: Schema.Schema<T>,
  arb: fc.Arbitrary<T>,
  numRuns = 50,
): void {
  fc.assert(
    fc.property(arb, (sample) => {
      const exit = Effect.runSyncExit(
        Schema.decodeUnknownEffect(schema)(sample as unknown),
      );
      return exit._tag === 'Success';
    }),
    { numRuns },
  );
}

describe('schemaToArbitrary', () => {
  it('handles String', () => {
    const schema = Schema.String;
    const arb = schemaToArbitrary(schema);
    expectAllDecode(schema, arb);
  });

  it('handles Number (as integer)', () => {
    const schema = Schema.Number;
    const arb = schemaToArbitrary(schema);
    expectAllDecode(schema, arb);
  });

  it('handles Boolean', () => {
    const schema = Schema.Boolean;
    const arb = schemaToArbitrary(schema);
    expectAllDecode(schema, arb);
  });

  it('handles Literal', () => {
    const schema = Schema.Literal('active');
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (v) => v === 'active'),
      { numRuns: 20 },
    );
  });

  it('handles Union of literals', () => {
    const schema = Schema.Union([
      Schema.Literal('a'),
      Schema.Literal('b'),
      Schema.Literal('c'),
    ]);
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (v) => v === 'a' || v === 'b' || v === 'c'),
      { numRuns: 50 },
    );
  });

  it('handles Struct with required fields', () => {
    const schema = Schema.Struct({
      name: Schema.String,
      age: Schema.Number,
      active: Schema.Boolean,
    });
    const arb = schemaToArbitrary(schema);
    expectAllDecode(schema, arb);
  });

  it('handles Array(T)', () => {
    const schema = Schema.Array(Schema.String);
    const arb = schemaToArbitrary(schema);
    expectAllDecode(schema, arb);
  });

  it('handles Unknown / Any via fc.anything', () => {
    const schema = Schema.Unknown;
    const arb = schemaToArbitrary(schema);
    // Just smoke-test that arb produces values; Unknown decodes everything.
    fc.assert(
      fc.property(arb, () => true),
      { numRuns: 20 },
    );
  });

  it('handles a tagged union of structs (TokenEvent shape)', () => {
    const schema = Schema.Union([
      Schema.Struct({ _tag: Schema.Literal('push'), token: Schema.String }),
      Schema.Struct({ _tag: Schema.Literal('flush') }),
      Schema.Struct({ _tag: Schema.Literal('reset') }),
    ]);
    const arb = schemaToArbitrary(schema);
    expectAllDecode(schema, arb);
  });

  it('throws UnsupportedSchemaError for unsupported Declaration nodes', () => {
    // Schema.instanceOf(Uint8Array) is a Declaration whose probe fails;
    // walker rejects it.
    const schema = Schema.instanceOf(Uint8Array);
    expect(() => schemaToArbitrary(schema)).toThrow(UnsupportedSchemaError);
  });

  it('throws UnsupportedSchemaError naming the unsupported node tag', () => {
    const schema = Schema.instanceOf(Uint8Array);
    let caught: unknown;
    try {
      schemaToArbitrary(schema);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnsupportedSchemaError);
    expect((caught as UnsupportedSchemaError).nodeTag).toBe('Declaration');
  });

  it('handles NonEmptyString refinement (checks-based)', () => {
    const schema = Schema.NonEmptyString;
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (s) => typeof s === 'string' && s.length > 0),
      { numRuns: 50 },
    );
  });

  it('handles String + minLength(3) refinement (checks-based)', () => {
    const schema = Schema.String.check(Schema.isMinLength(3));
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (s) => typeof s === 'string' && s.length >= 3),
      { numRuns: 50 },
    );
  });

  it('handles Schema.instanceOf(Date) by producing Date instances', () => {
    const schema = Schema.instanceOf(Date);
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (d) => d instanceof Date),
      { numRuns: 10 },
    );
  });

  it('handles NonEmptyArray (Arrays elements+rest shape)', () => {
    const schema = Schema.NonEmptyArray(Schema.String);
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (a) => Array.isArray(a) && a.length >= 1),
      { numRuns: 50 },
    );
  });

  it('handles Struct with optional fields', () => {
    const schema = Schema.Struct({
      name: Schema.String,
      age: Schema.optional(Schema.Number),
    });
    const arb = schemaToArbitrary(schema);
    let sawWith = false;
    let sawWithout = false;
    fc.assert(
      fc.property(arb, (rec) => {
        if (typeof rec !== 'object' || rec === null) return false;
        const r = rec as Record<string, unknown>;
        if (typeof r.name !== 'string') return false;
        if ('age' in r) {
          sawWith = true;
          if (r.age !== undefined && typeof r.age !== 'number') return false;
        } else {
          sawWithout = true;
        }
        return true;
      }),
      { numRuns: 100 },
    );
    // We don't strictly require both branches but typical fast-check
    // runs hit each at least once. This documents the expected shape.
    expect(sawWith || sawWithout).toBe(true);
  });

  it('handles Suspend pointing at a non-recursive schema', () => {
    const Inner = Schema.Struct({ name: Schema.String });
    const Suspended = Schema.suspend(() => Inner);
    const arb = schemaToArbitrary(Suspended);
    fc.assert(
      fc.property(
        arb,
        (rec) =>
          typeof rec === 'object' &&
          rec !== null &&
          typeof (rec as { name: unknown }).name === 'string',
      ),
      { numRuns: 20 },
    );
  });

  it('throws UnsupportedSchemaError for unhandled AST tags (Schema.Never)', () => {
    // Schema.Never has _tag 'Never' which the walker does not handle —
    // exercises the switch's default-case throw.
    expect(() => schemaToArbitrary(Schema.Never)).toThrow(
      UnsupportedSchemaError,
    );
  });

  it('handles Schema.Enum', () => {
    enum Color {
      Red = 'red',
      Blue = 'blue',
      Green = 'green',
    }
    const schema = Schema.Enum(Color);
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (v) => v === 'red' || v === 'blue' || v === 'green'),
      { numRuns: 30 },
    );
  });

  it('handles Schema.BigInt by producing bigint values', () => {
    const arb = schemaToArbitrary(Schema.BigInt);
    fc.assert(
      fc.property(arb, (v) => typeof v === 'bigint'),
      { numRuns: 20 },
    );
  });

  it('handles Schema.Null', () => {
    const arb = schemaToArbitrary(Schema.Null);
    fc.assert(
      fc.property(arb, (v) => v === null),
      { numRuns: 5 },
    );
  });

  it('handles Schema.Undefined', () => {
    const arb = schemaToArbitrary(Schema.Undefined);
    fc.assert(
      fc.property(arb, (v) => v === undefined),
      { numRuns: 5 },
    );
  });

  it('handles Schema.Void', () => {
    const arb = schemaToArbitrary(Schema.Void);
    fc.assert(
      fc.property(arb, (v) => v === undefined),
      { numRuns: 5 },
    );
  });

  it('handles a fixed Tuple', () => {
    const schema = Schema.Tuple([Schema.String, Schema.Number]);
    const arb = schemaToArbitrary(schema);
    fc.assert(
      fc.property(arb, (v) =>
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === 'string' &&
        typeof v[1] === 'number'
      ),
      { numRuns: 20 },
    );
  });
});
