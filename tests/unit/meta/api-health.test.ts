/**
 * API Health Canary -- programmatic verification of all public APIs.
 *
 * This test is the czap equivalent of free-batteries' ANTI-ALMOST-CORRECTNESS
 * PROTOCOL. It catches hallucinated, renamed, or removed APIs before they
 * reach production.
 *
 * If a namespace method is removed or renamed, THIS test fails first.
 * If an AI model generates code referencing a non-existent API, THIS test
 * would have caught the discrepancy.
 *
 * The registry below is the ground truth for what @czap/core exports.
 * Update it when you intentionally add/remove/rename APIs.
 */

import { describe, test, expect } from 'vitest';
import * as Core from '@czap/core';

// ── Ground-truth API registry ───────────────────────────────────────
// Every namespace object and its expected methods/values.
// This is intentionally exhaustive — all 47+ core modules.

const API_REGISTRY: Record<string, { methods: string[]; values?: string[] }> = {
  // ── Rendering primitives ──────────────────────────────────────────
  Boundary: { methods: ['make', 'evaluate', 'evaluateWithHysteresis'] },
  BoundarySpec: { methods: ['isActive'] },
  Token: { methods: ['make', 'tap', 'cssVar'] },
  TokenBuffer: { methods: ['make'] },
  Style: { methods: ['make', 'tap', 'mergeLayers'] },
  Theme: { methods: ['make', 'tap'] },
  Component: { methods: ['make'] },
  Signal: { methods: ['make', 'controllable', 'audio'] },
  Easing: {
    methods: [
      'linear',
      'easeInCubic',
      'easeOutCubic',
      'easeInOutCubic',
      'easeOutExpo',
      'easeOutBack',
      'easeOutElastic',
      'easeOutBounce',
      'ease',
      'easeIn',
      'easeOut',
      'easeInOut',
      'spring',
      'cubicBezier',
      'springToLinearCSS',
      'springNaturalDuration',
    ],
  },
  Animation: { methods: ['run', 'interpolate'] },
  Timeline: { methods: ['from'] },

  // ── Compositor / ECS / scheduling ─────────────────────────────────
  Compositor: { methods: ['create'] },
  CompositorStatePool: { methods: ['make'] },
  BlendTree: { methods: ['make'] },
  DirtyFlags: { methods: ['make'] },
  FrameBudget: { methods: ['make'] },
  Scheduler: { methods: ['raf', 'noop', 'fixedStep', 'audioSync'] },
  Part: { methods: ['dense'] },
  World: { methods: ['make'] },
  Composable: { methods: ['make', 'compose', 'merge'] },
  ComposableWorld: { methods: ['make', 'dense'] },

  Op: {
    methods: ['make', 'fromPromise', 'succeed', 'fail', 'all', 'allSettled', 'race', 'retry', 'timeout'],
  },

  // ── Reactive primitives ───────────────────────────────────────────
  Cell: { methods: ['make', 'fromStream', 'all', 'map'] },
  Derived: { methods: ['make', 'combine', 'map', 'flatten'] },
  Zap: { methods: ['make', 'fromDOMEvent', 'merge', 'map', 'filter', 'debounce', 'throttle'] },
  Wire: {
    methods: ['from', 'fromSSE', 'fromWebSocket', 'fromAsyncIterable', 'zip', 'merge', 'runCollect', 'runForEach'],
  },
  Store: { methods: ['make', 'makeWithEffect'] },
  LiveCell: { methods: ['make', 'makeBoundary'] },

  // ── Content addressing / receipts / DAG ───────────────────────────
  TypedRef: { methods: ['create', 'equals', 'canonicalize', 'hash'] },
  Receipt: {
    methods: [
      'createEnvelope',
      'buildChain',
      'validateChain',
      'validateChainDetailed',
      'hashEnvelope',
      'isGenesis',
      'head',
      'tail',
      'append',
      'findByHash',
      'findByKind',
      'generateMACKey',
      'macEnvelope',
      'verifyMAC',
    ],
    values: ['GENESIS'],
  },
  DAG: {
    methods: [
      'empty',
      'ingest',
      'ingestAll',
      'fromReceipts',
      'checkForkRule',
      'linearize',
      'linearizeFrom',
      'getHeads',
      'canonicalHead',
      'isFork',
      'ancestors',
      'isAncestor',
      'commonAncestor',
      'size',
      'merge',
    ],
  },
  HLC: {
    methods: ['create', 'compare', 'increment', 'merge', 'encode', 'decode', 'makeClock', 'tick', 'receive'],
  },
  VectorClock: {
    methods: [
      'make',
      'from',
      'get',
      'tick',
      'merge',
      'happensBefore',
      'concurrent',
      'equals',
      'compare',
      'toObject',
      'peers',
      'size',
    ],
  },
  Codec: { methods: ['make'] },
  Plan: { methods: ['make', 'validate', 'topoSort'] },
  RuntimeCoordinator: { methods: ['create'] },
  Diagnostics: { methods: ['warn', 'error', 'warnOnce', 'setSink', 'resetSink', 'clearOnce', 'reset', 'createBufferSink'] },
  Config: { methods: ['make', 'toViteConfig', 'toAstroConfig', 'toTestAliases'] },

  // ── Generative UI / video ─────────────────────────────────────────
  GenFrame: { methods: ['make', 'resolveGap'] },
  VideoRenderer: { methods: ['make'] },
  AVBridge: { methods: ['make'] },
  AVRenderer: { methods: ['make'] },
  UIQuality: { methods: ['make'], values: ['boundary'] },

  // ── Device / capability ───────────────────────────────────────────
  Cap: {
    methods: ['empty', 'from', 'grant', 'revoke', 'has', 'superset', 'union', 'intersection', 'atLeast', 'ordinal'],
  },

  // ── Speculative / WASM ────────────────────────────────────────────
  SpeculativeEvaluator: { methods: ['make'] },
  WASMDispatch: { methods: ['detect', 'load', 'kernels', 'isLoaded', 'unload'] },

  // ── Capsule factory ───────────────────────────────────────────────
  TypeValidator: { methods: ['validate'] },

  // ── Canonical CBOR (RFC 8949 §4.2.1) ─────────────────────────────
  CanonicalCbor: { methods: ['encode'] },

  // ── ShipCapsule (ADR-0011) ────────────────────────────────────────
  AddressedDigest: { methods: ['of'] },
  ShipCapsule: { methods: ['make', 'canonicalize', 'decode', 'computeId'] },

  // Harness lives at `@czap/core/harness` sub-path — intentionally NOT in
  // the main entry to keep fast-check + code-gen surface out of every
  // consumer's bundle. Verified separately below.
};

