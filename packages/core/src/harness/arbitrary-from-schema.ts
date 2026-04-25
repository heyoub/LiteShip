/**
 * arbitrary-from-schema — derive a `fast-check` arbitrary from an Effect
 * `Schema.Codec<T>`. Used by the harness templates so generated property
 * tests feed real, schema-conformant inputs into capsule run handlers.
 *
 * Coverage is intentionally narrow: scalars (String, Number, Boolean,
 * BigInt), Literal, Null/Undefined/Void, Unknown/Any, ObjectKeyword,
 * Enum, Union, Array (Schema.Array + fixed Tuple), TypeLiteral
 * (Struct with optional property signatures), and Suspend.
 *
 * KNOWN GAPS — these AST nodes throw `UnsupportedSchemaError` and the
 * harness falls back to `it.skip` rather than a vacuous test:
 *   - Refinement (e.g. Schema.NonEmptyString, Schema.Int, branded types)
 *   - Transformation (Schema.transform, Schema.compose chains)
 *   - Declaration (custom user-defined Schemas like Schema.instanceOf)
 *   - TemplateLiteral (Schema.TemplateLiteral)
 * Closing these gaps is follow-up work — most production capsules use
 * Refinement-bearing schemas, so today many generated tests skip even
 * when a `run` handler is wired. See STATUS.md for tracking.
 *
 * @module
 */
import type { Schema, SchemaAST } from 'effect';
import * as fc from 'fast-check';

/** Error thrown when an AST node has no supported arbitrary mapping. */
export class UnsupportedSchemaError extends Error {
  readonly _tag = 'UnsupportedSchemaError';
  readonly nodeTag: string;
  constructor(nodeTag: string, hint?: string) {
    super(
      `arbitrary-from-schema: AST node "${nodeTag}" is not supported${
        hint ? ` (${hint})` : ''
      }`,
    );
    this.nodeTag = nodeTag;
  }
}

function walk(ast: SchemaAST.AST): fc.Arbitrary<unknown> {
  switch (ast._tag) {
    case 'String':
      return fc.string();
    case 'Number':
      // Integer is safer than float — avoids NaN/Infinity which trip
      // most user-defined invariants. Capsules that need floats can
      // refine via filter checks (not yet handled here).
      return fc.integer();
    case 'Boolean':
      return fc.boolean();
    case 'BigInt':
      return fc.bigInt();
    case 'Literal':
      return fc.constant((ast as SchemaAST.Literal).literal);
    case 'Null':
      return fc.constant(null);
    case 'Undefined':
    case 'Void':
      return fc.constant(undefined);
    case 'Unknown':
    case 'Any':
      return fc.anything();
    case 'ObjectKeyword':
      return fc.object();
    case 'Enum': {
      const enums = (ast as SchemaAST.Enum).enums;
      if (enums.length === 0) {
        throw new UnsupportedSchemaError('Enum', 'empty enum');
      }
      return fc.constantFrom(...enums.map(([, v]) => v));
    }
    case 'Union': {
      const u = ast as SchemaAST.Union;
      if (u.types.length === 0) {
        throw new UnsupportedSchemaError('Union', 'empty union');
      }
      const arbs = u.types.map(walk);
      // fc.oneof accepts an arbitraries-array as variadic args
      return fc.oneof(...arbs);
    }
    case 'Arrays': {
      const a = ast as SchemaAST.Arrays;
      // Common case: Schema.Array(T) yields elements=[], rest=[T]
      if (a.elements.length === 0 && a.rest.length === 1) {
        const elem = a.rest[0];
        if (elem === undefined) {
          throw new UnsupportedSchemaError('Arrays', 'rest[0] missing');
        }
        return fc.array(walk(elem), { maxLength: 8 });
      }
      // Fixed tuple
      if (a.rest.length === 0 && a.elements.length > 0) {
        const elemArbs = a.elements.map(walk);
        return fc.tuple(...elemArbs);
      }
      throw new UnsupportedSchemaError(
        'Arrays',
        `mixed tuple+rest shape (elements=${a.elements.length}, rest=${a.rest.length})`,
      );
    }
    case 'Objects': {
      const o = ast as SchemaAST.Objects;
      if (o.indexSignatures.length > 0) {
        throw new UnsupportedSchemaError('Objects', 'index signatures');
      }
      const required: Record<string, fc.Arbitrary<unknown>> = {};
      const optional: Record<string, fc.Arbitrary<unknown>> = {};
      for (const ps of o.propertySignatures) {
        const key = String(ps.name);
        const arb = walk(ps.type);
        const isOptional = ps.type.context?.isOptional === true;
        if (isOptional) optional[key] = arb;
        else required[key] = arb;
      }
      if (Object.keys(optional).length === 0) {
        return fc.record(required);
      }
      // fast-check supports `requiredKeys` to mark a subset as required —
      // but the simpler, version-stable approach is to merge all keys and
      // post-process: for each optional key, randomly drop it.
      const allKeys = { ...required, ...optional };
      return fc
        .record(allKeys)
        .chain((rec) =>
          fc
            .tuple(...Object.keys(optional).map(() => fc.boolean()))
            .map((dropFlags) => {
              const out: Record<string, unknown> = { ...rec };
              const optKeys = Object.keys(optional);
              for (let i = 0; i < optKeys.length; i++) {
                if (dropFlags[i] === true) {
                  const k = optKeys[i];
                  if (k !== undefined) delete out[k];
                }
              }
              return out;
            }),
        );
    }
    case 'Suspend': {
      const s = ast as SchemaAST.Suspend;
      // Resolve once; arbitrary depth control is left to fast-check defaults.
      return walk(s.thunk());
    }
    default:
      throw new UnsupportedSchemaError(ast._tag);
  }
}

/**
 * Walk a `Schema` AST and return a `fc.Arbitrary` that produces values
 * structurally conforming to the schema. Throws
 * {@link UnsupportedSchemaError} on AST nodes with no supported mapping.
 *
 * Accepts any `Schema.Schema<T>` (or `Codec`) — only `.ast` is read.
 */
function _schemaToArbitrary<T>(schema: Schema.Schema<T>): fc.Arbitrary<T> {
  return walk(schema.ast) as fc.Arbitrary<T>;
}

/** Public namespace for the arbitrary-from-schema walker. */
export const ArbitraryFromSchema = {
  fromSchema: _schemaToArbitrary,
} as const;

/** Convenience top-level export — most call sites use this directly. */
export const schemaToArbitrary = _schemaToArbitrary;

export declare namespace ArbitraryFromSchema {
  /** The result type returned by {@link ArbitraryFromSchema.fromSchema}. */
  export type Result<T> = fc.Arbitrary<T>;
}
