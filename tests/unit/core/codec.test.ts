/**
 * Codec -- Effect Schema codec encode/decode roundtrip and error handling.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { Codec } from '@czap/core';

describe('Codec', () => {
  describe('roundtrip with simple schema', () => {
    const PersonSchema = Schema.Struct({
      name: Schema.String,
      age: Schema.Number,
    });

    const personCodec = Codec.make(PersonSchema);

    test('encode then decode recovers original value', async () => {
      const original = { name: 'Alice', age: 30 };
      const encoded = await Effect.runPromise(personCodec.encode(original));
      const decoded = await Effect.runPromise(personCodec.decode(encoded));
      expect(decoded).toEqual(original);
    });

    test('decode valid input succeeds', async () => {
      const input = { name: 'Bob', age: 25 };
      const decoded = await Effect.runPromise(personCodec.decode(input));
      expect(decoded.name).toBe('Bob');
      expect(decoded.age).toBe(25);
    });
  });

  describe('error handling', () => {
    const StrictSchema = Schema.Struct({
      id: Schema.Number,
      label: Schema.String,
    });

    const strictCodec = Codec.make(StrictSchema);

    test('decode with wrong type returns error effect, not crash', async () => {
      const invalid = { id: 'not-a-number', label: 'test' };
      const result = await Effect.runPromise(
        strictCodec.decode(invalid as any).pipe(
          Effect.matchEffect({
            onSuccess: () => Effect.succeed('should-not-reach' as const),
            onFailure: (err) => Effect.succeed(err),
          }),
        ),
      );
      expect(result).not.toBe('should-not-reach');
    });

    test('decode with missing field returns error effect', async () => {
      const incomplete = { id: 42 };
      const result = await Effect.runPromise(
        strictCodec.decode(incomplete as any).pipe(
          Effect.matchEffect({
            onSuccess: () => Effect.succeed('should-not-reach' as const),
            onFailure: (err) => Effect.succeed(err),
          }),
        ),
      );
      expect(result).not.toBe('should-not-reach');
    });
  });

  describe('schema with transformations', () => {
    const NumericString = Schema.NumberFromString;
    const numCodec = Codec.make(NumericString);

    test('encode transforms number to string representation', async () => {
      const encoded = await Effect.runPromise(numCodec.encode(42));
      expect(encoded).toBe('42');
    });

    test('decode transforms string to number', async () => {
      const decoded = await Effect.runPromise(numCodec.decode('123'));
      expect(decoded).toBe(123);
    });

    test('decode non-numeric string yields NaN which is not a valid number', async () => {
      const decoded = await Effect.runPromise(numCodec.decode('not-a-number'));
      expect(Number.isNaN(decoded)).toBe(true);
    });
  });

  describe('schema property', () => {
    test('codec exposes underlying schema', () => {
      const TestSchema = Schema.Struct({ value: Schema.Boolean });
      const codec = Codec.make(TestSchema);
      expect(codec.schema).toBeDefined();
    });
  });
});
