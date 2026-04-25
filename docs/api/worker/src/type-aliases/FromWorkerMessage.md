[**czap**](../../../README.md)

***

[czap](../../../README.md) / [worker/src](../README.md) / FromWorkerMessage

# Type Alias: FromWorkerMessage

> **FromWorkerMessage** = `ReadyMessage` \| `StateMessage` \| `ResolvedStateAckMessage` \| `FrameMessage` \| `RenderCompleteMessage` \| `ErrorMessage` \| `MetricsMessage`

Defined in: [worker/src/messages.ts:289](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/worker/src/messages.ts#L289)

Every message a worker may send back to the main thread. Discriminated
on the `type` field. Includes readiness, state updates, frame output,
metrics, completion signals, and errors.
