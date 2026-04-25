[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Op

# Op

Op -- Effect.Effect wrapper providing named factories and combinators
for async operations with retry, timeout, race, and parallel execution.

## Example

```ts
const op = Op.succeed(42).map(n => n * 2);
const result = Effect.runSync(op.run()); // 84

const tasks = Op.all([Op.succeed(1), Op.succeed(2)] as const);
const [a, b] = Effect.runSync(tasks.run()); // [1, 2]
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
