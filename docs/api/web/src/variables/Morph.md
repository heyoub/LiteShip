[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / Morph

# Variable: Morph

> `const` **Morph**: `object`

Defined in: web/src/morph/diff.ts:138

DOM morph namespace.

## Type Declaration

### defaultConfig

> **defaultConfig**: [`MorphConfig`](../interfaces/MorphConfig.md)

Default morph configuration.

### morph

> **morph**: (`oldNode`, `newHTML`, `config?`, `hints?`) => `Effect`\<`void`\>

Morph an existing DOM element to match new HTML using idiomorph-inspired
diffing that minimizes DOM mutations and preserves element identity.

#### Parameters

##### oldNode

`Element`

##### newHTML

`string`

##### config?

`Partial`\<[`MorphConfig`](../interfaces/MorphConfig.md)\>

##### hints?

[`MorphHints`](../interfaces/MorphHints.md)

#### Returns

`Effect`\<`void`\>

### morphWithState

> **morphWithState**: (`oldNode`, `newHTML`, `config?`, `hints?`) => `Effect`\<[`MorphResult`](../type-aliases/MorphResult.md)\>

Morph with physical state capture and restore.

#### Parameters

##### oldNode

`Element`

##### newHTML

`string`

##### config?

`Partial`\<[`MorphConfig`](../interfaces/MorphConfig.md)\>

##### hints?

[`MorphHints`](../interfaces/MorphHints.md)

#### Returns

`Effect`\<[`MorphResult`](../type-aliases/MorphResult.md)\>

### parseHTML

> **parseHTML**: (`html`) => `DocumentFragment`

Parse an HTML string into a DocumentFragment using a template element.

#### Parameters

##### html

`string`

#### Returns

`DocumentFragment`
