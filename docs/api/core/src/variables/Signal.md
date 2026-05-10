[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Signal

# Variable: Signal

> `const` **Signal**: `object`

Defined in: core/src/signal.ts:336

Signal namespace -- live data feeds from the browser environment.

Create reactive signals from viewport, scroll, pointer, time, media query,
audio, or custom sources. Each signal provides `.current` and `.changes`
backed by Effect's SubscriptionRef. Scoped for automatic listener cleanup.

## Type Declaration

### audio

> **audio**: (`bridge`, `mode`, `totalDurationSec?`) => `Effect`\<`AudioSignalShape`, `never`, [`Scope`](#)\> = `_audio`

Create an audio signal backed by an AVBridge.

In 'sample' mode, returns the raw sample index. In 'normalized' mode,
returns a 0..1 progress value based on totalDurationSec. Call `.poll()`
to read the latest sample from the bridge and update the signal.

#### Parameters

##### bridge

`AVBridgeShape`

##### mode?

`"sample"` \| `"normalized"`

##### totalDurationSec?

`number`

#### Returns

`Effect`\<`AudioSignalShape`, `never`, [`Scope`](#)\>

#### Example

```ts
import { Effect } from 'effect';
import { Signal } from '@czap/core';

const program = Effect.scoped(Effect.gen(function* () {
  const audioSig = yield* Signal.audio(bridge, 'normalized', 120);
  const progress = yield* audioSig.poll();
  // progress is a number between 0 and 1
}));
```

### controllable

> **controllable**: () => `Effect`\<`ControllableSignalShape`\<`number`\>, `never`, [`Scope`](#)\> = `_controllable`

Create a controllable time signal for video rendering / scrubbing.

External code drives the signal value via seek(); no automatic ticking.
Supports pause/resume to temporarily ignore seek updates.

#### Returns

`Effect`\<`ControllableSignalShape`\<`number`\>, `never`, [`Scope`](#)\>

#### Example

```ts
import { Effect } from 'effect';
import { Signal } from '@czap/core';

const program = Effect.scoped(Effect.gen(function* () {
  const ctrl = yield* Signal.controllable();
  yield* ctrl.seek(1500);
  const t = yield* ctrl.current;
  // t === 1500
  yield* ctrl.pause();
  yield* ctrl.seek(2000); // ignored while paused
}));
```

### make

> **make**: (`source`) => `Effect`\<`SignalShape`\<`number`\>, `never`, [`Scope`](#)\> = `_make`

Create a reactive signal from a browser environment source.

Returns a scoped Effect that sets up event listeners (resize, scroll,
pointermove, etc.) and cleans them up when the scope closes. The signal
exposes `.current` (latest value) and `.changes` (stream of updates).

#### Parameters

##### source

[`SignalSource`](../type-aliases/SignalSource.md)

#### Returns

`Effect`\<`SignalShape`\<`number`\>, `never`, [`Scope`](#)\>

#### Example

```ts
import { Effect, Scope } from 'effect';
import { Signal } from '@czap/core';

const program = Effect.scoped(Effect.gen(function* () {
  const sig = yield* Signal.make({ type: 'viewport', axis: 'width' });
  const width = yield* sig.current;
  // width === current window.innerWidth
}));
```

## Example

```ts
import { Effect } from 'effect';
import { Signal } from '@czap/core';

const program = Effect.scoped(Effect.gen(function* () {
  const viewport = yield* Signal.make({ type: 'viewport', axis: 'width' });
  const width = yield* viewport.current;
  const ctrl = yield* Signal.controllable();
  yield* ctrl.seek(500);
}));
```
