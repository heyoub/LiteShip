[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / tokenBufferCapsule

# Variable: tokenBufferCapsule

> `const` **tokenBufferCapsule**: [`CapsuleDef`](../interfaces/CapsuleDef.md)\<`"stateMachine"`, \{ `_tag`: `"push"`; `token`: `string`; \} \| \{ `_tag`: `"flush"`; \} \| \{ `_tag`: `"reset"`; \}, \{ `phase`: `"idle"` \| `"buffering"` \| `"draining"`; `tokens`: readonly `string`[]; `totalBytes`: `number`; \}, `unknown`\>

Defined in: [core/src/capsules/token-buffer.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsules/token-buffer.ts#L30)

Declared capsule for TokenBuffer. Registered in the module-level
catalog at import time; walked by the factory compiler.
