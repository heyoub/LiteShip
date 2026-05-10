[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / QuantizerOutputs

# Interface: QuantizerOutputs\<B\>

Defined in: [quantizer/src/quantizer.ts:95](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L95)

Per-target output tables keyed by boundary state.

Each optional field is a record mapping every state in `B` to a target-
specific value shape: CSS allows `string | number`, GLSL/WGSL are numeric
only, ARIA is string only, AI is unconstrained. Missing fields simply
skip that target during dispatch.

## Type Parameters

### B

`B` *extends* [`Boundary.Shape`](#)

## Properties

### ai?

> `readonly` `optional` **ai?**: [`OutputsFor`](../../../core/src/type-aliases/OutputsFor.md)\<`B`, `Record`\<`string`, `unknown`\>\>

Defined in: [quantizer/src/quantizer.ts:105](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L105)

AI-facing signals per state (free-form; consumed by LLMAdapter).

***

### aria?

> `readonly` `optional` **aria?**: [`OutputsFor`](../../../core/src/type-aliases/OutputsFor.md)\<`B`, `Record`\<`string`, `string`\>\>

Defined in: [quantizer/src/quantizer.ts:103](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L103)

ARIA attribute map per state (string values only).

***

### css?

> `readonly` `optional` **css?**: [`OutputsFor`](../../../core/src/type-aliases/OutputsFor.md)\<`B`, `Record`\<`string`, `string` \| `number`\>\>

Defined in: [quantizer/src/quantizer.ts:97](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L97)

CSS property map per state (values are raw CSS, e.g. `'16px'` or `1`).

***

### glsl?

> `readonly` `optional` **glsl?**: [`OutputsFor`](../../../core/src/type-aliases/OutputsFor.md)\<`B`, `Record`\<`string`, `number`\>\>

Defined in: [quantizer/src/quantizer.ts:99](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L99)

GLSL uniform values per state (numeric only).

***

### wgsl?

> `readonly` `optional` **wgsl?**: [`OutputsFor`](../../../core/src/type-aliases/OutputsFor.md)\<`B`, `Record`\<`string`, `number`\>\>

Defined in: [quantizer/src/quantizer.ts:101](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L101)

WGSL uniform values per state (numeric only).
