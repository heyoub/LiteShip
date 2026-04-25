[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / BlendTree

# BlendTree

BlendTree -- weighted multi-state blending for numeric records.
Add named nodes with values and weights, then compute the weighted average.

## Example

```ts
const program = Effect.scoped(Effect.gen(function* () {
  const tree = yield* BlendTree.make<{ opacity: number }>();
  tree.add('fadeIn', { opacity: 1 }, 0.8);
  tree.add('fadeOut', { opacity: 0 }, 0.2);
  const result = tree.compute(); // { opacity: 0.8 }
}));
```

## Type Aliases

- [Node](type-aliases/Node.md)
- [Shape](type-aliases/Shape.md)
