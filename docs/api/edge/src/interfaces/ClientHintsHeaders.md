[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / ClientHintsHeaders

# Interface: ClientHintsHeaders

Defined in: [edge/src/client-hints.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L24)

Plain-object header bag accepted by [ClientHints.parseClientHints](../variables/ClientHints.md#parseclienthints).

All names are lowercased because Client Hints headers are always lowercase
in spec. Values that are missing simply fall back to conservative
defaults during parsing.

## Properties

### downlink?

> `readonly` `optional` **downlink?**: `string`

Defined in: [edge/src/client-hints.ts:46](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L46)

`Downlink` estimate in Mb/s.

***

### ect?

> `readonly` `optional` **ect?**: `string`

Defined in: [edge/src/client-hints.ts:48](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L48)

`ECT` effective connection type.

***

### rtt?

> `readonly` `optional` **rtt?**: `string`

Defined in: [edge/src/client-hints.ts:50](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L50)

`RTT` round-trip-time estimate in ms.

***

### save-data?

> `readonly` `optional` **save-data?**: `string`

Defined in: [edge/src/client-hints.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L44)

`Save-Data` (`on`).

***

### sec-ch-device-memory?

> `readonly` `optional` **sec-ch-device-memory?**: `string`

Defined in: [edge/src/client-hints.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L28)

`Sec-CH-Device-Memory` in GiB (one of the standard buckets).

***

### sec-ch-dpr?

> `readonly` `optional` **sec-ch-dpr?**: `string`

Defined in: [edge/src/client-hints.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L30)

`Sec-CH-DPR` — devicePixelRatio as a decimal string.

***

### sec-ch-prefers-color-scheme?

> `readonly` `optional` **sec-ch-prefers-color-scheme?**: `string`

Defined in: [edge/src/client-hints.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L38)

`Sec-CH-Prefers-Color-Scheme` (`light` / `dark`).

***

### sec-ch-prefers-reduced-motion?

> `readonly` `optional` **sec-ch-prefers-reduced-motion?**: `string`

Defined in: [edge/src/client-hints.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L36)

`Sec-CH-Prefers-Reduced-Motion` (`reduce` / `no-preference`).

***

### sec-ch-ua?

> `readonly` `optional` **sec-ch-ua?**: `string`

Defined in: [edge/src/client-hints.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L42)

`Sec-CH-UA` — full user-agent brand list.

***

### sec-ch-ua-mobile?

> `readonly` `optional` **sec-ch-ua-mobile?**: `string`

Defined in: [edge/src/client-hints.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L40)

`Sec-CH-UA-Mobile` as a structured boolean (`?1` / `?0`).

***

### sec-ch-ua-platform?

> `readonly` `optional` **sec-ch-ua-platform?**: `string`

Defined in: [edge/src/client-hints.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L26)

`Sec-CH-UA-Platform` (e.g. `"macOS"`, `"Windows"`).

***

### sec-ch-viewport-height?

> `readonly` `optional` **sec-ch-viewport-height?**: `string`

Defined in: [edge/src/client-hints.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L34)

`Sec-CH-Viewport-Height` in CSS pixels.

***

### sec-ch-viewport-width?

> `readonly` `optional` **sec-ch-viewport-width?**: `string`

Defined in: [edge/src/client-hints.ts:32](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L32)

`Sec-CH-Viewport-Width` in CSS pixels.

***

### user-agent?

> `readonly` `optional` **user-agent?**: `string`

Defined in: [edge/src/client-hints.ts:52](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/client-hints.ts#L52)

`User-Agent` fallback for GPU-tier heuristics.
