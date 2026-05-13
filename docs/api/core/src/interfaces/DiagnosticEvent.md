[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DiagnosticEvent

# Interface: DiagnosticEvent

Defined in: [core/src/diagnostics.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L28)

A [DiagnosticPayload](DiagnosticPayload.md) enriched with severity and an emission timestamp.

## Extends

- [`DiagnosticPayload`](DiagnosticPayload.md)

## Properties

### cause?

> `readonly` `optional` **cause?**: `unknown`

Defined in: [core/src/diagnostics.ts:23](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L23)

#### Inherited from

[`DiagnosticPayload`](DiagnosticPayload.md).[`cause`](DiagnosticPayload.md#cause)

***

### code

> `readonly` **code**: `string`

Defined in: [core/src/diagnostics.ts:21](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L21)

#### Inherited from

[`DiagnosticPayload`](DiagnosticPayload.md).[`code`](DiagnosticPayload.md#code)

***

### detail?

> `readonly` `optional` **detail?**: `unknown`

Defined in: [core/src/diagnostics.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L24)

#### Inherited from

[`DiagnosticPayload`](DiagnosticPayload.md).[`detail`](DiagnosticPayload.md#detail)

***

### level

> `readonly` **level**: [`DiagnosticLevel`](../type-aliases/DiagnosticLevel.md)

Defined in: [core/src/diagnostics.ts:29](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L29)

***

### message

> `readonly` **message**: `string`

Defined in: [core/src/diagnostics.ts:22](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L22)

#### Inherited from

[`DiagnosticPayload`](DiagnosticPayload.md).[`message`](DiagnosticPayload.md#message)

***

### source

> `readonly` **source**: `string`

Defined in: [core/src/diagnostics.ts:20](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L20)

#### Inherited from

[`DiagnosticPayload`](DiagnosticPayload.md).[`source`](DiagnosticPayload.md#source)

***

### timestamp

> `readonly` **timestamp**: `number`

Defined in: [core/src/diagnostics.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/diagnostics.ts#L30)
