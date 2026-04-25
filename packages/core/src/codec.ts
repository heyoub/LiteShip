/**
 * Codec -- Effect Schema codec builder.
 *
 * Wraps Effect Schema into a typed codec with encode/decode methods.
 *
 * @module
 */

import type { Effect } from 'effect';
import { Schema } from 'effect';

interface CodecShape<A, I = A> {
  readonly schema: Schema.Codec<A, I>;
  encode(value: A): Effect.Effect<I, Schema.SchemaError>;
  decode(input: I): Effect.Effect<A, Schema.SchemaError>;
}

function _make<A, I>(schema: Schema.Codec<A, I>): CodecShape<A, I> {
  return {
    schema,
    encode: (value: A) => Schema.encodeEffect(schema)(value),
    decode: (input: I) => Schema.decodeEffect(schema)(input),
  };
}

/**
 * Codec — typed encode/decode wrapper over `effect`'s `Schema.Codec`.
 * Gives a single call site for schema-driven validation so consumers don't
 * import `Schema.encodeEffect`/`decodeEffect` directly.
 */
export const Codec = {
  /** Wrap a `Schema.Codec` in the {@link Codec.Shape} facade. */
  make: _make,
};

export declare namespace Codec {
  /** Structural shape of a codec: underlying schema plus `encode` / `decode` Effects. */
  export type Shape<A, I = A> = CodecShape<A, I>;
}
