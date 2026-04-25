/**
 * Effect Schema definitions for quantizer configuration types.
 *
 * Note: TransitionConfigSchema validates runtime shape (number fields).
 * The branded Millis type is enforced at the TypeScript level via
 * TransitionConfig interface. Decoded values should be wrapped with
 * Millis() at the consumer site.
 */

import { Schema } from 'effect';

/**
 * Runtime schema for {@link TransitionConfig}.
 *
 * Validates numeric `duration` and optional `easing`/`delay`. The branded
 * `Millis` type is not enforced here; wrap decoded durations with `Millis()`
 * at the consumer site for type safety.
 */
export const TransitionConfigSchema = Schema.Struct({
  duration: Schema.Number,
  easing: Schema.optionalKey(Schema.Any),
  delay: Schema.optionalKey(Schema.Number),
});

/** Runtime schema for a {@link TransitionMap} record. */
export const TransitionMapSchema = Schema.Record(Schema.String, TransitionConfigSchema);

/** Runtime schema for the {@link OutputTarget} literal union. */
export const OutputTargetSchema = Schema.Union([
  Schema.Literal('css'),
  Schema.Literal('glsl'),
  Schema.Literal('wgsl'),
  Schema.Literal('aria'),
  Schema.Literal('ai'),
]);

/**
 * Runtime schema for {@link QuantizerOutputs}.
 *
 * Each target is an optional record whose values are unchecked at the
 * schema level; target-specific value constraints live in the TypeScript
 * types on {@link QuantizerOutputs}.
 */
export const QuantizerOutputsSchema = Schema.Struct({
  css: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  glsl: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  wgsl: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  aria: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  ai: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});
