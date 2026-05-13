[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / Messages

# Variable: Messages

> `const` **Messages**: `object`

Defined in: [worker/src/messages.ts:316](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/messages.ts#L316)

Runtime type guards and type aliases for the worker message protocol.
Consumers typically use [Messages.isToWorker](#istoworker) /
[Messages.isFromWorker](#isfromworker) inside a `message` handler to narrow
`event.data` before switching on the `type` field.

## Type Declaration

### isFromWorker()

> `readonly` **isFromWorker**(`msg`): `msg is FromWorkerMessage`

Type guard: is a FromWorkerMessage

#### Parameters

##### msg

`unknown`

#### Returns

`msg is FromWorkerMessage`

### isToWorker()

> `readonly` **isToWorker**(`msg`): `msg is ToWorkerMessage`

Type guard: is a ToWorkerMessage

#### Parameters

##### msg

`unknown`

#### Returns

`msg is ToWorkerMessage`

## Example

```ts
worker.addEventListener('message', (e) => {
  if (!Messages.isFromWorker(e.data)) return;
  if (e.data.type === 'state') { /* ... */ }
});
```
