[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / FadeEnvelope

# Interface: FadeEnvelope

Defined in: [scene/src/sugar/envelope.ts:12](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L12)

Fade envelope (linear over a beat span).

## Properties

### \_t

> `readonly` **\_t**: `"envelope"`

Defined in: [scene/src/sugar/envelope.ts:14](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L14)

Discriminant tag.

***

### curve

> `readonly` **curve**: `"linear-in"` \| `"linear-out"`

Defined in: [scene/src/sugar/envelope.ts:16](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L16)

Curve kind — linear-in or linear-out.

***

### span

> `readonly` **span**: [`BeatHandle`](BeatHandle.md)

Defined in: [scene/src/sugar/envelope.ts:18](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/envelope.ts#L18)

Duration of the fade in beats.
