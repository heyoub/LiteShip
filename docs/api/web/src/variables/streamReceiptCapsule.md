[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / streamReceiptCapsule

# Variable: streamReceiptCapsule

> `const` **streamReceiptCapsule**: `CapsuleDef`\<`"receiptedMutation"`, \{ `kind`: `"snapshot"` \| `"patch"` \| `"batch"` \| `"signal"`; `payload`: `unknown`; \}, \{ `receipt`: \{ `appliedAt`: `number`; `messageId`: `string`; `morphPath?`: `string`; \}; `status`: `"applied"` \| `"skipped"` \| `"failed"`; \}, `unknown`\>

Defined in: [web/src/capsules/stream-receipt.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/capsules/stream-receipt.ts#L36)

Declared capsule for the SSE stream receipt flow. Registered in the
module-level catalog at import time; walked by the factory compiler.
