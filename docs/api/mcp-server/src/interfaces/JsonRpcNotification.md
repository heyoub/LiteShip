[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [mcp-server/src](../README.md) / JsonRpcNotification

# Interface: JsonRpcNotification

Defined in: [mcp-server/src/jsonrpc.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L41)

A JSON-RPC 2.0 notification (no `id`). Per §4.1 MUST NOT be responded to.

## Properties

### jsonrpc

> `readonly` **jsonrpc**: `"2.0"`

Defined in: [mcp-server/src/jsonrpc.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L42)

***

### method

> `readonly` **method**: `string`

Defined in: [mcp-server/src/jsonrpc.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L43)

***

### params?

> `readonly` `optional` **params?**: `Record`\<`string`, `unknown`\> \| readonly `unknown`[]

Defined in: [mcp-server/src/jsonrpc.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L44)
