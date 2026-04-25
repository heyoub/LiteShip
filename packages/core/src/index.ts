/**
 * `@czap/core` — constraint-based adaptive rendering primitives.
 * @module
 */

// Brands
export { brand, SignalInput, ThresholdValue, StateName, ContentAddress, TokenRef, Millis } from './brands.js';
export type { HLC as HLCBrand } from './brands.js';

// FNV-1a hash utility
export { fnv1a, fnv1aBytes } from './fnv.js';

// Canonical CBOR encoder (RFC 8949 §4.2.1) — content-address kernel
export { CanonicalCbor } from './cbor.js';

// Type utilities
export type { Prettify, StateUnion, StateAt, OutputsFor, BoundaryCrossing } from './type-utils.js';

// Tuple utilities
export { tupleMap } from './tuple.js';

// Boundary
export { Boundary, BoundarySpec } from './boundary.js';
export type { BoundarySpec as BoundarySpecType } from './boundary.js';

// Token
export { Token } from './token.js';
export type { TokenCategory } from './token.js';

// Style
export { Style } from './style.js';
export type { StyleLayer, ShadowLayer } from './style.js';

// Theme
export { Theme } from './theme.js';

// Component
export { Component } from './component.js';
export type { SlotConfig } from './component.js';

// Signal
export { Signal } from './signal.js';
export type { SignalSourceType, SignalSource } from './signal.js';

// Easing
export { Easing } from './easing.js';

// Animation
export { Animation } from './animation.js';

// Timeline
export { Timeline } from './timeline.js';

// Quantizer types
export type { Quantizer } from './quantizer-types.js';

// Scheduler
export { Scheduler } from './scheduler.js';

// Compositor
export { Compositor } from './compositor.js';
export type { CompositeState, CompositorConfig } from './compositor.js';

// Compositor State Pool
export { CompositorStatePool } from './compositor-pool.js';

// Speculative Evaluation
export { SpeculativeEvaluator } from './speculative.js';

// Token Buffer
export { TokenBuffer } from './token-buffer.js';

// UI Quality
export { UIQuality } from './ui-quality.js';
export type { UIQualityTier, MotionTier } from './ui-quality.js';

// Generative UI Frames
export { GenFrame } from './gen-frame.js';
export type { UIFrame, FrameType, MorphStrategy, GapStrategy } from './gen-frame.js';

// Video
export { VideoRenderer } from './video.js';
export type { VideoConfig, VideoFrameOutput } from './video.js';

// Capture
export type { CaptureConfig, CaptureFrame, FrameCapture, CaptureResult } from './capture.js';

// Blend
export { BlendTree } from './blend.js';

// Frame budget
export { FrameBudget } from './frame-budget.js';
export type { Priority } from './frame-budget.js';

// Dirty tracking
export { DirtyFlags } from './dirty.js';

// Protocol
export type { CellKind, CellMeta, CellEnvelope } from './protocol.js';

// ECS
export type { Entity, System, DenseSystem, DenseStore } from './ecs.js';
export { Part, World, EntityId } from './ecs.js';

// Composable
export { Composable, ComposableWorld } from './composable.js';
export type { EntityComponents, ComposableEntity, ComposableWorldShape } from './composable.js';

// Cell
export { Cell } from './cell.js';

// Derived
export { Derived } from './derived.js';

// Zap
export { Zap } from './zap.js';

// Store
export { Store } from './store.js';

// Wire
export { Wire } from './wire.js';

// Op
export { Op } from './op.js';

// Cap
export type { CapLevel, CapSet } from './caps.js';
export { Cap } from './caps.js';

// HLC
export { HLC } from './hlc.js';

// VectorClock
export { VectorClock } from './vector-clock.js';

// TypedRef
export { TypedRef } from './typed-ref.js';

// Receipt
export type { ReceiptSubject, ReceiptEnvelope, ChainValidationError } from './receipt.js';
export { Receipt } from './receipt.js';

// DAG
export type { DAGNode, ReceiptDAG, MergeResult, ForkViolation } from './dag.js';
export { DAG } from './dag.js';

