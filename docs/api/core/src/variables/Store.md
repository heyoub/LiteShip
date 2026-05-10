[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Store

# Variable: Store

> `const` **Store**: `object`

Defined in: core/src/store.ts:65

Store — TEA-style state container.
Build with an initial state and a pure `reducer(state, msg) => state`, then
dispatch messages; the store publishes the resulting state via `changes`.
Use `makeWithEffect` when the reducer is itself an `Effect`.

## Type Declaration

### make

> **make**: \<`S`, `Msg`\>(`initial`, `reducer`) => `Effect`\<`StoreShape`\<`S`, `Msg`\>\> = `_make`

Synchronous reducer store.

#### Type Parameters

##### S

`S`

##### Msg

`Msg`

#### Parameters

##### initial

`S`

##### reducer

(`state`, `msg`) => `S`

#### Returns

`Effect`\<`StoreShape`\<`S`, `Msg`\>\>

### makeWithEffect

> **makeWithEffect**: \<`S`, `Msg`, `E`, `R`\>(`initial`, `reducer`) => `Effect`\<`EffectfulStoreShape`\<`S`, `Msg`, `E`, `R`\>\> = `_makeWithEffect`

Reducer store where state transitions are themselves `Effect`s.

#### Type Parameters

##### S

`S`

##### Msg

`Msg`

##### E

`E`

##### R

`R`

#### Parameters

##### initial

`S`

##### reducer

(`state`, `msg`) => `Effect`\<`S`, `E`, `R`\>

#### Returns

`Effect`\<`EffectfulStoreShape`\<`S`, `Msg`, `E`, `R`\>\>
