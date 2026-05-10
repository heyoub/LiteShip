[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Store

# Store

Store — TEA-style state container.
Build with an initial state and a pure `reducer(state, msg) => state`, then
dispatch messages; the store publishes the resulting state via `changes`.
Use `makeWithEffect` when the reducer is itself an `Effect`.

## Type Aliases

- [Effectful](type-aliases/Effectful.md)
- [Shape](type-aliases/Shape.md)
