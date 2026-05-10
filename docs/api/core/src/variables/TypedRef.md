[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / TypedRef

# Variable: TypedRef

> `const` **TypedRef**: `object`

Defined in: core/src/typed-ref.ts:65

TypedRef — schema-plus-content-hash pointer used by the receipt pipeline.
Lets a receipt reference a payload by its content address without embedding
the payload itself, while still binding it to a schema identity.

## Type Declaration

### canonicalize

> **canonicalize**: (`value`) => `Uint8Array`

Canonical-CBOR-ish serialization used to compute the content hash.

Canonicalize value to CBOR bytes using canonical (deterministic) encoding.

#### Parameters

##### value

`unknown`

#### Returns

`Uint8Array`

### create

> **create**: (`schemaHash`, `payload`) => `Effect`\<`TypedRefShape`\> = `_create`

Build a TypedRef from a schema hash and an arbitrary payload.

Create a TypedRef from schema hash and payload.

#### Parameters

##### schemaHash

`string`

##### payload

`unknown`

#### Returns

`Effect`\<`TypedRefShape`\>

### equals

> **equals**: (`a`, `b`) => `boolean` = `_equals`

Structural equality over schema + content hashes.

Compare two TypedRefs for structural equality.

#### Parameters

##### a

`TypedRefShape`

##### b

`TypedRefShape`

#### Returns

`boolean`

### hash

> **hash**: (`data`) => `Effect`\<`string`\>

Hash a canonicalized payload to its content address.

Hash data using SHA-256. Returns "sha256:hex" formatted hash.

The `bytes as BufferSource` assertion is the single sanctioned cast in this
file. `Uint8Array` is structurally a BufferSource, but TS's DOM lib types
`bytes.buffer` as potentially-SharedArrayBuffer, preventing direct assignment.
Safe: cborg encodes into fresh ArrayBuffer and TextEncoder.encode returns
ArrayBuffer-backed views. No data copy.

Hash-primitive failures are unrecoverable in practice (crypto.subtle errors
are environment-level, not user-recoverable), so we `Effect.orDie` to fold
the Error channel into a defect and keep the `Effect<string>` signature that
the content-addressing pipeline relies on.

#### Parameters

##### data

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

#### Returns

`Effect`\<`string`\>
