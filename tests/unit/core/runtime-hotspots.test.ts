// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import { Effect, Schema } from 'effect';
import { Boundary, Millis, Part, SpeculativeEvaluator, Style, World } from '@czap/core';
import { evaluate as evaluateQuantizer } from '@czap/quantizer';
import { GLSLCompiler } from '@czap/compiler';
import { captureSelection, findScrollable } from '../../../packages/web/src/physical/capture.js';
import { restoreActiveElement, restoreFocusState, restoreSelection } from '../../../packages/web/src/physical/restore.js';

describe('runtime hotspot coverage', () => {
  test('World regular systems handle empty queries, component add/remove, and missing dense stores', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const hpPart = { name: 'hp', schema: Schema.Number };
          const labelPart = { name: 'label', schema: Schema.String };
          const presentStore = Part.dense('present', 8);
          yield* world.addDenseStore(presentStore);

          const id = yield* world.spawn({ label: 'player' });
          yield* world.addComponent(id, hpPart, 100);
          yield* world.addComponent('missing-entity' as never, hpPart, 50);

          let emptyExecutions = 0;
          let denseExecuted = false;
          let regularSeen: string[] = [];

          yield* world.addSystem({
            name: 'empty-query',
            query: ['ghost'],
            execute(entities) {
              emptyExecutions += 1;
              expect(entities).toEqual([]);
              return Effect.void;
            },
          });

          yield* world.addSystem({
            name: 'label-and-hp',
            query: ['label', 'hp'],
            execute(entities) {
              regularSeen = entities.map((entity) => {
                const label = entity.components.get(labelPart.name);
                const hp = entity.components.get(hpPart.name);
                return `${label}:${hp}`;
              });
              return Effect.void;
            },
          });

          yield* world.addSystem({
            name: 'missing-dense-store',
            query: ['present', 'missing'],
            _denseSystem: true as const,
            execute() {
              denseExecuted = true;
              return Effect.void;
            },
          });

          yield* world.tick();
          yield* world.removeComponent(id, hpPart.name);
          yield* world.removeComponent('missing-entity' as never, hpPart.name);
          const matchedAfterRemoval = yield* world.query('label', 'hp');

          return {
            emptyExecutions,
            denseExecuted,
            regularSeen,
            matchedAfterRemoval: matchedAfterRemoval.length,
          };
        }),
      ),
    );

    expect(result.emptyExecutions).toBe(1);
    expect(result.denseExecuted).toBe(false);
    expect(result.regularSeen).toEqual(['player:100']);
    expect(result.matchedAfterRemoval).toBe(0);
  });

  test('quantizer evaluate handles empty threshold sets and unknown previous states defensively', () => {
    const thresholdless = {
      thresholds: [],
      states: ['only'],
      hysteresis: 20,
    } as never;

    expect(evaluateQuantizer(thresholdless, 42)).toEqual({
      state: 'only',
      index: 0,
      value: 42,
      crossed: false,
    });

    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'small'],
        [500, 'large'],
      ] as const,
      hysteresis: 40,
    });

    const result = evaluateQuantizer(boundary, 700, 'missing' as never);
    expect(result.state).toBe('large');
    expect(result.index).toBe(1);
    expect(result.crossed).toBe(true);
  });

  test('SpeculativeEvaluator handles zero velocity, reverse movement, and confidence clamping', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'small'],
        [500, 'large'],
      ] as const,
      hysteresis: 20,
    });

    const stationary = SpeculativeEvaluator.make(boundary);
    stationary.evaluate(495);
    const zeroVelocity = stationary.evaluate(499, 0);

    const reversing = SpeculativeEvaluator.make(boundary);
    reversing.evaluate(505);
    const reverseVelocity = reversing.evaluate(501, 10);

    const confident = SpeculativeEvaluator.make(boundary);
    confident.evaluate(480);
    confident.evaluate(490);
    const fastToward = confident.evaluate(499, 100);

    expect(zeroVelocity.prefetched).toBeUndefined();
    expect(zeroVelocity.confidence).toBe(0);
    expect(reverseVelocity.prefetched).toBeUndefined();
    expect(fastToward.prefetched).toBe('large');
    expect(fastToward.confidence).toBeGreaterThan(0);
    expect(fastToward.confidence).toBeLessThanOrEqual(1);
  });

  test('SpeculativeEvaluator skips low-confidence speculation and ignores prefetched states identical to current', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'small'],
        [500, 'large'],
      ] as const,
      hysteresis: 100,
    });
    const lowConfidence = SpeculativeEvaluator.make(boundary);
    lowConfidence.evaluate(400);
    const slowApproach = lowConfidence.evaluate(401, 0.01);

    const singleState = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'only'],
      ] as const,
    });
    const noThresholds = SpeculativeEvaluator.make(singleState);
    const noNearest = noThresholds.evaluate(200, 5);

    expect(slowApproach.prefetched).toBeUndefined();
    expect(slowApproach.confidence).toBeGreaterThan(0);
    expect(slowApproach.confidence).toBeLessThan(0.3);
    expect(noNearest.prefetched).toBeUndefined();
    expect(noNearest.confidence).toBe(0);
  });

  test('Style merge/tap keeps empty layers tidy and falls back to base for unknown states', () => {
    const emptyMerge = Style.mergeLayers({ properties: {} }, { properties: {} });
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'base'],
        [768, 'wide'],
      ] as const,
    });
    const adaptiveStyle = Style.make({
      boundary,
      base: {
        properties: { color: 'red' },
      },
      states: {
        wide: {
          properties: { color: 'blue', gap: '16px' },
        },
      },
      transition: { duration: Millis(150) },
    });

    expect(emptyMerge).toEqual({ properties: {} });
    expect(Style.tap(adaptiveStyle, 'unknown').color).toBe('red');
    expect(Style.tap(adaptiveStyle, 'unknown').gap).toBeUndefined();
    expect(Style.tap(adaptiveStyle, 'wide').gap).toBe('16px');
  });

  test('physical helpers ignore invalid selectors, disabled focus targets, collapsed selections, and hidden overflow', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    const disabledInput = document.createElement('input');
    disabledInput.id = 'disabled-input';
    disabledInput.disabled = true;
    root.appendChild(disabledInput);

    const hiddenScroller = document.createElement('div');
    hiddenScroller.style.overflow = 'hidden';
    hiddenScroller.style.height = '20px';
    hiddenScroller.style.width = '20px';
    hiddenScroller.innerHTML = '<div style="height: 200px; width: 200px;"></div>';
    root.appendChild(hiddenScroller);

    const editable = document.createElement('div');
    editable.id = 'editable';
    editable.contentEditable = 'true';
    editable.textContent = 'hello world';
    root.appendChild(editable);

    const emailInput = document.createElement('input');
    emailInput.id = 'email-input';
    emailInput.type = 'email';
    emailInput.value = 'person@example.com';
    root.appendChild(emailInput);
    document.body.appendChild(root);

    const selection = window.getSelection();
    const range = document.createRange();
    const textNode = editable.firstChild!;
    range.setStart(textNode, 2);
    range.setEnd(textNode, 2);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(captureSelection()).toBeNull();
    expect(findScrollable(root)).toEqual([]);
    expect(() => Effect.runSync(restoreActiveElement('[broken-selector', root))).not.toThrow();

    Effect.runSync(
      restoreFocusState(
        {
          elementId: '#disabled-input',
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 0,
          selectionDirection: 'none',
        },
        root,
      ),
    );
    expect(document.activeElement).not.toBe(disabledInput);

    expect(() =>
      Effect.runSync(
        restoreSelection({
          elementPath: '#email-input',
          start: 0,
          end: 6,
          direction: 'forward',
        }),
      ),
    ).not.toThrow();
  });

  test('GLSLCompiler normalizes unusual names and missing state maps deterministically', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'ready-go'],
        [768, 'HTTP/2'],
      ] as const,
    });

    const result = GLSLCompiler.compile(boundary, {
      'ready-go': { HTTP2Rate: 1, mixValue: -1 },
      'HTTP/2': {} as Record<string, number>,
    });

    expect(result.defines.map((define) => define.name)).toEqual(['STATE_READY_GO', 'STATE_HTTP_2', 'STATE_COUNT']);
    expect(result.uniforms.find((uniform) => uniform.name === 'u_http2_rate')?.type).toBe('int');
    expect(result.uniforms.find((uniform) => uniform.name === 'u_mix_value')?.type).toBe('float');
    expect(GLSLCompiler.serialize(result)).toContain('uniform float u_mix_value;');
  });

  test('GLSLCompiler skips undefined state maps and preserves int fallback declarations', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'expanded'],
      ] as const,
    });

    const result = GLSLCompiler.compile(boundary, {
      compact: { count: 1 },
      expanded: undefined as unknown as Record<string, number>,
    });

    expect(result.uniformValues.u_count).toBe(1);
    expect(result.uniforms.find((uniform) => uniform.name === 'u_count')?.type).toBe('int');
    expect(GLSLCompiler.serialize(result)).toContain('uniform int u_count;');
  });

  test('GLSLCompiler serialize omits inline comments when compile metadata lacks them', () => {
    const serialized = GLSLCompiler.serialize({
      defines: [{ name: 'STATE_COMPACT', value: '0' }],
      uniforms: [{ name: 'u_state', type: 'int' }],
      uniformValues: { u_state: 0 },
      declarations: ['#define STATE_COMPACT 0', '', 'uniform int u_state;'].join('\n'),
      bindUniforms: [
        'function bindUniforms(gl, program, values) {',
        "  gl.uniform1i(gl.getUniformLocation(program, 'u_state'), values['u_state']);",
        '}',
      ].join('\n'),
    });

    expect(serialized).toContain('#define STATE_COMPACT 0');
    expect(serialized).toContain('uniform int u_state;');
    expect(serialized).not.toContain('// undefined');
  });
});
