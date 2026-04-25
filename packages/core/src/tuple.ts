/**
 * Map each element of a readonly tuple, preserving tuple arity and ordering.
 *
 * TypeScript's Array.prototype.map returns U[], erasing tuple structure.
 * This helper reintroduces the mapped tuple type via one narrow cast,
 * provably safe: the map is total over the input and the output element
 * type is uniform.
 *
 * @example
 * ```ts
 * const types = tupleMap([1, 'two', true] as const, (el) => typeof el);
 * // types: readonly ['number', 'string', 'boolean']
 * ```
 */
export const tupleMap = <T extends readonly unknown[], U>(
  tuple: T,
  fn: (element: T[number], index: number) => U,
): { readonly [K in keyof T]: U } =>
  tuple.map(fn) as { readonly [K in keyof T]: U };
