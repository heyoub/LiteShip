[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [mcp-server/src](../README.md) / dispatch

# Function: dispatch()

> **dispatch**(`msg`): `Promise`\<[`JsonRpcResponse`](../type-aliases/JsonRpcResponse.md) \| `null`\>

Defined in: [mcp-server/src/dispatch.ts:76](https://github.com/heyoub/LiteShip/blob/main/packages/mcp-server/src/dispatch.ts#L76)

Route a parsed JSON-RPC message to its method handler.

Returns `null` for notifications (§4.1: notifications MUST NOT receive
a response). For requests, returns either a success or an error
response. Internal handler exceptions are caught and surfaced as
`-32603 Internal error` per §5.1.

## Parameters

### msg

[`JsonRpcRequest`](../interfaces/JsonRpcRequest.md) \| [`JsonRpcNotification`](../interfaces/JsonRpcNotification.md)

## Returns

`Promise`\<[`JsonRpcResponse`](../type-aliases/JsonRpcResponse.md) \| `null`\>
