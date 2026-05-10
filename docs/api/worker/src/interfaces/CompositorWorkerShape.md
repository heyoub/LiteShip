[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / CompositorWorkerShape

# Interface: CompositorWorkerShape

Defined in: worker/src/compositor-types.ts:50

Host-facing surface of a compositor worker. Returned by
[CompositorWorker](../namespaces/CompositorWorker/README.md) as the public control/observation API. Owns
the underlying `Worker` -- call [CompositorWorkerShape.dispose](#dispose)
to terminate and release resources.

## Properties

### runtime

> `readonly` **runtime**: `RuntimeCoordinatorShape`

Defined in: worker/src/compositor-types.ts:54

Shared runtime coordination surface reflecting host-side worker state.

***

### worker

> `readonly` **worker**: `Worker`

Defined in: worker/src/compositor-types.ts:52

The underlying Worker instance.

## Methods

### addQuantizer()

> **addQuantizer**(`name`, `boundary`): `void`

Defined in: worker/src/compositor-types.ts:57

Register a quantizer in the worker.

#### Parameters

##### name

`string`

##### boundary

###### id

`string`

###### states

readonly `string`[]

###### thresholds

readonly `number`[]

#### Returns

`void`

***

### applyResolvedState()

> **applyResolvedState**(`states`): `void`

Defined in: worker/src/compositor-types.ts:79

Mirror resolved quantizer state updates into the worker without raw threshold evaluation.

#### Parameters

##### states

readonly `ResolvedStateEntry`[]

#### Returns

`void`

***

### bootstrapResolvedState()

> **bootstrapResolvedState**(`states`): `void`

Defined in: worker/src/compositor-types.ts:76

Seed resolved quantizer state into the worker without raw threshold evaluation.

#### Parameters

##### states

readonly `ResolvedStateEntry`[]

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: worker/src/compositor-types.ts:94

Terminate the worker and clean up resources.

#### Returns

`void`

***

### evaluate()

> **evaluate**(`name`, `value`): `void`

Defined in: worker/src/compositor-types.ts:70

Evaluate a quantizer with a numeric value (threshold-based).

#### Parameters

##### name

`string`

##### value

`number`

#### Returns

`void`

***

### onMetrics()

> **onMetrics**(`callback`): () => `void`

Defined in: worker/src/compositor-types.ts:91

Subscribe to metrics updates. Returns an unsubscribe function.

#### Parameters

##### callback

(`fps`, `budgetUsed`) => `void`

#### Returns

() => `void`

***

### onResolvedStateAck()

> **onResolvedStateAck**(`callback`): () => `void`

Defined in: worker/src/compositor-types.ts:88

Subscribe to resolved-state acknowledgement updates. Returns an unsubscribe function.

#### Parameters

##### callback

(`ack`) => `void`

#### Returns

() => `void`

***

### onState()

> **onState**(`callback`): () => `void`

Defined in: worker/src/compositor-types.ts:85

Subscribe to state updates from the worker. Returns an unsubscribe function.

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

***

### removeQuantizer()

> **removeQuantizer**(`name`): `void`

Defined in: worker/src/compositor-types.ts:67

Remove a quantizer from the worker.

#### Parameters

##### name

`string`

#### Returns

`void`

***

### requestCompute()

> **requestCompute**(): `void`

Defined in: worker/src/compositor-types.ts:82

Request the worker to compute and return a CompositeState.

#### Returns

`void`

***

### setBlendWeights()

> **setBlendWeights**(`name`, `weights`): `void`

Defined in: worker/src/compositor-types.ts:73

Override blend weights for a quantizer.

#### Parameters

##### name

`string`

##### weights

`Record`\<`string`, `number`\>

#### Returns

`void`
