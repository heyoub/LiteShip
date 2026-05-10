[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / ClientHintsHeaders

# Interface: ClientHintsHeaders

Defined in: edge/src/client-hints.ts:24

Plain-object header bag accepted by [ClientHints.parseClientHints](../variables/ClientHints.md#parseclienthints).

All names are lowercased because Client Hints headers are always lowercase
in spec. Values that are missing simply fall back to conservative
defaults during parsing.

## Properties

### downlink?

> `readonly` `optional` **downlink?**: `string`

Defined in: edge/src/client-hints.ts:46

`Downlink` estimate in Mb/s.

***

### ect?

> `readonly` `optional` **ect?**: `string`

Defined in: edge/src/client-hints.ts:48

`ECT` effective connection type.

***

### rtt?

> `readonly` `optional` **rtt?**: `string`

Defined in: edge/src/client-hints.ts:50

`RTT` round-trip-time estimate in ms.

***

### save-data?

> `readonly` `optional` **save-data?**: `string`

Defined in: edge/src/client-hints.ts:44

`Save-Data` (`on`).

***

### sec-ch-device-memory?

> `readonly` `optional` **sec-ch-device-memory?**: `string`

Defined in: edge/src/client-hints.ts:28

`Sec-CH-Device-Memory` in GiB (one of the standard buckets).

***

### sec-ch-dpr?

> `readonly` `optional` **sec-ch-dpr?**: `string`

Defined in: edge/src/client-hints.ts:30

`Sec-CH-DPR` — devicePixelRatio as a decimal string.

***

### sec-ch-prefers-color-scheme?

> `readonly` `optional` **sec-ch-prefers-color-scheme?**: `string`

Defined in: edge/src/client-hints.ts:38

`Sec-CH-Prefers-Color-Scheme` (`light` / `dark`).

***

### sec-ch-prefers-reduced-motion?

> `readonly` `optional` **sec-ch-prefers-reduced-motion?**: `string`

Defined in: edge/src/client-hints.ts:36

`Sec-CH-Prefers-Reduced-Motion` (`reduce` / `no-preference`).

***

### sec-ch-ua?

> `readonly` `optional` **sec-ch-ua?**: `string`

Defined in: edge/src/client-hints.ts:42

`Sec-CH-UA` — full user-agent brand list.

***

### sec-ch-ua-mobile?

> `readonly` `optional` **sec-ch-ua-mobile?**: `string`

Defined in: edge/src/client-hints.ts:40

`Sec-CH-UA-Mobile` as a structured boolean (`?1` / `?0`).

***

### sec-ch-ua-platform?

> `readonly` `optional` **sec-ch-ua-platform?**: `string`

Defined in: edge/src/client-hints.ts:26

`Sec-CH-UA-Platform` (e.g. `"macOS"`, `"Windows"`).

***

### sec-ch-viewport-height?

> `readonly` `optional` **sec-ch-viewport-height?**: `string`

Defined in: edge/src/client-hints.ts:34

`Sec-CH-Viewport-Height` in CSS pixels.

***

### sec-ch-viewport-width?

> `readonly` `optional` **sec-ch-viewport-width?**: `string`

Defined in: edge/src/client-hints.ts:32

`Sec-CH-Viewport-Width` in CSS pixels.

***

### user-agent?

> `readonly` `optional` **user-agent?**: `string`

Defined in: edge/src/client-hints.ts:52

`User-Agent` fallback for GPU-tier heuristics.
