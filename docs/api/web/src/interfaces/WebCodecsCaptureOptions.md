[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / WebCodecsCaptureOptions

# Interface: WebCodecsCaptureOptions

Defined in: [web/src/capture/webcodecs.ts:22](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/capture/webcodecs.ts#L22)

Options for [WebCodecsCapture.make](../variables/WebCodecsCapture.md#make). All fields are optional;
omitted values fall back to Baseline H.264 at 4 Mbps.

## Properties

### bitrate?

> `readonly` `optional` **bitrate?**: `number`

Defined in: [web/src/capture/webcodecs.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/capture/webcodecs.ts#L26)

Target bitrate in bits/second. Default: 4_000_000

***

### codec?

> `readonly` `optional` **codec?**: `string`

Defined in: [web/src/capture/webcodecs.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/capture/webcodecs.ts#L24)

Video codec string. Default: 'avc1.42001E' (H.264 Baseline Level 3.0)

***

### keyframeInterval?

> `readonly` `optional` **keyframeInterval?**: `number`

Defined in: [web/src/capture/webcodecs.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/capture/webcodecs.ts#L28)

Keyframe interval in frames. Default: 30
