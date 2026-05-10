[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / HLC

# HLC

HLC namespace -- Hybrid Logical Clock.

Pure functions for creating, comparing, incrementing, and merging HLC
timestamps, plus Effect-based managed clock helpers. Encodes to/from
a deterministic colon-separated hex string format.

## Example

```ts
import { HLC } from '@czap/core';

const a = HLC.increment(HLC.create('A'), Date.now());
const b = HLC.increment(HLC.create('B'), Date.now());
const merged = HLC.merge(a, b, Date.now());
const encoded = HLC.encode(merged);
const decoded = HLC.decode(encoded);
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
