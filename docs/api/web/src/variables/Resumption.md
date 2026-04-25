[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / Resumption

# Variable: Resumption

> `const` **Resumption**: `object`

Defined in: [web/src/stream/resumption.ts:344](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/resumption.ts#L344)

SSE resumption protocol namespace.

Handles connection resumption using `lastEventId`. Persists resumption
state to `sessionStorage`, compares event IDs to determine if replay
is possible, and falls back to full snapshot when the gap is too large.

## Type Declaration

### canResume

> **canResume**: (`lastEventId`, `serverOldestId`) => `boolean`

Re-export of the Effect-free gap-size check from `./resumption-pure.js`.

Check if resumption is possible by comparing event IDs.

#### Parameters

##### lastEventId

`string`

##### serverOldestId

`string`

#### Returns

`boolean`

### clearState

> **clearState**: (`artifactId`) => `Effect`\<`void`\>

Clear resumption state from sessionStorage.

#### Parameters

##### artifactId

`string`

The artifact ID whose state should be cleared

#### Returns

`Effect`\<`void`\>

An Effect that removes the state

#### Example

```ts
import { Resumption } from '@czap/web';
import { Effect } from 'effect';

Effect.runSync(Resumption.clearState('article-123'));
```

### loadState

> **loadState**: (`artifactId`) => `Effect`\<[`ResumptionState`](../interfaces/ResumptionState.md) \| `null`\>

Load resumption state from sessionStorage.

#### Parameters

##### artifactId

`string`

The artifact ID to load state for

#### Returns

`Effect`\<[`ResumptionState`](../interfaces/ResumptionState.md) \| `null`\>

An Effect yielding the saved state, or null if none exists

#### Example

```ts
import { Resumption } from '@czap/web';
import { Effect } from 'effect';

const state = Effect.runSync(Resumption.loadState('article-123'));
if (state) {
  console.log(state.lastEventId); // 'evt-42'
}
```

### parseEventId

> **parseEventId**: (`eventId`) => `object`

Re-export of the Effect-free event-id parser from `./resumption-pure.js`.

Parse an event ID to extract sequence number and other components.

Supports: numeric ("123"), prefixed ("evt-123"),
HLC-style ("1234567890-5-node1"), HLC simple ("1234567890-5").

#### Parameters

##### eventId

`string`

#### Returns

`object`

##### nodeId?

> `optional` **nodeId?**: `string`

##### raw

> **raw**: `string`

##### sequence

> **sequence**: `number`

##### timestamp?

> `optional` **timestamp?**: `number`

### resume

> **resume**: (`artifactId`, `currentEventId`, `config?`) => `Effect`\<[`ResumeResponse`](../type-aliases/ResumeResponse.md), `Error`\>

Resume from a disconnection, choosing between event replay (small gap)
and full snapshot (large gap or no prior state).

#### Parameters

##### artifactId

`string`

The artifact to resume

##### currentEventId

`string`

The latest event ID from the reconnected stream

##### config?

`Partial`\<[`ResumptionConfig`](../interfaces/ResumptionConfig.md)\>

Optional partial config overriding defaults

#### Returns

`Effect`\<[`ResumeResponse`](../type-aliases/ResumeResponse.md), `Error`\>

An Effect yielding a [ResumeResponse](../type-aliases/ResumeResponse.md)

#### Example

```ts
import { Resumption } from '@czap/web';
import { Effect } from 'effect';

const response = Effect.runPromise(
  Resumption.resume('article-123', 'evt-50', { maxGapSize: 100 }),
);
// response.type => 'replay' | 'snapshot'
```

### saveState

> **saveState**: (`state`) => `Effect`\<`void`\>

Save resumption state to sessionStorage.

#### Parameters

##### state

[`ResumptionState`](../interfaces/ResumptionState.md)

The resumption state to persist

#### Returns

`Effect`\<`void`\>

An Effect that saves the state

#### Example

```ts
import { Resumption } from '@czap/web';
import { Effect } from 'effect';

Effect.runSync(Resumption.saveState({
  artifactId: 'article-123',
  lastEventId: 'evt-42',
  lastSequence: 42,
}));
```

## Example

```ts
import { Resumption } from '@czap/web';
import { Effect } from 'effect';

// Save state on each SSE message
Effect.runSync(Resumption.saveState({
  artifactId: 'doc-1', lastEventId: 'evt-99', lastSequence: 99,
}));

// On reconnect, resume from where we left off
const response = Effect.runPromise(Resumption.resume('doc-1', 'evt-105'));
// response.type => 'replay' (patches) or 'snapshot' (full state)
```
