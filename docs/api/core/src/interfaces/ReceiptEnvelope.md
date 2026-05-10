[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / ReceiptEnvelope

# Interface: ReceiptEnvelope

Defined in: core/src/receipt.ts:25

Single link in a receipt chain: timestamped, content-addressed, and linked
to its predecessor(s). Merge envelopes carry an array of `previous` hashes;
optionally MAC-signed via `Receipt.macEnvelope`.

## Properties

### hash

> `readonly` **hash**: `string`

Defined in: core/src/receipt.ts:30

***

### kind

> `readonly` **kind**: `string`

Defined in: core/src/receipt.ts:26

***

### payload

> `readonly` **payload**: `TypedRefShape`

Defined in: core/src/receipt.ts:29

***

### previous

> `readonly` **previous**: `string` \| readonly `string`[]

Defined in: core/src/receipt.ts:31

***

### signature?

> `readonly` `optional` **signature?**: `string`

Defined in: core/src/receipt.ts:32

***

### subject

> `readonly` **subject**: [`ReceiptSubject`](ReceiptSubject.md)

Defined in: core/src/receipt.ts:28

***

### timestamp

> `readonly` **timestamp**: [`HLCBrand`](HLCBrand.md)

Defined in: core/src/receipt.ts:27
