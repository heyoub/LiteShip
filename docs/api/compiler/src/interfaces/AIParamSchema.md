[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIParamSchema

# Interface: AIParamSchema

Defined in: [compiler/src/ai-manifest.ts:67](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L67)

Parameter schema for a single [AIAction](AIAction.md) parameter.

Mirrors a subset of JSON Schema (`type`, `enum`, `min`, `max`) that is
losslessly translatable to both tool-calling and schema validation.

## Properties

### description

> `readonly` **description**: `string`

Defined in: [compiler/src/ai-manifest.ts:79](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L79)

Human-readable description.

***

### enum?

> `readonly` `optional` **enum?**: readonly `string`[]

Defined in: [compiler/src/ai-manifest.ts:71](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L71)

Permitted enum values.

***

### max?

> `readonly` `optional` **max?**: `number`

Defined in: [compiler/src/ai-manifest.ts:75](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L75)

Numeric maximum (inclusive).

***

### min?

> `readonly` `optional` **min?**: `number`

Defined in: [compiler/src/ai-manifest.ts:73](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L73)

Numeric minimum (inclusive).

***

### required

> `readonly` **required**: `boolean`

Defined in: [compiler/src/ai-manifest.ts:77](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L77)

Whether the parameter must be present.

***

### type

> `readonly` **type**: `string`

Defined in: [compiler/src/ai-manifest.ts:69](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L69)

JSON Schema type (`'string'` | `'number'` | `'integer'` | `'boolean'` | `'array'` | `'object'`).
