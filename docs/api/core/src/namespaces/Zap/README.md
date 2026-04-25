[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Zap

# Zap

Zap -- push-based event channel backed by Effect PubSub.
Provides reactive event streams with map, filter, merge, debounce, and throttle.

## Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const zap = yield* Zap.make<number>();
  const doubled = yield* Zap.map(zap, n => n * 2);
  yield* zap.emit(5);
  // doubled.stream receives 10
}));
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
