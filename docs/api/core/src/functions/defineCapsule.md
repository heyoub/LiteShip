[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / defineCapsule

# Function: defineCapsule()

> **defineCapsule**\<`K`, `In`, `Out`, `R`\>(`decl`): [`CapsuleDef`](../interfaces/CapsuleDef.md)\<`K`, `In`, `Out`, `R`\>

Defined in: [core/src/assembly.ts:46](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/assembly.ts#L46)

Declare a capsule. Validates shape, computes content address,
registers in the module-level catalog, returns a typed def.
No runtime behavior beyond registration — behavior comes from
the harness/compiler walking the catalog.

## Type Parameters

### K

`K` *extends* [`AssemblyKind`](../type-aliases/AssemblyKind.md)

### In

`In`

### Out

`Out`

### R

`R`

## Parameters

### decl

`Omit`\<[`CapsuleContract`](../interfaces/CapsuleContract.md)\<`K`, `In`, `Out`, `R`\>, `"id"`\>

## Returns

[`CapsuleDef`](../interfaces/CapsuleDef.md)\<`K`, `In`, `Out`, `R`\>
