[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / RequireAtLeastOne

# Type Alias: RequireAtLeastOne\<T, Keys\>

> **RequireAtLeastOne**\<`T`, `Keys`\> = `Pick`\<`T`, `Exclude`\<keyof `T`, `Keys`\>\> & `{ [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }`\[`Keys`\]

Defined in: [core/src/type-utils.ts:40](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/type-utils.ts#L40)

Require at least one key of T

## Type Parameters

### T

`T`

### Keys

`Keys` *extends* keyof `T` = keyof `T`
