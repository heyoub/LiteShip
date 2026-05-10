[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Receipt

# Receipt

Receipt namespace -- chain validation and envelope construction.

Build, validate, append, query, and sign linear receipt chains.
Each envelope is content-addressed and linked to its predecessor.
Supports HMAC signing/verification for tamper detection.

## Example

```ts
import { Effect } from 'effect';
import { Receipt, HLC } from '@czap/core';

const program = Effect.gen(function* () {
  const ts = HLC.increment(HLC.create('node-1'), Date.now());
  const chain = yield* Receipt.buildChain([
    { kind: 'init', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts },
  ]);
  const valid = yield* Receipt.validateChain(chain);
  const latest = Receipt.head(chain);
});
```

## Type Aliases

- [ChainError](type-aliases/ChainError.md)
- [Envelope](type-aliases/Envelope.md)
- [Subject](type-aliases/Subject.md)
