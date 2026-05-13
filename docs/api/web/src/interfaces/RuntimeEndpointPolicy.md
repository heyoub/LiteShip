[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / RuntimeEndpointPolicy

# Interface: RuntimeEndpointPolicy

Defined in: [web/src/types.ts:181](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L181)

Host-provided policy that governs which origins the runtime may talk
to. `same-origin` is the default; `allowlist` consults
`allowOrigins` plus any per-kind overrides in `byKind`.

## Properties

### allowOrigins?

> `readonly` `optional` **allowOrigins?**: readonly `string`[]

Defined in: [web/src/types.ts:185](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L185)

Allowed origins when `mode` is `allowlist`.

***

### byKind?

> `readonly` `optional` **byKind?**: `Partial`\<`Record`\<[`RuntimeEndpointKind`](../type-aliases/RuntimeEndpointKind.md), readonly `string`[]\>\>

Defined in: [web/src/types.ts:187](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L187)

Optional per-endpoint-kind override allowlists.

***

### mode

> `readonly` **mode**: `"same-origin"` \| `"allowlist"`

Defined in: [web/src/types.ts:183](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/types.ts#L183)

Enforcement mode.
