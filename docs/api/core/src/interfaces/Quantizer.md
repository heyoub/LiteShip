[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Quantizer

# Interface: Quantizer\<B\>

Defined in: [core/src/quantizer-types.ts:21](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L21)

Quantizer contract — the live evaluator that binds a [Boundary](../variables/Boundary.md) to a signal source.

A quantizer holds a boundary definition plus the reactive machinery to observe
its current state and emit crossings when the underlying signal moves between
bands. The concrete implementation is produced by `@czap/quantizer`'s `Q.from()`
builder; consumers interact only via this structural interface.

## Type Parameters

### B

`B` *extends* [`Shape`](../namespaces/Boundary/type-aliases/Shape.md) = [`Shape`](../namespaces/Boundary/type-aliases/Shape.md)

## Properties

### \_tag

> `readonly` **\_tag**: `"Quantizer"`

Defined in: [core/src/quantizer-types.ts:22](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L22)

***

### boundary

> `readonly` **boundary**: `B`

Defined in: [core/src/quantizer-types.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L23)

***

### changes

> `readonly` **changes**: `Stream`\<[`BoundaryCrossing`](../type-aliases/BoundaryCrossing.md)\<[`StateUnion`](../type-aliases/StateUnion.md)\<`B`\>\>\>

Defined in: [core/src/quantizer-types.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L27)

***

### state

> `readonly` **state**: `Effect`\<[`StateUnion`](../type-aliases/StateUnion.md)\<`B`\>\>

Defined in: [core/src/quantizer-types.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L24)

***

### stateSync?

> `readonly` `optional` **stateSync?**: () => [`StateUnion`](../type-aliases/StateUnion.md)\<`B`\>

Defined in: [core/src/quantizer-types.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L26)

Synchronous state accessor for hot paths (avoids Effect overhead).

#### Returns

[`StateUnion`](../type-aliases/StateUnion.md)\<`B`\>

## Methods

### evaluate()

> **evaluate**(`value`): [`StateUnion`](../type-aliases/StateUnion.md)\<`B`\>

Defined in: [core/src/quantizer-types.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/quantizer-types.ts#L28)

#### Parameters

##### value

`number`

#### Returns

[`StateUnion`](../type-aliases/StateUnion.md)\<`B`\>
