[**LiteShip**](../../README.md)

***

[LiteShip](../../modules.md) / remotion/src

# remotion/src

`@czap/remotion` — **LiteShip** Remotion adapter: video timeline + shader
surfaces driven by `CompositeState` from the **CZAP** `VideoRenderer`.

Provides React hooks and composition helpers to consume
`CompositeState` from `@czap/core`'s `VideoRenderer` in Remotion projects.

Typical flow:
1. Build a [VideoRenderer.Shape](#) on the server (via `@czap/core`).
2. Call [precomputeFrames](functions/precomputeFrames.md) once before Remotion renders.
3. Inside a composition, read the current frame's state with
   [useCompositeState](functions/useCompositeState.md) (or [useCzapState](functions/useCzapState.md) if you wrap your
   tree in [Provider](functions/Provider.md)).
4. Turn the discrete state into CSS variables via [cssVarsFromState](functions/cssVarsFromState.md).

## Variables

- [remotionAdapterCapsule](variables/remotionAdapterCapsule.md)

## Functions

- [cssVarsFromState](functions/cssVarsFromState.md)
- [precomputeFrames](functions/precomputeFrames.md)
- [Provider](functions/Provider.md)
- [stateAtFrame](functions/stateAtFrame.md)
- [useCompositeState](functions/useCompositeState.md)
- [useCzapState](functions/useCzapState.md)
