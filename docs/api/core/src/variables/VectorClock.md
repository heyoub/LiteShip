[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / VectorClock

# Variable: VectorClock

> `const` **VectorClock**: `object`

Defined in: [core/src/vector-clock.ts:81](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/vector-clock.ts#L81)

VectorClock — per-peer counter algebra for causal ordering.
Pairs with [HLC](../namespaces/HLC/README.md) when you need exact happens-before rather than HLC's
hybrid ordering.

## Type Declaration

### compare

> **compare**: (`a`, `b`) => `-1` \| `0` \| `1` = `_compare`

`-1 | 0 | 1` comparator suitable for `sort`; `0` when concurrent.

#### Parameters

##### a

`VectorClockShape`

##### b

`VectorClockShape`

#### Returns

`-1` \| `0` \| `1`

### concurrent

> **concurrent**: (`a`, `b`) => `boolean` = `_concurrent`

`true` iff `a` and `b` are causally concurrent.

#### Parameters

##### a

`VectorClockShape`

##### b

`VectorClockShape`

#### Returns

`boolean`

### equals

> **equals**: (`a`, `b`) => `boolean` = `_equals`

Exact structural equality.

#### Parameters

##### a

`VectorClockShape`

##### b

`VectorClockShape`

#### Returns

`boolean`

### from

> **from**: (`entries`) => `VectorClockShape` = `_from`

Build a vector clock from an existing `Record<peer, counter>`.

#### Parameters

##### entries

`Record`\<`string`, `number`\>

#### Returns

`VectorClockShape`

### get

> **get**: (`vc`, `peerId`) => `number` = `_get`

Read the counter for a single peer.

#### Parameters

##### vc

`VectorClockShape`

##### peerId

`string`

#### Returns

`number`

### happensBefore

> **happensBefore**: (`a`, `b`) => `boolean` = `_happensBefore`

`true` iff `a` strictly happens-before `b`.

#### Parameters

##### a

`VectorClockShape`

##### b

`VectorClockShape`

#### Returns

`boolean`

### make

> **make**: () => `VectorClockShape` = `_make`

Build an empty vector clock.

#### Returns

`VectorClockShape`

### merge

> **merge**: (`a`, `b`) => `VectorClockShape` = `_merge`

Pointwise-max merge of two clocks.

#### Parameters

##### a

`VectorClockShape`

##### b

`VectorClockShape`

#### Returns

`VectorClockShape`

### peers

> **peers**: (`vc`) => `string`[] = `_peers`

List peers known to the clock.

#### Parameters

##### vc

`VectorClockShape`

#### Returns

`string`[]

### size

> **size**: (`vc`) => `number` = `_size`

Number of peers.

#### Parameters

##### vc

`VectorClockShape`

#### Returns

`number`

### tick

> **tick**: (`vc`, `peerId`) => `VectorClockShape` = `_tick`

Increment the counter for the given peer, returning a new clock.

#### Parameters

##### vc

`VectorClockShape`

##### peerId

`string`

#### Returns

`VectorClockShape`

### toObject

> **toObject**: (`vc`) => `Record`\<`string`, `number`\> = `_toObject`

Convert to a plain `Record<peer, counter>`.

#### Parameters

##### vc

`VectorClockShape`

#### Returns

`Record`\<`string`, `number`\>
