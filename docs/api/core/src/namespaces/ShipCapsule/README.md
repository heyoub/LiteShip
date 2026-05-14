[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / ShipCapsule

# ShipCapsule

Public namespace for ShipCapsule (ADR-0011). `make` builds a capsule from
input, `canonicalize` encodes it as canonical CBOR for transport / hashing,
`decode` round-trips canonical bytes and rejects non-canonical encodings,
`computeId` mints the fnv1a label over the canonicalized payload.

## Type Aliases

- [BuildEnv](type-aliases/BuildEnv.md)
- [DecodeError](type-aliases/DecodeError.md)
- [Input](type-aliases/Input.md)
- [Shape](type-aliases/Shape.md)
