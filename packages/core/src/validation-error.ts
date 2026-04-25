/**
 * Structured validation error for factory/constructor failures.
 *
 * Thrown (not Effect.fail'd) because all factory functions are synchronous.
 * Callers can catch and `instanceof CzapValidationError` to distinguish
 * czap validation failures from other errors.
 *
 * @module
 */

/**
 * Structured validation error thrown by czap factory/constructor functions.
 *
 * Carries a `module` identifier (e.g. `'Boundary.make'`) and a human-readable
 * `detail` message. Synchronous factories throw this directly so callers can
 * `catch` and branch via {@link isValidationError} without Effect plumbing.
 */
export class CzapValidationError extends Error {
  readonly _tag = 'CzapValidationError' as const;
  readonly module: string;
  readonly detail: string;

  constructor(module: string, detail: string) {
    super(`${module}: ${detail}`);
    this.name = 'CzapValidationError';
    this.module = module;
    this.detail = detail;
  }
}

/** Type guard for CzapValidationError */
export function isValidationError(error: unknown): error is CzapValidationError {
  return error instanceof CzapValidationError;
}
