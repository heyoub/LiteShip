[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Wire

# Wire

Wire -- fluent stream wrapper with chainable operators for map, filter,
scan, debounce, throttle, merge, and more. Wraps Effect Streams.

## Example

```ts
const wire = Wire.from(Stream.make(1, 2, 3, 4, 5));
const result = wire.filter(n => n > 2).map(n => n * 10);
const values = Effect.runSync(result.runCollect()); // [30, 40, 50]
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
