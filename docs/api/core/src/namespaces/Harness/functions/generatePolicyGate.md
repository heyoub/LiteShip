[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generatePolicyGate

# Function: generatePolicyGate()

> **generatePolicyGate**(`cap`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/policy-gate.ts:19](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/policy-gate.ts#L19)

Generate the test + bench file contents for a `policyGate` capsule.
Emits `it.skip` placeholders for allow / deny / reason-chain coverage.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"policyGate"`, `unknown`, `unknown`, `unknown`\>

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
