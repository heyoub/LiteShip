[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [assets/src](../README.md) / DecodedAudio

# Interface: DecodedAudio

Defined in: [assets/src/decoders/audio.ts:21](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L21)

Decoded audio metadata + sample buffer.

NOTE: for PCM16 and IEEE float32 input, `samples` is a VIEW into the
caller's `ArrayBuffer` — no copy is made. Mutating the source buffer
(or reusing it in a pooled allocator) mutates samples underneath.
For PCM8/24/32, `samples` is a fresh `Float32Array` and is safe to
keep independently of the input.

## Properties

### bitsPerSample

> `readonly` **bitsPerSample**: `number`

Defined in: [assets/src/decoders/audio.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L24)

***

### channels

> `readonly` **channels**: `number`

Defined in: [assets/src/decoders/audio.ts:23](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L23)

***

### durationMs

> `readonly` **durationMs**: `number`

Defined in: [assets/src/decoders/audio.ts:27](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L27)

***

### sampleCount

> `readonly` **sampleCount**: `number`

Defined in: [assets/src/decoders/audio.ts:25](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L25)

***

### sampleRate

> `readonly` **sampleRate**: `number`

Defined in: [assets/src/decoders/audio.ts:22](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L22)

***

### samples

> `readonly` **samples**: `Int16Array`\<`ArrayBufferLike`\> \| `Float32Array`\<`ArrayBufferLike`\>

Defined in: [assets/src/decoders/audio.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/assets/src/decoders/audio.ts#L26)
