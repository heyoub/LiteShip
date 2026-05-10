[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / dispatch

# Function: dispatch()

> **dispatch**(`def`): [`CompileResult`](../type-aliases/CompileResult.md)

Defined in: compiler/src/dispatch.ts:137

Dispatch a [CompilerDef](../type-aliases/CompilerDef.md) to the matching compiler and return a
tagged [CompileResult](../type-aliases/CompileResult.md).

This is the single public entry point for multi-target compilation.
The switch has no default case; adding a new arm to [CompilerDef](../type-aliases/CompilerDef.md)
will produce a type error at dispatch.

## Parameters

### def

[`CompilerDef`](../type-aliases/CompilerDef.md)

The compiler definition arm to dispatch

## Returns

[`CompileResult`](../type-aliases/CompileResult.md)

A [CompileResult](../type-aliases/CompileResult.md) tagged by target

## Example

```ts
import { Boundary } from '@czap/core';
import { dispatch } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const, thresholds: [0, 768],
});
const result = dispatch({
  _tag: 'CSSCompiler',
  boundary,
  states: { sm: { 'font-size': '14px' }, lg: { 'font-size': '18px' } },
});
if (result.target === 'css') {
  console.log(result.result.raw); // emitted @container rules
}
```
