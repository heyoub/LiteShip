[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Easing

# Easing

Easing -- pure math easing functions mapping t in [0,1] to value in [0,1].
Includes standard CSS easings, cubic-bezier, spring physics, and CSS linear() export.

## Example

```ts
const t = 0.5;
Easing.easeOutCubic(t);  // 0.875
Easing.linear(t);        // 0.5
const spring = Easing.spring({ stiffness: 200, damping: 15 });
spring(t);               // spring-physics interpolated value
const css = Easing.springToLinearCSS({ stiffness: 200, damping: 15 });
```

## Type Aliases

- [Config](type-aliases/Config.md)
- [Fn](type-aliases/Fn.md)
