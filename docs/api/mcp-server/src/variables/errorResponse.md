[**czap**](../../../README.md)

***

[czap](../../../README.md) / [mcp-server/src](../README.md) / errorResponse

# Variable: errorResponse

> `const` **errorResponse**: (`id`, `code`, `message`, `data?`) => [`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md) = `_errorResponse`

Defined in: [mcp-server/src/jsonrpc.ts:146](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L146)

Construct a -32700 / -32600 / -32601 / -32602 / -32603 error response.

## Parameters

### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

### code

`number`

### message

`string`

### data?

`unknown`

## Returns

[`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)
