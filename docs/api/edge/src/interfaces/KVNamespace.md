[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / KVNamespace

# Interface: KVNamespace

Defined in: [edge/src/kv-cache.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/kv-cache.ts#L23)

Minimal KV namespace interface -- compatible with Cloudflare Workers KV,
Deno KV, or any adapter that implements get/put with string values.

## Methods

### get()

> **get**(`key`): `Promise`\<`string` \| `null`\>

Defined in: [edge/src/kv-cache.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/kv-cache.ts#L24)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### put()

> **put**(`key`, `value`, `options?`): `Promise`\<`void`\>

Defined in: [edge/src/kv-cache.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/kv-cache.ts#L25)

#### Parameters

##### key

`string`

##### value

`string`

##### options?

###### expirationTtl?

`number`

#### Returns

`Promise`\<`void`\>
