[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / SSEMessage

# Type Alias: SSEMessage

> **SSEMessage** = \{ `data`: `unknown`; `type`: `"patch"`; \} \| \{ `data`: `unknown`; `type`: `"batch"`; \} \| \{ `data`: `unknown`; `type`: `"signal"`; \} \| \{ `data`: `unknown`; `type`: `"receipt"`; \} \| \{ `type`: `"heartbeat"`; \} \| \{ `data`: `unknown`; `type`: `"snapshot"`; \}

Defined in: [web/src/types.ts:233](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/types.ts#L233)

SSE message types received from server.
