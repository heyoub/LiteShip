[**czap**](../../../README.md)

***

[czap](../../../README.md) / [mcp-server/src](../README.md) / JsonRpcServer

# Variable: JsonRpcServer

> `const` **JsonRpcServer**: `object`

Defined in: [mcp-server/src/jsonrpc.ts:222](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L222)

Namespaced public surface of the kernel.

## Type Declaration

### errorResponse

> `readonly` **errorResponse**: (`id`, `code`, `message`, `data?`) => [`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md) = `_errorResponse`

Construct a -32700 / -32600 / -32601 / -32602 / -32603 error response.

#### Parameters

##### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

##### code

`number`

##### message

`string`

##### data?

`unknown`

#### Returns

[`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)

### parse

> `readonly` **parse**: (`line`) => [`ParseOutcome`](../type-aliases/ParseOutcome.md) = `_parse`

Parse a single JSON-RPC line. Distinguishes:
- parse failure → `parse-error` (§4.2)
- empty array → `invalid-request` per §6
- non-object scalar → `invalid-request`
- object with bad `jsonrpc`/`method` → `invalid-request`
- object with `id` present → `request`
- object without `id` → `notification`
- non-empty array → `batch` with per-element outcomes

Note (§4 id-vs-notification): `"id": null` is a Request with id null,
not a notification. Only an absent id field marks a notification.

#### Parameters

##### line

`string`

#### Returns

[`ParseOutcome`](../type-aliases/ParseOutcome.md)

### successResponse

> `readonly` **successResponse**: (`id`, `result`) => [`JsonRpcSuccess`](../interfaces/JsonRpcSuccess.md) = `_successResponse`

Construct a success response (§5).

#### Parameters

##### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

##### result

`unknown`

#### Returns

[`JsonRpcSuccess`](../interfaces/JsonRpcSuccess.md)
