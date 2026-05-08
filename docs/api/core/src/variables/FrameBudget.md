[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / FrameBudget

# Variable: FrameBudget

> `const` **FrameBudget**: `object`

Defined in: [core/src/frame-budget.ts:144](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/frame-budget.ts#L144)

FrameBudget -- rAF-based frame budget manager with priority lanes.
Tracks remaining time per animation frame and gates work by priority:
`critical` (always runs) `> high > low > idle`.

## Type Declaration

### make

> **make**: (`config?`) => `Effect`\<`FrameBudgetShape`, `never`, [`Scope`](#)\> = `_make`

Creates a FrameBudget tracker tied to rAF, with priority-based scheduling.
Critical tasks always run; lower priorities are deferred if budget is exhausted.

#### Parameters

##### config?

###### targetFps?

`number`

#### Returns

`Effect`\<`FrameBudgetShape`, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const budget = yield* FrameBudget.make({ targetFps: 60 });
  const remaining = budget.remaining(); // ms left in this frame
  const canAnimate = budget.canRun('high'); // true if enough budget
  const result = yield* budget.schedule('low', Effect.succeed('done'));
  // result is 'done' if budget permits, null otherwise
}));
```

## Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const budget = yield* FrameBudget.make({ targetFps: 60 });
  if (budget.canRun('high')) {
    yield* budget.schedule('high', Effect.succeed('rendered'));
  }
  const fps = yield* budget.fps; // current measured FPS
}));
```
