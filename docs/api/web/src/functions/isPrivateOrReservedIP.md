[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / isPrivateOrReservedIP

# Function: isPrivateOrReservedIP()

> **isPrivateOrReservedIP**(`hostname`): `boolean`

Defined in: web/src/security/runtime-url.ts:187

Return `true` when `hostname` resolves to `localhost`, a private
RFC 1918 network, link-local, carrier-grade NAT, or a reserved
range. Handles both IPv4 and IPv6 literals. Used to block SSRF
attempts against metadata services (e.g. 169.254.169.254).

## Parameters

### hostname

`string`

## Returns

`boolean`
