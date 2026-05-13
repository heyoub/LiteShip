[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / syncTo

# Variable: syncTo

> `const` **syncTo**: `object`

Defined in: [scene/src/sugar/sync-to.ts:19](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/sync-to.ts#L19)

Typed SyncAnchor constructors for the three supported modes.

## Type Declaration

### beat

> `readonly` **beat**: (`anchor`) => `object`

Sync to downbeats (BeatMarkerProjection).

#### Parameters

##### anchor

[`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

#### Returns

`object`

##### anchor

> `readonly` **anchor**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

##### mode

> `readonly` **mode**: `"beat"` \| `"onset"` \| `"peak"`

### onset

> `readonly` **onset**: (`anchor`) => `object`

Sync to note attacks (OnsetProjection).

#### Parameters

##### anchor

[`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

#### Returns

`object`

##### anchor

> `readonly` **anchor**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

##### mode

> `readonly` **mode**: `"beat"` \| `"onset"` \| `"peak"`

### peak

> `readonly` **peak**: (`anchor`) => `object`

Sync to loudness peaks (WaveformProjection + peak-pick).

#### Parameters

##### anchor

[`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

#### Returns

`object`

##### anchor

> `readonly` **anchor**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

##### mode

> `readonly` **mode**: `"beat"` \| `"onset"` \| `"peak"`
