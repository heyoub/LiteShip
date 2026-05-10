[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / SatelliteProps

# Interface: SatelliteProps

Defined in: astro/src/Satellite.ts:22

Server-render props for a satellite container. Astro components
typically destructure these and pass them to [satelliteAttrs](../functions/satelliteAttrs.md).

## Properties

### boundary?

> `readonly` `optional` **boundary?**: [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

Defined in: astro/src/Satellite.ts:24

Boundary whose state the satellite tracks.

***

### class?

> `readonly` `optional` **class?**: `string`

Defined in: astro/src/Satellite.ts:28

Extra CSS class names to merge with `czap-satellite`.

***

### component?

> `readonly` `optional` **component?**: [`Shape`](#)\<[`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>, readonly `string`[]\>

Defined in: astro/src/Satellite.ts:26

Component definition used to identify the satellite on the client.

***

### initialState?

> `readonly` `optional` **initialState?**: `string`

Defined in: astro/src/Satellite.ts:30

Server-side initial state (serialised into `data-czap-state`).
