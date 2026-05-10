[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [web/src](../../README.md) / SlotRegistry

# SlotRegistry

Slot registry namespace.

Maps `SlotPath` identifiers (from `data-czap-slot` attributes) to DOM
elements for efficient lookup and patching. Provides DOM scanning,
`MutationObserver`-based auto-registration, and path lookup utilities.

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

## Type Aliases

- [Shape](type-aliases/Shape.md)