// Plan
export { Plan } from './plan.js';
export type { OpType, EdgeType } from './plan.js';

// Runtime coordination
export { RuntimeCoordinator } from './runtime-coordinator.js';
export type { RuntimePhase, RuntimeCoordinatorConfig } from './runtime-coordinator.js';

// Codec
export { Codec } from './codec.js';
export { SchemaError, isSchemaError } from 'effect/Schema';

// LiveCell
export { LiveCell } from './live-cell.js';

// WASM Dispatch
export { WASMDispatch } from './wasm-dispatch.js';
export type { WASMKernels, WASMDispatchAPI } from './wasm-dispatch.js';
export { fallbackKernels } from './wasm-fallback.js';

// AVBridge
export { AVBridge } from './av-bridge.js';

// AVRenderer
export { AVRenderer } from './av-renderer.js';

// Defaults (centralized constants)
export {
  DEFAULT_TARGET_FPS,
  MS_PER_SEC,
  SSE_BUFFER_SIZE,
  SSE_HEARTBEAT_MS,
  SSE_RECONNECT_INITIAL_MS,
  SSE_RECONNECT_MAX_MS,
  COMPOSITOR_POOL_CAP,
  DIRTY_FLAGS_MAX,
  WASM_SCRATCH_BASE,
  CAPTURE_KEYFRAME_INTERVAL,
  EASING_SPRING_STEPS,
  THEME_TRANSITION_DURATION_MS,
  THEME_TRANSITION_EASING,
  CANVAS_FALLBACK_WIDTH,
  CANVAS_FALLBACK_HEIGHT,
  VIEWPORT,
} from './defaults.js';

// Validation error
export { CzapValidationError, isValidationError } from './validation-error.js';

// Diagnostics
export { Diagnostics } from './diagnostics.js';
export type { DiagnosticEvent, DiagnosticLevel, DiagnosticPayload, DiagnosticsSink } from './diagnostics.js';

// Type guards
import type { Cell as _Cell } from './cell.js';
import type { Derived as _Derived } from './derived.js';
import type { Zap as _Zap } from './zap.js';
import type { Wire as _Wire } from './wire.js';

/** Union of the four reactive primitives czap exposes to user code. */
export type Primitive<T> = _Cell.Shape<T> | _Derived.Shape<T> | _Zap.Shape<T> | _Wire.Shape<T>;

/** Narrow a {@link Primitive} to a {@link Cell}. */
export const isCell = <T>(p: Primitive<T>): p is _Cell.Shape<T> => p._tag === 'Cell';
/** Narrow a {@link Primitive} to a {@link Derived}. */
export const isDerived = <T>(p: Primitive<T>): p is _Derived.Shape<T> => p._tag === 'Derived';
/** Narrow a {@link Primitive} to a {@link Zap}. */
export const isZap = <T>(p: Primitive<T>): p is _Zap.Shape<T> => p._tag === 'Zap';
/** Narrow a {@link Primitive} to a {@link Wire}. */
export const isWire = <T>(p: Primitive<T>): p is _Wire.Shape<T> => p._tag === 'Wire';

// Config hub
export { Config, defineConfig } from './config.js';
export type { PrimitiveKind, PluginConfig as CorePluginConfig, AstroConfig as CoreAstroConfig } from './config.js';

// Capsule factory base types
export type {
  AssemblyKind,
  Site,
  CapabilityDecl,
  BudgetDecl,
  Invariant,
  AttributionDecl,
  CapsuleContract,
} from './capsule.js';

export { TypeValidator } from './capsule.js';

export { defineCapsule, getCapsuleCatalog, resetCapsuleCatalog } from './assembly.js';
export type { CapsuleDef } from './assembly.js';

// Capsule declarations — concrete instances of the 7-arm factory
export { boundaryEvaluateCapsule } from './capsules/boundary-evaluate.js';
export { tokenBufferCapsule } from './capsules/token-buffer.js';
export { canonicalCborCapsule } from './capsules/canonical-cbor.js';

// Harness — per-arm test + bench template generators
export * as Harness from './harness/index.js';
