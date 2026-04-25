[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / DenseStore

# Interface: DenseStore

Defined in: [core/src/ecs.ts:37](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L37)

## Properties

### \_dense

> `readonly` **\_dense**: `true`

Defined in: [core/src/ecs.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L40)

***

### capacity

> `readonly` **capacity**: `number`

Defined in: [core/src/ecs.ts:39](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L39)

***

### count

> **count**: `number`

Defined in: [core/src/ecs.ts:48](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L48)

Current number of live entries

***

### data

> `readonly` **data**: `Float64Array`

Defined in: [core/src/ecs.ts:46](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L46)

The raw Float64Array backing store

***

### entityToIndex

> `readonly` **entityToIndex**: [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<[`EntityId`](../type-aliases/EntityId.md), `number`\>

Defined in: [core/src/ecs.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L42)

Entity ID `->` index in the data array

***

### indexToEntity

> `readonly` **indexToEntity**: [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [core/src/ecs.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L44)

Index `->` Entity ID (for iteration)

***

### name

> `readonly` **name**: `string`

Defined in: [core/src/ecs.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L38)

## Methods

### delete()

> **delete**(`entityId`): `boolean`

Defined in: [core/src/ecs.ts:53](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L53)

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`boolean`

***

### entities()

> **entities**(): readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [core/src/ecs.ts:58](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L58)

All entity IDs with values, in dense order

#### Returns

readonly [`EntityId`](../type-aliases/EntityId.md)[]

***

### get()

> **get**(`entityId`): `number` \| `undefined`

Defined in: [core/src/ecs.ts:50](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L50)

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`number` \| `undefined`

***

### has()

> **has**(`entityId`): `boolean`

Defined in: [core/src/ecs.ts:52](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L52)

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`boolean`

***

### reset()

> **reset**(): `void`

Defined in: [core/src/ecs.ts:54](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L54)

#### Returns

`void`

***

### set()

> **set**(`entityId`, `value`): `void`

Defined in: [core/src/ecs.ts:51](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L51)

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

Defined in: [core/src/ecs.ts:56](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L56)

Direct typed array view for tight-loop iteration (length = count)

#### Returns

`Float64Array`
