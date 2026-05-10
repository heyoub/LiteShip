[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [mcp-server/src](../README.md) / runStdio

# Function: runStdio()

> **runStdio**(`input?`, `output?`): `Promise`\<`void`\>

Defined in: mcp-server/src/stdio.ts:37

Run the MCP stdio loop until the input stream closes. Defaults to
`process.stdin` / `process.stdout` so the production CLI bootstrap
stays a one-liner (`runStdio()`); tests inject a pre-populated
Readable + a sink Writable to exercise the full read-line-write loop
without spawning a child process.

## Parameters

### input?

`Readable` = `process.stdin`

### output?

`Writable` = `process.stdout`

## Returns

`Promise`\<`void`\>
