[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DenseStore

# Interface: DenseStore

Defined in: core/src/ecs.ts:37

## Properties

### \_dense

> `readonly` **\_dense**: `true`

Defined in: core/src/ecs.ts:40

***

### capacity

> `readonly` **capacity**: `number`

Defined in: core/src/ecs.ts:39

***

### count

> **count**: `number`

Defined in: core/src/ecs.ts:48

Current number of live entries

***

### data

> `readonly` **data**: `Float64Array`

Defined in: core/src/ecs.ts:46

The raw Float64Array backing store

***

### entityToIndex

> `readonly` **entityToIndex**: [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<[`EntityId`](../type-aliases/EntityId.md), `number`\>

Defined in: core/src/ecs.ts:42

Entity ID `->` index in the data array

***

### indexToEntity

> `readonly` **indexToEntity**: [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: core/src/ecs.ts:44

Index `->` Entity ID (for iteration)

***

### name

> `readonly` **name**: `string`

Defined in: core/src/ecs.ts:38

## Methods

### delete()

> **delete**(`entityId`): `boolean`

Defined in: core/src/ecs.ts:53

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`boolean`

***

### entities()

> **entities**(): readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: core/src/ecs.ts:58

All entity IDs with values, in dense order

#### Returns

readonly [`EntityId`](../type-aliases/EntityId.md)[]

***

### get()

> **get**(`entityId`): `number` \| `undefined`

Defined in: core/src/ecs.ts:50

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`number` \| `undefined`

***

### has()

> **has**(`entityId`): `boolean`

Defined in: core/src/ecs.ts:52

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`boolean`

***

### reset()

> **reset**(): `void`

Defined in: core/src/ecs.ts:54

#### Returns

`void`

***

### set()

> **set**(`entityId`, `value`): `void`

Defined in: core/src/ecs.ts:51

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

##### value

`number`

#### Returns

`void`

***

### view()

> **view**(): `Float64Array`

Defined in: core/src/ecs.ts:56

Direct typed array view for tight-loop iteration (length = count)

#### Returns

`Float64Array`
