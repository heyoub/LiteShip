[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / GapStrategy

# Type Alias: GapStrategy

> **GapStrategy** = \{ `bufferPosition`: `number`; `type`: `"resume"`; \} \| \{ `frames`: readonly [`UIFrame`](../interfaces/UIFrame.md)[]; `type`: `"replay"`; \} \| \{ `fromScratch`: `true`; `type`: `"re-request"`; \} \| \{ `type`: `"noop"`; \}

Defined in: [core/src/gen-frame.ts:58](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/gen-frame.ts#L58)

Recovery plan returned by [GenFrame.resolveGap](../variables/GenFrame.md#resolvegap) when a stream disconnects:
resume from a buffer position, replay cached frames, request a full restart,
or do nothing.
