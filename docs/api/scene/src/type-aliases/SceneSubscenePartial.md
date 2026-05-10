[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / SceneSubscenePartial

# Type Alias: SceneSubscenePartial

> **SceneSubscenePartial** = `Omit`\<[`SceneContract`](../interfaces/SceneContract.md), `"bpm"` \| `"fps"`\> & `object`

Defined in: [scene/src/include.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/include.ts#L17)

Partial sub-scene declaration — the parent supplies the missing
`bpm` / `fps` defaults via [Scene.subscene](../variables/Scene.md#subscene). Any explicit
`bpm` / `fps` on the partial wins over the inherited parent value.

## Type Declaration

### bpm?

> `readonly` `optional` **bpm?**: `number`

### fps?

> `readonly` `optional` **fps?**: `number`
