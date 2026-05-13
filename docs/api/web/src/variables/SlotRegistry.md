[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / SlotRegistry

# Variable: SlotRegistry

> `const` **SlotRegistry**: `object`

Defined in: [web/src/slot/registry.ts:343](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/slot/registry.ts#L343)

Slot registry namespace.

Maps `SlotPath` identifiers (from `data-czap-slot` attributes) to DOM
elements for efficient lookup and patching. Provides DOM scanning,
`MutationObserver`-based auto-registration, and path lookup utilities.

## Type Declaration

### create

> **create**: () => [`SlotRegistryShape`](../interfaces/SlotRegistryShape.md)

Create a new slot registry that maps slot paths to DOM elements.

#### Returns

[`SlotRegistryShape`](../interfaces/SlotRegistryShape.md)

A new [SlotRegistryShape](../interfaces/SlotRegistryShape.md) instance

#### Example

```ts
import { SlotRegistry, SlotAddressing } from '@czap/web';

const heroPath = SlotAddressing.brand('/hero');
const registry = SlotRegistry.create();
registry.register({
  path: heroPath, element: document.querySelector('#hero')!,
  mode: 'partial', mounted: true,
});
const entry = registry.get(heroPath);
console.log(entry?.element.id); // 'hero'
```

### findElement

> **findElement**: (`path`) => `Element` \| `null`

Find the DOM element for a slot path via `querySelector`.

#### Parameters

##### path

[`SlotPath`](../type-aliases/SlotPath.md)

The slot path to search for

#### Returns

`Element` \| `null`

The matching Element, or null

#### Example

```ts
import { SlotRegistry, SlotAddressing } from '@czap/web';

const el = SlotRegistry.findElement(SlotAddressing.brand('/sidebar'));
// el => <div data-czap-slot="/sidebar"> or null
```

### getPath

> **getPath**: (`element`) => [`SlotPath`](../type-aliases/SlotPath.md) \| `null`

Get the slot path from a DOM element's `data-czap-slot` attribute.

#### Parameters

##### element

`Element`

The DOM element to inspect

#### Returns

[`SlotPath`](../type-aliases/SlotPath.md) \| `null`

The slot path, or null if the element is not a slot

#### Example

```ts
import { SlotRegistry } from '@czap/web';

const el = document.querySelector('[data-czap-slot]')!;
const path = SlotRegistry.getPath(el);
// path => '/hero' or null if not a slot element
```

### observe

> **observe**: (`registry`, `root`) => `Effect`\<`void`, `never`, [`Scope`](#)\>

Create a `MutationObserver` that automatically registers/unregisters slots
as DOM elements with `data-czap-slot` are added or removed. The observer
is disconnected when the enclosing Effect scope closes.

#### Parameters

##### registry

[`SlotRegistryShape`](../interfaces/SlotRegistryShape.md)

The slot registry to keep in sync

##### root

`Element`

The DOM root to observe

#### Returns

`Effect`\<`void`, `never`, [`Scope`](#)\>

An Effect (scoped) that starts observation

#### Example

```ts
import { SlotRegistry } from '@czap/web';
import { Effect } from 'effect';

const program = Effect.scoped(Effect.gen(function* () {
  const registry = SlotRegistry.create();
  yield* SlotRegistry.observe(registry, document.body);
  // Observer is now active; slots auto-register on DOM changes
}));
```

### scanDOM

> **scanDOM**: (`registry`, `root`, `defaultMode`) => `void`

Scan the DOM subtree for elements with `data-czap-slot` attributes and
register them in the given registry.

#### Parameters

##### registry

[`SlotRegistryShape`](../interfaces/SlotRegistryShape.md)

The slot registry to populate

##### root

`Element`

The DOM root element to scan

##### defaultMode?

[`IslandMode`](../type-aliases/IslandMode.md) = `'partial'`

Default island mode for discovered slots (defaults to 'partial')

#### Returns

`void`

#### Example

```ts
import { SlotRegistry } from '@czap/web';

const registry = SlotRegistry.create();
SlotRegistry.scanDOM(registry, document.body);
// All elements with data-czap-slot="/..." are now registered
```

## Example

```ts
import { SlotRegistry } from '@czap/web';
import { Effect } from 'effect';

const registry = SlotRegistry.create();
SlotRegistry.scanDOM(registry, document.body);

const entries = registry.entries();
for (const [path, entry] of entries) {
  console.log(path, entry.element.tagName);
}

const el = SlotRegistry.findElement(SlotAddressing.brand('/hero'));
const path = el ? SlotRegistry.getPath(el) : null;
```
