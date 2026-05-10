[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / HLC

# Variable: HLC

> `const` **HLC**: `object`

Defined in: [core/src/hlc.ts:223](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/hlc.ts#L223)

HLC namespace -- Hybrid Logical Clock.

Pure functions for creating, comparing, incrementing, and merging HLC
timestamps, plus Effect-based managed clock helpers. Encodes to/from
a deterministic colon-separated hex string format.

## Type Declaration

### compare

> **compare**: (`a`, `b`) => `-1` \| `0` \| `1`

Compare two HLC timestamps. Returns -1, 0, or 1.

Compares wall_ms first, then counter, then node_id lexicographically.

#### Parameters

##### a

`HLCShape`

##### b

`HLCShape`

#### Returns

`-1` \| `0` \| `1`

#### Example

```ts
const a = HLC.create('node-1');
const b = HLC.increment(a, 1000);
const cmp = HLC.compare(a, b);
// cmp === -1 (a is before b)
```

### create

> **create**: (`nodeId`) => `HLCShape` = `_create`

Create a new HLC timestamp initialized to zero for the given node.

#### Parameters

##### nodeId

`string`

#### Returns

`HLCShape`

#### Example

```ts
const hlc = HLC.create('node-1');
// hlc === { wall_ms: 0, counter: 0, node_id: 'node-1' }
```

### decode

> **decode**: (`s`) => `HLCShape` = `_decode`

Decode an HLC timestamp from a colon-separated hex string.

Inverse of `encode`. Supports node IDs containing colons.

#### Parameters

##### s

`string`

#### Returns

`HLCShape`

#### Example

```ts
const hlc = HLC.decode('0000000003e8:0000:node-1');
// hlc === { wall_ms: 1000, counter: 0, node_id: 'node-1' }
```

### encode

> **encode**: (`hlc`) => `string` = `_encode`

Encode an HLC timestamp to a colon-separated hex string.

Format: `{wall_ms_hex_12}:{counter_hex_4}:{node_id}`

#### Parameters

##### hlc

`HLCShape`

#### Returns

`string`

#### Example

```ts
const hlc = HLC.increment(HLC.create('node-1'), 1000);
const encoded = HLC.encode(hlc);
// encoded === '0000000003e8:0000:node-1'
```

### increment

> **increment**: (`hlc`, `now`) => `HLCShape` = `_increment`

Increment an HLC for a local event.

Advances wall_ms to max(current, now) and bumps the counter if the wall
time didn't advance. Throws on counter overflow (`> 0xFFFF`).

#### Parameters

##### hlc

`HLCShape`

##### now?

`number` = `0`

#### Returns

`HLCShape`

#### Example

```ts
const hlc0 = HLC.create('node-1');
const hlc1 = HLC.increment(hlc0, Date.now());
// hlc1.wall_ms >= hlc0.wall_ms
```

### makeClock

> **makeClock**: (`nodeId`) => `Effect`\<`Ref`\<`HLCShape`\>\>

Create a managed HLC clock as an Effect Ref.

#### Parameters

##### nodeId

`string`

#### Returns

`Effect`\<`Ref`\<`HLCShape`\>\>

#### Example

```ts
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const clock = yield* HLC.makeClock('node-1');
  const ts = yield* HLC.tick(clock);
  // ts.wall_ms === Date.now() (approximately)
});
```

### merge

> **merge**: (`local`, `remote`, `now`) => `HLCShape` = `_merge`

Merge a local HLC with a remote HLC on message receive.

Takes the max of local, remote, and now for wall_ms, then adjusts the
counter accordingly. Preserves the local node_id.

Lamport causality: if wall clocks agree, increment the higher counter to preserve
happened-before ordering. Reset counter only when wall clock advances (new causal epoch).

#### Parameters

##### local

`HLCShape`

##### remote

`HLCShape`

##### now?

`number` = `0`

#### Returns

`HLCShape`

#### Example

```ts
const local = HLC.increment(HLC.create('A'), 1000);
const remote = HLC.increment(HLC.create('B'), 2000);
const merged = HLC.merge(local, remote, 1500);
// merged.wall_ms === 2000, merged.node_id === 'A'
```

### receive

> **receive**: (`clock`, `remote`) => `Effect`\<`HLCShape`\>

Receive a remote HLC timestamp and merge it into the managed clock.

#### Parameters

##### clock

`Ref`\<`HLCShape`\>

##### remote

`HLCShape`

#### Returns

`Effect`\<`HLCShape`\>

#### Example

```ts
const remoteTs = HLC.decode(remoteEncoded);
const merged = yield* HLC.receive(clock, remoteTs);
// merged.wall_ms >= remoteTs.wall_ms
```

### tick

> **tick**: (`clock`) => `Effect`\<`HLCShape`\>

Tick a managed clock forward, returning the new HLC timestamp.

#### Parameters

##### clock

`Ref`\<`HLCShape`\>

#### Returns

`Effect`\<`HLCShape`\>

#### Example

```ts
const ts = yield* HLC.tick(clock);
// ts.wall_ms >= previous wall_ms
```

## Example

```ts
import { HLC } from '@czap/core';

const a = HLC.increment(HLC.create('A'), Date.now());
const b = HLC.increment(HLC.create('B'), Date.now());
const merged = HLC.merge(a, b, Date.now());
const encoded = HLC.encode(merged);
const decoded = HLC.decode(encoded);
```
