[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Cell

# Variable: Cell

> `const` **Cell**: `object`

Defined in: [core/src/cell.ts:118](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/cell.ts#L118)

Cell — mutable reactive primitive backed by `SubscriptionRef`.
The workhorse of czap's reactive graph: `get` for a snapshot, `set` to
push, `changes` for the stream of subsequent values.

## Type Declaration

### all

> **all**: \<`T`\>(`cells`) => `Effect`\<`CellShape`\<`T`\>, `never`, [`Scope`](#)\> = `_all`

Tuple-combine cells into a single cell of their current values.

#### Type Parameters

##### T

`T` *extends* readonly `unknown`[]

#### Parameters

##### cells

\{ readonly \[K in string \| number \| symbol\]: CellShape\<T\[K\]\> \}

#### Returns

`Effect`\<`CellShape`\<`T`\>, `never`, [`Scope`](#)\>

### fromStream

> **fromStream**: \<`T`\>(`initial`, `source`) => `Effect`\<`CellShape`\<`T`\>, `never`, [`Scope`](#)\> = `_fromStream`

Seed a cell with an initial value and mirror every stream emission into it.

#### Type Parameters

##### T

`T`

#### Parameters

##### initial

`T`

##### source

`Stream`\<`T`\>

#### Returns

`Effect`\<`CellShape`\<`T`\>, `never`, [`Scope`](#)\>

### make

> **make**: \<`T`\>(`initial`) => `Effect`\<`CellShape`\<`T`\>\> = `_make`

Build a cell with an initial value.

#### Type Parameters

##### T

`T`

#### Parameters

##### initial

`T`

#### Returns

`Effect`\<`CellShape`\<`T`\>\>

### map

> **map**: \<`T`, `U`\>(`cell`, `fn`) => `Effect`\<`CellShape`\<`U`\>, `never`, [`Scope`](#)\> = `_map`

Scoped `map` — derive a new cell by applying `fn` to every emission.

#### Type Parameters

##### T

`T`

##### U

`U`

#### Parameters

##### cell

`CellShape`\<`T`\>

##### fn

(`value`) => `U`

#### Returns

`Effect`\<`CellShape`\<`U`\>, `never`, [`Scope`](#)\>
