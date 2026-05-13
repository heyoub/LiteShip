[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Receipt

# Variable: Receipt

> `const` **Receipt**: `object`

Defined in: [core/src/receipt.ts:419](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/receipt.ts#L419)

Receipt namespace -- chain validation and envelope construction.

Build, validate, append, query, and sign linear receipt chains.
Each envelope is content-addressed and linked to its predecessor.
Supports HMAC signing/verification for tamper detection.

## Type Declaration

### append

> **append**: (`chain`, `entry`, `previousHashes?`) => `Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]\>

Append a new entry to an existing chain, auto-linking to the previous hash.

Optionally accepts explicit previous hashes for merge envelopes.

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

##### entry

###### kind

`string`

###### payload

`TypedRefShape`

###### subject

[`ReceiptSubject`](../interfaces/ReceiptSubject.md)

###### timestamp

[`HLCBrand`](../interfaces/HLCBrand.md)

##### previousHashes?

readonly `string`[]

#### Returns

`Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]\>

#### Example

```ts
const chain = yield* Receipt.buildChain([entry1]);
const extended = yield* Receipt.append(chain, {
  kind: 'update', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts2,
});
// extended.length === 2
```

### buildChain

> **buildChain**: (`entries`) => `Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]\>

Build a linear chain of receipt envelopes from an array of entries.

Each envelope's `previous` points to the prior envelope's hash,
starting from GENESIS.

#### Parameters

##### entries

readonly `object`[]

#### Returns

`Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]\>

#### Example

```ts
const chain = yield* Receipt.buildChain([
  { kind: 'init', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts1 },
  { kind: 'update', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts2 },
]);
// chain.length === 2
// chain[1].previous === chain[0].hash
```

### createEnvelope

> **createEnvelope**: (`kind`, `subject`, `payload`, `timestamp`, `previousHash`) => `Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)\>

Create a new receipt envelope with an auto-computed content hash.

#### Parameters

##### kind

`string`

##### subject

[`ReceiptSubject`](../interfaces/ReceiptSubject.md)

##### payload

`TypedRefShape`

##### timestamp

[`HLCBrand`](../interfaces/HLCBrand.md)

##### previousHash

`string` \| readonly `string`[]

#### Returns

`Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)\>

#### Example

```ts
const envelope = yield* Receipt.createEnvelope(
  'state-change',
  { type: 'effect', id: 'actor-1' },
  { _tag: 'TypedRef', mediaType: 'application/json', data: { key: 'value' } },
  hlcTimestamp,
  Receipt.GENESIS,
);
// envelope.hash is the computed SHA-256 content address
```

### findByHash

> **findByHash**: (`chain`, `hash`) => [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `undefined`

Find an envelope in a chain by its content hash.

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

##### hash

`string`

#### Returns

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `undefined`

#### Example

```ts
const found = Receipt.findByHash(chain, targetHash);
// found?.hash === targetHash
```

### findByKind

> **findByKind**: (`chain`, `kind`) => [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

Find all envelopes in a chain matching a given kind.

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

##### kind

`string`

#### Returns

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Example

```ts
const updates = Receipt.findByKind(chain, 'update');
// updates contains all envelopes with kind === 'update'
```

### generateMACKey

> **generateMACKey**: () => `Effect`\<`CryptoKey`, `Error`\>

Generate an HMAC-SHA-256 key for signing receipt envelopes.

#### Returns

`Effect`\<`CryptoKey`, `Error`\>

#### Example

```ts
const key = yield* Receipt.generateMACKey();
const signed = yield* Receipt.macEnvelope(envelope, key);
// signed.signature is a hex string
```

### GENESIS

> **GENESIS**: `string`

Sentinel `previous` value marking the root of a receipt chain.

### hashEnvelope

> **hashEnvelope**: (`envelope`) => `Effect`\<`string`\>

Compute the content hash of a receipt envelope.

Normalizes the `previous` field (sorts array form), canonicalizes the
payload, and hashes with SHA-256 via TypedRef.

#### Parameters

##### envelope

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)

#### Returns

`Effect`\<`string`\>

#### Example

```ts
import { Effect } from 'effect';

const hash = yield* Receipt.hashEnvelope(envelope);
// hash === envelope.hash (if envelope is valid)
```

### head

> **head**: (`chain`) => [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `undefined`

Get the last (most recent) envelope in a chain.

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `undefined`

#### Example

```ts
const latest = Receipt.head(chain);
// latest === chain[chain.length - 1]
```

### isGenesis

> **isGenesis**: (`receipt`) => `boolean`

Check whether a receipt envelope is a genesis (root) envelope.

#### Parameters

##### receipt

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)

#### Returns

`boolean`

#### Example

```ts
const chain = yield* Receipt.buildChain(entries);
Receipt.isGenesis(chain[0]); // true
Receipt.isGenesis(chain[1]); // false
```

### macEnvelope

> **macEnvelope**: (`envelope`, `key`) => `Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md), `Error`\>

Sign a receipt envelope with an HMAC key, adding a `signature` field.

#### Parameters

##### envelope

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)

##### key

`CryptoKey`

#### Returns

`Effect`\<[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md), `Error`\>

#### Example

```ts
const key = yield* Receipt.generateMACKey();
const signed = yield* Receipt.macEnvelope(envelope, key);
// signed.signature !== undefined
```

### tail

> **tail**: (`chain`) => [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `undefined`

Get the first (genesis) envelope in a chain.

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `undefined`

#### Example

```ts
const first = Receipt.tail(chain);
// first === chain[0]
```

### validateChain

> **validateChain**: (`chain`) => `Effect`\<`boolean`, `Error`\>

Validate a receipt chain: genesis link, hash integrity, chain continuity, HLC ordering.

Returns true on success or fails with an Error describing the violation.

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

`Effect`\<`boolean`, `Error`\>

#### Example

```ts
const chain = yield* Receipt.buildChain(entries);
const valid = yield* Receipt.validateChain(chain);
// valid === true
```

### validateChainDetailed

> **validateChainDetailed**: (`chain`) => `Effect`\<`true`, [`ChainValidationError`](../type-aliases/ChainValidationError.md)\>

Validate a receipt chain with detailed, structured error reporting.

Returns `true` on success or fails with a typed `ChainValidationError`
discriminated union (not_genesis | hash_mismatch | chain_break | hlc_not_increasing).

#### Parameters

##### chain

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

`Effect`\<`true`, [`ChainValidationError`](../type-aliases/ChainValidationError.md)\>

#### Example

```ts
import { Effect } from 'effect';

const result = yield* Effect.either(Receipt.validateChainDetailed(chain));
// result._tag === 'Right' on success
// result._tag === 'Left' with .left.type on failure
```

### verifyMAC

> **verifyMAC**: (`envelope`, `key`) => `Effect`\<`boolean`, `Error`\>

Verify an envelope's HMAC signature against a key.

Returns false if the envelope has no signature.

#### Parameters

##### envelope

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)

##### key

`CryptoKey`

#### Returns

`Effect`\<`boolean`, `Error`\>

#### Example

```ts
const valid = yield* Receipt.verifyMAC(signedEnvelope, key);
// valid === true if signature matches
```

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
