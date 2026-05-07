/**
 * `@czap/quantizer` -- boundary detection, multi-target output dispatch, animated transitions.
 *
 * @module
 */

export { evaluate, Evaluate } from './evaluate.js';
export type { EvaluateResult } from './evaluate.js';

export { Q } from './quantizer.js';
export type { OutputTarget, QuantizerOutputs, QuantizerConfig, LiveQuantizer, QuantizerBuilder } from './quantizer.js';

export { Transition } from './transition.js';
export type { TransitionConfig, TransitionMap, Transition as TransitionType } from './transition.js';

export { AnimatedQuantizer } from './animated-quantizer.js';
export type { AnimatedQuantizerShape } from './animated-quantizer.js';

export { TransitionConfigSchema, TransitionMapSchema, OutputTargetSchema, QuantizerOutputsSchema } from './schemas.js';

export type { MotionTier, SpringConfig, QuantizerFromOptions } from './quantizer.js';
// `MemoCache` and `TIER_TARGETS` ship via `@czap/quantizer/testing` —
// implementation primitives that power the public `Q.from()` builder
// internally but are not consumer-facing API.
