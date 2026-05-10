[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / FrameBudget

# FrameBudget

FrameBudget -- rAF-based frame budget manager with priority lanes.
Tracks remaining time per animation frame and gates work by priority:
`critical` (always runs) `> high > low > idle`.

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

## Type Aliases

- [Shape](type-aliases/Shape.md)
