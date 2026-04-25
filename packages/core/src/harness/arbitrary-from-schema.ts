/**
 * arbitrary-from-schema — derive a `fast-check` arbitrary from an Effect
 * `Schema.Codec<T>`. Used by the harness templates so generated property
 * tests feed real, schema-conformant inputs into capsule run handlers.
 *
 * Coverage: scalars (String, Number, Boolean, BigInt), Literal,
 * Null/Undefined/Void, Unknown/Any, ObjectKeyword, Enum, Union, Array
 * (Schema.Array + fixed Tuple + NonEmptyArray-style elements+rest),
 * TypeLiteral (Struct with optional property signatures), Suspend,
 * Declaration (Date specifically; throws for other declarations), and
 * AST-level `checks` (Filter / FilterGroup) which model refinements
 * such as `Schema.NonEmptyString` and `Schema.minLength(n)` — these
 * post-filter the underlying arbitrary by running each Filter's
 * predicate.
 *
 * KNOWN GAPS — these AST nodes throw `UnsupportedSchemaError` and the
 * harness falls back to `it.skip` rather than a vacuous test:
 *   - Transformation (Schema.transform, Schema.compose chains)
 *   - TemplateLiteral (Schema.TemplateLiteral)
 *   - Declaration for non-Date opaque types (e.g. Uint8Array)
 *
 * @module
 */
import { Effect } from 'effect';
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

/**
 * Apply post-type-match `checks` (Filter / FilterGroup) declared on the
 * AST node to the produced arbitrary. Each Filter's `run` returns
 * `Issue | undefined`; `undefined` means the input passed. We compose all
 * checks and `.filter` the arbitrary so only conforming samples survive.
 *
 * fast-check throws if the filter rejection rate exceeds ~10%. For
 * common refinements (NonEmptyString, minLength) the underlying
 * arbitrary already biases toward populated values so rejection stays
 * well below the threshold.
 */
function _applyChecks(
  ast: SchemaAST.AST,
  arb: fc.Arbitrary<unknown>,
): fc.Arbitrary<unknown> {
  const checks = ast.checks;
  if (checks === undefined || checks.length === 0) return arb;
  return arb.filter((sample) => {
    for (const check of checks) {
      if (check._tag === 'Filter') {
        // ParseOptions is opaque — pass an empty object; the runtime
        // tolerates missing fields for filter execution.
        const issue = (check as SchemaAST.Filter<unknown>).run(
          sample,
          ast,
          {} as SchemaAST.ParseOptions,
        );
        if (issue !== undefined) return false;
      } else if (check._tag === 'FilterGroup') {
        const group = check as SchemaAST.FilterGroup<unknown>;
        for (const inner of group.checks) {
          if (inner._tag === 'Filter') {
            const issue = (inner as SchemaAST.Filter<unknown>).run(
              sample,
              ast,
              {} as SchemaAST.ParseOptions,
            );
            if (issue !== undefined) return false;
          }
          // Nested FilterGroup is theoretically possible but rare;
          // ignore for now and let the outer test catch failures.
        }
      }
    }
    return true;
  });
}

/**
 * Probe a `Declaration` node to determine the JavaScript class it accepts.
 * We attempt to construct a sentinel value and see whether the node's
 * `run` parser accepts it. If yes, return a fast-check arbitrary that
 * produces values of that shape. Otherwise throw.
 *
 * Currently supports `Date`. Add new probes here when production
 * capsules require them.
 */
function _arbitraryForDeclaration(
  ast: SchemaAST.Declaration,
): fc.Arbitrary<unknown> {
  const parser = ast.run(ast.typeParameters);
  // Probe with `new Date()` — the most common Declaration in production.
  const probeDate = new Date();
  // The parser returns an Effect; we synchronously inspect via the
  // runtime sync path. If it succeeds, the Declaration accepts Date.
  // We avoid pulling in the full Effect runtime here — a try/catch
  // around the parser's first sync step is enough for the probe.
  let acceptsDate = false;
  try {
    const out = parser(probeDate, ast, {} as SchemaAST.ParseOptions);
    // The Effect returned by `out` succeeds synchronously when the
    // input matches; failure surfaces as an Issue. We use Effect's
    // `runSyncExit` to inspect the success/failure tag without
    // throwing on parse failures.
    const exit = Effect.runSyncExit(out as never);
    acceptsDate = exit._tag === 'Success';
  } catch {
    acceptsDate = false;
  }
  if (acceptsDate) return fc.date();
  throw new UnsupportedSchemaError(
    'Declaration',
    'opaque user-defined type — only Date is currently probed',
  );
}

