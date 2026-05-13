[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / MorphCallbacks

# Interface: MorphCallbacks

Defined in: [web/src/types.ts:132](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L132)

Morph lifecycle callbacks.

## Methods

### afterAdd()?

> `optional` **afterAdd**(`node`): `void`

Defined in: [web/src/types.ts:134](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L134)

#### Parameters

##### node

`Node`

#### Returns

`void`

***

### beforeAttributeUpdate()?

> `optional` **beforeAttributeUpdate**(`element`, `name`, `value`): `boolean`

Defined in: [web/src/types.ts:135](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L135)

#### Parameters

##### element

`Element`

##### name

`string`

##### value

`string` \| `null`

#### Returns

`boolean`

***

### beforeRemove()?

> `optional` **beforeRemove**(`node`): `boolean`

Defined in: [web/src/types.ts:133](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L133)

#### Parameters

##### node

`Node`

#### Returns

`boolean`
