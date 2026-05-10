[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIDimension

# Interface: AIDimension

Defined in: [compiler/src/ai-manifest.ts:22](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L22)

Named dimension of UI state (e.g. `theme`, `layout`, `density`).

`exclusive: true` means exactly one state is active at a time (a radio
group); `exclusive: false` allows multiple concurrent states (a flag set).

## Properties

### current

> `readonly` **current**: `string`

Defined in: [compiler/src/ai-manifest.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L26)

Currently-active state (must be in `states`).

***

### description

> `readonly` **description**: `string`

Defined in: [compiler/src/ai-manifest.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L30)

Human-readable description surfaced to the LLM.

***

### exclusive

> `readonly` **exclusive**: `boolean`

Defined in: [compiler/src/ai-manifest.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L28)

Whether only one state can be active at a time.

***

### states

> `readonly` **states**: readonly `string`[]

Defined in: [compiler/src/ai-manifest.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/ai-manifest.ts#L24)

Allowed state names.
