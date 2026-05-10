[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Op

# Variable: Op

> `const` **Op**: `object`

Defined in: [core/src/op.ts:218](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/op.ts#L218)

Op -- Effect.Effect wrapper providing named factories and combinators
for async operations with retry, timeout, race, and parallel execution.

## Type Declaration

### all

> **all**: \<`T`\>(`tasks`) => `OpShape`\<`OpValues`\<`T`\>, `OpError`\<`T`\[`number`\]\>, `OpRequirement`\<`T`\[`number`\]\>\> = `_all`

Runs all Ops concurrently and returns their results as a tuple.
Fails if any Op fails.

#### Type Parameters

##### T

`T` *extends* readonly `OpShape`\<`unknown`, `unknown`, `unknown`\>[]

#### Parameters

##### tasks

`T`

#### Returns

`OpShape`\<`OpValues`\<`T`\>, `OpError`\<`T`\[`number`\]\>, `OpRequirement`\<`T`\[`number`\]\>\>

#### Example

```ts
const a = Op.succeed(10);
const b = Op.succeed('hello');
const combined = Op.all([a, b] as const);
const [num, str] = Effect.runSync(combined.run()); // [10, 'hello']
```

### allSettled

> **allSettled**: \<`T`\>(`tasks`) => `OpShape`\<`SettledOpValues`\<`T`\>, `never`, `OpRequirement`\<`T`\[`number`\]\>\> = `_allSettled`

Runs all Ops concurrently and returns a Result for each, never failing.
Each result is either a success or a failure.

#### Type Parameters

##### T

`T` *extends* readonly `OpShape`\<`unknown`, `unknown`, `unknown`\>[]

#### Parameters

##### tasks

`T`

#### Returns

`OpShape`\<`SettledOpValues`\<`T`\>, `never`, `OpRequirement`\<`T`\[`number`\]\>\>

#### Example

```ts
const a = Op.succeed(1);
const b = Op.fail(new Error('oops'));
const settled = Op.allSettled([a, b] as const);
const results = Effect.runSync(settled.run());
// results[0] is Result.success(1), results[1] is Result.failure(Error)
```

### fail

> **fail**: \<`E`\>(`error`) => `OpShape`\<`never`, `E`\> = `_fail`

Creates an Op that immediately fails with the given error.

#### Type Parameters

##### E

`E`

#### Parameters

##### error

`E`

#### Returns

`OpShape`\<`never`, `E`\>

#### Example

```ts
const op = Op.fail(new Error('GPU not available'));
// Effect.runSync(op.run()) would throw
```

### fromPromise

> **fromPromise**: \<`A`\>(`f`) => `OpShape`\<`A`, `Error`\> = `_fromPromise`

Creates an Op from a Promise-returning function, catching errors as `Error`.

#### Type Parameters

##### A

`A`

#### Parameters

##### f

() => `Promise`\<`A`\>

#### Returns

`OpShape`\<`A`, `Error`\>

#### Example

```ts
const op = Op.fromPromise(() => fetch('/api/data').then(r => r.json()));
const result = await Effect.runPromise(op.run());
console.log(result); // parsed JSON response
```

### make

> **make**: \<`A`, `E`, `R`\>(`effect`) => `OpShape`\<`A`, `E`, `R`\> = `_make`

Wraps an Effect into an Op, providing `.map()` and `.flatMap()` chaining.

#### Type Parameters

##### A

`A`

##### E

`E` = `never`

##### R

`R` = `never`

#### Parameters

##### effect

`Effect`\<`A`, `E`, `R`\>

#### Returns

`OpShape`\<`A`, `E`, `R`\>

#### Example

```ts
const op = Op.make(Effect.succeed(42));
const doubled = op.map(n => n * 2);
const result = Effect.runSync(doubled.run()); // 84
```

### race

> **race**: \<`A`, `E`, `R`\>(`tasks`) => `OpShape`\<`A`, `Error` \| `E`, `R`\> = `_race`

Races multiple Ops concurrently, returning the first to complete.
Fails with an error if the array is empty.

#### Type Parameters

##### A

`A`

##### E

`E`

##### R

`R`

#### Parameters

##### tasks

readonly `OpShape`\<`A`, `E`, `R`\>[]

#### Returns

`OpShape`\<`A`, `Error` \| `E`, `R`\>

#### Example

```ts
const fast = Op.succeed('fast');
const slow = Op.fromPromise(() => new Promise(r => setTimeout(() => r('slow'), 100)));
const winner = Op.race([fast, slow]);
const result = Effect.runSync(winner.run()); // 'fast'
```

### retry

> **retry**: \<`A`, `E`, `R`\>(`task`, `options`) => `OpShape`\<`A`, `E`, `R`\> = `_retry`

Retries a failing Op with exponential backoff.

#### Type Parameters

##### A

`A`

##### E

`E`

##### R

`R`

#### Parameters

##### task

`OpShape`\<`A`, `E`, `R`\>

##### options

###### delay?

`Millis`

###### factor?

`number`

###### times

`number`

#### Returns

`OpShape`\<`A`, `E`, `R`\>

#### Example

```ts
const flaky = Op.fromPromise(() => fetch('/unstable-api').then(r => r.json()));
const resilient = Op.retry(flaky, { times: 3, delay: Millis(200), factor: 2 });
const result = await Effect.runPromise(resilient.run());
```

### succeed

> **succeed**: \<`A`\>(`value`) => `OpShape`\<`A`\> = `_succeed`

Creates an Op that immediately succeeds with the given value.

#### Type Parameters

##### A

`A`

#### Parameters

##### value

`A`

#### Returns

`OpShape`\<`A`\>

#### Example

```ts
const op = Op.succeed({ name: 'dark', contrast: 0.9 });
const result = Effect.runSync(op.run()); // { name: 'dark', contrast: 0.9 }
```

### timeout

> **timeout**: \<`A`, `E`, `R`\>(`task`, `ms`) => `OpShape`\<`A`, `Error` \| `E`, `R`\> = `_timeout`

Wraps an Op with a timeout, failing with an Error if it exceeds the given duration.

#### Type Parameters

##### A

`A`

##### E

`E`

##### R

`R`

#### Parameters

##### task

`OpShape`\<`A`, `E`, `R`\>

##### ms

`Millis`

#### Returns

`OpShape`\<`A`, `Error` \| `E`, `R`\>

#### Example

```ts
const slow = Op.fromPromise(() => new Promise(r => setTimeout(() => r('done'), 5000)));
const bounded = Op.timeout(slow, Millis(1000));
// Will fail with Error('Op timed out after 1000ms') if not resolved in time
```

## Example

```ts
const op = Op.succeed(42).map(n => n * 2);
const result = Effect.runSync(op.run()); // 84

const tasks = Op.all([Op.succeed(1), Op.succeed(2)] as const);
const [a, b] = Effect.runSync(tasks.run()); // [1, 2]
```
