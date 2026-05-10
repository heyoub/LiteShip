[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Config

# Config

Config namespace — the single hub that every czap adapter (Vite, Astro, test
runners, edge runtime) projects from. [Config.make](../../variables/Config.md#make) produces a frozen,
FNV-1a content-addressed [Config.Shape](interfaces/Shape.md); every projection function
(`toViteConfig`, `toAstroConfig`, `toTestAliases`) is pure.

## Interfaces

- [Input](interfaces/Input.md)
- [Shape](interfaces/Shape.md)
