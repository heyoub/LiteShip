[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [worker/src](../../README.md) / Messages

# Messages

Runtime type guards and type aliases for the worker message protocol.
Consumers typically use [Messages.isToWorker](../../variables/Messages.md#istoworker) /
[Messages.isFromWorker](../../variables/Messages.md#isfromworker) inside a `message` handler to narrow
`event.data` before switching on the `type` field.

## Example

```ts
worker.addEventListener('message', (e) => {
  if (!Messages.isFromWorker(e.data)) return;
  if (e.data.type === 'state') { /* ... */ }
});
```

## Type Aliases

- [BootstrapRegistration](type-aliases/BootstrapRegistration.md)
- [Config](type-aliases/Config.md)
- [FromWorker](type-aliases/FromWorker.md)
- [ResolvedState](type-aliases/ResolvedState.md)
- [StartupPacket](type-aliases/StartupPacket.md)
- [ToWorker](type-aliases/ToWorker.md)
- [Update](type-aliases/Update.md)
