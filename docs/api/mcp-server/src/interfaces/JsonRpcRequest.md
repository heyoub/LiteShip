[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [mcp-server/src](../README.md) / JsonRpcRequest

# Interface: JsonRpcRequest

Defined in: [mcp-server/src/jsonrpc.ts:33](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L33)

A JSON-RPC 2.0 request (has `id`).

## Properties

### id

> `readonly` **id**: [`JsonRpcId`](../type-aliases/JsonRpcId.md)

Defined in: [mcp-server/src/jsonrpc.ts:35](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L35)

***

### jsonrpc

> `readonly` **jsonrpc**: `"2.0"`

Defined in: [mcp-server/src/jsonrpc.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L34)

***

### method

> `readonly` **method**: `string`

Defined in: [mcp-server/src/jsonrpc.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L36)

***

### params?

> `readonly` `optional` **params?**: `Record`\<`string`, `unknown`\> \| readonly `unknown`[]

Defined in: [mcp-server/src/jsonrpc.ts:37](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L37)
