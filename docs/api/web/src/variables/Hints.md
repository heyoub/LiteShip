[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / Hints

# Variable: Hints

> `const` **Hints**: `object`

Defined in: web/src/morph/hints.ts:279

Consolidated namespace export matching the spine contract.

## Type Declaration

### empty

> **empty**: () => [`MorphHints`](../interfaces/MorphHints.md)

Create empty morph hints.

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### fromElement

> **fromElement**: (`element`) => [`MorphHints`](../interfaces/MorphHints.md)

Extract hints from a DOM element's data attributes.

#### Parameters

##### element

`Element`

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### merge

> **merge**: (...`hints`) => [`MorphHints`](../interfaces/MorphHints.md)

Merge multiple morph hints into one.

#### Parameters

##### hints

...[`MorphHints`](../interfaces/MorphHints.md)[]

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### preserveFocus

> **preserveFocus**: (...`selectors`) => [`MorphHints`](../interfaces/MorphHints.md)

Create morph hints for focus preservation.

#### Parameters

##### selectors

...`string`[]

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### preserveIds

> **preserveIds**: (...`ids`) => [`MorphHints`](../interfaces/MorphHints.md)

Create morph hints that preserve specific element IDs.

#### Parameters

##### ids

...`string`[]

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### preserveScroll

> **preserveScroll**: (...`selectors`) => [`MorphHints`](../interfaces/MorphHints.md)

Create morph hints for scroll preservation.

#### Parameters

##### selectors

...`string`[]

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### withIdMap

> **withIdMap**: (`map`) => [`MorphHints`](../interfaces/MorphHints.md)

Create morph hints with ID remapping.

#### Parameters

##### map

[`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<`string`, `string`\>

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)

### withSemanticIds

> **withSemanticIds**: (...`ids`) => [`MorphHints`](../interfaces/MorphHints.md)

Create morph hints with semantic ID mappings.

#### Parameters

##### ids

...`string`[]

#### Returns

[`MorphHints`](../interfaces/MorphHints.md)
