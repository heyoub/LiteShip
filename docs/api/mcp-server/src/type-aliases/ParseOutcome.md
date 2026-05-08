[**czap**](../../../README.md)

***

[czap](../../../README.md) / [mcp-server/src](../README.md) / ParseOutcome

# Type Alias: ParseOutcome

> **ParseOutcome** = \{ `kind`: `"request"`; `message`: [`JsonRpcRequest`](../interfaces/JsonRpcRequest.md); \} \| \{ `kind`: `"notification"`; `message`: [`JsonRpcNotification`](../interfaces/JsonRpcNotification.md); \} \| \{ `kind`: `"batch"`; `outcomes`: readonly `ParseOutcome`[]; \} \| \{ `kind`: `"parse-error"`; \} \| \{ `id`: [`JsonRpcId`](JsonRpcId.md); `kind`: `"invalid-request"`; \}

Defined in: [mcp-server/src/jsonrpc.ts:75](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L75)

Discriminated union of every parse outcome the kernel produces.
