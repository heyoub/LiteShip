[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Wire

# Variable: Wire

> `const` **Wire**: `object`

Defined in: [core/src/wire.ts:260](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wire.ts#L260)

Wire -- fluent stream wrapper with chainable operators for map, filter,
scan, debounce, throttle, merge, and more. Wraps Effect Streams.

## Type Declaration

### from

> **from**: \<`T`, `E`\>(`stream`) => `WireShape`\<`T`, `E`\> = `_from`

Wraps an Effect Stream into a fluent Wire with chainable operators.

#### Type Parameters

##### T

`T`

##### E

`E` = `never`

#### Parameters

##### stream

`Stream`\<`T`, `E`\>

#### Returns

`WireShape`\<`T`, `E`\>

#### Example

```ts
const wire = Wire.from(Stream.make(1, 2, 3));
const doubled = wire.map(n => n * 2).filter(n => n > 2);
const results = Effect.runSync(doubled.runCollect()); // [4, 6]
```

### fromAsyncIterable

> **fromAsyncIterable**: \<`T`\>(`iterable`) => `WireShape`\<`T`, `Error`\> = `_fromAsyncIterable`

Creates a Wire from any AsyncIterable source.

#### Type Parameters

##### T

`T`

#### Parameters

##### iterable

`AsyncIterable`\<`T`\>

#### Returns

`WireShape`\<`T`, `Error`\>

#### Example

```ts
async function* gen() { yield 1; yield 2; yield 3; }
const wire = Wire.fromAsyncIterable(gen());
const results = await Effect.runPromise(wire.runCollect()); // [1, 2, 3]
```

### fromSSE

> **fromSSE**: (`url`, `options?`) => `WireShape`\<`MessageEvent`\<`any`\>, `Error`\> = `_fromSSE`

Creates a Wire from a Server-Sent Events endpoint.
The EventSource is cleaned up when the stream finalizes.

#### Parameters

##### url

`string`

##### options?

`EventSourceInit`

#### Returns

`WireShape`\<`MessageEvent`\<`any`\>, `Error`\>

#### Example

```ts
const wire = Wire.fromSSE('/api/events');
const parsed = wire.map(evt => JSON.parse(evt.data));
await Effect.runPromise(Wire.runForEach(parsed, msg => Effect.log(msg)));
```

### fromWebSocket

> **fromWebSocket**: (`url`, `protocols?`) => `WireShape`\<`MessageEvent`\<`any`\>, `Error`\> = `_fromWebSocket`

Creates a Wire from a WebSocket connection.
The socket is closed when the stream finalizes.

#### Parameters

##### url

`string`

##### protocols?

`string` \| `string`[]

#### Returns

`WireShape`\<`MessageEvent`\<`any`\>, `Error`\>

#### Example

```ts
const wire = Wire.fromWebSocket('wss://example.com/ws');
const messages = wire.map(evt => evt.data as string);
await Effect.runPromise(Wire.runForEach(messages, m => Effect.log(m)));
```

### merge

> **merge**: \<`T`, `E`\>(`streams`) => `WireShape`\<`T`, `E`\> = `_merge`

Merges multiple Wires into a single Wire, interleaving their emissions.

#### Type Parameters

##### T

`T`

##### E

`E`

#### Parameters

##### streams

readonly `WireShape`\<`T`, `E`\>[]

#### Returns

`WireShape`\<`T`, `E`\>

#### Example

```ts
const a = Wire.from(Stream.make(1, 2));
const b = Wire.from(Stream.make(3, 4));
const merged = Wire.merge([a, b]);
const results = Effect.runSync(merged.runCollect()); // [1, 2, 3, 4] (order varies)
```

### runCollect

> **runCollect**: \<`T`, `E`\>(`stream`) => `Effect`\<readonly `T`[], `E`\> = `_runCollect`

Collects all values from a Wire into an array.

#### Type Parameters

##### T

`T`

##### E

`E`

#### Parameters

##### stream

`WireShape`\<`T`, `E`\>

#### Returns

`Effect`\<readonly `T`[], `E`\>

#### Example

```ts
const wire = Wire.from(Stream.make(10, 20, 30));
const values = Effect.runSync(Wire.runCollect(wire)); // [10, 20, 30]
```

### runForEach

> **runForEach**: \<`T`, `SE`, `E`, `R`\>(`stream`, `fn`) => `Effect`\<`void`, `SE` \| `E`, `R`\> = `_runForEach`

Runs an effectful function for each value emitted by the Wire.

#### Type Parameters

##### T

`T`

##### SE

`SE`

##### E

`E`

##### R

`R`

#### Parameters

##### stream

`WireShape`\<`T`, `SE`\>

##### fn

(`t`) => `Effect`\<`void`, `E`, `R`\>

#### Returns

`Effect`\<`void`, `SE` \| `E`, `R`\>

#### Example

```ts
const wire = Wire.from(Stream.make('hello', 'world'));
await Effect.runPromise(Wire.runForEach(wire, s => Effect.log(s)));
// Logs: hello, world
```

### zip

> **zip**: \<`A`, `B`\>(`a`, `b`) => `WireShape`\<readonly \[`A`, `B`\]\> = `_zip`

Zips two Wires into a Wire of tuples, pairing elements pairwise.

#### Type Parameters

##### A

`A`

##### B

`B`

#### Parameters

##### a

`WireShape`\<`A`\>

##### b

`WireShape`\<`B`\>

#### Returns

`WireShape`\<readonly \[`A`, `B`\]\>

#### Example

```ts
const a = Wire.from(Stream.make(1, 2));
const b = Wire.from(Stream.make('a', 'b'));
const zipped = Wire.zip(a, b);
const results = Effect.runSync(zipped.runCollect()); // [[1,'a'], [2,'b']]
```

## Example

```ts
const wire = Wire.from(Stream.make(1, 2, 3, 4, 5));
const result = wire.filter(n => n > 2).map(n => n * 10);
const values = Effect.runSync(result.runCollect()); // [30, 40, 50]
```
