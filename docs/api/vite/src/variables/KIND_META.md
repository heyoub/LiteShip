[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / KIND\_META

# Variable: KIND\_META

> `const` **KIND\_META**: `Record`\<[`PrimitiveKind`](../type-aliases/PrimitiveKind.md), \{ `file`: `string`; `suffix`: `string`; `tag`: `string`; \}\>

Defined in: [vite/src/primitive-resolve.ts:51](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/primitive-resolve.ts#L51)

Per-`PrimitiveKind` metadata used by [resolvePrimitive](../functions/resolvePrimitive.md):
canonical filename, wildcard suffix, and the exported tag name the
module is expected to decorate its primitives with.
