[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / PulseEnvelope

# Interface: PulseEnvelope

Defined in: [scene/src/sugar/envelope.ts:22](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L22)

Pulse envelope (periodic, amplitude-scaled).

## Properties

### \_t

> `readonly` **\_t**: `"envelope"`

Defined in: [scene/src/sugar/envelope.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L24)

Discriminant tag.

***

### amplitude

> `readonly` **amplitude**: `number`

Defined in: [scene/src/sugar/envelope.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L30)

Peak amplitude (0–1 range, may exceed 1 for overdrive).

***

### curve

> `readonly` **curve**: `"pulse"`

Defined in: [scene/src/sugar/envelope.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L26)

Curve kind — pulse.

***

### period

> `readonly` **period**: [`BeatHandle`](BeatHandle.md)

Defined in: [scene/src/sugar/envelope.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L28)

Period of the pulse in beats.
