[**czap**](../../../README.md)

***

[czap](../../../README.md) / [mcp-server/src](../README.md) / parse

# Variable: parse

> `const` **parse**: (`line`) => [`ParseOutcome`](../type-aliases/ParseOutcome.md) = `_parse`

Defined in: [mcp-server/src/jsonrpc.ts:145](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/mcp-server/src/jsonrpc.ts#L145)

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

## Parameters

### line

`string`

## Returns

[`ParseOutcome`](../type-aliases/ParseOutcome.md)
