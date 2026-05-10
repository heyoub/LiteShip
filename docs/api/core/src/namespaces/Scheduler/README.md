[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Scheduler

# Scheduler

Scheduler — clock abstraction that decouples animation driver from real time.
Pick the impl that matches the runtime: `raf` in browser, `noop` on the
server, `fixedStep` for deterministic video render, `audioSync` to drive UI
in lockstep with an [AVBridge](../../variables/AVBridge.md).

## Type Aliases

- [AudioSync](type-aliases/AudioSync.md)
- [FixedStep](type-aliases/FixedStep.md)
- [Shape](type-aliases/Shape.md)
