[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / FrameCapture

# Interface: FrameCapture

Defined in: core/src/capture.ts:35

Minimal encoder contract: `init` to open the encoder, `capture` per frame,
`finalize` to flush and return the encoded blob. Implemented by `@czap/web`
(WebCodecs) and `@czap/remotion` (Remotion capture).

## Properties

### \_tag

> `readonly` **\_tag**: `"FrameCapture"`

Defined in: core/src/capture.ts:36

## Methods

### capture()

> **capture**(`frame`): `Promise`\<`void`\>

Defined in: core/src/capture.ts:38

#### Parameters

##### frame

[`CaptureFrame`](CaptureFrame.md)

#### Returns

`Promise`\<`void`\>

***

### finalize()

> **finalize**(): `Promise`\<[`CaptureResult`](CaptureResult.md)\>

Defined in: core/src/capture.ts:39

#### Returns

`Promise`\<[`CaptureResult`](CaptureResult.md)\>

***

### init()

> **init**(`config`): `Promise`\<`void`\>

Defined in: core/src/capture.ts:37

#### Parameters

##### config

[`CaptureConfig`](CaptureConfig.md)

#### Returns

`Promise`\<`void`\>
