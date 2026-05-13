[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / GenFrame

# Variable: GenFrame

> `const` **GenFrame**: `object`

Defined in: [core/src/gen-frame.ts:215](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/gen-frame.ts#L215)

Generative-UI frame scheduler namespace.

Turns a bursty LLM token stream into evenly-paced frames the DOM runtime
can apply without stalling, and resolves disconnect gaps using the receipt
chain or transport resumption.

## Type Declaration

### make

> **make**: (`config`) => `GenFrameSchedulerShape` = `_make`

Create a new fixed-step scheduler bound to a [TokenBuffer](TokenBuffer.md) and quality-tier probe.

#### Parameters

##### config

`GenFrameConfig`

#### Returns

`GenFrameSchedulerShape`

### resolveGap

> **resolveGap**: (`lastAckReceiptId`, `currentStreamPosition`, `receiptChain`, `resumptionState`) => [`GapStrategy`](../type-aliases/GapStrategy.md)

Pick a recovery [GapStrategy](../type-aliases/GapStrategy.md) after a stream disconnect.

#### Parameters

##### lastAckReceiptId

`ContentAddress` \| `null`

##### currentStreamPosition

`number`

##### receiptChain

`ReceiptChainInfo`

##### resumptionState

`ResumptionInfo`

#### Returns

[`GapStrategy`](../type-aliases/GapStrategy.md)
