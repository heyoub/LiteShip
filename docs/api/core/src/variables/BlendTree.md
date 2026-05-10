[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / BlendTree

# Variable: BlendTree

> `const` **BlendTree**: `object`

Defined in: [core/src/blend.ts:128](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/blend.ts#L128)

BlendTree -- weighted multi-state blending for numeric records.
Add named nodes with values and weights, then compute the weighted average.

## Type Declaration

### make

> **make**: \<`T`\>() => `Effect`\<`BlendTreeShape`\<`T`\>, `never`, [`Scope`](#)\> = `_make`

Creates a new BlendTree for weighted multi-state blending of numeric records.
Requires a Scope for lifecycle management of the change stream.

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `number`\>

#### Returns

`Effect`\<`BlendTreeShape`\<`T`\>, `never`, [`Scope`](#)\>

#### Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const tree = yield* BlendTree.make<{ x: number; y: number }>();
  tree.add('idle', { x: 0, y: 0 }, 0.3);
  tree.add('active', { x: 100, y: 50 }, 0.7);
  const blended = tree.compute(); // { x: 70, y: 35 }
}));
```

## Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const tree = yield* BlendTree.make<{ opacity: number }>();
  tree.add('fadeIn', { opacity: 1 }, 0.8);
  tree.add('fadeOut', { opacity: 0 }, 0.2);
  const result = tree.compute(); // { opacity: 0.8 }
}));
```
