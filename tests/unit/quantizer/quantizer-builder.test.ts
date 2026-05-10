/**
 * Q.from(boundary).outputs({...}) builder tests.
 *
 * Covers: config creation, content-address identity, MotionTier gating,
 * force() escape hatch, springToLinearCSS auto-generation, MemoCache,
 * LiveQuantizer reactive streams, BoundaryCrossing pub-sub.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Effect, Fiber, Scope, Stream } from 'effect';
import { Boundary } from '@czap/core';
import {
  Q,
  type OutputTarget,
  type MotionTier,
  type QuantizerConfig,
  type LiveQuantizer,
} from '@czap/quantizer';
import { TIER_TARGETS, MemoCache } from '@czap/quantizer/testing';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function viewport() {
  return Boundary.make({
    input: 'viewport-width',
    at: [
      [0, 'compact'],
      [768, 'medium'],
      [1280, 'expanded'],
    ] as const,
  });
}

// Counter to make outputs unique per call (avoids content-address cache collisions)
let outputCounter = 0;

function simpleOutputs<B extends Boundary.Shape>(_b: B) {
  const tag = `t${++outputCounter}`;
  return {
    css: {
      compact: { [`--${tag}-gap`]: '0.5rem', [`--${tag}-cols`]: 1 },
      medium: { [`--${tag}-gap`]: '1rem', [`--${tag}-cols`]: 2 },
      expanded: { [`--${tag}-gap`]: '2rem', [`--${tag}-cols`]: 3 },
    } as Record<string, Record<string, string | number>>,
    glsl: {
      compact: { [`u_${tag}_scale`]: 0.5 },
      medium: { [`u_${tag}_scale`]: 1.0 },
      expanded: { [`u_${tag}_scale`]: 1.5 },
    } as Record<string, Record<string, number>>,
    aria: {
      compact: { 'aria-label': `compact-${tag}` },
      medium: { 'aria-label': `medium-${tag}` },
      expanded: { 'aria-label': `expanded-${tag}` },
    } as Record<string, Record<string, string>>,
  };
}

// ---------------------------------------------------------------------------
// QuantizerConfig creation
// ---------------------------------------------------------------------------

describe('Q.from() config creation', () => {
  test('returns a QuantizerConfig with correct boundary', () => {
    const b = viewport();
    const config = Q.from(b).outputs({
      css: {
        compact: { '--gap': '0.5rem' },
        medium: { '--gap': '1rem' },
        expanded: { '--gap': '2rem' },
      },
    });
    expect(config.boundary).toBe(b);
  });

  test('config has content-addressed id', () => {
    const b = viewport();
    const config = Q.from(b).outputs({
      css: {
        compact: { '--gap': '0.5rem' },
        medium: { '--gap': '1rem' },
        expanded: { '--gap': '2rem' },
      },
    });
    expect(config.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });

  test('same inputs produce same content address', () => {
    const b = viewport();
    const outputs = {
      css: {
        compact: { '--gap': '0.5rem' },
        medium: { '--gap': '1rem' },
        expanded: { '--gap': '2rem' },
      },
    };
    const config1 = Q.from(b).outputs(outputs);
    const config2 = Q.from(b).outputs(outputs);
    expect(config1.id).toBe(config2.id);
    expect(config1).toBe(config2);
  });

  test('different outputs produce different content address', () => {
    const b = viewport();
    const config1 = Q.from(b).outputs({
      css: { compact: { '--gap': '0.5rem' }, medium: { '--gap': '1rem' }, expanded: { '--gap': '2rem' } },
    });
    const config2 = Q.from(b).outputs({
      css: { compact: { '--gap': '1rem' }, medium: { '--gap': '2rem' }, expanded: { '--gap': '3rem' } },
    });
    expect(config1.id).not.toBe(config2.id);
  });

  test('config has create() method', () => {
    const b = viewport();
    const config = Q.from(b).outputs({
      css: { compact: { '--gap': '0.5rem' }, medium: { '--gap': '1rem' }, expanded: { '--gap': '2rem' } },
    });
    expect(typeof config.create).toBe('function');
  });

  test('config stores tier when provided', () => {
    const b = viewport();
    const config = Q.from(b, { tier: 'transitions' }).outputs({
      css: {
        compact: { '--tier-test': '0.5rem' },
        medium: { '--tier-test': '1rem' },
        expanded: { '--tier-test': '2rem' },
      },
    });
    expect(config.tier).toBe('transitions');
  });

  test('config stores spring when provided', () => {
    const b = viewport();
    const config = Q.from(b, { spring: { stiffness: 170, damping: 26 } }).outputs({
      css: {
        compact: { '--spring-test': '0.5rem' },
        medium: { '--spring-test': '1rem' },
        expanded: { '--spring-test': '2rem' },
      },
    });
    expect(config.spring).toEqual({ stiffness: 170, damping: 26 });
  });
});

// ---------------------------------------------------------------------------
// MotionTier gating
// ---------------------------------------------------------------------------

describe('MotionTier gating', () => {
  test('TIER_TARGETS has every tier in the union', () => {
    // `satisfies` catches the case where a new tier is added to the
    // union but omitted from this array — the array literal must
    // include every element of `MotionTier` or the type-check fails.
    const tiers = ['none', 'transitions', 'animations', 'physics', 'compute'] as const satisfies readonly MotionTier[];
    type _ExhaustiveCheck = Exclude<MotionTier, (typeof tiers)[number]> extends never ? true : never;
    const _ok: _ExhaustiveCheck = true;
    void _ok;
    for (const tier of tiers) {
      expect(TIER_TARGETS[tier]).toBeDefined();
    }
  });

  test('none tier only allows aria', () => {
    expect(TIER_TARGETS.none).toEqual(new Set(['aria']));
  });

  test('transitions tier allows css + aria', () => {
    expect(TIER_TARGETS.transitions).toEqual(new Set(['css', 'aria']));
  });

  test('compute tier allows all targets', () => {
    expect(TIER_TARGETS.compute).toEqual(new Set(['css', 'glsl', 'wgsl', 'aria', 'ai']));
  });

  test('tier: none filters out css and glsl from outputs', async () => {
    const b = viewport();
    const config = Q.from(b, { tier: 'none' }).outputs(simpleOutputs(b));

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    // Only aria should be present
    expect(outputs.aria).toBeDefined();
    expect(outputs.css).toBeUndefined();
    expect(outputs.glsl).toBeUndefined();
  });

  test('tier: transitions includes css but not glsl', async () => {
    const b = viewport();
    const config = Q.from(b, { tier: 'transitions' }).outputs(simpleOutputs(b));

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toBeDefined();
    expect(outputs.aria).toBeDefined();
    expect(outputs.glsl).toBeUndefined();
  });

  test('tier: physics includes css + glsl + aria', async () => {
    const b = viewport();
    const config = Q.from(b, { tier: 'physics' }).outputs(simpleOutputs(b));

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toBeDefined();
    expect(outputs.glsl).toBeDefined();
    expect(outputs.aria).toBeDefined();
  });

  test('no tier = no filtering (all outputs present)', async () => {
    const b = viewport();
    const config = Q.from(b).outputs(simpleOutputs(b));

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toBeDefined();
    expect(outputs.glsl).toBeDefined();
    expect(outputs.aria).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// force() escape hatch
// ---------------------------------------------------------------------------

describe('force() escape hatch', () => {
  test('force() bypasses tier gating for specified targets', async () => {
    const b = viewport();
    // tier: none normally blocks everything except aria
    const config = Q.from(b, { tier: 'none' }).force('css', 'glsl').outputs(simpleOutputs(b));

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toBeDefined();
    expect(outputs.glsl).toBeDefined();
    expect(outputs.aria).toBeDefined(); // still allowed by tier
  });

  test('force() returns the builder for chaining', () => {
    const b = viewport();
    const builder = Q.from(b, { tier: 'none' });
    const result = builder.force('css');
    expect(result).toBe(builder);
  });
});

// ---------------------------------------------------------------------------
// Spring CSS auto-generation
// ---------------------------------------------------------------------------

describe('springToLinearCSS auto-generation', () => {
  test('injects --czap-easing when spring config + CSS outputs present', async () => {
    const b = viewport();
    const tag = `spring${++outputCounter}`;
    const config = Q.from(b, { spring: { stiffness: 170, damping: 26 } }).outputs({
      css: {
        compact: { [`--${tag}`]: '0.5rem' },
        medium: { [`--${tag}`]: '1rem' },
        expanded: { [`--${tag}`]: '2rem' },
      },
    });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toBeDefined();
    expect(outputs.css!['--czap-easing']).toBeDefined();
    expect(typeof outputs.css!['--czap-easing']).toBe('string');
    // Should be a linear() CSS function
    expect(outputs.css!['--czap-easing']).toMatch(/^linear\(/);
  });

  test('no spring config = no --czap-easing injection', async () => {
    const b = viewport();
    const tag = `nospring${++outputCounter}`;
    const config = Q.from(b).outputs({
      css: {
        compact: { [`--${tag}`]: '0.5rem' },
        medium: { [`--${tag}`]: '1rem' },
        expanded: { [`--${tag}`]: '2rem' },
      },
    });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toBeDefined();
    expect(outputs.css!['--czap-easing']).toBeUndefined();
  });

  test('spring CSS is cached (same spring config = same string)', async () => {
    const b = viewport();
    const spring = { stiffness: 170, damping: 26 };
    const t1 = `sc${++outputCounter}`;
    const t2 = `sc${++outputCounter}`;

    const config1 = Q.from(b, { spring }).outputs({
      css: { compact: { [`--${t1}`]: '1' }, medium: { [`--${t1}`]: '2' }, expanded: { [`--${t1}`]: '3' } },
    });
    const config2 = Q.from(b, { spring }).outputs({
      css: { compact: { [`--${t2}`]: '1' }, medium: { [`--${t2}`]: '2' }, expanded: { [`--${t2}`]: '3' } },
    });

    const lq1 = await Effect.runPromise(Effect.scoped(config1.create()));
    const lq2 = await Effect.runPromise(Effect.scoped(config2.create()));
    const o1 = await Effect.runPromise(lq1.currentOutputs);
    const o2 = await Effect.runPromise(lq2.currentOutputs);

    expect(o1.css!['--czap-easing']).toBe(o2.css!['--czap-easing']);
  });
});

// ---------------------------------------------------------------------------
// MemoCache
// ---------------------------------------------------------------------------

describe('MemoCache', () => {
  test('get/set/has work correctly', () => {
    const cache = MemoCache.make<number>();
    const key = 'fnv1a:12345678' as any;

    expect(cache.has(key)).toBe(false);
    cache.set(key, 42);
    expect(cache.has(key)).toBe(true);
    expect(cache.get(key)).toBe(42);
  });

  test('size tracks entries', () => {
    const cache = MemoCache.make<string>();
    expect(cache.size).toBe(0);
    cache.set('fnv1a:00000001' as any, 'a');
    cache.set('fnv1a:00000002' as any, 'b');
    expect(cache.size).toBe(2);
  });

  test('returns undefined for missing keys', () => {
    const cache = MemoCache.make<number>();
    expect(cache.get('fnv1a:missing00' as any)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LiveQuantizer -- reactive behavior
// ---------------------------------------------------------------------------

describe('LiveQuantizer', () => {
  function uniqueCss() {
    const t = `lq${++outputCounter}`;
    return {
      css: {
        compact: { [`--${t}`]: '0.5rem' },
        medium: { [`--${t}`]: '1rem' },
        expanded: { [`--${t}`]: '2rem' },
      },
      _key: `--${t}`,
    };
  }

  test('initial state is first boundary state', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const state = await Effect.runPromise(lq.state);
    expect(state).toBe('compact');
  });

  test('evaluate() returns current state for value in first range', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const result = lq.evaluate(500);
    expect(result).toBe('compact');
  });

  test('evaluate() transitions on boundary crossing', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));

    expect(lq.evaluate(500)).toBe('compact');
    expect(lq.evaluate(800)).toBe('medium');
    expect(lq.evaluate(1300)).toBe('expanded');
  });

  test('evaluate() updates currentOutputs on crossing', async () => {
    const b = viewport();
    const { css, _key } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));

    let outputs = await Effect.runPromise(lq.currentOutputs);
    expect(outputs.css![_key]).toBe('0.5rem');

    lq.evaluate(800);
    outputs = await Effect.runPromise(lq.currentOutputs);
    expect(outputs.css![_key]).toBe('1rem');

    lq.evaluate(1300);
    outputs = await Effect.runPromise(lq.currentOutputs);
    expect(outputs.css![_key]).toBe('2rem');
  });

  test('evaluate() does not emit crossing when state unchanged', async () => {
    const b = viewport();
    const { css, _key } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));

    expect(lq.evaluate(100)).toBe('compact');
    expect(lq.evaluate(200)).toBe('compact');
    expect(lq.evaluate(300)).toBe('compact');

    const outputs = await Effect.runPromise(lq.currentOutputs);
    expect(outputs.css![_key]).toBe('0.5rem');
  });

  test('config reference is available on LiveQuantizer', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    expect(lq.config).toBe(config);
  });

  test('boundary reference is available on LiveQuantizer', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    expect(lq._tag).toBe('Quantizer');
    expect(lq.boundary).toBe(b);
  });

  test('stateSync tracks the latest boundary evaluation result', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    expect((lq as LiveQuantizer<typeof b> & { stateSync(): string }).stateSync()).toBe('compact');
    lq.evaluate(800);
    expect((lq as LiveQuantizer<typeof b> & { stateSync(): string }).stateSync()).toBe('medium');
  });

  test('omits targets that do not define outputs for the current state', async () => {
    const b = viewport();
    const config = Q.from(b).outputs({
      css: {
        compact: { '--gap': '4px' },
        medium: { '--gap': '8px' },
        expanded: { '--gap': '12px' },
      },
      glsl: {
        expanded: { u_scale: 2 },
      },
    });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    expect(await Effect.runPromise(lq.currentOutputs)).toEqual({
      css: { '--gap': '4px' },
    });

    lq.evaluate(1300);
    expect(await Effect.runPromise(lq.currentOutputs)).toEqual({
      css: { '--gap': '12px' },
      glsl: { u_scale: 2 },
    });
  });

  test('reuses cached outputs when returning to a previously resolved state', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const config = Q.from(b).outputs({ css });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const initialOutputs = await Effect.runPromise(lq.currentOutputs);

    lq.evaluate(800);
    const mediumOutputs = await Effect.runPromise(lq.currentOutputs);
    expect(mediumOutputs).not.toBe(initialOutputs);

    lq.evaluate(500);
    const compactOutputs = await Effect.runPromise(lq.currentOutputs);
    expect(compactOutputs).toBe(initialOutputs);
  });

  test('falls back to ungated outputs when a tier lookup is missing at runtime', async () => {
    const b = viewport();
    const config = Q.from(b, { tier: 'ghost' as MotionTier }).outputs({
      css: {
        compact: { '--gap': '4px' },
        medium: { '--gap': '8px' },
        expanded: { '--gap': '12px' },
      },
      glsl: {
        compact: { u_gap: 4 },
        medium: { u_gap: 8 },
        expanded: { u_gap: 12 },
      },
      aria: {
        compact: { 'aria-label': 'compact' },
        medium: { 'aria-label': 'medium' },
        expanded: { 'aria-label': 'expanded' },
      },
    });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    expect(await Effect.runPromise(lq.currentOutputs)).toEqual({
      css: { '--gap': '4px' },
      glsl: { u_gap: 4 },
      aria: { 'aria-label': 'compact' },
    });
  });

  test('changes subscriptions clean up cleanly when the scope closes after a crossing', async () => {
    const b = viewport();
    const { css } = uniqueCss();
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const lq = yield* Q.from(b).outputs({ css }).create();
          const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(lq.changes, 1)));

          yield* Effect.yieldNow;
          yield* Effect.sync(() => {
            lq.evaluate(900);
          });

          const chunk = yield* Fiber.join(fiber);
          return Array.from(chunk).map((crossing) => ({ from: crossing.from, to: crossing.to }));
        }),
      ),
    );

    expect(events).toEqual([{ from: 'compact', to: 'medium' }]);
  });
});

// ---------------------------------------------------------------------------
// Tier gating + output correctness integration
// ---------------------------------------------------------------------------

describe('tier gating output correctness', () => {
  test('tier: none with all output types only produces aria', async () => {
    const b = viewport();
    const t = `none${++outputCounter}`;
    const config = Q.from(b, { tier: 'none' }).outputs({
      css: { compact: { [`--${t}`]: '0.5rem' }, medium: { [`--${t}`]: '1rem' }, expanded: { [`--${t}`]: '2rem' } },
      glsl: { compact: { [`u_${t}`]: 0.5 }, medium: { [`u_${t}`]: 1.0 }, expanded: { [`u_${t}`]: 1.5 } },
      aria: {
        compact: { 'aria-label': `c-${t}` },
        medium: { 'aria-label': `m-${t}` },
        expanded: { 'aria-label': `e-${t}` },
      },
    });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.aria).toEqual({ 'aria-label': `c-${t}` });
    expect(outputs.css).toBeUndefined();
    expect(outputs.glsl).toBeUndefined();
  });

  test('after crossing, tier gating still applies', async () => {
    const b = viewport();
    const t = `trans${++outputCounter}`;
    const config = Q.from(b, { tier: 'transitions' }).outputs({
      css: { compact: { [`--${t}`]: '0.5rem' }, medium: { [`--${t}`]: '1rem' }, expanded: { [`--${t}`]: '2rem' } },
      glsl: { compact: { [`u_${t}`]: 0.5 }, medium: { [`u_${t}`]: 1.0 }, expanded: { [`u_${t}`]: 1.5 } },
      aria: {
        compact: { 'aria-label': `c-${t}` },
        medium: { 'aria-label': `m-${t}` },
        expanded: { 'aria-label': `e-${t}` },
      },
    });

    const lq = await Effect.runPromise(Effect.scoped(config.create()));
    lq.evaluate(800);
    const outputs = await Effect.runPromise(lq.currentOutputs);

    expect(outputs.css).toEqual({ [`--${t}`]: '1rem' });
    expect(outputs.aria).toEqual({ 'aria-label': `m-${t}` });
    expect(outputs.glsl).toBeUndefined();
  });
});
