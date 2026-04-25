import { describe, it, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { TypeValidator } from '@czap/core';

describe('TypeValidator', () => {
  it('validates a value against a schema and returns the typed result', () => {
    const result = Effect.runSync(
      TypeValidator.validate(Schema.Number, 42),
    );
    expect(result).toBe(42);
  });

  it('fails Effect on a schema mismatch', () => {
    const exit = Effect.runSyncExit(
      TypeValidator.validate(Schema.Number, 'not a number'),
    );
    expect(exit._tag).toBe('Failure');
  });
});
