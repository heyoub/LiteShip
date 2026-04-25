[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generateReceiptedMutation

# Function: generateReceiptedMutation()

> **generateReceiptedMutation**(`cap`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/receipted-mutation.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/receipted-mutation.ts#L24)

Generate the test + bench file contents for a `receiptedMutation` capsule.
Emits `it.skip` placeholders covering contract shape, idempotency, audit
receipt, and fault reachability — each carries a TODO naming the
invocation channel it would need.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"receiptedMutation"`, `unknown`, `unknown`, `unknown`\>

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
