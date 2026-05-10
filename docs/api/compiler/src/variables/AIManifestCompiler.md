[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIManifestCompiler

# Variable: AIManifestCompiler

> `const` **AIManifestCompiler**: `object`

Defined in: compiler/src/ai-manifest.ts:596

AI manifest compiler namespace.

Compiles an [AIManifest](../interfaces/AIManifest.md) into tool definitions (function calling format),
a JSON Schema for validation, and a system prompt describing available
dimensions, slots, actions, and constraints. Also provides validation of
AI-generated output against the manifest schema.

## Type Declaration

### compile

> **compile**: (`manifest`) => [`AIManifestCompileResult`](../interfaces/AIManifestCompileResult.md)

Compile an AI manifest into tool definitions, JSON Schema, and a system prompt.

#### Parameters

##### manifest

[`AIManifest`](../interfaces/AIManifest.md)

The AI manifest to compile

#### Returns

[`AIManifestCompileResult`](../interfaces/AIManifestCompileResult.md)

An [AIManifestCompileResult](../interfaces/AIManifestCompileResult.md) with tools, schema, and prompt

#### Example

```ts
import { AIManifestCompiler } from '@czap/compiler';

const manifest = {
  version: '1.0', dimensions: {}, slots: {}, constraints: [],
  actions: {
    setTheme: {
      params: { theme: { type: 'string', enum: ['light', 'dark'], required: true, description: 'Theme' } },
      effects: ['theme-change'], description: 'Set the color theme',
    },
  },
};
const result = AIManifestCompiler.compile(manifest);
console.log(result.toolDefinitions[0].name); // 'setTheme'
console.log(result.systemPrompt); // system prompt describing available actions
```

### generateSystemPrompt

> **generateSystemPrompt**: (`manifest`) => `string`

Generate a system prompt describing all available dimensions, slots,
actions, and constraints from the manifest.

#### Parameters

##### manifest

[`AIManifest`](../interfaces/AIManifest.md)

The AI manifest to describe

#### Returns

`string`

A markdown-formatted system prompt string

#### Example

```ts
import { AIManifestCompiler } from '@czap/compiler';

const prompt = AIManifestCompiler.generateSystemPrompt(manifest);
// Use as the system prompt for an LLM conversation
```

### generateToolDefinitions

> **generateToolDefinitions**: (`manifest`) => readonly [`AIToolDefinition`](../interfaces/AIToolDefinition.md)[]

Generate tool definitions (function calling format) from an AIManifest's actions.

#### Parameters

##### manifest

[`AIManifest`](../interfaces/AIManifest.md)

The AI manifest containing action definitions

#### Returns

readonly [`AIToolDefinition`](../interfaces/AIToolDefinition.md)[]

An array of [AIToolDefinition](../interfaces/AIToolDefinition.md) objects

#### Example

```ts
import { AIManifestCompiler } from '@czap/compiler';

const tools = AIManifestCompiler.generateToolDefinitions(manifest);
// tools[0] => { name: 'setTheme', description: '...', parameters: {...}, returns: {...} }
```

### validateAIOutput

> **validateAIOutput**: (`output`, `manifest`) => `object`

Validate AI-generated output against a manifest's constraints and schema.
Returns `{ valid: true, errors: [] }` or `{ valid: false, errors: [...] }`.

#### Parameters

##### output

`unknown`

The AI-generated output object to validate

##### manifest

[`AIManifest`](../interfaces/AIManifest.md)

The manifest defining valid actions, dimensions, and slots

#### Returns

`object`

An object with `valid` boolean and `errors` array

##### errors

> **errors**: readonly `string`[]

##### valid

> **valid**: `boolean`

#### Example

```ts
import { AIManifestCompiler } from '@czap/compiler';

const manifest = { version: '1.0', dimensions: {}, slots: {}, constraints: [],
  actions: { setLayout: { params: { cols: { type: 'number', required: true, min: 1, max: 12, description: 'Column count' } }, effects: [], description: 'Set grid layout' } },
};
const check = AIManifestCompiler.validateAIOutput(
  { action: 'setLayout', params: { cols: 3 } },
  manifest,
);
console.log(check.valid); // true
```

## Example

```ts
import { AIManifestCompiler } from '@czap/compiler';

const manifest = {
  version: '1.0',
  dimensions: { theme: { states: ['light', 'dark'], current: 'light', exclusive: true, description: 'Color theme' } },
  slots: { hero: { accepts: ['image', 'video'], description: 'Hero section' } },
  actions: { setTheme: { params: { theme: { type: 'string', enum: ['light', 'dark'], required: true, description: 'Theme' } }, effects: ['repaint'], description: 'Switch theme' } },
  constraints: [],
};
const compiled = AIManifestCompiler.compile(manifest);
const valid = AIManifestCompiler.validateAIOutput(
  { action: 'setTheme', params: { theme: 'dark' } },
  manifest,
);
```