// ── Standalone function exports ─────────────────────────────────────
const STANDALONE_FUNCTIONS = [
  // `brand` removed from main entry — it is the unsafe escape-hatch the
  // sanctioned brand constructors compose with, and exposing it on the public
  // surface lets consumers forge any brand. Tests that need it import from
  // the source module directly.
  // `isSchemaError` removed from main entry — was an orphan re-export of
  // effect/Schema. Consumers can import directly from 'effect/Schema'.
  'isCell',
  'isDerived',
  'isZap',
  'isWire',
  'fnv1a',
  'fnv1aBytes',
  'isValidationError',
  'defineConfig',
  'tupleMap',
  'defineCapsule',
  'getCapsuleCatalog',
  // `resetCapsuleCatalog` lives at `@czap/core/testing` sub-path — see below.
  // ShipCapsule release-input addressing helpers (ADR-0011)
  'tarballManifestAddress',
  'lockfileAddress',
  'workspaceManifestAddress',
  'normalizedDryRunAddress',
  'normalizeDryRunOutput',
];

// ── Error classes ───────────────────────────────────────────────────
const ERROR_CLASSES = ['CzapValidationError'];

// Namespace objects that aren't in the main API_REGISTRY (utility re-exports)
const STANDALONE_OBJECTS = ['fallbackKernels', 'VIEWPORT', 'boundaryEvaluateCapsule', 'tokenBufferCapsule', 'canonicalCborCapsule'];

// ── Centralized default constants (re-exported from defaults.ts) ────
const DEFAULT_CONSTANTS = [
  'DEFAULT_TARGET_FPS',
  'MS_PER_SEC',
  'SSE_BUFFER_SIZE',
  'SSE_HEARTBEAT_MS',
  'SSE_RECONNECT_INITIAL_MS',
  'SSE_RECONNECT_MAX_MS',
  'COMPOSITOR_POOL_CAP',
  'DIRTY_FLAGS_MAX',
  'WASM_SCRATCH_BASE',
  'CAPTURE_KEYFRAME_INTERVAL',
  'EASING_SPRING_STEPS',
  'THEME_TRANSITION_DURATION_MS',
  'THEME_TRANSITION_EASING',
  'CANVAS_FALLBACK_WIDTH',
  'CANVAS_FALLBACK_HEIGHT',
];

// ── Branded type constructors (re-exported from brands.ts) ──────────
const BRANDED_CONSTRUCTORS = [
  'SignalInput',
  'ThresholdValue',
  'StateName',
  'ContentAddress',
  'IntegrityDigest',
  'TokenRef',
  'Millis',
  'EntityId',
];

