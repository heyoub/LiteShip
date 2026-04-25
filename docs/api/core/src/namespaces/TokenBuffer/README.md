[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / TokenBuffer

# TokenBuffer

TokenBuffer — zero-alloc ring buffer that absorbs bursty LLM token arrival
and hands tokens out at a smooth cadence. Reports stall via `isStalled`
and rate via an internal EMA.

## Type Aliases

- [Config](type-aliases/Config.md)
- [Shape](type-aliases/Shape.md)
