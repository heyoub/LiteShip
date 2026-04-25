/**
 * Property test: Core validation and branding invariants.
 *
 * Type guard boolean invariants, brand constructor zero-cost guarantees.
 */

import { describe, test } from 'vitest';
import fc from 'fast-check';
import { CzapValidationError, isValidationError, brand } from '@czap/core';

describe('Core validation properties', () => {
  test('ValidationError type guard boolean invariant', () => {
    fc.assert(
      fc.property(fc.oneof(
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.object(), { nil: undefined }),
        fc.integer(),
        fc.boolean(),
        fc.array(fc.string()),
        fc.constant(new CzapValidationError('test-module', 'test-detail'))
      ), (input) => {
        const result = isValidationError(input);
        return typeof result === 'boolean';
      }),
    );
  });

  test('ValidationError type guard correctly identifies instances', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ minLength: 1, maxLength: 20 }), (module, detail) => {
        const error = new CzapValidationError(module, detail);
        return isValidationError(error) === true;
      }),
    );
  });

  test('ValidationError type guard rejects non-instances', () => {
    fc.assert(
      fc.property(fc.oneof(
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.object(), { nil: undefined }),
        fc.integer(),
        fc.boolean()
      ), (input) => {
        return isValidationError(input) === false;
      }),
    );
  });

  test('Brand constructor preserves value identity (zero runtime cost)', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const branded = brand(value);
        return branded === value; // Zero runtime cost
      }),
    );
  });

  test('Brand constructor works with different value types', () => {
    fc.assert(
      fc.property(fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.float().filter(n => !Number.isNaN(n)), // Filter out NaN
        fc.array(fc.string())
      ), (value) => {
        const branded = brand(value);
        return branded === value;
      }),
    );
  });
});
