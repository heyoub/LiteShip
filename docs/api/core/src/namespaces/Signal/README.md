[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Signal

# Signal

Signal namespace -- live data feeds from the browser environment.

Create reactive signals from viewport, scroll, pointer, time, media query,
audio, or custom sources. Each signal provides `.current` and `.changes`
backed by Effect's SubscriptionRef. Scoped for automatic listener cleanup.

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

## Type Aliases

- [Audio](type-aliases/Audio.md)
- [Controllable](type-aliases/Controllable.md)
- [Shape](type-aliases/Shape.md)
