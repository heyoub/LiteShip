[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generatePureTransform

# Function: generatePureTransform()

> **generatePureTransform**(`cap`, `ctx?`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/pure-transform.ts:47](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/pure-transform.ts#L47)

Generate the test + bench file contents for a `pureTransform` capsule.
The emitted files are strings; the repo compiler writes them to
`tests/generated/<name>.{test,bench}.ts`.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"pureTransform"`, `unknown`, `unknown`, `unknown`\>

### ctx?

[`HarnessContext`](../interfaces/HarnessContext.md) = `{}`

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
