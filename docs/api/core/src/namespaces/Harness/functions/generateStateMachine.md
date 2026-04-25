[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generateStateMachine

# Function: generateStateMachine()

> **generateStateMachine**(`cap`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/state-machine.ts:20](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/state-machine.ts#L20)

Generate the test + bench file contents for a `stateMachine` capsule.
Emits `it.skip` placeholders covering illegal transitions, replay, and
invariant preservation — each carries a TODO naming the missing handler.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"stateMachine"`, `unknown`, `unknown`, `unknown`\>

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
