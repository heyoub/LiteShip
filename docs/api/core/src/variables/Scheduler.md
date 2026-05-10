[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Scheduler

# Variable: Scheduler

> `const` **Scheduler**: `object`

Defined in: core/src/scheduler.ts:143

Scheduler — clock abstraction that decouples animation driver from real time.
Pick the impl that matches the runtime: `raf` in browser, `noop` on the
server, `fixedStep` for deterministic video render, `audioSync` to drive UI
in lockstep with an [AVBridge](AVBridge.md).

## Type Declaration

### audioSync

> **audioSync**: (`bridge`) => `AudioSyncShape` = `_audioSync`

Scheduler that polls an [AVBridge](AVBridge.md) and fires callbacks when the sample frame advances.

#### Parameters

##### bridge

`AVBridgeShape`

#### Returns

`AudioSyncShape`

### fixedStep

> **fixedStep**: (`fps`) => `FixedStepShape` = `_fixedStep`

Fixed-step scheduler at the given fps — deterministic timestamps for offline rendering.

#### Parameters

##### fps

`number`

#### Returns

`FixedStepShape`

### noop

> **noop**: () => `SchedulerShape` = `_noop`

No-op scheduler for SSR / environments without rAF.

SSR-safe: noop scheduler for server environments.

#### Returns

`SchedulerShape`

### raf

> **raf**: () => `SchedulerShape` = `_raf`

`requestAnimationFrame`-backed scheduler for browser real-time work.

Default: requestAnimationFrame. Used by Timeline/animate in browser.

#### Returns

`SchedulerShape`
