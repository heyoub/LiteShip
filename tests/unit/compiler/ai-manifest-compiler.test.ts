/**
 * AIManifestCompiler -- manifest -> tool definitions + JSON Schema + system prompts + validation.
 *
 * Property: validateAIOutput accumulates ALL errors (never short-circuits after first).
 * Property: tool definitions have 1:1 correspondence with manifest actions.
 * Property: JSON Schema dimension enums match manifest dimension states.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { AIManifestCompiler } from '@czap/compiler';
import type { AIManifest } from '@czap/compiler';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const minimalManifest: AIManifest = {
  version: '1.0',
  dimensions: {},
  slots: {},
  actions: {},
  constraints: [],
};

const fullManifest: AIManifest = {
  version: '1.0',
  dimensions: {
    layout: {
      states: ['mobile', 'tablet', 'desktop'],
      current: 'desktop',
      exclusive: true,
      description: 'Viewport layout tier',
    },
    theme: {
      states: ['light', 'dark'],
      current: 'light',
      exclusive: true,
      description: 'Color theme',
    },
  },
  slots: {
    hero: {
      accepts: ['image', 'video', 'animation'],
      description: 'Hero section content',
    },
  },
  actions: {
    setLayout: {
      params: {
        tier: {
          type: 'string',
          enum: ['mobile', 'tablet', 'desktop'],
          required: true,
          description: 'Target layout tier',
        },
      },
      effects: ['reflow', 'rerender'],
      description: 'Change the layout tier',
    },
    setOpacity: {
      params: {
        value: { type: 'number', min: 0, max: 1, required: true, description: 'Opacity value' },
        animate: { type: 'boolean', required: false, description: 'Whether to animate' },
      },
      effects: ['repaint'],
      description: 'Set element opacity',
    },
  },
  constraints: [{ id: 'C1', condition: null, message: 'Mobile must use single column layout' }],
};

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

describe('AIManifestCompiler.compile', () => {
  test('empty manifest produces valid result', () => {
    const result = AIManifestCompiler.compile(minimalManifest);

    expect(result.manifest).toBe(minimalManifest);
    expect(result.toolDefinitions).toHaveLength(0);
    expect(result.jsonSchema).toBeDefined();
    expect(result.systemPrompt).toContain('1.0');
  });

  test('tool definitions match manifest actions 1:1', () => {
    const result = AIManifestCompiler.compile(fullManifest);

    expect(result.toolDefinitions).toHaveLength(2);
    const names = result.toolDefinitions.map((t) => t.name);
    expect(names).toContain('setLayout');
    expect(names).toContain('setOpacity');
  });

  test('tool parameters include required array', () => {
    const result = AIManifestCompiler.compile(fullManifest);
    const setLayout = result.toolDefinitions.find((t) => t.name === 'setLayout')!;

    expect((setLayout.parameters as any).required).toContain('tier');
  });

  test('optional params excluded from required array', () => {
    const result = AIManifestCompiler.compile(fullManifest);
    const setOpacity = result.toolDefinitions.find((t) => t.name === 'setOpacity')!;

    expect((setOpacity.parameters as any).required).toContain('value');
    expect((setOpacity.parameters as any).required).not.toContain('animate');
  });
});

// ---------------------------------------------------------------------------
// generateToolDefinitions()
// ---------------------------------------------------------------------------

describe('AIManifestCompiler.generateToolDefinitions', () => {
  test('enum constraints preserved in param schema', () => {
    const tools = AIManifestCompiler.generateToolDefinitions(fullManifest);
    const setLayout = tools.find((t) => t.name === 'setLayout')!;
    const tierSchema = (setLayout.parameters as any).properties.tier;

    expect(tierSchema.enum).toEqual(['mobile', 'tablet', 'desktop']);
  });

  test('min/max constraints preserved in param schema', () => {
    const tools = AIManifestCompiler.generateToolDefinitions(fullManifest);
    const setOpacity = tools.find((t) => t.name === 'setOpacity')!;
    const valueSchema = (setOpacity.parameters as any).properties.value;

    expect(valueSchema.minimum).toBe(0);
    expect(valueSchema.maximum).toBe(1);
  });

  test('returns section includes success and effects', () => {
    const tools = AIManifestCompiler.generateToolDefinitions(fullManifest);

    for (const tool of tools) {
      expect((tool.returns as any).properties.success).toBeDefined();
      expect((tool.returns as any).properties.effects).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// generateSystemPrompt()
// ---------------------------------------------------------------------------

describe('AIManifestCompiler.generateSystemPrompt', () => {
  test('includes version', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(fullManifest);
    expect(prompt).toContain('v1.0');
  });

  test('lists all dimensions with states', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(fullManifest);
    expect(prompt).toContain('layout');
    expect(prompt).toContain('mobile, tablet, desktop');
    expect(prompt).toContain('current: desktop');
  });

  test('marks exclusive dimensions', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(fullManifest);
    expect(prompt).toContain('exclusive');
  });

  test('marks non-exclusive dimensions and includes optional parameter metadata when present', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt({
      ...minimalManifest,
      dimensions: {
        motion: {
          states: ['still', 'kinetic'],
          current: 'still',
          exclusive: false,
          description: 'Motion capability',
        },
      },
      actions: {
        annotate: {
          description: 'Annotate the scene',
          effects: [],
          params: {
            label: {
              type: 'string',
              required: false,
              enum: ['hero', 'footer'],
              min: 1,
              max: 10,
              description: 'Annotation label',
            },
          },
        },
      },
    });

    expect(prompt).toContain('(non-exclusive)');
    expect(prompt).toContain('(optional)');
    expect(prompt).toContain('[hero | footer]');
    expect(prompt).toContain('min=1');
    expect(prompt).toContain('max=10');
  });

  test('lists slots with accepted types', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(fullManifest);
    expect(prompt).toContain('hero');
    expect(prompt).toContain('image, video, animation');
  });

  test('lists actions with parameters', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(fullManifest);
    expect(prompt).toContain('setLayout');
    expect(prompt).toContain('tier');
    expect(prompt).toContain('(required)');
  });

  test('lists constraints', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(fullManifest);
    expect(prompt).toContain('[C1]');
    expect(prompt).toContain('Mobile must use single column layout');
  });

  test('empty manifest produces minimal prompt', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt(minimalManifest);
    expect(prompt).toContain('1.0');
    expect(prompt).not.toContain('## Dimensions');
    expect(prompt).not.toContain('## Slots');
  });

  test('omits parameter and effects sections for actions without params or effects', () => {
    const prompt = AIManifestCompiler.generateSystemPrompt({
      ...minimalManifest,
      actions: {
        ping: {
          params: {},
          effects: [],
          description: 'Ping the host',
        },
      },
    });

    expect(prompt).toContain('### ping');
    expect(prompt).not.toContain('Parameters:');
    expect(prompt).not.toContain('Effects:');
  });
});

// ---------------------------------------------------------------------------
// validateAIOutput()
// ---------------------------------------------------------------------------

describe('AIManifestCompiler.validateAIOutput', () => {
  test('null output returns error', () => {
    const result = AIManifestCompiler.validateAIOutput(null, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('null');
  });

  test('undefined output returns error', () => {
    const result = AIManifestCompiler.validateAIOutput(undefined, fullManifest);
    expect(result.valid).toBe(false);
  });

  test('non-object output returns error', () => {
    const result = AIManifestCompiler.validateAIOutput('string', fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('object');
  });

  test('valid output with no action passes', () => {
    const result = AIManifestCompiler.validateAIOutput({}, fullManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('unknown action name produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ action: 'nonexistent' }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('nonexistent');
  });

  test('missing required parameter produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ action: 'setLayout', params: {} }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('tier');
  });

  test('valid action with correct params passes', () => {
    const result = AIManifestCompiler.validateAIOutput(
      { action: 'setLayout', params: { tier: 'mobile' } },
      fullManifest,
    );
    expect(result.valid).toBe(true);
  });

  test('wrong param type produces error', () => {
    const result = AIManifestCompiler.validateAIOutput(
      { action: 'setOpacity', params: { value: 'not-a-number' } },
      fullManifest,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('number')]));
  });

  test('enum violation produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ action: 'setLayout', params: { tier: 'huge' } }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('huge');
  });

  test('range violation produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ action: 'setOpacity', params: { value: 1.5 } }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('<=');
  });

  test('unknown dimension produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ dimensions: { nonexistent: 'foo' } }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('nonexistent');
  });

  test('invalid dimension state produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ dimensions: { layout: 'huge' } }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('huge');
  });

  test('valid dimension state passes', () => {
    const result = AIManifestCompiler.validateAIOutput({ dimensions: { layout: 'mobile' } }, fullManifest);
    expect(result.valid).toBe(true);
  });

  test('unknown slot produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ slots: { nonexistent: 'image' } }, fullManifest);
    expect(result.valid).toBe(false);
  });

  test('invalid slot content type produces error', () => {
    const result = AIManifestCompiler.validateAIOutput({ slots: { hero: 'unsupported' } }, fullManifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unsupported');
  });

  test('valid slot content type passes', () => {
    const result = AIManifestCompiler.validateAIOutput({ slots: { hero: 'video' } }, fullManifest);
    expect(result.valid).toBe(true);
  });

  test('multiple errors accumulated', () => {
    const result = AIManifestCompiler.validateAIOutput(
      {
        action: 'setOpacity',
        params: { value: 'wrong-type' },
        dimensions: { nonexistent: 'foo' },
        slots: { nonexistent: 'bar' },
      },
      fullManifest,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('validates boolean, integer, array, object, and minimum branches', () => {
    const manifest: AIManifest = {
      ...minimalManifest,
      actions: {
        configure: {
          description: 'Configure advanced options',
          effects: [],
          params: {
            enabled: { type: 'boolean', required: true, description: 'Enable the feature' },
            retries: { type: 'integer', required: true, min: 1, description: 'Retry count' },
            tags: { type: 'array', required: true, description: 'Tag list' },
            metadata: { type: 'object', required: true, description: 'Metadata object' },
          },
        },
      },
    };

    const result = AIManifestCompiler.validateAIOutput(
      {
        action: 'configure',
        params: {
          enabled: 'yes',
          retries: 0.5,
          tags: 'one',
          metadata: [],
        },
      },
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Parameter 'enabled' must be a boolean"),
        expect.stringContaining("Parameter 'retries' must be an integer"),
        expect.stringContaining("Parameter 'tags' must be an array"),
        expect.stringContaining("Parameter 'metadata' must be an object"),
        expect.stringContaining("Parameter 'retries' must be >= 1"),
      ]),
    );
  });

  test('ignores non-string dimension and slot payloads while still validating numeric minimums', () => {
    const manifest: AIManifest = {
      ...fullManifest,
      actions: {
        setSpacing: {
          description: 'Set spacing',
          effects: [],
          params: {
            gap: { type: 'number', min: 2, required: true, description: 'Gap size' },
          },
        },
      },
    };

    const result = AIManifestCompiler.validateAIOutput(
      {
        action: 'setSpacing',
        params: { gap: 1 },
        dimensions: { layout: 123 },
        slots: { hero: { kind: 'image' } },
      },
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([expect.stringContaining("Parameter 'gap' must be >= 2")]);
  });

  test('validates string and object branches for non-number payloads, including null object payloads', () => {
    const manifest: AIManifest = {
      ...minimalManifest,
      actions: {
        configure: {
          description: 'Configure labels',
          effects: [],
          params: {
            label: { type: 'string', required: true, description: 'Display label' },
            metadata: { type: 'object', required: true, description: 'Metadata object' },
          },
        },
      },
    };

    const result = AIManifestCompiler.validateAIOutput(
      {
        action: 'configure',
        params: {
          label: 42,
          metadata: [],
        },
      },
      manifest,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Parameter 'label' must be a string"),
        expect.stringContaining("Parameter 'metadata' must be an object, got array"),
      ]),
    );

    const primitiveObjectResult = AIManifestCompiler.validateAIOutput(
      {
        action: 'configure',
        params: {
          label: 'ok',
          metadata: 'bad-shape',
        },
      },
      manifest,
    );

    expect(primitiveObjectResult.valid).toBe(false);
    expect(primitiveObjectResult.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("Parameter 'metadata' must be an object, got string")]),
    );
  });

  test('validates absent params, integer strings, and null object payload fallbacks', () => {
    const manifest: AIManifest = {
      ...minimalManifest,
      actions: {
        configure: {
          description: 'Configure labels',
          effects: [],
          params: {
            count: { type: 'integer', required: true, description: 'Expected count' },
            metadata: { type: 'object', required: true, description: 'Metadata object' },
          },
        },
      },
    };

    const missingParams = AIManifestCompiler.validateAIOutput(
      {
        action: 'configure',
      },
      manifest,
    );
    expect(missingParams.valid).toBe(false);
    expect(missingParams.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Missing required parameter 'count'"),
        expect.stringContaining("Missing required parameter 'metadata'"),
      ]),
    );

    const wrongTypes = AIManifestCompiler.validateAIOutput(
      {
        action: 'configure',
        params: {
          count: '2',
          metadata: {},
        },
      },
      manifest,
    );
    expect(wrongTypes.valid).toBe(false);
    expect(wrongTypes.errors).toEqual([expect.stringContaining("Parameter 'count' must be an integer, got string")]);
  });
});

// ---------------------------------------------------------------------------
// Property-based
// ---------------------------------------------------------------------------

describe('AIManifestCompiler properties', () => {
  test('tool count equals action count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (actionCount) => {
        const actions: AIManifest['actions'] = {};
        for (let i = 0; i < actionCount; i++) {
          actions[`action${i}`] = {
            params: {},
            effects: [],
            description: `Action ${i}`,
          };
        }
        const manifest: AIManifest = { ...minimalManifest, actions };
        const result = AIManifestCompiler.compile(manifest);
        expect(result.toolDefinitions).toHaveLength(actionCount);
      }),
    );
  });
});
