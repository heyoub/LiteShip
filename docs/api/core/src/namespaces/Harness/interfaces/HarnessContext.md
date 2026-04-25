[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / HarnessContext

# Interface: HarnessContext

Defined in: [core/src/harness/pure-transform.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/pure-transform.ts#L30)

Optional metadata the compile-time driver passes to harness templates so
the generated test file can `import` the real capsule binding from its
source file. When `bindingImport` is undefined, the harness emits an
`it.skip` placeholder rather than a vacuous test.

## Properties

### arbitraryImport?

> `readonly` `optional` **arbitraryImport?**: `string`

Defined in: [core/src/harness/pure-transform.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/pure-transform.ts#L36)

Import specifier for `schemaToArbitrary`, default to source path.

***

### bindingImport?

> `readonly` `optional` **bindingImport?**: `string`

Defined in: [core/src/harness/pure-transform.ts:32](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/pure-transform.ts#L32)

ESM-style import specifier (with `.js` extension) for the test file.

***

### bindingName?

> `readonly` `optional` **bindingName?**: `string`

Defined in: [core/src/harness/pure-transform.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/pure-transform.ts#L34)

Exported binding name to import from `bindingImport`.