// ── Tests ───────────────────────────────────────────────────────────

describe('API health canary', () => {
  describe('namespace objects', () => {
    for (const [ns, spec] of Object.entries(API_REGISTRY)) {
      describe(ns, () => {
        test(`${ns} exists as an object`, () => {
          const val = (Core as Record<string, unknown>)[ns];
          expect(val).toBeDefined();
          expect(typeof val).toBe('object');
        });

        for (const method of spec.methods) {
          test(`${ns}.${method} is a function`, () => {
            const nsObj = (Core as Record<string, Record<string, unknown>>)[ns];
            expect(nsObj).toBeDefined();
            expect(typeof nsObj[method]).toBe('function');
          });
        }

        if (spec.values) {
          for (const value of spec.values) {
            test(`${ns}.${value} exists`, () => {
              const nsObj = (Core as Record<string, Record<string, unknown>>)[ns];
              expect(nsObj).toBeDefined();
              expect(nsObj[value]).toBeDefined();
            });
          }
        }
      });
    }
  });

  describe('standalone functions', () => {
    for (const fn of STANDALONE_FUNCTIONS) {
      test(`${fn} is exported as a function`, () => {
        expect(typeof (Core as Record<string, unknown>)[fn]).toBe('function');
      });
    }
  });

  describe('standalone objects', () => {
    for (const obj of STANDALONE_OBJECTS) {
      test(`${obj} is exported`, () => {
        expect((Core as Record<string, unknown>)[obj]).toBeDefined();
      });
    }
  });

  describe('branded constructors', () => {
    for (const ctor of BRANDED_CONSTRUCTORS) {
      test(`${ctor} is exported`, () => {
        expect((Core as Record<string, unknown>)[ctor]).toBeDefined();
      });
    }
  });

  describe('default constants', () => {
    for (const name of DEFAULT_CONSTANTS) {
      test(`${name} is exported`, () => {
        const val = (Core as Record<string, unknown>)[name];
        expect(val).toBeDefined();
        expect(
          typeof val === 'number' || typeof val === 'string' || typeof val === 'object',
          `${name} should be a number, string, or object, got ${typeof val}`,
        ).toBe(true);
      });
    }
  });

  describe('error classes', () => {
    for (const name of ERROR_CLASSES) {
      test(`${name} is exported as a constructor`, () => {
        const val = (Core as Record<string, unknown>)[name];
        expect(val).toBeDefined();
        expect(typeof val).toBe('function');
      });
    }
  });

  describe('registry completeness', () => {
    test('no undocumented namespace exports', () => {
      const documented = new Set([
        ...Object.keys(API_REGISTRY),
        ...STANDALONE_FUNCTIONS,
        ...STANDALONE_OBJECTS,
        ...BRANDED_CONSTRUCTORS,
        ...DEFAULT_CONSTANTS,
        ...ERROR_CLASSES,
        // SchemaError + isSchemaError were removed from the main entry as
        // orphan re-exports of effect/Schema (no in-repo consumers).
      ]);

      const actual = Object.keys(Core).filter((k) => !k.startsWith('_'));

      const undocumented = actual.filter((k) => !documented.has(k));
      expect(
        undocumented,
        `Undocumented exports found: ${undocumented.join(', ')}.\n` +
        'Add them to API_REGISTRY, STANDALONE_FUNCTIONS, or BRANDED_CONSTRUCTORS ' +
        'in tests/unit/api-health.test.ts',
      ).toEqual([]);
    });
  });

  describe('sub-path exports', () => {
    test('@czap/core/testing exposes resetCapsuleCatalog', async () => {
      const Testing = await import('@czap/core/testing');
      expect(typeof Testing.resetCapsuleCatalog).toBe('function');
    });

    test('@czap/core/harness exposes the harness generators', async () => {
      const Harness = await import('@czap/core/harness');
      const expected = [
        'generatePureTransform',
        'generateReceiptedMutation',
        'generateStateMachine',
        'generateSiteAdapter',
        'generatePolicyGate',
        'generateCachedProjection',
        'generateSceneComposition',
      ];
      for (const name of expected) {
        expect(typeof (Harness as Record<string, unknown>)[name]).toBe('function');
      }
    });

    test('resetCapsuleCatalog is NOT on the main entry (footgun gate)', () => {
      expect((Core as Record<string, unknown>).resetCapsuleCatalog).toBeUndefined();
    });

    test('Harness namespace is NOT on the main entry (bundle-weight gate)', () => {
      expect((Core as Record<string, unknown>).Harness).toBeUndefined();
    });
  });
});
