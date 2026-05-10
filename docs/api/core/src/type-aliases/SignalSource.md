[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / SignalSource

# Type Alias: SignalSource

> **SignalSource** = \{ `axis`: `"width"` \| `"height"`; `type`: `"viewport"`; \} \| \{ `mode`: `"elapsed"` \| `"absolute"` \| `"scheduled"`; `type`: `"time"`; \} \| \{ `axis`: `"x"` \| `"y"` \| `"pressure"`; `type`: `"pointer"`; \} \| \{ `axis`: `"x"` \| `"y"` \| `"progress"`; `type`: `"scroll"`; \} \| \{ `query`: `string`; `type`: `"media"`; \} \| \{ `id`: `string`; `type`: `"custom"`; \} \| \{ `mode`: `"sample"` \| `"normalized"`; `type`: `"audio"`; \}

Defined in: core/src/signal.ts:21

Configuration describing what a [Signal](../variables/Signal.md) reads from: viewport axis,
time mode, pointer axis, scroll axis, media query, custom push source,
or audio sample/normalized mode.
