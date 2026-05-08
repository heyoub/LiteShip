[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / fade

# Variable: fade

> `const` **fade**: `object`

Defined in: [scene/src/sugar/envelope.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/sugar/envelope.ts#L34)

Fade constructors.

## Type Declaration

### in

> `readonly` **in**: (`span`) => [`FadeEnvelope`](../interfaces/FadeEnvelope.md)

Linear fade-in over the given span.

#### Parameters

##### span

[`BeatHandle`](../interfaces/BeatHandle.md)

#### Returns

[`FadeEnvelope`](../interfaces/FadeEnvelope.md)

### out

> `readonly` **out**: (`span`) => [`FadeEnvelope`](../interfaces/FadeEnvelope.md)

Linear fade-out over the given span.

#### Parameters

##### span

[`BeatHandle`](../interfaces/BeatHandle.md)

#### Returns

[`FadeEnvelope`](../interfaces/FadeEnvelope.md)
