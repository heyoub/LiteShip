[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / CompositeState

# Interface: CompositeState

Defined in: core/src/compositor.ts:35

Snapshot of the compositor's output per tick: discrete state names for each
quantizer, their blend-weight vectors, and the compiled per-target output
maps (`css` / `glsl` / `aria`).

## Properties

### blend

> `readonly` **blend**: `Record`\<`string`, `Record`\<`string`, `number`\>\>

Defined in: core/src/compositor.ts:37

***

### discrete

> `readonly` **discrete**: `Record`\<`string`, `string`\>

Defined in: core/src/compositor.ts:36

***

### outputs

> `readonly` **outputs**: `object`

Defined in: core/src/compositor.ts:38

#### aria

> `readonly` **aria**: `Record`\<`string`, `string`\>

#### css

> `readonly` **css**: `Record`\<`string`, `number` \| `string`\>

#### glsl

> `readonly` **glsl**: `Record`\<`string`, `number`\>
