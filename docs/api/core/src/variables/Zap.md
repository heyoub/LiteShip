[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Zap

# Variable: Zap

> `const` **Zap**: `object`

Defined in: [core/src/zap.ts:228](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/zap.ts#L228)

Zap -- push-based event channel backed by Effect PubSub.
Provides reactive event streams with map, filter, merge, debounce, and throttle.

## Type Declaration

### debounce

> **debounce**: \<`T`\>(`event`, `ms`) => `Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\> = `_debounce`

Debounces a Zap, only emitting after `ms` milliseconds of silence.

#### Type Parameters

##### T

`T`

#### Parameters

##### event

`ZapShape`\<`T`\>

##### ms

`Millis`

#### Returns

`Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const input = yield* Zap.make<string>();
  const debounced = yield* Zap.debounce(input, Millis(300));
  // debounced.stream emits only after 300ms pause in input
}));
```

### filter

> **filter**: \<`T`\>(`event`, `predicate`) => `Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\> = `_filter`

Filters a Zap, only forwarding values that satisfy the predicate.

#### Type Parameters

##### T

`T`

#### Parameters

##### event

`ZapShape`\<`T`\>

##### predicate

(`value`) => `boolean`

#### Returns

`Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const nums = yield* Zap.make<number>();
  const evens = yield* Zap.filter(nums, n => n % 2 === 0);
  // evens.stream only receives even numbers
}));
```

### fromDOMEvent

> **fromDOMEvent**: \<`K`\>(`element`, `event`) => `Effect`\<`ZapShape`\<`HTMLElementEventMap`\[`K`\]\>, `never`, [`Scope`](#)\> = `_fromDOMEvent`

Creates a Zap from a DOM event, auto-managing listener lifecycle via Scope.

#### Type Parameters

##### K

`K` *extends* keyof `HTMLElementEventMap`

#### Parameters

##### element

`HTMLElement`

##### event

`K`

#### Returns

`Effect`\<`ZapShape`\<`HTMLElementEventMap`\[`K`\]\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const btn = document.getElementById('btn');
  if (!(btn instanceof HTMLElement)) return;
  const clicks = yield* Zap.fromDOMEvent(btn, 'click');
  // clicks.stream emits MouseEvents; listener removed when scope closes
}));
```

### make

> **make**: \<`T`\>() => `Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\> = `_make`

Creates a new push-based event channel backed by an unbounded PubSub.

#### Type Parameters

##### T

`T`

#### Returns

`Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const zap = await Effect.runPromise(Effect.scoped(Zap.make<number>()));
Effect.runSync(zap.emit(42));
// Subscribers on zap.stream will receive 42
```

### map

> **map**: \<`A`, `B`\>(`event`, `f`) => `Effect`\<`ZapShape`\<`B`\>, `never`, [`Scope`](#)\> = `_map`

Transforms each value emitted by a Zap through a mapping function.

#### Type Parameters

##### A

`A`

##### B

`B`

#### Parameters

##### event

`ZapShape`\<`A`\>

##### f

(`a`) => `B`

#### Returns

`Effect`\<`ZapShape`\<`B`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const nums = yield* Zap.make<number>();
  const strs = yield* Zap.map(nums, n => `value: ${n}`);
  // strs.stream emits transformed strings
}));
```

### merge

> **merge**: \<`T`\>(`events`) => `Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\> = `_merge`

Merges multiple Zaps of the same type into a single Zap.

#### Type Parameters

##### T

`T`

#### Parameters

##### events

readonly `ZapShape`\<`T`\>[]

#### Returns

`Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const a = yield* Zap.make<number>();
  const b = yield* Zap.make<number>();
  const merged = yield* Zap.merge([a, b]);
  // merged.stream receives events from both a and b
}));
```

### throttle

> **throttle**: \<`T`\>(`event`, `ms`) => `Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\> = `_throttle`

Throttles a Zap, allowing at most one emission per `ms` milliseconds.

#### Type Parameters

##### T

`T`

#### Parameters

##### event

`ZapShape`\<`T`\>

##### ms

`Millis`

#### Returns

`Effect`\<`ZapShape`\<`T`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const scroll = yield* Zap.make<number>();
  const throttled = yield* Zap.throttle(scroll, Millis(16));
  // throttled.stream emits at most once every 16ms (~60fps)
}));
```

## Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const zap = yield* Zap.make<number>();
  const doubled = yield* Zap.map(zap, n => n * 2);
  yield* zap.emit(5);
  // doubled.stream receives 10
}));
```
