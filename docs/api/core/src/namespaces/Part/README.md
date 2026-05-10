[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Part

# Part

Part namespace — factories for ECS component stores.

Currently exposes the dense `Float64Array`-backed store used for hot-path
numeric state; sparse/object-valued parts are registered ad-hoc via
[World](../../variables/World.md).`addComponent`.

## Type Aliases

- [Dense](type-aliases/Dense.md)
- [Shape](type-aliases/Shape.md)
