[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / RuntimeUrlResolution

# Type Alias: RuntimeUrlResolution

> **RuntimeUrlResolution** = \{ `type`: `"missing"`; \} \| \{ `baseOrigin`: `string`; `detail?`: `string`; `rawUrl`: `string`; `reason`: `"url-can-parse-rejected"` \| `"url-constructor-threw"`; `type`: `"malformed"`; \} \| \{ `resolved`: `URL`; `type`: `"cross-origin-rejected"`; \} \| \{ `resolved`: `URL`; `type`: `"origin-not-allowed"`; \} \| \{ `resolved`: `URL`; `type`: `"kind-not-allowed"`; \} \| \{ `resolved`: `URL`; `type`: `"private-ip-rejected"`; \} \| \{ `resolved`: `URL`; `type`: `"allowed"`; `url`: `string`; \}

Defined in: [web/src/security/runtime-url.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/security/runtime-url.ts#L17)

Discriminated union returned by [resolveRuntimeUrl](../functions/resolveRuntimeUrl.md). Every
non-`allowed` variant preserves enough context for the caller to log
or report why the URL was rejected.
