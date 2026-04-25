[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / AIManifest

# Interface: AIManifest

Defined in: [compiler/src/ai-manifest.ts:104](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L104)

Top-level AI manifest describing the UI surface to an LLM.

Consumed by [AIManifestCompiler.compile](../variables/AIManifestCompiler.md#compile) to produce tool
definitions, a JSON Schema, and a system prompt in a single pass.

## Properties

### actions

> `readonly` **actions**: `Record`\<`string`, [`AIAction`](AIAction.md)\>

Defined in: [compiler/src/ai-manifest.ts:112](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L112)

Invocable actions.

***

### constraints

> `readonly` **constraints**: readonly [`AIConstraint`](AIConstraint.md)[]

Defined in: [compiler/src/ai-manifest.ts:114](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L114)

Cross-cutting invariants.

***

### dimensions

> `readonly` **dimensions**: `Record`\<`string`, [`AIDimension`](AIDimension.md)\>

Defined in: [compiler/src/ai-manifest.ts:108](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L108)

State-space dimensions.

***

### slots

> `readonly` **slots**: `Record`\<`string`, [`AISlot`](AISlot.md)\>

Defined in: [compiler/src/ai-manifest.ts:110](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L110)

Content slots.

***

### version

> `readonly` **version**: `string`

Defined in: [compiler/src/ai-manifest.ts:106](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L106)

Manifest schema version.
