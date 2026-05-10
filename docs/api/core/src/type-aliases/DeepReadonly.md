[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DeepReadonly

# Type Alias: DeepReadonly\<T\>

> **DeepReadonly**\<`T`\> = `T` *extends* infer U[] ? `ReadonlyArray`\<`DeepReadonly`\<`U`\>\> : `T` *extends* `Record`\<`string`, `unknown`\> ? `{ readonly [K in keyof T]: DeepReadonly<T[K]> }` : `T`

Defined in: core/src/type-utils.ts:44

Deep readonly

## Type Parameters

### T

`T`