function walk(ast: SchemaAST.AST): fc.Arbitrary<unknown> {
  let arb: fc.Arbitrary<unknown>;
  switch (ast._tag) {
    case 'String':
      arb = fc.string();
      break;
    case 'Number':
      // Integer is safer than float — avoids NaN/Infinity which trip
      // most user-defined invariants. Capsules that need floats can
      // refine via filter checks (not yet handled here).
      arb = fc.integer();
      break;
    case 'Boolean':
      arb = fc.boolean();
      break;
    case 'BigInt':
      arb = fc.bigInt();
      break;
    case 'Literal':
      arb = fc.constant((ast as SchemaAST.Literal).literal);
      break;
    case 'Null':
      arb = fc.constant(null);
      break;
    case 'Undefined':
    case 'Void':
      arb = fc.constant(undefined);
      break;
    case 'Unknown':
    case 'Any':
      arb = fc.anything();
      break;
    case 'ObjectKeyword':
      arb = fc.object();
      break;
    case 'Enum': {
      const enums = (ast as SchemaAST.Enum).enums;
      if (enums.length === 0) {
        throw new UnsupportedSchemaError('Enum', 'empty enum');
      }
      arb = fc.constantFrom(...enums.map(([, v]) => v));
      break;
    }
    case 'Union': {
      const u = ast as SchemaAST.Union;
      if (u.types.length === 0) {
        throw new UnsupportedSchemaError('Union', 'empty union');
      }
      const arbs = u.types.map(walk);
      // fc.oneof accepts an arbitraries-array as variadic args
      arb = fc.oneof(...arbs);
      break;
    }
    case 'Arrays': {
      const a = ast as SchemaAST.Arrays;
      // Common case: Schema.Array(T) yields elements=[], rest=[T]
      if (a.elements.length === 0 && a.rest.length === 1) {
        const elem = a.rest[0];
        if (elem === undefined) {
          throw new UnsupportedSchemaError('Arrays', 'rest[0] missing');
        }
        arb = fc.array(walk(elem), { maxLength: 8 });
        break;
      }
      // Fixed tuple
      if (a.rest.length === 0 && a.elements.length > 0) {
        const elemArbs = a.elements.map(walk);
        arb = fc.tuple(...elemArbs);
        break;
      }
      // Mixed: required leading element(s) + rest tail. NonEmptyArray
      // surfaces here as elements=[T], rest=[T] — generate the leading
      // tuple and append a variable-length tail of the same elem type.
      if (a.elements.length > 0 && a.rest.length === 1) {
        const headArbs = a.elements.map(walk);
        const tailElem = a.rest[0];
        if (tailElem === undefined) {
          throw new UnsupportedSchemaError('Arrays', 'rest[0] missing');
        }
        const tailArb = fc.array(walk(tailElem), { maxLength: 7 });
        arb = fc
          .tuple(fc.tuple(...headArbs), tailArb)
          .map(([head, tail]) => [...head, ...tail]);
        break;
      }
      throw new UnsupportedSchemaError(
        'Arrays',
        `unsupported tuple+rest shape (elements=${a.elements.length}, rest=${a.rest.length})`,
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
        const fieldArb = walk(ps.type);
        const isOptional = ps.type.context?.isOptional === true;
        if (isOptional) optional[key] = fieldArb;
        else required[key] = fieldArb;
      }
      if (Object.keys(optional).length === 0) {
        arb = fc.record(required);
        break;
      }
      // fast-check supports `requiredKeys` to mark a subset as required —
      // but the simpler, version-stable approach is to merge all keys and
      // post-process: for each optional key, randomly drop it.
      const allKeys = { ...required, ...optional };
      arb = fc
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
      break;
    }
    case 'Suspend': {
      const s = ast as SchemaAST.Suspend;
      // Resolve once; arbitrary depth control is left to fast-check defaults.
      arb = walk(s.thunk());
      break;
    }
    case 'Declaration':
      arb = _arbitraryForDeclaration(ast as SchemaAST.Declaration);
      break;
    default:
      throw new UnsupportedSchemaError(ast._tag);
  }
  return _applyChecks(ast, arb);
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
