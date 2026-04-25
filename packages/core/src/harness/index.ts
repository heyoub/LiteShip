/**
 * Harness — per-arm templates that emit test + bench + audit files
 * from a capsule declaration. Each arm has its own generator.
 *
 * @module
 */

export { generatePureTransform } from './pure-transform.js';
export type { HarnessOutput, HarnessContext } from './pure-transform.js';
export { ArbitraryFromSchema, schemaToArbitrary, UnsupportedSchemaError } from './arbitrary-from-schema.js';
export { generateReceiptedMutation } from './receipted-mutation.js';
export { generateStateMachine } from './state-machine.js';
export { generateSiteAdapter } from './site-adapter.js';
export { generatePolicyGate } from './policy-gate.js';
export { generateCachedProjection } from './cached-projection.js';
export { generateSceneComposition } from './scene-composition.js';
