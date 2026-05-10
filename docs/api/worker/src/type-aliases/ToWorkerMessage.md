[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / ToWorkerMessage

# Type Alias: ToWorkerMessage

> **ToWorkerMessage** = `InitMessage` \| `AddQuantizerMessage` \| `BootstrapQuantizersMessage` \| `StartupComputeMessage` \| `BootstrapResolvedStateMessage` \| `ApplyResolvedStateMessage` \| `ApplyUpdatesMessage` \| `RemoveQuantizerMessage` \| `EvaluateMessage` \| `SetBlendMessage` \| `WarmResetMessage` \| `ComputeMessage` \| `StartRenderMessage` \| `StopRenderMessage` \| `TransferCanvasMessage` \| `DisposeMessage`

Defined in: worker/src/messages.ts:198

Every message the main thread may send to a compositor/render worker.
Discriminated on the `type` field.
