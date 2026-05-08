[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / Track

# Variable: Track

> `const` **Track**: `object`

Defined in: [scene/src/track.ts:100](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/track.ts#L100)

Track namespace — typed constructors for the four track kinds plus
per-kind id minters (Track.videoId, Track.audioId, Track.transitionId,
Track.effectId) for use in cross-track references.

## Type Declaration

### audio

> **audio**: (`id`, `opts`) => [`AudioTrack`](../interfaces/AudioTrack.md)

Build an AudioTrack referencing an asset id, with default mix { volume: 0, pan: 0 }.

#### Parameters

##### id

`string`

##### opts

###### from

`number`

###### mix?

\{ `pan?`: `number`; `sync?`: \{ `bpm?`: `number`; \}; `volume?`: `number`; \}

###### mix.pan?

`number`

###### mix.sync?

\{ `bpm?`: `number`; \}

###### mix.sync.bpm?

`number`

###### mix.volume?

`number`

###### source

`string`

###### to

`number`

#### Returns

[`AudioTrack`](../interfaces/AudioTrack.md)

### audioId

> **audioId**: (`id`) => [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

Mint an audio TrackId — the one sanctioned cast site for the 'audio' brand.

#### Parameters

##### id

`string`

#### Returns

[`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

### effect

> **effect**: (`id`, `opts`) => [`EffectTrack`](../interfaces/EffectTrack.md)

Build an EffectTrack applying an intensity curve to a target video, optionally synced to audio.

#### Parameters

##### id

`string`

##### opts

###### from

`number`

###### kind

`"pulse"` \| `"glow"` \| `"shake"` \| `"zoom"` \| `"desaturate"`

###### syncTo?

\{ `anchor`: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>; `mode`: `"beat"` \| `"onset"` \| `"peak"`; \}

###### syncTo.anchor

[`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

###### syncTo.mode

`"beat"` \| `"onset"` \| `"peak"`

###### target

[`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>

###### to

`number`

#### Returns

[`EffectTrack`](../interfaces/EffectTrack.md)

### effectId

> **effectId**: (`id`) => [`TrackId`](../type-aliases/TrackId.md)\<`"effect"`\>

Mint an effect TrackId — the one sanctioned cast site for the 'effect' brand.

#### Parameters

##### id

`string`

#### Returns

[`TrackId`](../type-aliases/TrackId.md)\<`"effect"`\>

### transition

> **transition**: (`id`, `opts`) => [`TransitionTrack`](../interfaces/TransitionTrack.md)

Build a TransitionTrack blending two target tracks over a frame window.

#### Parameters

##### id

`string`

##### opts

###### between

readonly \[[`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>, [`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>\]

###### from

`number`

###### kind

`"crossfade"` \| `"swipe.left"` \| `"swipe.right"` \| `"zoom.in"` \| `"zoom.out"` \| `"cut"`

###### to

`number`

#### Returns

[`TransitionTrack`](../interfaces/TransitionTrack.md)

### transitionId

> **transitionId**: (`id`) => [`TrackId`](../type-aliases/TrackId.md)\<`"transition"`\>

Mint a transition TrackId — the one sanctioned cast site for the 'transition' brand.

#### Parameters

##### id

`string`

#### Returns

[`TrackId`](../type-aliases/TrackId.md)\<`"transition"`\>

### video

> **video**: (`id`, `opts`) => [`VideoTrack`](../interfaces/VideoTrack.md)

Build a VideoTrack referencing a quantizer source, with optional layer.

#### Parameters

##### id

`string`

##### opts

###### from

`number`

###### layer?

`number`

###### source

`unknown`

###### to

`number`

#### Returns

[`VideoTrack`](../interfaces/VideoTrack.md)

### videoId

> **videoId**: (`id`) => [`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>

Mint a video TrackId — the one sanctioned cast site for the 'video' brand.

#### Parameters

##### id

`string`

#### Returns

[`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>
