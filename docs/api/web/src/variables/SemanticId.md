[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / SemanticId

# Variable: SemanticId

> `const` **SemanticId**: `object`

Defined in: web/src/morph/semantic-id.ts:238

Consolidated namespace export matching the spine contract.

## Type Declaration

### ATTR

> **ATTR**: `"data-czap-id"`

The attribute name for semantic IDs.

### buildIndex

> **buildIndex**: (`root`) => [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<`string`, `Element`\>

Build an index of elements by semantic ID.

#### Parameters

##### root

`Element`

#### Returns

[`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<`string`, `Element`\>

### find

> **find**: (`root`, `id`) => `Element` \| `null`

Find an element by semantic ID within a root.

#### Parameters

##### root

`Element`

##### id

`string`

#### Returns

`Element` \| `null`

### findBestMatch

> **findBestMatch**: (`target`, `candidates`) => \{ `element`: `Element`; `result`: [`MatchResult`](../interfaces/MatchResult.md); \} \| `null`

Find the best matching element in a list of candidates.
Returns the match with highest priority.

#### Parameters

##### target

`Element`

##### candidates

`Element`[]

#### Returns

\{ `element`: `Element`; `result`: [`MatchResult`](../interfaces/MatchResult.md); \} \| `null`

### generate

> **generate**: (`element`, `index`) => `string`

Generate a semantic ID for an element based on its position.
Used when no explicit semantic ID is provided.

#### Parameters

##### element

`Element`

##### index

`number`

#### Returns

`string`

### get

> **get**: (`element`) => `string` \| `null`

Get the semantic ID of an element.

#### Parameters

##### element

`Element`

#### Returns

`string` \| `null`

### matches

> **matches**: (`a`, `b`) => `boolean`

Check if two elements have matching semantic IDs.

#### Parameters

##### a

`Element`

##### b

`Element`

#### Returns

`boolean`

### matchNodes

> **matchNodes**: (`oldNode`, `newNode`) => [`MatchResult`](../interfaces/MatchResult.md)

Match nodes with priority ordering:
1. Semantic ID (highest priority)
2. DOM ID
3. Structural match (tag name, attributes)

#### Parameters

##### oldNode

`Element`

##### newNode

`Element`

#### Returns

[`MatchResult`](../interfaces/MatchResult.md)

### set

> **set**: (`element`, `id`) => `void`

Set the semantic ID of an element.

#### Parameters

##### element

`Element`

##### id

`string`

#### Returns

`void`
