[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / TokenJSResult

# Interface: TokenJSResult

Defined in: compiler/src/token-js.ts:25

Output of [TokenJSCompiler.compile](../variables/TokenJSCompiler.md#compile).

Two parallel artifacts for the same token set: a runtime ES module and
a companion ambient declaration. The type declaration uses `typeof` so
values round-trip exactly through the compiler without hand-maintained
duplication.

## Properties

### code

> `readonly` **code**: `string`

Defined in: compiler/src/token-js.ts:27

Runtime `.ts` source declaring `export const tokens` with const assertion.

***

### typeDeclaration

> `readonly` **typeDeclaration**: `string`

Defined in: compiler/src/token-js.ts:29

Ambient `.d.ts` declaration exposing the same shape via `typeof`.
